/**
 * Funding payment history — GET /arb/activity/funding/history.
 *
 * Returns USD-denominated funding flows across every supported DEX over
 * the past year (default window). Used to surface:
 *   - Top-line `fundingEarned` / `fundingPaid` / `totalFundingUsd` in the
 *     portfolio header metrics next to PnL.
 *   - Per-leg breakdown so the FundingPerpExpandedRow can show how much
 *     funding each side of an arb pair actually accrued.
 *
 * Per-leg key shape: `${protocol.lower()}|${symbol.upper()}`.
 * Direction is intentionally excluded — a single DEX cannot hold both a
 * long and short on the same asset simultaneously, so (protocol, symbol)
 * is already unique per open position. Filtering by `sinceMs` (createdAt)
 * is sufficient to scope entries to the current position.
 */

"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useIdentityToken, usePrivy } from "@privy-io/react-auth";
import { getPrivyAccessToken } from "@/lib/privy-auth";

import { PERP_HEDGE_API_URL } from "@/lib/perp-api-url";

export interface FundingPaymentEntry {
  symbol: string;
  /** USD. Positive = earned, negative = paid. */
  amount: number;
  /** Funding rate at the time of payment. 0 for Aster (rate not surfaced). */
  rate: number;
  /** Milliseconds epoch. */
  timestamp: number;
  /** "long" or "short". Missing on Aster — the sign of `amount` is the
   *  only signal of which side accrued the payment. */
  direction?: "long" | "short";
}

export interface FundingPaymentsHistoryResponse {
  status: "success";
  drift: FundingPaymentEntry[];
  hyperliquid: FundingPaymentEntry[];
  pacifica: FundingPaymentEntry[];
  aster: FundingPaymentEntry[];
  lighter: FundingPaymentEntry[];
  "01"?: FundingPaymentEntry[];
  phoenix?: FundingPaymentEntry[];
  /** HIP-3 venues are surfaced under their `hl:<dex>` key when supported. */
  [key: string]: unknown;
  errors?: Record<string, string>;
  warnings?: Record<string, string>;
  fundingEarned: number;
  fundingPaid: number;
  totalFundingUsd: number;
}

const PROTOCOL_KEYS = [
  "drift",
  "hyperliquid",
  "pacifica",
  "aster",
  "lighter",
  "01",
  "phoenix",
  "hl:xyz",
  "hl:flx",
  "hl:hyna",
  "hl:km",
  "hl:cash",
  "hl:para",
] as const;

export interface FundingLegTotals {
  earned: number;
  paid: number;
}

const ZERO: FundingLegTotals = { earned: 0, paid: 0 };

function legKey(protocol: string, symbol: string): string {
  return `${protocol.toLowerCase()}|${symbol.toUpperCase()}`;
}

/** Walk every entry in the response and bucket raw entries by
 *  (protocol, symbol) so callers can filter by timestamp.
 *  Direction is excluded from the key — a single DEX can't hold long
 *  and short on the same asset simultaneously.
 *  HIP-3 venues are nested under `hip3` in the API response — we
 *  flatten them alongside the top-level protocol entries. */
function buildLegEntries(
  data: FundingPaymentsHistoryResponse | undefined,
): Map<string, FundingPaymentEntry[]> {
  const map = new Map<string, FundingPaymentEntry[]>();
  if (!data) return map;

  const addEntry = (key: string, entry: FundingPaymentEntry) => {
    const prev = map.get(key) ?? [];
    prev.push(entry);
    map.set(key, prev);
  };

  const processEntries = (protocol: string, entries: unknown) => {
    if (!Array.isArray(entries)) return;
    for (const e of entries as FundingPaymentEntry[]) {
      if (!e || typeof e.symbol !== "string") continue;
      if (typeof e.amount !== "number" || !Number.isFinite(e.amount)) continue;
      addEntry(legKey(protocol, e.symbol), e);
    }
  };

  // Top-level protocols (drift, hyperliquid, pacifica, aster, lighter, 01)
  for (const protocol of PROTOCOL_KEYS) {
    processEntries(protocol, (data as Record<string, unknown>)[protocol]);
  }

  // HIP-3 venues are nested under `hip3` in the funding history response
  // (e.g. data.hip3["hl:hyna"]), NOT at the top level.
  const hip3 = (data as Record<string, unknown>).hip3;
  if (hip3 && typeof hip3 === "object" && !Array.isArray(hip3)) {
    for (const [dex, entries] of Object.entries(hip3 as Record<string, unknown>)) {
      processEntries(dex, entries);
    }
  }

  return map;
}

/** Accumulate earned/paid from a list of raw entries, optionally
 *  filtered to only those at or after `sinceMs` (position createdAt). */
function sumEntries(
  entries: FundingPaymentEntry[] | undefined,
  sinceMs?: number,
): FundingLegTotals {
  if (!entries || entries.length === 0) return ZERO;
  const result = { earned: 0, paid: 0 };
  for (const e of entries) {
    if (sinceMs !== undefined && e.timestamp < sinceMs) continue;
    if (e.amount > 0) result.earned += e.amount;
    else if (e.amount < 0) result.paid += e.amount;
  }
  return result;
}

export function useFundingPaymentsHistory(enabled = true) {
  const { user } = usePrivy();
  const { identityToken } = useIdentityToken();
  const wallet = user?.wallet?.address ?? null;

  const query = useQuery<FundingPaymentsHistoryResponse>({
    queryKey: ["funding-payments-history", wallet],
    queryFn: async () => {
      if (!identityToken) throw new Error("Authentication required");
      const accessToken = getPrivyAccessToken();
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        "privy-id-token": identityToken,
      };
      if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
      const res = await fetch(
        `${PERP_HEDGE_API_URL}/arb/activity/funding/history`,
        { method: "GET", headers, signal: AbortSignal.timeout(15_000) },
      );
      if (!res.ok) {
        if (res.status === 401) throw new Error("Authentication required");
        throw new Error(`Failed to fetch funding history: ${res.statusText}`);
      }
      return res.json();
    },
    enabled: enabled && !!wallet && !!identityToken,
    staleTime: 20 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchInterval: 20 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: (prev) => prev,
  });

  const legEntries = React.useMemo(
    () => buildLegEntries(query.data),
    [query.data],
  );

  /** Resolve per-leg earned/paid for a (protocol, symbol) pair.
   *  Pass `sinceMs` (epoch ms) to exclude payments before the position was
   *  opened — filters out funding accrued on earlier closed positions for
   *  the same asset on the same venue.
   *  Returns zeroed totals when no payments have accrued or auth isn't
   *  ready — callers can render unconditionally without null-checking. */
  const getLegTotals = React.useCallback(
    (
      protocol?: string,
      symbol?: string,
      sinceMs?: number,
    ): FundingLegTotals => {
      if (!protocol || !symbol) return ZERO;
      const sym = symbol.replace(/-PERP$/i, "");
      const entries = legEntries.get(legKey(protocol, sym));
      return sumEntries(entries, sinceMs);
    },
    [legEntries],
  );

  return {
    ...query,
    fundingEarned: query.data?.fundingEarned ?? 0,
    fundingPaid: query.data?.fundingPaid ?? 0,
    totalFundingUsd: query.data?.totalFundingUsd ?? 0,
    /** Per-leg raw entries — see `legKey()` for shape. */
    legEntries,
    getLegTotals,
  };
}
