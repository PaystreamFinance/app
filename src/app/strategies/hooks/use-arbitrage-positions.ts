"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useIdentityToken, usePrivy } from "@privy-io/react-auth";
import { fetchPositions, type PositionsResponse, type ArbitragePositionPair } from "@/lib/arbitrage-api";
import { getPrivyAccessToken } from "@/lib/privy-auth";

type PairLeg = ArbitragePositionPair["long"];

function pairCacheKey(pair: ArbitragePositionPair): string {
  if (pair.publicId) return `public:${pair.publicId}`;
  if (pair.pairId != null) return `pair:${pair.pairId}`;
  return `legs:${legCacheKey(pair.long)}|${legCacheKey(pair.short)}`;
}

function legCacheKey(leg: Pick<PairLeg, "protocol" | "symbol" | "direction">): string {
  return `${leg.protocol}:${leg.symbol}:${leg.direction}`;
}

function legStillLooksOpen(leg: PairLeg): boolean {
  return (
    leg.margin > 0 ||
    leg.entryPrice > 0 ||
    leg.leverage > 0 ||
    Math.abs(leg.size?.asset ?? 0) > 0 ||
    Math.abs(leg.size?.usd ?? 0) > 0
  );
}

function shouldReusePreviousLeg(current: PairLeg, previous: PairLeg): boolean {
  // /arb/positions/v2 already tells us when a leg was rate-limited:
  // the backend returns `live: null`, which normalizes to
  // `liveDataMissing: true`. While that flag is set, keep serving the
  // last richer cached snapshot for that leg instead of collapsing the
  // portfolio row back to DB-only values like entryPrice: 0 / pnl: 0.
  if (!current.liveDataMissing) return false;

  return (
    (Math.abs(previous.size?.asset ?? 0) > Math.abs(current.size?.asset ?? 0) ||
      Math.abs(previous.size?.usd ?? 0) > Math.abs(current.size?.usd ?? 0) ||
      Math.abs(previous.pnl) > Math.abs(current.pnl) ||
      previous.entryPrice > current.entryPrice ||
      previous.margin > current.margin) &&
    legStillLooksOpen(previous)
  );
}

function sumPositionsPnl(
  positions: PositionsResponse["positions"],
): number {
  let total = 0;
  for (const list of Object.values(positions)) {
    if (!Array.isArray(list) || list.length === 0) continue;
    for (const position of list) {
      total += position.pnl ?? 0;
    }
  }
  return total;
}

function legHasTpSl(leg: Pick<PairLeg, "triggerPrices" | "takeProfitPrice" | "stopLossPrice">): boolean {
  return (
    leg.triggerPrices?.tp != null ||
    leg.triggerPrices?.sl != null ||
    leg.takeProfitPrice != null ||
    leg.stopLossPrice != null
  );
}

function patchTpSlFromPrev<T extends Pick<PairLeg, "triggerPrices" | "takeProfitPrice" | "stopLossPrice">>(
  fresh: T,
  prev: T,
): T {
  if (legHasTpSl(fresh) || !legHasTpSl(prev)) return fresh;
  return {
    ...fresh,
    triggerPrices: prev.triggerPrices ?? fresh.triggerPrices,
    takeProfitPrice: prev.takeProfitPrice ?? fresh.takeProfitPrice,
    stopLossPrice: prev.stopLossPrice ?? fresh.stopLossPrice,
  };
}

/**
 * When the /arb/tp-sl lookup fails or returns no results, fresh positions
 * come back without triggerPrices. Preserve the last known TP/SL values
 * from the previous response so the UI doesn't flicker to "—".
 */
function preserveStaleTpSl(
  fresh: PositionsResponse,
  previous: PositionsResponse | undefined,
): PositionsResponse {
  if (!previous) return fresh;

  // Patch flat per-protocol positions
  const positions = { ...fresh.positions } as PositionsResponse["positions"];
  for (const [protocol, list] of Object.entries(positions)) {
    if (!Array.isArray(list) || list.length === 0) continue;
    const prevList = previous.positions[protocol as keyof typeof previous.positions];
    if (!Array.isArray(prevList) || prevList.length === 0) continue;
    positions[protocol as keyof typeof positions] = list.map((position) => {
      const prev = prevList.find(
        (p) => p.symbol === position.symbol && p.direction === position.direction,
      );
      return prev ? patchTpSlFromPrev(position, prev) : position;
    }) as typeof list;
  }

  // Patch pair legs — prefer already-patched positions from above as source of truth
  const pairs = fresh.pairs?.map((pair) => {
    const prevPair = previous.pairs?.find((p) => pairCacheKey(p) === pairCacheKey(pair));
    if (!prevPair) return pair;
    return {
      ...pair,
      long: patchTpSlFromPrev(pair.long, prevPair.long),
      short: patchTpSlFromPrev(pair.short, prevPair.short),
    };
  });

  return { ...fresh, positions, pairs };
}

