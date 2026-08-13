import type { ArbDepthRequest, ArbDepthResult } from "./types";
import { getVenueAdapter } from "./venues/registry";
import { computeSlippage } from "./venues/utils";
import { bpsToRatio, safeDiv } from "@/lib/math/primitives";

export async function computeArbDepthForPair(
  request: ArbDepthRequest,
): Promise<ArbDepthResult> {
  const {
    symbol,
    symbols,
    longVenue,
    shortVenue,
    r0Pct,
    longTakerFeeBps,
    shortTakerFeeBps,
    longVenueOiUsd,
    shortVenueOiUsd,
  } = request;
  const warnings: string[] = [];

  if ((longVenue as string) === "drift" || (shortVenue as string) === "drift") {
    return { viable: false, reason: "venue_unavailable", warnings: ["Drift is no longer supported"] };
  }

  const r0 = r0Pct / 100; // per-hour decimal
  const c  = bpsToRatio(longTakerFeeBps) + bpsToRatio(shortTakerFeeBps);

  if (r0 <= 0) return { viable: false, reason: "negative_spread", warnings: [], r0, c };

  const longAdapter  = getVenueAdapter(longVenue);
  const shortAdapter = getVenueAdapter(shortVenue);
  const longSymbol = symbols?.long ?? symbol;
  const shortSymbol = symbols?.short ?? symbol;

  const [longData, shortData] = await Promise.all([
    longAdapter.fetchData(longSymbol).catch(() => null),
    shortAdapter.fetchData(shortSymbol).catch(() => null),
  ]);

  const longBookDepth  = longData  ? longData.askLiquidityUsd  + longData.bidLiquidityUsd  : 0;
  const shortBookDepth = shortData ? shortData.askLiquidityUsd + shortData.bidLiquidityUsd : 0;
  const longOI  = (longVenueOiUsd  ?? 0) > 0 ? longVenueOiUsd!  : longBookDepth  * 5;
  const shortOI = (shortVenueOiUsd ?? 0) > 0 ? shortVenueOiUsd! : shortBookDepth * 5;

  if (longOI <= 0 && shortOI <= 0) {
    return { viable: false, reason: "insufficient_data", warnings: ["No OI or orderbook data"], r0, c };
  }

  const resolvedLongOI  = longOI  > 0 ? longOI  : shortOI;
  const resolvedShortOI = shortOI > 0 ? shortOI : longOI;
  const minOI = Math.min(resolvedLongOI, resolvedShortOI);

  // ── Parabola formula ─────────────────────────────────────────────────────
  // Slippage is a ONE-TIME entry cost, amortized over N holding periods:
  //
  // Total_profit(q, N) = N·r₀·q − (N·α + s)·q²
  //
  // α = 2·r₀/minOI   (rate compression — recurring every period)
  // s = k/OI_long + k/OI_short  (slippage — paid once on entry, k=0.1 universal)
  //
  // arb_depth    = r₀ / (α + s/N)   ← zero-profit point over N periods
  // optimal_size = arb_depth / 2    ← peak of parabola
  //
  // k=0.1: at 10% of OI → 1% slippage (realistic for perp markets)
  // N=168: 1-week hold horizon — higher funding → holds longer → larger depth
  // ─────────────────────────────────────────────────────────────────────────

  const K               = 0.1; // universal slippage constant (not per-venue)
  const AMORTIZE_PERIODS = 168; // hours — slippage amortised over 1 week

  // α = 2·r₀/minOI
  const alpha = (2 * r0) / minOI;

  // s = k/OI_long + k/OI_short  (k=0.1, venue-agnostic)
  const s = K / resolvedLongOI + K / resolvedShortOI;

  // tiers still used for book-walk slippage display below
  const longTier  = longAdapter.constants.slippageTier;
  const shortTier = shortAdapter.constants.slippageTier;

  const denom = alpha + s / AMORTIZE_PERIODS;
  if (!Number.isFinite(denom) || denom <= 0) {
    return { viable: false, reason: "non_finite_input", warnings, r0, c };
  }

  const rawArbDepth = Math.floor(r0 / denom);
  const arbDepth    = Math.min(rawArbDepth, Math.floor(minOI * 0.1));
  const optimalSize = Math.floor(arbDepth / 2);

  if (arbDepth <= 0) {
    return { viable: false, reason: "insufficient_data", warnings, r0, c, alpha, effectiveImbalance: minOI / 2 };
  }

  const maxProfitPerPeriod = safeDiv(r0 * r0, 4 * denom, 0);
  // Round-trip taker fees (open + close on each leg). The previous formula
  // used `c * optimalSize`, counting only entry fees and silently halving
  // the true cost shown to the user. Closing fees are functionally identical
  // to entry fees (taker on both sides), so a 2x multiplier is the simplest
  // correct adjustment until per-leg maker/taker mix is modelled.
  const entryCostUsd = c * optimalSize; // entry leg only (display)
  const roundTripCostUsd = 2 * entryCostUsd;

  // Slippage at key sizes (informational)
  const slippageAt = (q: number): number => {
    let slip = 0;
    if (longData?.book)  slip += computeSlippage("long",  longData.book,  q, longData.impact,  resolvedLongOI,  longTier).slippageRatio;
    if (shortData?.book) slip += computeSlippage("short", shortData.book, q, shortData.impact, resolvedShortOI, shortTier).slippageRatio;
    return Math.max(0, slip);
  };

  const slippageAtOptimal = slippageAt(optimalSize);
  const slippageAtDepth   = slippageAt(arbDepth);

  // Payback in hours: (round-trip taker fees + entry slippage) divided by
  // hourly profit at optimal size. Entry slippage is one-time so not doubled;
  // fees are.
  const totalEntryCostUsd = roundTripCostUsd + slippageAtOptimal * optimalSize;
  const paybackHours = maxProfitPerPeriod > 0
    ? Math.min(safeDiv(totalEntryCostUsd, maxProfitPerPeriod, 999), 999)
    : 999;

  // ── Small-depth diagnosis ────────────────────────────────────────────────
  const SMALL_DEPTH_THRESHOLD = 100_000;
  const LOW_SPREAD_THRESHOLD  = 0.0001; // 1 bps/hr
  const LOW_OI_THRESHOLD      = 5_000_000;

  let smallDepthReason: string | undefined;
  if (arbDepth < SMALL_DEPTH_THRESHOLD) {
    const isLowSpread = r0   < LOW_SPREAD_THRESHOLD;
    const isLowOI     = minOI < LOW_OI_THRESHOLD;
    const thinVenue   = resolvedLongOI < resolvedShortOI ? longVenue : shortVenue;
    if (isLowSpread && isLowOI) {
      smallDepthReason = `Low funding spread (${(r0 * 10000).toFixed(2)} bps/hr) and low open interest on ${thinVenue} (${(minOI / 1e6).toFixed(1)}M)`;
    } else if (isLowSpread) {
      smallDepthReason = `Low funding spread between venues — only ${(r0 * 10000).toFixed(2)} bps/hr`;
    } else if (isLowOI) {
      smallDepthReason = `Low open interest on ${thinVenue} (${(minOI / 1e6).toFixed(1)}M) — thin market compresses the rate quickly`;
    }
  }

  return {
    viable: true,
    optimalSize,
    arbDepth,
    r0,
    c,
    alpha,
    effectiveImbalance: minOI / 2,
    maxSizeBeforeZeroRate: minOI,
    slippageAtOptimal,
    slippageAtDepth,
    paybackConservative: paybackHours,
    paybackOptimistic:   paybackHours,
    compressionRisk: 0,
    entryCostUsd,
    smallDepthReason,
    warnings,
  };
}
