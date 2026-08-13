"use client";

import { useArbitragePositions } from "@/app/strategies/hooks/use-arbitrage-positions";

/**
 * Mounts alongside the app layout to pre-warm the positions cache before
 * the user navigates to the portfolio page. Renders nothing — side-effect only.
 *
 * useArbitragePositions is internally gated on wallet + identityToken so it
 * won't fire unauthenticated requests. Once the user connects their wallet
 * the query starts immediately, and localStorage persistence means the
 * result is available instantly on subsequent page loads.
 */
export function PositionsPrefetch() {
  useArbitragePositions();
  return null;
}
