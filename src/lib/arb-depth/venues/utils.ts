// ─── Shared Venue Utilities ───

import type { OrderbookLevel } from "@/lib/perp-orderbook-simulation";
import {
  computeMidPrice,
  simulateFillByNotional,
} from "@/lib/perp-orderbook-simulation";
import type { ImpactPriceData, SlippageTier } from "../types";

export function computeBookLiquidity(book: {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
}): { askLiquidityUsd: number; bidLiquidityUsd: number } {
  let askLiq = 0;
  for (const level of book.asks) askLiq += level.price * level.size;
  let bidLiq = 0;
  for (const level of book.bids) bidLiq += level.price * level.size;
  return { askLiquidityUsd: askLiq, bidLiquidityUsd: bidLiq };
}

// ─── OI-proportional slippage extrapolation ───
//
// When the visible orderbook is exhausted (only 10-20 levels), we can't observe
// the full market depth. OI is used as a proxy: deeper markets have more OI, and
// slippage scales with what fraction of OI you're consuming.
//
// Model: slippage_ratio = tier_k × (q / OI)
// Calibrated so that consuming 10% of a venue's OI costs:
//   tier1   (HL, $1B+ OI):      5bp  → k = 0.005
//   tier1_5 (Pacifica, $20-50M): 15bp → k = 0.015
//   tier3   (Lighter/Aster, $5-100M): 50bp → k = 0.050
export const OI_SLIPPAGE_K: Record<SlippageTier, number> = {
  tier1:   0.005,
  tier1_5: 0.015,
  tier3:   0.025,
};

// ─── Slippage at arbitrary size ───
//
// Walks the live orderbook at the requested notional q.
// If the book is exhausted (only partial depth), extrapolates the remaining
// slippage using an OI-proportional model rather than capping at book depth.
//
// This is called by the iterative solver at every candidate size.

export interface SlippageResult {
  slippageRatio: number;
  insufficientDepth: boolean;
}

export function computeSlippage(
  side: "long" | "short",
  book: { bids: OrderbookLevel[]; asks: OrderbookLevel[] },
  q: number,
  impact: ImpactPriceData | null,
  oiUsd?: number,
  tier?: SlippageTier,
): SlippageResult {
  if (q <= 0) return { slippageRatio: 0, insufficientDepth: false };

  const mid = computeMidPrice(book);
  if (mid === null || mid <= 0) return { slippageRatio: 0, insufficientDepth: true };

  // Walk the book at size q
  const levels = side === "long" ? book.asks : book.bids;
  const fill = simulateFillByNotional(levels, q, side === "long" ? "buy" : "sell");
  const insufficientDepth = fill.unfilledNotionalUsd > 1e-9;

  if (fill.averagePrice === null || fill.filledNotionalUsd < 1) {
    // No book data at all — fall back entirely to OI model
    if (oiUsd && oiUsd > 0 && tier) {
      const k = OI_SLIPPAGE_K[tier];
      return { slippageRatio: k * (q / oiUsd), insufficientDepth: false };
    }
    return { slippageRatio: 0, insufficientDepth: true };
  }

  const vwap = fill.averagePrice;
  const bookSlippageRatio = side === "long"
    ? (vwap - mid) / mid
    : (mid - vwap) / mid;

  // If book was exhausted and we have OI data, extrapolate the unfilled portion
  if (insufficientDepth && oiUsd && oiUsd > 0 && tier) {
    const filledQ = fill.filledNotionalUsd;
    const unfilledQ = q - filledQ;
    const k = OI_SLIPPAGE_K[tier];
    // Marginal slippage for the unfilled portion at this depth in the book
    const oiSlipForUnfilled = k * (unfilledQ / oiUsd);
    // Weighted average: book cost + OI-extrapolated cost
    const bookCostUsd = Math.max(bookSlippageRatio, 0) * filledQ;
    const oiCostUsd = oiSlipForUnfilled * unfilledQ;
    return { slippageRatio: (bookCostUsd + oiCostUsd) / q, insufficientDepth: false };
  }

  return { slippageRatio: Math.max(bookSlippageRatio, 0), insufficientDepth };
}
