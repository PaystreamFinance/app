"use client";

import { useQuery } from "@tanstack/react-query";
import { useIdentityToken, usePrivy } from "@privy-io/react-auth";

import {
  fetchSpotPerpPositions,
  type SpotPerpPositionsResponse,
} from "@/lib/spotperp-api";
import { getPrivyAccessToken } from "@/lib/privy-auth";
import { useBetaMode } from "@/hooks/use-beta-mode";

/**
 * React Query hook for fetching user's spot-perp positions
 * Requires authentication (Privy id token and access token).
 *
 * Spot-Perp is a beta-only feature. The query stays disabled until the user
 * enables beta mode via the footer toggle, so /trade/spot-perp/positions is
 * never called outside beta.
 */
export function useSpotPerpPositions(enabled = true) {
  const { user } = usePrivy();
  const { identityToken } = useIdentityToken();
  const wallet = user?.wallet?.address ?? null;
  const { betaMode } = useBetaMode();
  const query = useQuery<SpotPerpPositionsResponse>({
    // Stable per-user cache key — token rotates and would thrash the cache
    // if part of the key. identityToken is captured by the closure for
    // each fetch, no sessionStorage round-trip.
    queryKey: ["spotperp-positions", wallet],
    queryFn: async () => {
      if (!identityToken) throw new Error("Authentication required");
      const accessToken = getPrivyAccessToken();
      return fetchSpotPerpPositions(identityToken, accessToken ?? undefined);
    },
    enabled: !!wallet && !!enabled && betaMode && !!identityToken,
    staleTime: 10_000,
    // 30 min — match useArbitragePositions so navigations don't evict cache.
    gcTime: 30 * 60 * 1000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    // Don't override structuralSharing to keep previous data when next is
    // empty — that pattern hides legitimate close events. placeholderData
    // already prevents flicker during refetch; React Query's default
    // structural sharing handles ref-equality of unchanged sub-trees.
    placeholderData: (prev: SpotPerpPositionsResponse | undefined) => prev,
  });

  // When disabled (no wallet or beta mode off), isPending stays true but we
  // shouldn't block the UI
  const isBlocking = !!wallet && betaMode && query.isPending;

  return { ...query, isBlocking };
}
