// ─── Numeric primitives ───
//
// Single choke-point for turning untrusted strings / unknowns into numbers.
// Every external input (API JSON, WS frames, user text) funnels through these
// before reaching any formula. Downstream math can then assume its inputs are
// finite, non-NaN, and — where specified — positive.
//
// Rules:
//   * `parseFinite` rejects NaN, +Infinity, -Infinity, and non-numeric strings.
//   * `parsePositive` additionally rejects zero and negatives.
//   * `safeDiv` never throws and never returns Infinity/NaN.
//   * All helpers are pure and stateless.

/** True for plain finite numbers (rejects NaN, ±Infinity). */
export function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Parse an untrusted value into a finite number.
 * Returns `null` for NaN, ±Infinity, non-numeric strings, null, undefined, objects.
 * Accepts numbers and numeric strings only. Whitespace is trimmed.
 */
export function parseFinite(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (trimmed === "") return null;
  // parseFloat accepts "1abc" → 1. Use Number() which rejects trailing garbage.
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Parse to a finite number, or return `fallback` on failure. */
export function parseFiniteOr(v: unknown, fallback: number): number {
  const n = parseFinite(v);
  return n === null ? fallback : n;
}

/** Parse a strictly positive finite number (> 0). */
export function parsePositive(v: unknown): number | null {
  const n = parseFinite(v);
  return n !== null && n > 0 ? n : null;
}

/** Parse a non-negative finite number (>= 0). */
export function parseNonNegative(v: unknown): number | null {
  const n = parseFinite(v);
  return n !== null && n >= 0 ? n : null;
}

/**
 * Safe division. Returns `fallback` when:
 *   - denominator is 0
 *   - either operand is non-finite
 *   - result is non-finite (overflow/underflow edge case)
 */
export function safeDiv(
  numerator: number,
  denominator: number,
  fallback = 0,
): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) {
    return fallback;
  }
  if (denominator === 0) return fallback;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : fallback;
}

/** Clamp `v` to [min, max]. Non-finite inputs collapse to `min`. */
export function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

/**
 * Floor to cents (2 decimal places) and subtract one cent.
 *
 * Used when reporting a maximum withdrawable amount — on-chain simulators
 * reject exact-max requests due to rounding/staleness, so we always quote
 * max - 1¢. Returns a string to preserve exact decimal display.
 */
export function safeFloorCents(v: unknown): string {
  const n = parseFinite(v);
  if (n === null) return "0.00";
  const floored = Math.floor(n * 100) / 100;
  return Math.max(0, floored - 0.01).toFixed(2);
}

/** Round a number to `decimals` places using banker's rounding is not worth
 * the dep — standard round-half-up is fine for display. */
export function round(v: number, decimals: number): number {
  if (!Number.isFinite(v)) return 0;
  const p = Math.pow(10, decimals);
  return Math.round(v * p) / p;
}

/** bps → decimal ratio (e.g. 25 bps → 0.0025). Non-finite → 0. */
export function bpsToRatio(bps: unknown): number {
  const n = parseFinite(bps);
  return n === null ? 0 : n / 10_000;
}

/** decimal ratio → bps (e.g. 0.0025 → 25). Non-finite → 0. */
export function ratioToBps(ratio: unknown): number {
  const n = parseFinite(ratio);
  return n === null ? 0 : n * 10_000;
}

/** Sum with non-finite inputs treated as 0. Never returns NaN/Infinity. */
export function safeSum(values: readonly unknown[]): number {
  let total = 0;
  for (const v of values) {
    const n = parseFinite(v);
    if (n !== null) total += n;
  }
  return total;
}
