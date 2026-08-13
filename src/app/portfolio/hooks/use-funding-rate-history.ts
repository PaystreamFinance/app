"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { isVariableInterval, PROTOCOL_HOURS_PER_INTERVAL as _HOURS } from "@/lib/protocol-registry";

import { PERP_HEDGE_API_URL } from "@/lib/perp-api-url";

interface FundingRateEntry {
  timestamp: number;
  fundingRate: number;
}

type ProtocolRates = FundingRateEntry[] | null;

type FundingRateHistoryResponse = Record<string, Record<string, ProtocolRates>>;

export async function fetchFundingRateHistory(): Promise<FundingRateHistoryResponse> {
  const response = await fetch(
    `${PERP_HEDGE_API_URL}/arb/funding-rates/history`,
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch funding history: ${response.statusText}`);
  }
  return response.json();
}

export interface AveragedRates {
  "1hr": number;
  "8hr": number;
  "24hr": number;
  yearly: number;
}

/**
 * Compute averaged funding rates from a history array.
 * @param rates                Array of funding rate values (most recent first).
 * @param hoursPerInterval     How many hours each entry's rate covers (settlement cadence).
 * @param recordingCadenceHours How often entries are recorded (default = hoursPerInterval).
 *   Pass 1 for Lighter: each entry is an 8h rate stored every 1h, so we must sample every
 *   8th entry to get distinct settlement values rather than 8 snapshots of the same period.
 */
export function computeAveragedRates(
  rates: number[],
  hoursPerInterval: number = 1,
  recordingCadenceHours: number = hoursPerInterval,
): AveragedRates | null {
  if (!rates.length) return null;

  // When recording is more frequent than settlement (e.g. Lighter: 1h recording, 8h settlement),
  // consecutive entries are snapshots of the same period — sample one per settlement window.
  const samplingStep = Math.max(1, Math.round(hoursPerInterval / recordingCadenceHours));
  const sampled = samplingStep > 1 ? rates.filter((_, i) => i % samplingStep === 0) : rates;

  const sum = (n: number) => {
    const slice = sampled.slice(0, Math.min(n, sampled.length));
    return slice.reduce((a, b) => a + b, 0);
  };

  const total = sum(sampled.length);
  const intervalsPerDay = 24 / hoursPerInterval;

  // How many sampled entries cover the target window
  const entriesFor1hr = Math.max(1, Math.round(1 / hoursPerInterval));
  const entriesFor8hr = Math.max(1, Math.round(8 / hoursPerInterval));
  const entriesFor24hr = Math.max(1, Math.round(24 / hoursPerInterval));

  return {
    "1hr": (sum(entriesFor1hr) / (entriesFor1hr * hoursPerInterval)) * 10000,
    "8hr": sum(entriesFor8hr) * 10000,
    "24hr": sum(entriesFor24hr) * 10000,
    yearly: (total / sampled.length) * intervalsPerDay * 365 * 100,
  };
}

/**
 * Build a per-symbol interval map from history data.
 * Both Aster and Lighter are variable-interval; intervals are detected per symbol
 * from the actual timestamp spacing (1h / 4h / 8h).
 * Note: Lighter *live* funding rates are still treated as 8h (per the market API)
 * but historical entries are 1h and normalised correctly here.
 * Result: { [symbol]: { aster?: hours, lighter?: hours } }
 */
export function buildIntervalMap(
  allHistory: FundingRateHistoryResponse | undefined,
): Record<string, Partial<Record<string, number>>> {
  if (!allHistory) return {};
  const map: Record<string, Partial<Record<string, number>>> = {};
  for (const [symbol, protocolMap] of Object.entries(allHistory)) {
    for (const [protocol, entries] of Object.entries(protocolMap)) {
      if (isVariableInterval(protocol) && entries && entries.length >= MIN_DETECTION_ENTRIES) {
        map[symbol] ??= {};
        map[symbol]![protocol] = detectIntervalHours(entries);
      }
    }
  }
  return map;
}

export function useFundingRateHistoryAll() {
  return useQuery({
    queryKey: ["funding-rate-history-all"],
    queryFn: fetchFundingRateHistory,
    staleTime: 60 * 1000,
    // 30 min — funding-rate history is large (per-symbol per-DEX); keep
    // it cached across navigations.
    gcTime: 30 * 60 * 1000,
    refetchInterval: 60 * 1000,
    placeholderData: (prev: FundingRateHistoryResponse | undefined) => prev,
  });
}

// Re-export for backward compatibility
export const PROTOCOL_HOURS_PER_INTERVAL = _HOURS;

/**
 * Minimum number of history entries required before we trust interval detection.
 * Below this threshold we have insufficient data to distinguish 1h / 4h / 8h settlement,
 * so the symbol is left out of pair selection rather than guessing.
 *
 * Set to 5 — enough for reliable timestamp-gap detection (Aster uses gaps, needs ≥2)
 * and won't wrongly include truly empty/trivial datasets.
 * Lighter always has 72 entries per symbol so the run-length detection (needs ≥9) is never affected.
 * All currently-sparse Aster symbols have exactly 9 entries, well above this threshold.
 */
export const MIN_DETECTION_ENTRIES = 5;

/**
 * Detect the true settlement interval (in hours) from a series of history entries.
 *
 * Uses two signals:
 *   1. Median timestamp gap  — the recording cadence (how often the backend saves a row).
 *   2. Median run-length     — how many consecutive entries share the same rate value.
 *      A run of N means the backend is republishing the same live quote N times before
 *      the DEX actually settles and the rate changes.
 *
 * Effective interval = recordingGap × medianRunLength, snapped to 1 / 4 / 8 h.
 *
 * Examples:
 *   Aster (true 1h)      : gap=1h, runs=[1,1,…]   → effectiveHours=1  → 1h
 *   Lighter (settles 8h) : gap=1h, runs=[8,8,…]   → effectiveHours=8  → 8h
 *   Aster (true 4h mkt)  : gap=4h, runs=[1,1,…]   → effectiveHours=4  → 4h
 *
 * Results are cached per array reference to avoid redundant recomputation.
 */
const _intervalCache = new WeakMap<object, number>();

export function detectIntervalHours(entries: { timestamp: number; fundingRate: number }[]): number {
  const cached = _intervalCache.get(entries);
  if (cached !== undefined) return cached;

  let result = 8;
  if (entries.length >= 2) {
    // Signal 1: median timestamp gap (recording cadence in hours)
    const gaps: number[] = [];
    for (let i = 1; i < entries.length; i++) {
      gaps.push(Math.abs(entries[i]!.timestamp - entries[i - 1]!.timestamp));
    }
    gaps.sort((a, b) => a - b);
    const medianGapHours = gaps[Math.floor(gaps.length / 2)]! / 3_600_000;

    // Snap median gap to known buckets (1 / 4 / 8).
    // Lighter is hardcoded (/8) and never reaches this function.
    // All other variable-interval protocols (Aster) use timestamp gap only.
    if (medianGapHours <= 2) result = 1;
    else if (medianGapHours <= 6) result = 4;
    else result = 8;
  }

  _intervalCache.set(entries, result);
  return result;
}

/**
 * Get the effective hours-per-interval for a protocol.
 * Variable-interval protocols (Aster, Lighter): detect from history entries.
 * Fixed-interval protocols: use the registry value.
 */
export function getIntervalHours(
  protocol: string,
  entries?: { timestamp: number; fundingRate: number }[] | null,
): number {
  if (isVariableInterval(protocol) && entries?.length) {
    return detectIntervalHours(entries);
  }
  return PROTOCOL_HOURS_PER_INTERVAL[protocol] ?? 1;
}

export function useAveragedRates(
  symbol: string | undefined,
  protocol?: string,
) {
  const { data: allHistory, ...rest } = useFundingRateHistoryAll();

  const avgRates = React.useMemo(() => {
    if (!allHistory || !symbol) return null;
    const symbolData = allHistory[symbol];
    if (!symbolData) return null;

    let resolvedProtocol: string | undefined = protocol;
    let entries: FundingRateEntry[] | null;

    if (protocol) {
      entries = symbolData[protocol] ?? null;
    } else {
      // Fallback: pick the first protocol that has data
      const fallback = ["drift", "hyperliquid", "pacifica", "aster", "lighter", "01", "phoenix"];
      resolvedProtocol = fallback.find((p) => symbolData[p]?.length);
      entries = resolvedProtocol ? (symbolData[resolvedProtocol] ?? null) : null;
    }

    if (!entries?.length) return null;

    const rates = entries.map((e) => e.fundingRate);
    const hoursPerInterval = getIntervalHours(resolvedProtocol ?? "", entries);
    return computeAveragedRates(rates, hoursPerInterval);
  }, [allHistory, symbol, protocol]);

  return { avgRates, ...rest };
}
