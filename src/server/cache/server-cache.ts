/**
 * Server-side in-memory cache with TTL and stale-while-revalidate support
 * Used to cache expensive API calls (e.g., Meteora API) for instant responses
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

class ServerCache {
  private cache = new Map<string, CacheEntry<any>>();
  private revalidating = new Set<string>();

  /**
   * Get cached data if available
   * Returns data even if stale (stale-while-revalidate pattern)
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Return data even if stale - caller should check isStale() for revalidation
    return entry.data as T;
  }

  /**
   * Set data in cache with TTL
   */
  set<T>(key: string, data: T, ttlMs: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * Check if cached data is stale
   */
  isStale(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return true;
    return Date.now() > entry.expiresAt;
  }

  /**
   * Check if key is currently being revalidated
   */
  isRevalidating(key: string): boolean {
    return this.revalidating.has(key);
  }

  /**
   * Mark key as being revalidated
   */
  startRevalidation(key: string): void {
    this.revalidating.add(key);
  }

  /**
   * Mark key as done revalidating
   */
  endRevalidation(key: string): void {
    this.revalidating.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.revalidating.clear();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      revalidating: this.revalidating.size,
      entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
        key,
        age: Date.now() - entry.timestamp,
        stale: Date.now() > entry.expiresAt,
      })),
    };
  }
}

// Singleton instance
export const serverCache = new ServerCache();

// Helper function for stale-while-revalidate pattern
export async function getCachedOrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = 5 * 60 * 1000, // 5 minutes default
): Promise<T> {
  // Try to get from cache
  const cached = serverCache.get<T>(key);

  if (cached) {
    // Return cached data immediately
    // If stale and not already revalidating, revalidate in background
    if (serverCache.isStale(key) && !serverCache.isRevalidating(key)) {
      serverCache.startRevalidation(key);

      // Background revalidation
      void fetcher()
        .then((data) => {
          serverCache.set(key, data, ttlMs);
        })
        .catch((error) => {
          console.error(`Background revalidation failed for ${key}:`, error);
        })
        .finally(() => {
          serverCache.endRevalidation(key);
        });
    }

    return cached;
  }

  // No cache - fetch and cache
  const data = await fetcher();
  serverCache.set(key, data, ttlMs);
  return data;
}
