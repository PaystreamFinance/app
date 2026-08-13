"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchMarkets, type ArbitrageMarket } from "@/lib/arbitrage-api";

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
 * React Query hook for fetching arbitrage markets.
 * Auth tokens are passed opportunistically but not required.
 */
export function useArbitrageMarkets(enabled = true) {
  const { idToken, accessToken } = getPrivyTokens();

  return useQuery<ArbitrageMarket[]>({
    queryKey: ["arbitrage-markets"],
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
    staleTime: 10_000,
    // 30 min — markets list is shared across portfolio + strategies pages,
    // navigation between them should reuse the cache without re-fetching.
    gcTime: 30 * 60 * 1000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: (prev: ArbitrageMarket[] | undefined) => prev,
    retry: (failureCount, err) => {
      // Retry aborts (timeouts) up to 2 times; don't retry other errors
      if (err instanceof Error && err.name === "AbortError") return failureCount < 2;
      return false;
    },
  });
}
