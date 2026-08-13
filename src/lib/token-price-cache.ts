// Token price cache utility with localStorage persistence

interface PriceCacheEntry {
  price: number;
  timestamp: number;
}

const PRICE_CACHE_KEY = "token_price_cache";
const PRICE_CACHE_DURATION = 2 * 60 * 1000; // 2 minutes - prices change more frequently than metadata

class TokenPriceCache {
  private memoryCache: Map<string, PriceCacheEntry> = new Map();
  private isInitialized = false;

  // Initialize cache from localStorage
  private init() {
    if (this.isInitialized || typeof window === "undefined") return;

    try {
      const stored = localStorage.getItem(PRICE_CACHE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Convert plain object back to Map and filter expired entries
        const now = Date.now();
        Object.entries(parsed).forEach(([key, value]) => {
          const entry = value as PriceCacheEntry;
          if (now - entry.timestamp < PRICE_CACHE_DURATION) {
            this.memoryCache.set(key, entry);
          }
        });
      }
    } catch (error) {
      console.error("Failed to load token price cache:", error);
    }

    this.isInitialized = true;
  }

  // Save cache to localStorage
  private persist() {
    if (typeof window === "undefined") return;

    try {
      const cacheObject = Object.fromEntries(this.memoryCache);
      localStorage.setItem(PRICE_CACHE_KEY, JSON.stringify(cacheObject));
    } catch (error) {
      console.error("Failed to persist token price cache:", error);
    }
  }

  // Get cached price
  get(mintAddress: string): number | undefined {
    this.init();

    const entry = this.memoryCache.get(mintAddress);
    if (!entry) return undefined;

    // Check if cache entry is still valid
    const now = Date.now();
    if (now - entry.timestamp > PRICE_CACHE_DURATION) {
      this.memoryCache.delete(mintAddress);
      this.persist();
      return undefined;
    }

    return entry.price;
  }

  // Set price in cache
  set(mintAddress: string, price: number) {
    this.init();

    this.memoryCache.set(mintAddress, {
      price,
      timestamp: Date.now(),
    });

    this.persist();
  }

  // Check if price exists in cache (and is not expired)
  has(mintAddress: string): boolean {
    return this.get(mintAddress) !== undefined;
  }
}

// Export singleton instance
export const tokenPriceCache = new TokenPriceCache();

/**
 * Fetch token price from Jupiter API with caching
 */
export async function fetchTokenPriceWithCache(
  mintAddress: string,
): Promise<number> {
  if (!mintAddress) return 0;

  // Check cache first
  const cached = tokenPriceCache.get(mintAddress);
  if (cached !== undefined) {
    return cached;
  }

  // Fetch from API if not in cache
  try {
    const response = await fetch(
      `https://lite-api.jup.ag/price/v3?ids=${mintAddress}`,
    );
    if (!response.ok) {
      throw new Error(`Jupiter API failed: ${response.status}`);
    }
    const data = await response.json();
    const price = data?.[mintAddress]?.usdPrice;
    if (typeof price === "number" && price > 0) {
      tokenPriceCache.set(mintAddress, price);
      return price;
    }
    return 0;
  } catch (error) {
    console.error(`Failed to fetch token price for ${mintAddress}:`, error);
    return 0;
  }
}

/**
 * Fetch multiple token prices in a single API call with caching
 */
export async function fetchMultipleTokenPrices(
  mintAddresses: string[],
): Promise<Map<string, number>> {
  if (mintAddresses.length === 0) {
    return new Map();
  }

  const results = new Map<string, number>();
  const toFetch: string[] = [];

  // Check cache for each address
  for (const address of mintAddresses) {
    if (!address) continue;

    const cached = tokenPriceCache.get(address);
    if (cached !== undefined) {
      results.set(address, cached);
    } else {
      toFetch.push(address);
    }
  }

  // Fetch uncached addresses in a single API call
  if (toFetch.length > 0) {
    try {
      const uniqueAddresses = Array.from(new Set(toFetch));
      // Batch requests to avoid URL length limits (max 50 IDs per request)
      const BATCH_SIZE = 50;
      const batches: string[][] = [];
      for (let i = 0; i < uniqueAddresses.length; i += BATCH_SIZE) {
        batches.push(uniqueAddresses.slice(i, i + BATCH_SIZE));
      }

      // Process batches in parallel
      const fetchPromises = batches.map(async (batch) => {
        const idsParam = batch.join(",");
        try {
          const response = await fetch(
            `https://lite-api.jup.ag/price/v3?ids=${idsParam}`,
            {
              // Add cache headers to leverage browser cache
              cache: "force-cache",
            },
          );

          if (!response.ok) {
            throw new Error(`Jupiter API failed: ${response.status}`);
          }

          const data = await response.json();

          batch.forEach((address) => {
            const price = data?.[address]?.usdPrice;
            if (typeof price === "number" && price > 0) {
              tokenPriceCache.set(address, price);
              results.set(address, price);
            } else {
              results.set(address, 0);
            }
          });
        } catch (error) {
          console.error(
            `Failed to fetch prices for batch: ${batch.slice(0, 3).join(",")}...`,
            error,
          );
          // Set 0 for failed batch
          batch.forEach((address) => results.set(address, 0));
        }
      });

      await Promise.all(fetchPromises);
    } catch (error) {
      console.error("Failed to fetch multiple token prices:", error);
      // Set 0 for all failed addresses
      toFetch.forEach((address) => results.set(address, 0));
    }
  }

  return results;
}

// Legacy function for backward compatibility
export async function fetchTokenPrice(mintAddress: string): Promise<number> {
  return fetchTokenPriceWithCache(mintAddress);
}
