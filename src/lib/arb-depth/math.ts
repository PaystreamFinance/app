// ─── Arb Depth Math ───
//
// arbDepth = min(longOI, shortOI) / 2
//
// The position size that zeroes the funding rate (fully balances OI skew).
// Rate compression: r(q) = r₀ × (1 − q/I), hits zero at q = I = minOI/2.

import { safeDiv } from "@/lib/math/primitives";

// ─── Self-Impact: OI-Based Rate Compression ───

export interface SelfImpactInput {
  r0: number;
  longVenueOI: number;
  shortVenueOI: number;
}

export interface SelfImpactResult {
  alpha: number;
  effectiveImbalance: number;
  maxSizeBeforeZeroRate: number;
}

export function computeSelfImpact(input: SelfImpactInput): SelfImpactResult {
  const { r0, longVenueOI, shortVenueOI } = input;

  if (r0 <= 0) return { alpha: 0, effectiveImbalance: 0, maxSizeBeforeZeroRate: 0 };

  const minOI = Math.min(
    longVenueOI  > 0 ? longVenueOI  : Infinity,
    shortVenueOI > 0 ? shortVenueOI : Infinity,
  );

  if (!Number.isFinite(minOI) || minOI <= 0) {
    return { alpha: 0, effectiveImbalance: 0, maxSizeBeforeZeroRate: 0 };
  }

  return {
    alpha: safeDiv(2 * r0, minOI, 0),
    effectiveImbalance: minOI / 2,
    maxSizeBeforeZeroRate: minOI,
  };
}

// ─── Payback ───
//
// Conservative: rate stays compressed (you reduced OI imbalance permanently)
// Optimistic: rate mean-reverts (other traders close, skew returns)

export interface PaybackInput {
  r0: number;
  c: number;
  alpha: number;
  optimalSize: number;
  slippageAtOptimal: number;
}

export interface PaybackResult {
  paybackConservative: number;
  paybackOptimistic: number;
  compressionRisk: number;
  entryCostUsd: number;
}

export function computePayback(input: PaybackInput): PaybackResult {
  const { r0, c, alpha, optimalSize, slippageAtOptimal } = input;

  const entryCostUsd = (c + slippageAtOptimal) * optimalSize;

  const rEffective = r0 > 0
    ? r0 * Math.max(0, 1 - safeDiv(alpha * optimalSize, r0, 0))
    : 0;
  const conservativeHourly = Math.max(0, rEffective - c) * optimalSize;
  const paybackConservative = conservativeHourly > 0
    ? safeDiv(entryCostUsd, conservativeHourly * 24, 999)
    : 999;

  const optimisticHourly = (r0 - c) * optimalSize;
  const paybackOptimistic = optimisticHourly > 0
    ? safeDiv(entryCostUsd, optimisticHourly * 24, 999)
    : 999;

  return {
    paybackConservative: Math.min(paybackConservative, 999),
    paybackOptimistic: Math.min(paybackOptimistic, 999),
    compressionRisk: Math.max(0, paybackConservative - paybackOptimistic),
    entryCostUsd,
  };
}
