/**
 * Cache for drift balance endpoint
 */

const driftBalanceCache = new Map<string, { data: any; timestamp: number }>();

const DRIFT_BALANCE_CACHE_TTL = 30 * 1000; // 30 seconds

export function getCachedDriftBalance(privyIdToken: string | null): any | null {
  const cacheKey = `drift-balance-${privyIdToken || "anonymous"}`;
  const cached = driftBalanceCache.get(cacheKey);

  if (!cached) return null;

  const now = Date.now();
  if (now - cached.timestamp < DRIFT_BALANCE_CACHE_TTL) {
    return cached.data;
  }

  driftBalanceCache.delete(cacheKey);
  return null;
}

export function setCachedDriftBalance(
  privyIdToken: string | null,
  data: any,
): void {
  const cacheKey = `drift-balance-${privyIdToken || "anonymous"}`;
  driftBalanceCache.set(cacheKey, {
    data,
    timestamp: Date.now(),
  });

  // Clean up old entries
  if (driftBalanceCache.size > 500) {
    const entries = Array.from(driftBalanceCache.entries());
    entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
    const toKeep = entries.slice(0, 500);
    driftBalanceCache.clear();
    toKeep.forEach(([key, value]) => driftBalanceCache.set(key, value));
  }
}

export function invalidateCachedDriftBalance(
  privyIdToken: string | null,
): void {
  const cacheKey = `drift-balance-${privyIdToken || "anonymous"}`;
  driftBalanceCache.delete(cacheKey);
}
