/**
 * Historical funding-rate data for backtesting.
 *
 * Fetches directly from the backend route:
 *   GET /api/arb/funding-rates/history/:dex?symbol=<SYM>&days=30&order=asc
 *
 * All protocols are fetched with days=30; the chart renders whatever the
 * backend returns (lighter and 01 accumulate data going forward so may have
 * fewer than 30 days, but we show what's available rather than hiding them).
 */

"use client";

import { useQuery } from "@tanstack/react-query";

import { PERP_HEDGE_API_URL } from "@/lib/perp-api-url";

/** @deprecated No protocols are currently treated as snapshot-only. */
export const SNAPSHOT_ONLY_PROTOCOLS = new Set<string>();

export function isSnapshotOnlyProtocol(protocol: string): boolean {
  return SNAPSHOT_ONLY_PROTOCOLS.has(protocol);
}

export interface FundingRecord {
  /** Epoch milliseconds. */
  t: number;
  /**
   * Funding rate as a decimal (not percent), **normalised to per-hour**.
   * e.g. an Aster 8h rate of 0.008 is stored as 0.008 / 8 = 0.001 /h.
   * This makes all legs directly comparable regardless of settlement cadence.
   */
  r: number;
}

/** Reasons a dex/symbol might not have usable backtesting data. Keep the
 *  strings UX-ready — the panel renders them verbatim. */
export type BacktestingUnavailable =
  | { kind: "snapshot-only"; dex: string }
  | { kind: "no-symbol"; dex: string; symbol: string }
  | { kind: "sparse-data"; dex: string; symbol: string; count: number }
  | { kind: "fetch-failed"; dex: string };

export interface BacktestingLegResult {
  records: FundingRecord[];
  protocolSymbol: string;
}

interface BackendRateEntry {
  timestamp: number;
  fundingRate: number;
  granularity: string;
  protocolSymbol: string;
}

interface BackendOkResponse {
  dex: string;
  symbol: string;
  days: number;
  count: number;
  rates: BackendRateEntry[];
}

interface BackendErrorResponse {
  error: string;
}

/**
 * Parse a granularity string from the backend into hours.
 * "1h" → 1, "4h" → 4, "8h" → 8, "1d" → 24.
 * Falls back to 1 so unknown values are treated as already-hourly.
 */
function parseGranularityHours(granularity: string): number {
  const hMatch = /^(\d+)h$/i.exec(granularity);
  if (hMatch) return parseInt(hMatch[1]!, 10);
  const dMatch = /^(\d+)d$/i.exec(granularity);
  if (dMatch) return parseInt(dMatch[1]!, 10) * 24;
  return 1;
}

function resolveSettlementHours(protocol: string, granularity: string): number {
  // Lighter history may be recorded hourly while each raw funding rate covers
  // an 8h settlement window. Always normalize Lighter rates as 8h values.
  if (protocol === "lighter") return 8;
  return parseGranularityHours(granularity);
}

