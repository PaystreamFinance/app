// ─── Base Venue Adapter Interface ───
//
// To add a new DEX:
//   1. Create a new file in this directory (e.g. newdex.ts)
//   2. Implement VenueAdapter
//   3. Register it in ./registry.ts
//
// To remove a DEX:
//   1. Remove its entry from ./registry.ts
//   2. Delete its adapter file

import type { ArbDepthVenue, VenueData, VenueConstants } from "../types";

export interface VenueAdapter {
  /** Venue identifier */
  readonly venue: ArbDepthVenue;

  /** Constants for this venue (interestRate, clampWidth, slippageTier) */
  readonly constants: VenueConstants;

  /**
   * Fetch all available data for this venue + symbol.
   * Returns null if the venue doesn't support this symbol or data is unavailable.
   * Partial data is OK — set missing fields to defaults.
   */
  fetchData(symbol: string): Promise<VenueData | null>;
}
