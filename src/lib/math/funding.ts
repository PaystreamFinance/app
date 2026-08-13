// ─── Funding-rate parsing ───
//
// A single source of truth for interpreting funding-rate strings from any
// upstream API. Handles the two conventions encountered in the codebase:
//
//   * percent strings, e.g. "0.0125%"  — trailing % sign
//   * decimal strings, e.g. "0.000125" — no sign, already a ratio
//
// Output is always a decimal ratio (per the interval the API reports,
// usually 1h). Callers that need annualised or per-8h numbers should use
// `scaleFundingRate`.
//
// This used to be duplicated across arbitrage-utils.ts, spotperp-utils.ts,
// and several venue adapters. Keep it here and here only.

import { parseFinite } from "./primitives";

export interface ParseFundingRateOptions {
  /** When input has no `%` sign, assume it's already a decimal ratio. */
  treatBareAs?: "ratio" | "percent";
}

/**
 * Parse a funding-rate string/number into a decimal ratio (e.g. 0.0001 = 1bps).
 * Returns `null` for unparseable input. Never returns NaN or ±Infinity.
 *
 * Examples:
 *   parseFundingRate("0.0125%")  → 0.000125
 *   parseFundingRate("0.000125") → 0.000125 (default: treatBareAs="ratio")
 *   parseFundingRate("0.0125", { treatBareAs: "percent" }) → 0.000125
 */
export function parseFundingRate(
  raw: unknown,
  opts: ParseFundingRateOptions = {},
): number | null {
  const treatBareAs = opts.treatBareAs ?? "ratio";

  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw !== "string") return null;

  const trimmed = raw.trim();
  if (trimmed === "") return null;

  const hasPercent = trimmed.endsWith("%");
  const cleaned = hasPercent ? trimmed.slice(0, -1).trim() : trimmed;

  const n = parseFinite(cleaned);
  if (n === null) return null;

  if (hasPercent) return n / 100;
  return treatBareAs === "percent" ? n / 100 : n;
}

/** Same as `parseFundingRate` but returns a fallback on failure. */
export function parseFundingRateOr(
  raw: unknown,
  fallback: number,
  opts?: ParseFundingRateOptions,
): number {
  const n = parseFundingRate(raw, opts);
  return n === null ? fallback : n;
}

/**
 * Scale a funding ratio to a different interval.
 * `fromHours` / `toHours` describe the period the ratio applies to.
 *
 *   scaleFundingRate(0.0001, 1, 24)  // hourly → daily
 *   scaleFundingRate(0.0001, 1, 8760) // hourly → annualised (simple)
 */
export function scaleFundingRate(
  rate: number,
  fromHours: number,
  toHours: number,
): number {
  if (!Number.isFinite(rate) || fromHours <= 0 || toHours <= 0) return 0;
  return rate * (toHours / fromHours);
}