export function useBacktestingLeg(
  protocol: string | null | undefined,
  symbol: string | null | undefined,
) {
  const enabled = Boolean(protocol && symbol);
  return useQuery<BacktestingLegResult | BacktestingUnavailable>({
    queryKey: ["backtesting-v2", protocol, symbol],
    enabled,
    staleTime: 60 * 60 * 1000, // 1h — feed updates at most hourly
    gcTime: 6 * 60 * 60 * 1000, // 6h
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: async () => {
      if (!protocol || !symbol) {
        return { kind: "fetch-failed", dex: protocol ?? "" } as const;
      }

      // lighter and 01 have no deep history — surface immediately.
      if (isSnapshotOnlyProtocol(protocol)) {
        return { kind: "snapshot-only", dex: protocol } as const;
      }

      const url =
        `${PERP_HEDGE_API_URL}/arb/funding-rates/history/` +
        `${encodeURIComponent(protocol)}` +
        `?symbol=${encodeURIComponent(symbol.toUpperCase())}&days=30&order=asc`;

      let res: Response;
      try {
        res = await fetch(url);
      } catch {
        return { kind: "fetch-failed", dex: protocol } as const;
      }

      if (!res.ok) {
        if (res.status === 400) {
          const body = await res.json().catch(() => ({})) as BackendErrorResponse;
          if (body.error?.includes("Unknown dex")) {
            return { kind: "fetch-failed", dex: protocol } as const;
          }
          // symbol required / invalid → treat as no-symbol
          return { kind: "no-symbol", dex: protocol, symbol } as const;
        }
        return { kind: "fetch-failed", dex: protocol } as const;
      }

      let data: BackendOkResponse;
      try {
        data = (await res.json()) as BackendOkResponse;
      } catch {
        return { kind: "fetch-failed", dex: protocol } as const;
      }

      if (!data.rates?.length) {
        return { kind: "no-symbol", dex: protocol, symbol } as const;
      }

      // Derive the settlement interval from the first record's granularity field.
      // Normalize every rate to per-hour so all legs (1h, 4h, 8h) are on the
      // same scale before merging and spread calculation.
      const granularityHours = resolveSettlementHours(
        protocol,
        data.rates[0]?.granularity ?? "1h",
      );

      const records: FundingRecord[] = data.rates.map((entry) => ({
        t: entry.timestamp,
        // Divide by the settlement period to get the per-hour rate.
        // e.g. Aster 8h rate 0.008 → 0.001 /h; HL 1h rate 0.001 → 0.001 /h.
        r: entry.fundingRate / granularityHours,
      }));

      if (records.length < 3) {
        return {
          kind: "sparse-data",
          dex: protocol,
          symbol,
          count: records.length,
        } as const;
      }

      // protocolSymbol from the last entry (backend may differ from canonical)
      const protocolSymbol =
        data.rates[data.rates.length - 1]?.protocolSymbol ?? symbol;

      return { records, protocolSymbol };
    },
  });
}

export function isUnavailable(
  x: BacktestingLegResult | BacktestingUnavailable | undefined,
): x is BacktestingUnavailable {
  return !!x && "kind" in x;
}

/** Build a single time-aligned series for the chart. For each timestamp
 *  emitted by either leg we take the *nearest* (forward or backward)
 *  rate from each leg — this smooths over different settlement cadences
 *  (hourly vs 8h) without fabricating data.
 *
 *  Returns { points, longIntervalHours, shortIntervalHours } where
 *  points are already percent-valued (r × 100) for chart display. */
export interface BacktestingPoint {
  t: number;
  long: number | null;
  short: number | null;
  spread: number | null;
}

export function mergeLegRecords(
  longRecords: FundingRecord[],
  shortRecords: FundingRecord[],
): BacktestingPoint[] {
  if (longRecords.length === 0 && shortRecords.length === 0) return [];
  const allTimestamps = Array.from(
    new Set([...longRecords.map((r) => r.t), ...shortRecords.map((r) => r.t)]),
  ).sort((a, b) => a - b);

  const rateAt = (records: FundingRecord[], t: number): number | null => {
    if (records.length === 0) return null;
    // Binary search for closest timestamp (within 24h window).
    let lo = 0;
    let hi = records.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (records[mid]!.t < t) lo = mid + 1;
      else hi = mid;
    }
    const closest = records[lo];
    if (!closest) return null;
    const prev = lo > 0 ? records[lo - 1] : undefined;
    const best =
      prev && Math.abs(prev.t - t) < Math.abs(closest.t - t) ? prev : closest;
    if (Math.abs(best.t - t) > 24 * 3600 * 1000) return null;
    return best.r * 100;
  };

  return allTimestamps.map((t) => {
    const long = rateAt(longRecords, t);
    const short = rateAt(shortRecords, t);
    const spread = long !== null && short !== null ? short - long : null;
    return { t, long, short, spread };
  });
}
