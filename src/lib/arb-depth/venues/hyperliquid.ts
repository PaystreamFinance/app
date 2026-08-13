// ─── Hyperliquid Venue Adapter (Tier 1) ───
//
// Data sources:
//   Orderbook: WS via getLiveOrderbook("hyperliquid", symbol)
//   Impact prices: POST https://api.hyperliquid.xyz/info { type: "metaAndAssetCtxs" }
//   Premium, Oracle, OI: same endpoint

import type { VenueAdapter } from "./base";
import type { ArbDepthVenue, VenueData } from "../types";
import { getLiveOrderbook } from "@/lib/perp-orderbook-ws";
import { computeBookLiquidity } from "./utils";
import { parseFinite } from "@/lib/math/primitives";

const HL_API = "https://api.hyperliquid.xyz/info";

interface HLAssetCtx {
  funding: string;
  openInterest: string;
  premium: string;
  oraclePx: string;
  markPx: string;
  midPx: string;
  impactPxs: [string, string];
}

async function fetchMetaAndAssetCtxs(symbol: string): Promise<{
  bidImpactPrice: number;
  askImpactPrice: number;
  oraclePrice: number;
  midPrice: number;
  premium: number;
  fundingRate: number;
} | null> {
  try {
    const res = await fetch(HL_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "metaAndAssetCtxs" }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as [{ universe: Array<{ name: string }> }, HLAssetCtx[]];
    const idx = data[0].universe.findIndex((u) => u.name.toUpperCase() === symbol.toUpperCase());
    if (idx < 0 || !data[1][idx]) return null;

    const ctx = data[1][idx];
    const bidImpact = parseFinite(ctx.impactPxs[0]);
    const askImpact = parseFinite(ctx.impactPxs[1]);
    const oracle = parseFinite(ctx.oraclePx);
    const mid = parseFinite(ctx.midPx);
    const premium = parseFinite(ctx.premium);
    const funding = parseFinite(ctx.funding);

    if (bidImpact === null || askImpact === null || oracle === null || mid === null) {
      return null;
    }

    return {
      bidImpactPrice: bidImpact,
      askImpactPrice: askImpact,
      oraclePrice: oracle,
      midPrice: mid,
      premium: premium ?? 0,
      fundingRate: funding ?? 0,
    };
  } catch {
    return null;
  }
}

function createHyperliquidAdapter(venue: ArbDepthVenue): VenueAdapter {
  return {
    venue,
    constants: { interestRate: 0.0001, clampWidth: 0.0005, slippageTier: "tier1" },

    async fetchData(symbol: string): Promise<VenueData | null> {
      const isMainDex = venue === "hyperliquid";
      const [bookResult, meta] = await Promise.all([
        getLiveOrderbook(venue, symbol, { timeoutMs: 5000, maxAgeMs: 3000 }).catch(() => null),
        isMainDex ? fetchMetaAndAssetCtxs(symbol) : Promise.resolve(null),
      ]);

      const book = bookResult ? { bids: bookResult.book.bids, asks: bookResult.book.asks } : null;
      if (!book || book.bids.length === 0 || book.asks.length === 0) return null;

      const { askLiquidityUsd, bidLiquidityUsd } = computeBookLiquidity(book);

      return {
        venue,
        book,
        impact: meta ? {
          bidImpactPrice: meta.bidImpactPrice,
          askImpactPrice: meta.askImpactPrice,
          oraclePrice: meta.oraclePrice,
          midPrice: meta.midPrice,
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
}

export const hyperliquidAdapter: VenueAdapter =
  createHyperliquidAdapter("hyperliquid");

export const hyperliquidHip3Adapters: Partial<Record<ArbDepthVenue, VenueAdapter>> = {
  "hl:xyz": createHyperliquidAdapter("hl:xyz"),
  "hl:flx": createHyperliquidAdapter("hl:flx"),
  "hl:hyna": createHyperliquidAdapter("hl:hyna"),
  "hl:km": createHyperliquidAdapter("hl:km"),
  "hl:cash": createHyperliquidAdapter("hl:cash"),
  "hl:para": createHyperliquidAdapter("hl:para"),
};
