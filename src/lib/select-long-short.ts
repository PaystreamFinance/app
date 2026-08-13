import type { ProtocolId } from "./protocol-registry";

export type Protocol = ProtocolId;

export interface ArbPositionResult<P extends string = Protocol> {
  long: P | null;
  short: P | null;
  /** spread = highestRate - lowestRate (the funding you capture) */
  spread: number;
}

/**
 * Pure function: pick which protocols to long/short for funding rate arbitrage.
 *
 * Funding rate mechanics:
 *  - Positive rate → longs pay shorts  (shorts earn)
 *  - Negative rate → shorts pay longs  (longs earn)
 *
 * To maximise arb profit:
 *  - Short the protocol with the HIGHEST rate  (earn most / pay least as short)
 *  - Long  the protocol with the LOWEST  rate  (earn most / pay least as long)
 *  - Spread = highestRate - lowestRate  (your net funding income)
 *
 * Works with any number of protocols (2, 3, 4, …). Null rates are excluded.
 *
 * Examples:
 *  +3, +2.5        → short +3, long +2.5    (spread 0.5)
 *  -3, -2.5        → short -2.5, long -3    (spread 0.5)
 *  +3, -2.5        → short +3, long -2.5    (spread 5.5)
 *  +3, +1, -2      → short +3, long -2      (spread 5)
 */
export function selectLongShort<P extends string = Protocol>(
  rates: Array<{ protocol: P; fundingRate: number | null }>,
): ArbPositionResult<P> {
  const valid = rates.filter(
    (r): r is { protocol: P; fundingRate: number } => r.fundingRate !== null,
  );

  if (valid.length < 2) {
    return { long: null, short: null, spread: 0 };
  }

  // Sort ascending: first = lowest (long), last = highest (short)
  const sorted = [...valid].sort((a, b) => a.fundingRate - b.fundingRate);

  const longEntry = sorted[0]!; // lowest rate  → long  (earn most / pay least)
  const shortEntry = sorted[sorted.length - 1]!; // highest rate → short (earn most / pay least)

  return {
    long: longEntry.protocol,
    short: shortEntry.protocol,
    spread: shortEntry.fundingRate - longEntry.fundingRate,
  };
}
