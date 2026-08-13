// ─── Pacifica Venue Adapter (Tier 1.5) ───
//
// Data sources:
//   Orderbook: WS via getLiveOrderbook("pacifica", symbol) — 10 levels max
//   Impact prices: GET /funding_rate/history?symbol=X&limit=1 → bid/ask_impact_price
//   Oracle, OI: GET /info/prices

import type { VenueAdapter } from "./base";
import type { VenueData } from "../types";
import { getLiveOrderbook } from "@/lib/perp-orderbook-ws";
import { computeBookLiquidity } from "./utils";
import { parsePositive, parseFinite } from "@/lib/math/primitives";
import { computePremium } from "@/lib/math/premium";

const PACIFICA_API = "https://api.pacifica.fi/api/v1";

async function fetchImpact(symbol: string): Promise<{
  bidImpactPrice: number;
  askImpactPrice: number;
  oraclePrice: number;
  premium: number;
  fundingRate: number;
} | null> {
  try {
    const histRes = await fetch(
      `${PACIFICA_API}/funding_rate/history?symbol=${encodeURIComponent(symbol)}&limit=1`,
      { signal: AbortSignal.timeout(5_000) },
    );
    if (!histRes.ok) return null;
    const histJson = (await histRes.json()) as {
      success: boolean;
      data: Array<{ oracle_price: string; bid_impact_price: string; ask_impact_price: string; funding_rate: string }>;
    };
    if (!histJson.success || !histJson.data?.[0]) return null;

    const rec = histJson.data[0];
    const oracle = parsePositive(rec.oracle_price);
    const bidImpact = parsePositive(rec.bid_impact_price);
    const askImpact = parsePositive(rec.ask_impact_price);
    if (oracle === null || bidImpact === null || askImpact === null) return null;

    const mid = (bidImpact + askImpact) / 2;
    const premium = computePremium(mid, oracle);
    const fundingRate = parseFinite(rec.funding_rate);
    return {
      bidImpactPrice: bidImpact,
      askImpactPrice: askImpact,
      oraclePrice: oracle,
      premium,
      fundingRate: fundingRate ?? 0,
    };
  } catch {
    return null;
  }
}

export const pacificaAdapter: VenueAdapter = {
  venue: "pacifica",
  constants: { interestRate: 0.0001, clampWidth: 0.0005, slippageTier: "tier1_5" },

  async fetchData(symbol: string): Promise<VenueData | null> {
    const [bookResult, meta] = await Promise.all([
      getLiveOrderbook("pacifica", symbol, { timeoutMs: 5000, maxAgeMs: 3000 }).catch(() => null),
      fetchImpact(symbol),
    ]);

    const book = bookResult ? { bids: bookResult.book.bids, asks: bookResult.book.asks } : null;
    if (!book || book.bids.length === 0 || book.asks.length === 0) return null;

    const { askLiquidityUsd, bidLiquidityUsd } = computeBookLiquidity(book);

    return {
      venue: "pacifica",
      book,
      impact: meta ? {
        bidImpactPrice: meta.bidImpactPrice,
        askImpactPrice: meta.askImpactPrice,
        oraclePrice: meta.oraclePrice,
        midPrice: (meta.bidImpactPrice + meta.askImpactPrice) / 2,
        premium: meta.premium,
      } : null,
      oraclePrice: meta?.oraclePrice ?? (book.bids[0]!.price + book.asks[0]!.price) / 2,
      premium: meta?.premium ?? 0,
      askLiquidityUsd,
      bidLiquidityUsd,
      openInterestUsd: 0, // OI comes from markets API via request params
    };
  },
};