/** For any pair leg where live data is missing (e.g. Aster rate-limited),
 *  substitute the matching leg from the previous successful response so
 *  the UI shows stale data rather than zeros. */
function mergeCachedLiveData(
  fresh: PositionsResponse,
  previous: PositionsResponse | undefined,
): PositionsResponse {
  if (!previous?.pairs?.length || !fresh.pairs?.length) return fresh;
  const prevByPairKey = new Map<string, ArbitragePositionPair>();
  for (const pair of previous.pairs) {
    prevByPairKey.set(pairCacheKey(pair), pair);
  }
  let anyLiveMerged = false;
  const mergedLegs = new Map<string, PairLeg>();
  const pairs = fresh.pairs.map((pair) => {
    const prev = prevByPairKey.get(pairCacheKey(pair));
    if (!prev) return pair;
    const longMissing = shouldReusePreviousLeg(pair.long, prev.long);
    const shortMissing = shouldReusePreviousLeg(pair.short, prev.short);
    if (longMissing || shortMissing) {
      anyLiveMerged = true;
    }
    const long = longMissing ? { ...prev.long, liveDataMissing: true } : pair.long;
    const short = shortMissing ? { ...prev.short, liveDataMissing: true } : pair.short;
    if (longMissing) mergedLegs.set(legCacheKey(long), long);
    if (shortMissing) mergedLegs.set(legCacheKey(short), short);
    return {
      ...pair,
      long,
      short,
    };
  });
  const positions = { ...fresh.positions } as PositionsResponse["positions"];
  for (const [protocol, list] of Object.entries(positions)) {
    if (!Array.isArray(list) || list.length === 0) continue;
    positions[protocol as keyof typeof positions] = list.map((position) => {
      const merged = mergedLegs.get(
        legCacheKey({
          protocol: protocol as PairLeg["protocol"],
          symbol: position.symbol,
          direction: position.direction,
        }),
      );
      if (!merged) return position;
      const { protocol: _protocol, ...rest } = merged;
      return { ...position, ...rest, liveDataMissing: true };
    }) as typeof list;
  }
  // When any leg is running on cached live data, the backend aggregate can
  // drift from what the UI is actually rendering. Recompute from the merged
  // per-leg PnL so the header stays consistent with the rows.
  const totalPnl = anyLiveMerged ? sumPositionsPnl(positions) : fresh.totalPnl;
  return { ...fresh, positions, pairs, totalPnl };
}

/**
 * React Query hook for fetching user's arbitrage positions.
 * Requires authentication (Privy id token and access token).
 */
export function useArbitragePositions(enabled = true) {
  const { user } = usePrivy();
  // Pull the identity token directly from Privy (in-memory) instead of
  // waiting for the storeTokens effect to mirror it into sessionStorage.
  const { identityToken } = useIdentityToken();
  const queryClient = useQueryClient();
  const wallet = user?.wallet?.address ?? null;

  const query = useQuery<PositionsResponse>({
    queryKey: ["arbitrage-positions", wallet],
    queryFn: async () => {
      if (!identityToken) throw new Error("Authentication required");
      const accessToken = getPrivyAccessToken();
      const fresh = await fetchPositions(identityToken, accessToken ?? undefined);
      const previous = queryClient.getQueryData<PositionsResponse>(["arbitrage-positions", wallet]);
      const merged = mergeCachedLiveData(fresh, previous);
      // Only preserve stale TP/SL when the lookup actually failed — if the
      // lookup ran and returned no triggers, that's intentional (trigger fired
      // or was removed) and we must not restore the old values.
      return merged.tpSlLookupFailed ? preserveStaleTpSl(merged, previous) : merged;
    },
    enabled: !!wallet && !!enabled && !!identityToken,
    staleTime: 5_000,
    gcTime: 30 * 60 * 1000,
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: (prev: PositionsResponse | undefined) => prev,
  });

  const isBlocking = !!wallet && !!identityToken && query.isPending;

  return { ...query, isBlocking };
}
