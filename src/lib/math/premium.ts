// ─── Premium (mark vs oracle) ───
//
// Premium = (mark - oracle) / oracle
//
// Used by every perp venue adapter. Consolidated here so the sign convention,
// zero-oracle handling, and missing-data behaviour are identical everywhere.

import { parsePositive, parseFinite, safeDiv } from "./primitives";

/**
 * Compute the premium of mark over oracle/index price as a decimal ratio.
 * Returns 0 when oracle <= 0, oracle is non-finite, or mark is non-finite.
 * Never returns NaN or ±Infinity.
 */
export function computePremium(
  markPrice: unknown,
  oraclePrice: unknown,
): number {
  const mark = parseFinite(markPrice);
  const oracle = parsePositive(oraclePrice);
  if (mark === null || oracle === null) return 0;
  return safeDiv(mark - oracle, oracle, 0);
}
