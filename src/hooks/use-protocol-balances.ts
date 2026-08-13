/**
 * Centralized protocol balance management.
 *
 * Single React Query entry that fans out balance fetching for every enabled
 * DEX. Hyperliquid and HIP-3 venues are fetched directly from Hyperliquid's
 * public info API; non-HL venues stay on their respective backend balance
 * routes.
 *
 * Multiple consumers (navbar, wallet-sheet, trade modal) share the same
 * cache by hitting the stable queryKey `["all-protocol-balances", wallet]`,
 * so the same numbers appear everywhere by construction.
 *
 * To add a new DEX:
 *   1. Add its entry to PROTOCOL_REGISTRY + ENABLED_PROTOCOLS in protocol-registry.ts
 *   2. Add its balance fetcher below if it is not Hyperliquid-compatible
 *   3. That's it — every modal / sheet picks it up
 */

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useIdentityToken, usePrivy } from "@privy-io/react-auth";
import {
  type AggregateBalanceEntry,
  type AggregateBalanceData,
  type AggregateBalanceTotal,
  type AggregateBalanceSummary,
  type AllBalancesResponse,
  type ArbExecProtocol,
} from "@/lib/arbitrage-api";
import {
  ENABLED_PROTOCOLS,
  getHip3Collateral,
  isHip3ProtocolId,
  isProtocolEnabled,
  type ProtocolId,
} from "@/lib/protocol-registry";
import {
  extractPrivyEmbeddedEthAddress,
  fetchAllHyperliquidBalances,
} from "@/lib/hyperliquid-balance";
import { fetchLighterBalanceDirect } from "@/lib/lighter-balance";
import { getPrivyAccessToken } from "@/lib/privy-auth";
import { triggerBalanceRefresh } from "@/lib/balance-refresh";
import { PERP_HEDGE_API_URL } from "@/lib/perp-api-url";

// ─── Types ───

export interface ProtocolBalance {
  /** Human-readable balance (withdrawable amount), 2dp, minus 1c for safety. */
  balance: string;
  /** Numeric balance for calculations (already safe-floored). */
  balanceNum: number;
  /** Free collateral (raw availableToTrade, full precision) — used for trade sizing. */
  freeCollateralUSD: number;
  /** Collateral token for this venue, e.g. USDC on main HL or USDE on hl:hyna. */
  quoteUnit?: string;
}

export type ProtocolBalanceMap = Partial<Record<ProtocolId, ProtocolBalance>>;

// ─── Helpers ───

const safeFloor = (v: string | number): string => {
  const n = parseFloat(String(v));
  if (!Number.isFinite(n)) return "—";
  const floored = Math.floor(n * 100) / 100;
  return Math.max(0, floored - 0.01).toFixed(2);
};

/** Produce the consumer-facing ProtocolBalance from a per-DEX aggregate
 *  entry. Errored entries collapse to "—" / 0 so the UI shows the venue
 *  as unavailable without breaking layout. */
function entryToBalance(
  entry: AggregateBalanceEntry | undefined,
  fallbackQuoteUnit: string | undefined,
): ProtocolBalance {
  if (!entry || entry.status === "error") {
    return {
      balance: "—",
      balanceNum: 0,
      freeCollateralUSD: 0,
      quoteUnit: fallbackQuoteUnit,
    };
  }
  // Backend prefers availableToTrade as the primary withdrawable figure.
  // Fallback to the explicit `withdrawable` field for venues that report
  // both. Stay defensive against missing keys (older provider responses).
  const avail = entry.data.availableToTrade ?? entry.data.withdrawable ?? "0";
  return {
    balance: avail ? safeFloor(avail) : "—",
    balanceNum: avail ? parseFloat(safeFloor(avail)) : 0,
    freeCollateralUSD: parseFloat(avail) || 0,
    quoteUnit: entry.data.quoteUnit ?? fallbackQuoteUnit,
  };
}

function quoteFallback(protocol: ProtocolId): string {
  return protocol === "pacifica"
    ? "USDC"
    : protocol === "hyperliquid"
      ? "USDC"
      : protocol === "aster"
        ? "USDT"
        : protocol === "lighter"
          ? "USDC"
          : protocol === "01"
            ? "USDC"
            : protocol === "phoenix"
              ? "USDC"
              : (getHip3Collateral(protocol) ?? "USDC");
}

// ─── Aster smart-fetch state (module-level, shared across all hook instances) ───

