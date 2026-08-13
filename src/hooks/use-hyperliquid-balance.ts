import { useQuery } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import {
  extractPrivyEmbeddedEthAddress,
  fetchHyperliquidBalance,
  type HyperliquidBalanceProtocol,
} from "@/lib/hyperliquid-balance";

export function useHyperliquidBalance(
  protocol: HyperliquidBalanceProtocol,
  opts: {
    enabled: boolean;
    refetchInterval?: number;
    staleTime?: number;
    retry?: number;
    refetchOnWindowFocus?: boolean;
  },
) {
  const { user } = usePrivy();
  const ethAddress = extractPrivyEmbeddedEthAddress(user);

  return useQuery({
    queryKey: ["hyperliquid-balance", protocol, ethAddress],
    queryFn: () => fetchHyperliquidBalance(ethAddress, protocol),
    enabled: opts.enabled,
    refetchInterval: opts.refetchInterval,
    staleTime: opts.staleTime,
    retry: opts.retry ?? 1,
    refetchOnWindowFocus: opts.refetchOnWindowFocus ?? false,
  });
}
