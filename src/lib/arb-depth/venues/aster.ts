// ─── Aster Venue Adapter (Tier 3) ───
//
// Data sources:
//   Orderbook: REST GET /fapi/v1/depth?symbol={SYM}USDT&limit=20
//   Mark price, Index price, Funding: REST GET /fapi/v1/premiumIndex?symbol={SYM}USDT
//   OI: Not directly available from premiumIndex — derived from 24hr ticker if needed
//
// Aster uses Binance-style API format. Symbols are {BASE}USDT (e.g. SOLUSDT, WLFIUSDT).

import type { VenueAdapter } from "./base";
import type { VenueData } from "../types";
import type { OrderbookLevel } from "@/lib/perp-orderbook-simulation";
import { computeBookLiquidity } from "./utils";
import { parsePositive, parseFinite } from "@/lib/math/primitives";
import { computePremium } from "@/lib/math/premium";

const ASTER_API = "https://fapi.asterdex.com";

function toAsterSymbol(symbol: string): string {
  return symbol.toUpperCase().replace(/-PERP$/i, "") + "USDT";
}

async function fetchOrderbook(symbol: string): Promise<{
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
} | null> {
  try {
    const res = await fetch(
      `${ASTER_API}/fapi/v1/depth?symbol=${toAsterSymbol(symbol)}&limit=20`,
      { signal: AbortSignal.timeout(5_000) },
    );
    if (!res.ok) return null;

    const data = (await res.json()) as {
      bids: [string, string][];
      asks: [string, string][];
    };

    const parseLevel = ([p, s]: [string, string]): OrderbookLevel | null => {
      const price = parsePositive(p);
      const size = parsePositive(s);
      return price !== null && size !== null ? { price, size } : null;
    };
    const bids: OrderbookLevel[] = (data.bids ?? [])
      .map(parseLevel)
      .filter((l): l is OrderbookLevel => l !== null);
    const asks: OrderbookLevel[] = (data.asks ?? [])
      .map(parseLevel)
      .filter((l): l is OrderbookLevel => l !== null);

    if (bids.length === 0 || asks.length === 0) return null;
    return { bids, asks };
  } catch {
    return null;
  }
}


async function fetchPremiumIndex(symbol: string): Promise<{
  markPrice: number;
  indexPrice: number;
  fundingRate: number;
} | null> {
  try {
    const res = await fetch(
      `${ASTER_API}/fapi/v1/premiumIndex?symbol=${toAsterSymbol(symbol)}`,
      { signal: AbortSignal.timeout(5_000) },
    );
    if (!res.ok) return null;

    const data = (await res.json()) as {
      markPrice: string;
      indexPrice: string;
      lastFundingRate: string;
    };

    const mark = parsePositive(data.markPrice);
    const index = parseFinite(data.indexPrice);
    const funding = parseFinite(data.lastFundingRate);

    if (mark === null || index === null) return null;
    return { markPrice: mark, indexPrice: index, fundingRate: funding ?? 0 };
  } catch {
    return null;
  }
}

export const asterAdapter: VenueAdapter = {
  venue: "aster",
  constants: { interestRate: 0.0001, clampWidth: 0.0005, slippageTier: "tier3" },

  async fetchData(symbol: string): Promise<VenueData | null> {
    const [book, premium] = await Promise.all([
      fetchOrderbook(symbol),
      fetchPremiumIndex(symbol),
    ]);

    if (!book) return null;

    const { askLiquidityUsd, bidLiquidityUsd } = computeBookLiquidity(book);
    const midPrice = (book.bids[0]!.price + book.asks[0]!.price) / 2;

    const oraclePrice = premium?.indexPrice ?? midPrice;
    const markPrice = premium?.markPrice ?? midPrice;
    const prem = computePremium(markPrice, oraclePrice);

    return {
      venue: "aster",
      book,
      impact: null,
      oraclePrice,
      premium: prem,
      askLiquidityUsd,
      bidLiquidityUsd,
      openInterestUsd: 0, // OI comes from markets API via request params
    };
  },
};