let asterLastSuccessTime = 0;
let asterPostTradeSnapshot: string | null = null;
let asterPostTradeActive = false;
let asterCachedEntry: AggregateBalanceEntry | null = null;

function shouldFetchAster(): boolean {
  if (asterPostTradeActive) return true;
  if (Date.now() - asterLastSuccessTime >= 60_000) return true;
  return false;
}

/** Call immediately after a successful Aster trade to start aggressive polling. */
export function triggerAsterPostTradeRefresh() {
  asterPostTradeActive = true;
  asterPostTradeSnapshot =
    asterCachedEntry?.status === "success"
      ? (asterCachedEntry.data?.accountValue ?? null)
      : null;
}

/** Reset the 60-second cooldown so the next fetch cycle includes Aster. */
export function resetAsterCooldown() {
  asterLastSuccessTime = 0;
}

class RateLimitError extends Error {
  constructor(protocol: string) {
    super(`Rate limited fetching ${protocol} balance (429)`);
    this.name = "RateLimitError";
  }
}

async function fetchBackendBalance(
  protocol: "pacifica" | "aster" | "01" | "phoenix",
  idToken: string,
  accessToken?: string,
): Promise<AggregateBalanceEntry> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "privy-id-token": idToken,
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const path =
    protocol === "pacifica"
      ? "/pacifica/balance"
      : `/arb/balance/${protocol}`;
  const response = await fetch(`${PERP_HEDGE_API_URL}${path}`, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(10_000),
  });

  if (response.status === 429) {
    throw new RateLimitError(protocol);
  }
  if (response.status === 500) {
    // Backend wraps upstream 429s (e.g. Aster rate limit) as 500.
    // Parse the body to detect it and throw RateLimitError so the
    // cached balance is served instead of an error entry.
    const body = await response.json().catch(() => null) as Record<string, unknown> | null;
    const errStr = JSON.stringify(body ?? "");
    if (errStr.includes("429") || errStr.toLowerCase().includes("too many requests")) {
      throw new RateLimitError(protocol);
    }
    throw new Error(`Failed to fetch ${protocol} balance: ${response.statusText}`);
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch ${protocol} balance: ${response.statusText}`);
  }

  const body = (await response.json()) as {
    message?: string;
    data?: AggregateBalanceData;
  };

  return {
    dex: protocol,
    status: "success",
    message: body.message,
    data: body.data ?? {
      accountValue: "0.00",
      accountEquity: "0.00",
      availableToTrade: "0.00",
      withdrawable: "0.00",
      totalMarginUsed: "0.00",
      totalPositionValue: "0.00",
      positionsCount: 0,
      quoteUnit: quoteFallback(protocol),
    },
  };
}

function totalFromEntries(
  balances: Partial<Record<ArbExecProtocol, AggregateBalanceEntry>>,
): Record<string, AggregateBalanceTotal> {
  const totals: Record<string, AggregateBalanceTotal> = {};

  for (const entry of Object.values(balances)) {
    if (!entry || entry.status === "error") continue;
    const quoteUnit = entry.data.quoteUnit ?? "USDC";
    const total =
      totals[quoteUnit] ??
      (totals[quoteUnit] = {
        quoteUnit,
        accountValue: "0.00",
        accountEquity: "0.00",
        availableToTrade: "0.00",
        withdrawable: "0.00",
        totalMarginUsed: "0.00",
        totalPositionValue: "0.00",
        positionsCount: 0,
      });

    total.accountValue = (
      parseFloat(total.accountValue) + parseFloat(entry.data.accountValue)
    ).toFixed(2);
    total.accountEquity = (
      parseFloat(total.accountEquity) + parseFloat(entry.data.accountEquity)
    ).toFixed(2);
    total.availableToTrade = (
      parseFloat(total.availableToTrade) + parseFloat(entry.data.availableToTrade)
    ).toFixed(2);
    total.withdrawable = (
      parseFloat(total.withdrawable) + parseFloat(entry.data.withdrawable)
    ).toFixed(2);
    total.totalMarginUsed = (
      parseFloat(total.totalMarginUsed) + parseFloat(entry.data.totalMarginUsed)
    ).toFixed(2);
    total.totalPositionValue = (
      parseFloat(total.totalPositionValue) +
      parseFloat(entry.data.totalPositionValue)
    ).toFixed(2);
    total.positionsCount += entry.data.positionsCount;
  }

  return totals;
}

async function fetchProtocolBalances(
  idToken: string,
  accessToken: string | undefined,
  ethAddress: string | null,
  previousBalances?: Partial<Record<ArbExecProtocol, AggregateBalanceEntry>>,
): Promise<AllBalancesResponse> {
  const enabledProtocols = ENABLED_PROTOCOLS.filter((id) =>
    isProtocolEnabled(id),
  );
  const balances: Partial<Record<ArbExecProtocol, AggregateBalanceEntry>> = {};

  // Hyperliquid + HIP-3: fetched directly from HL's public API.
  // Lighter: fetched directly from Lighter's public API (no backend needed).
  const [hlBalances, lighterEntry] = await Promise.all([
    fetchAllHyperliquidBalances(ethAddress),
    enabledProtocols.includes("lighter")
      ? fetchLighterBalanceDirect(ethAddress)
      : Promise.resolve(null),
  ]);
  Object.assign(balances, hlBalances);
  if (lighterEntry) balances["lighter"] = lighterEntry;

  // Aster is excluded from the batch — it has its own throttled fetch path below.
  // Lighter is excluded here because it is fetched directly above.
  const backendProtocols = enabledProtocols.filter(
    (id): id is "pacifica" | "01" | "phoenix" =>
      id === "pacifica" || id === "01" || id === "phoenix",
  );

  const backendResults = await Promise.allSettled(
    backendProtocols.map(async (protocol) => [
      protocol,
      await fetchBackendBalance(protocol, idToken, accessToken),
    ] as const),
  );

  for (const result of backendResults) {
    if (result.status === "fulfilled") {
      const [protocol, entry] = result.value;
      balances[protocol] = entry;
      continue;
    }
    const protocol = backendProtocols[backendResults.indexOf(result)];
    if (!protocol) continue;
    // On 429/rate-limit, serve the last known GOOD balance instead of
    // overwriting with an error entry. Only substitute if the previous
    // entry was a success — don't recycle a stale error entry.
    if (
      result.reason instanceof RateLimitError &&
      previousBalances?.[protocol]?.status === "success"
    ) {
      balances[protocol] = previousBalances[protocol];
      continue;
    }
    balances[protocol] = {
      dex: protocol,
      status: "error",
      message: `Failed to fetch ${protocol} balance`,
      error:
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason),
    };
  }

  // ── Aster: smart fetch with 60-second throttle and post-trade aggressive polling ──
  if (enabledProtocols.includes("aster")) {
    if (shouldFetchAster()) {
      try {
        const entry = await fetchBackendBalance("aster", idToken, accessToken);
        asterCachedEntry = entry;
        asterLastSuccessTime = Date.now();
        balances["aster"] = entry;
        // If we were in post-trade polling and the accountValue changed, stop polling.
        if (asterPostTradeActive && entry.status === "success" && entry.data?.accountValue !== asterPostTradeSnapshot) {
          asterPostTradeActive = false;
        }
      } catch {
        // On error, keep the last good balance — never drop to zero or show error.
        if (asterCachedEntry) {
          balances["aster"] = asterCachedEntry;
        } else if (previousBalances?.aster?.status === "success") {
          balances["aster"] = previousBalances.aster;
        }
        // Keep asterPostTradeActive as-is so the next cycle retries.
      }
    } else if (asterCachedEntry) {
      balances["aster"] = asterCachedEntry;
    }
  }

  const shownBalances = Object.fromEntries(
    Object.entries(balances).filter(([id]) =>
      enabledProtocols.includes(id as ProtocolId),
    ),
  ) as Partial<Record<ArbExecProtocol, AggregateBalanceEntry>>;
  const dexesFailed = Object.values(shownBalances).filter(
    (entry) => entry?.status === "error",
  ).length;
  const dexesReporting = Object.values(shownBalances).filter(
    (entry) => entry?.status === "success",
  ).length;

  return {
    status: dexesFailed > 0 ? "partial" : "success",
    message:
      dexesFailed > 0
        ? "Some balances failed to fetch"
        : "Balances fetched successfully",
    data: {
      balances: shownBalances,
      totalsByQuoteUnit: totalFromEntries(shownBalances),
      summary: {
        positionsCount: Object.values(shownBalances).reduce(
          (sum, entry) =>
            entry?.status === "success" ? sum + entry.data.positionsCount : sum,
          0,
        ),
        dexesReporting,
        dexesFailed,
        dexesTotal: enabledProtocols.filter(
          (id) =>
            id === "hyperliquid" ||
            id === "aster" ||
            isHip3ProtocolId(id) ||
            (backendProtocols as string[]).includes(id),
        ).length,
      },
    },
  };
}

// ─── Hook ───

export function useProtocolBalances(opts: { enabled: boolean }) {
  const { enabled } = opts;
  const { user } = usePrivy();
  const { identityToken } = useIdentityToken();
  const queryClient = useQueryClient();

  // Wallet scopes the cache per-user. queryKey deliberately stays out
  // of the rotating identityToken (would thrash cache on token rotation).
  const wallet = user?.wallet?.address ?? user?.id ?? null;
  const ethAddress = extractPrivyEmbeddedEthAddress(user);

  const query = useQuery<AllBalancesResponse>({
    queryKey: ["all-protocol-balances", wallet, ethAddress],
    queryFn: async () => {
      if (!identityToken) throw new Error("Authentication required");
      const accessToken = getPrivyAccessToken();
      const previousData = queryClient.getQueryData<AllBalancesResponse>([
        "all-protocol-balances",
        wallet,
        ethAddress,
      ]);
      return fetchProtocolBalances(
        identityToken,
        accessToken ?? undefined,
        ethAddress,
        previousData?.data.balances,
      );
    },
    enabled: enabled && !!wallet && !!identityToken,
    refetchInterval: 5000,
    staleTime: 3000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: (prev: AllBalancesResponse | undefined) => prev,
  });

  // ── Build the consumer-facing ProtocolBalanceMap ──

  const balances: ProtocolBalanceMap = React.useMemo(() => {
    const map: ProtocolBalanceMap = {};
    const apiBalances = query.data?.data.balances ?? {};

    // Walk each enabled protocol; if the fetcher returned an entry for
    // it (success OR error), include it in the map. Disabled protocols
    // never appear in `apiBalances` so the loop just skips them.
    const protocolsToShow = (Object.keys(apiBalances) as ProtocolId[]).filter(
      (id) => isProtocolEnabled(id),
    );

    for (const protocol of protocolsToShow) {
      const entry = apiBalances[protocol as ArbExecProtocol];
      const fallbackQuote =
        protocol === "pacifica"
          ? "USDC"
          : protocol === "hyperliquid"
            ? "USDC"
            : protocol === "aster"
              ? "USDT"
              : protocol === "lighter"
                ? "USDC"
                : protocol === "01"
                  ? "USDC"
                  : protocol === "phoenix"
                    ? "USDC"
                  : (getHip3Collateral(protocol) ?? "USDC");
      map[protocol] = entryToBalance(entry, fallbackQuote);
    }

    return map;
  }, [query.data]);

  // ── Bucketed totals + summary ──

  const totalsByQuoteUnit: Record<string, AggregateBalanceTotal> =
    query.data?.data.totalsByQuoteUnit ?? {};

  const summary: AggregateBalanceSummary | null =
    query.data?.data.summary ?? null;

  // ── Refresh broadcast ──
  //
  // Single invalidation: every consumer of useProtocolBalances re-fetches
  // in lockstep. Cheaper than the old per-protocol invalidation since
  // there's now exactly one queryKey to invalidate.

  const refetchAll = React.useCallback(
    async (reason: string) => {
      // Reset cooldown so the next fetch cycle includes Aster (manual refresh
      // should always get fresh data regardless of the 60s throttle).
      asterLastSuccessTime = 0;
      await queryClient.invalidateQueries({
        queryKey: ["all-protocol-balances"],
      });
      triggerBalanceRefresh({ reason });
    },
    [queryClient],
  );

  /** Get withdrawable balance string for a protocol (for withdraw modal). */
  const getWithdrawableBalance = React.useCallback(
    (protocol: ProtocolId): string => {
      return balances[protocol]?.balance ?? "—";
    },
    [balances],
  );

  /** Get free collateral for a protocol (for trade sizing). */
  const getFreeCollateral = React.useCallback(
    (protocol: ProtocolId): number => {
      return balances[protocol]?.freeCollateralUSD ?? 0;
    },
    [balances],
  );

  return {
    balances,
    totalsByQuoteUnit,
    summary,
    refetchAll,
    getWithdrawableBalance,
    getFreeCollateral,
    /** Surfaces the partial-failure state to the UI when ≥1 DEX errored. */
    isPartial: query.data?.status === "partial",
    /** True before the first successful response — useful for skeletons. */
    isPending: query.isPending,
  };
}
