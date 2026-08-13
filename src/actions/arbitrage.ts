"use server";

import {
  selectLongShort,
  type Protocol,
  type ArbPositionResult,
} from "@/lib/select-long-short";

export type { Protocol, ArbPositionResult };

/**
 * Server action: determine which protocols to long/short for funding rate arbitrage.
 *
 * Short the highest rate (earn most / pay least as short).
 * Long the lowest rate (earn most / pay least as long).
 * Spread = highestRate - lowestRate.
 */
export async function determineArbPositions(
  rates: Array<{ protocol: Protocol; fundingRate: number | null }>,
): Promise<ArbPositionResult> {
  return selectLongShort(rates);
}
