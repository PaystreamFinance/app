// ─── Arb Depth Types ───

export type ArbDepthVenue =
  | "hyperliquid"
  | "pacifica"
  | "lighter"
  | "aster"
  | "01"
  | "phoenix"
  | "hl:xyz"
  | "hl:flx"
  | "hl:hyna"
  | "hl:km"
  | "hl:cash"
  | "hl:para";

export type SlippageTier = "tier1" | "tier1_5" | "tier3";

export interface VenueConstants {
  interestRate: number;
  clampWidth: number;
  slippageTier: SlippageTier;
}

export type NonViableReason =
  | "negative_spread"
  | "venue_unavailable"
  | "insufficient_data"
  | "non_finite_input";

export interface ArbDepthResult {
  viable: boolean;
  reason?: NonViableReason | string;
  optimalSize?: number;
  arbDepth?: number;
  r0?: number;
  c?: number;
  alpha?: number;
  effectiveImbalance?: number;
  maxSizeBeforeZeroRate?: number;
  slippageAtOptimal?: number;
  slippageAtDepth?: number;
  insufficientDepth?: boolean;
  smallDepthReason?: string;
  /** Hours to recover entry costs at the conservative/optimistic assumptions. */
  paybackConservative?: number;
  paybackOptimistic?: number;
  compressionRisk?: number;
  entryCostUsd?: number;
  warnings: string[];
}

export interface ImpactPriceData {
  bidImpactPrice: number;
  askImpactPrice: number;
  oraclePrice: number;
  midPrice: number;
  premium: number;
  impactNotional?: number;
}

export interface VenueData {
  venue: ArbDepthVenue;
  book: { bids: Array<{ price: number; size: number }>; asks: Array<{ price: number; size: number }> } | null;
  impact: ImpactPriceData | null;
  oraclePrice: number;
  premium: number;
  askLiquidityUsd: number;
  bidLiquidityUsd: number;
  openInterestUsd: number;
}

export interface ArbDepthRequest {
  symbol: string;
  symbols?: {
    long?: string;
    short?: string;
  };
  longVenue: ArbDepthVenue;
  shortVenue: ArbDepthVenue;
  r0Pct: number;
  longTakerFeeBps: number;
  shortTakerFeeBps: number;
  longVenueOiUsd?: number;
  shortVenueOiUsd?: number;
}
