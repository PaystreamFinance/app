// ─── Venue Adapter Registry ───
//
// To add a new DEX:    Import its adapter and add to VENUE_ADAPTERS below.
// To remove a DEX:     Delete its line from VENUE_ADAPTERS.
// To disable a DEX:    Comment out its line.

import type { VenueAdapter } from "./base";
import type { ArbDepthVenue } from "../types";
import { hyperliquidAdapter, hyperliquidHip3Adapters } from "./hyperliquid";
import { pacificaAdapter } from "./pacifica";
import { lighterAdapter } from "./lighter";
import { asterAdapter } from "./aster";
import { zeroOneAdapter } from "./01";
import { phoenixAdapter } from "./phoenix";

const VENUE_ADAPTERS: Record<ArbDepthVenue, VenueAdapter> = {
  hyperliquid: hyperliquidAdapter,
  pacifica: pacificaAdapter,
  lighter: lighterAdapter,
  aster: asterAdapter,
  "01": zeroOneAdapter,
  phoenix: phoenixAdapter,
  "hl:xyz": hyperliquidHip3Adapters["hl:xyz"]!,
  "hl:flx": hyperliquidHip3Adapters["hl:flx"]!,
  "hl:hyna": hyperliquidHip3Adapters["hl:hyna"]!,
  "hl:km": hyperliquidHip3Adapters["hl:km"]!,
  "hl:cash": hyperliquidHip3Adapters["hl:cash"]!,
  "hl:para": hyperliquidHip3Adapters["hl:para"]!,
};

export function getVenueAdapter(venue: ArbDepthVenue): VenueAdapter {
  const adapter = VENUE_ADAPTERS[venue];
  if (!adapter) throw new Error(`Unknown venue: ${venue}`);
  return adapter;
}

export function isVenueSupported(venue: string): venue is ArbDepthVenue {
  return venue in VENUE_ADAPTERS;
}
