"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchMarkets, type SpotPerpMarket } from "@/lib/spotperp-api";

function getPrivyTokens(): {
  idToken: string | null;
  accessToken: string | null;
} {
  if (typeof window === "undefined") {
    return { idToken: null, accessToken: null };
  }
  return {
    idToken: sessionStorage.getItem("privy-id-token"),
    accessToken: sessionStorage.getItem("privy-access-token"),
  };
}

/**
 * React Query hook for fetching spot-perp markets.
 * Auth tokens are passed opportunistically but not required.
 */
export function useSpotPerpMarkets(enabled = true) {
  const { idToken, accessToken } = getPrivyTokens();

  return useQuery<SpotPerpMarket[]>({
    queryKey: ["spotperp-markets"],
    queryFn: async () => {
      const response = await fetchMarkets(
        idToken || undefined,
        accessToken || undefined,
      );
      if (response.status !== "success") {
        throw new Error("Failed to fetch markets");
      }
      return response.markets;
    },
    enabled,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
  });
}
