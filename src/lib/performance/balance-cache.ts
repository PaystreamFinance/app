/**
 * Generic server-side balance cache for all protocols.
 *
 * Uses a stale-while-revalidate pattern:
 *  - FRESH (< 30s): return cached data, no refetch
 *  - STALE (30s–120s): return cached data immediately AND signal a background refresh
 *  - EXPIRED (> 120s): cache miss, must refetch
 *
 * This means the UI almost never waits for the slow external API.
 */

interface CacheEntry {
  data: any;
  timestamp: number;
}

const balanceCache = new Map<string, CacheEntry>();

/** Data considered fresh — no refetch needed */
const FRESH_TTL = 30 * 1000; // 30 seconds

/** Data still usable but should be refreshed in background */
const STALE_TTL = 120 * 1000; // 2 minutes

function cacheKey(protocol: string, privyIdToken: string | null): string {
  return `${protocol}-balance-${privyIdToken || "anonymous"}`;
}

export type CacheResult =
  | { status: "hit"; data: any }
  | { status: "stale"; data: any }
  | { status: "miss" };

/**
 * Get cached balance with stale-while-revalidate semantics.
 *
 * - "hit"   → data is fresh, use it directly
 * - "stale" → data is usable but should be refreshed in the background
 * - "miss"  → no usable data, must fetch
 */
export function getCachedBalance(
  protocol: string,
  privyIdToken: string | null,
): CacheResult {
  const key = cacheKey(protocol, privyIdToken);
  const cached = balanceCache.get(key);

  if (!cached) return { status: "miss" };

  const age = Date.now() - cached.timestamp;

  if (age < FRESH_TTL) {
    return { status: "hit", data: cached.data };
  }

  if (age < STALE_TTL) {
    return { status: "stale", data: cached.data };
  }

  // Expired
  balanceCache.delete(key);
  return { status: "miss" };
}

export function setCachedBalance(
  protocol: string,
  privyIdToken: string | null,
  data: any,
): void {
  const key = cacheKey(protocol, privyIdToken);
  balanceCache.set(key, { data, timestamp: Date.now() });

  // Prevent unbounded growth
  if (balanceCache.size > 500) {
    const entries = Array.from(balanceCache.entries());
    entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
    const toKeep = entries.slice(0, 500);
    balanceCache.clear();
    toKeep.forEach(([k, v]) => balanceCache.set(k, v));
  }
}

export function invalidateCachedBalance(
  protocol: string,
  privyIdToken: string | null,
): void {
  balanceCache.delete(cacheKey(protocol, privyIdToken));
}
