// Token metadata cache utility with localStorage persistence

import { getKnownMintAddress } from "@/lib/spotperp-utils";

export interface TokenMetadata {
  icon?: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  mint?: string;
}

interface CacheEntry {
  data: TokenMetadata | null;
  timestamp: number;
}

const CACHE_KEY = "token_metadata_cache_v2";
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

class TokenMetadataCache {
  private memoryCache: Map<string, CacheEntry> = new Map();
  private isInitialized = false;

  // Initialize cache from localStorage
  private init() {
    if (this.isInitialized) return;

    try {
      const stored = localStorage.getItem(CACHE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Convert plain object back to Map and filter expired entries
        const now = Date.now();
        Object.entries(parsed).forEach(([key, value]) => {
          const entry = value as CacheEntry;
          if (now - entry.timestamp < CACHE_DURATION) {
            this.memoryCache.set(key, entry);
          }
        });
      }
    } catch (error) {
      console.error("Failed to load token metadata cache:", error);
    }

    this.isInitialized = true;
  }

  // Save cache to localStorage
  private persist() {
    try {
      const cacheObject = Object.fromEntries(this.memoryCache);
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheObject));
    } catch (error) {
      console.error("Failed to persist token metadata cache:", error);
    }
  }

  // Get cached metadata
  get(mintAddress: string): TokenMetadata | null | undefined {
    this.init();

    const entry = this.memoryCache.get(mintAddress);
    if (!entry) return undefined;

    // Check if cache entry is still valid
    const now = Date.now();
    if (now - entry.timestamp > CACHE_DURATION) {
      this.memoryCache.delete(mintAddress);
      this.persist();
      return undefined;
    }

    return entry.data;
  }

  // Set metadata in cache
  set(mintAddress: string, metadata: TokenMetadata | null) {
    this.init();

    this.memoryCache.set(mintAddress, {
      data: metadata,
      timestamp: Date.now(),
    });

    this.persist();
  }

  // Check if metadata exists in cache (and is not expired)
  has(mintAddress: string): boolean {
    return this.get(mintAddress) !== undefined;
  }

  // Clear entire cache
  clear() {
    this.memoryCache.clear();
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch (error) {
      console.error("Failed to clear token metadata cache:", error);
    }
  }

  // Get cache statistics
  getStats() {
    this.init();
    return {
      size: this.memoryCache.size,
      entries: Array.from(this.memoryCache.keys()),
    };
  }
}

// Export singleton instance
export const tokenMetadataCache = new TokenMetadataCache();

// Enhanced fetchTokenMetadata function with caching
export async function fetchTokenMetadataWithCache(
  mintAddress: string | undefined,
): Promise<TokenMetadata | null> {
  if (!mintAddress) return null;

  // If the input looks like a symbol (not a base58 address), resolve to known mint
  // This prevents fuzzy Jupiter search from returning wrong tokens (e.g. "pytia" for "PYTH")
  const knownMint = getKnownMintAddress(mintAddress);
  const resolvedAddress = knownMint || mintAddress;
  const originalInput = mintAddress;

  // Check cache first (check both the original input and resolved address)
  const cached =
    tokenMetadataCache.get(originalInput) ??
    (knownMint ? tokenMetadataCache.get(resolvedAddress) : undefined);
  if (cached !== undefined) {
    // console.log(`✅ Cache HIT for ${originalInput.slice(0, 8)}...`);
    return cached;
  }

  console.log(
    `❌ Cache MISS for ${originalInput.slice(0, 8)}...${knownMint ? ` (resolved to ${resolvedAddress.slice(0, 8)}...)` : ""} - Fetching from API`,
  );

  // Fetch from API if not in cache
  try {
    const response = await fetch(
      `https://datapi.jup.ag/v1/assets/search?query=${resolvedAddress}`,
    );

    if (!response.ok) {
      console.warn(`API returned ${response.status} for ${resolvedAddress}`);
      tokenMetadataCache.set(originalInput, null);
      return null;
    }

    const data = await response.json();

    // Jupiter API returns an array directly: [{ id, name, symbol, icon, ... }]
    if (!Array.isArray(data) || data.length === 0) {
      console.warn(`No token data found for ${resolvedAddress}`);
      tokenMetadataCache.set(originalInput, null);
      return null;
    }

    // Get the first result that matches the address (exact match preferred)
    // Then try exact symbol match (for when called with a symbol like "PYTH" instead of a mint address)
    // Only fall back to data[0] as last resort
    const tokenData =
      data.find(
        (token: any) =>
          token.id?.toLowerCase() === resolvedAddress.toLowerCase(),
      ) ||
      data.find(
        (token: any) =>
          token.symbol?.toLowerCase() === resolvedAddress.toLowerCase(),
      ) ||
      data[0];

    const metadata: TokenMetadata = {
      icon: tokenData.icon || tokenData.image_uri || tokenData.logoURI,
      name: tokenData.name,
      symbol: tokenData.symbol,
      decimals: tokenData.decimals || 9,
      mint: tokenData.id,
    };

    console.log(
      `✅ Fetched ${tokenData.symbol} - Icon: ${metadata.icon ? "YES" : "NO"}, Decimals: ${metadata.decimals}`,
    );

    // Cache under both the original input and the resolved mint address
    tokenMetadataCache.set(originalInput, metadata);
    if (knownMint && originalInput !== resolvedAddress) {
      tokenMetadataCache.set(resolvedAddress, metadata);
    }
    return metadata;
  } catch (error) {
    console.error(`Failed to fetch metadata for ${resolvedAddress}:`, error);
    tokenMetadataCache.set(originalInput, null);
    return null;
  }
}

export async function fetchMultipleTokenMetadata(
  mintAddresses: string[],
): Promise<Map<string, TokenMetadata | null>> {
  const results = new Map<string, TokenMetadata | null>();
  const toFetch: string[] = [];

  // Check cache for each address (resolving known symbols to mints)
  for (const address of mintAddresses) {
    if (!address) continue;

    const knownMint = getKnownMintAddress(address);
    const resolvedAddress = knownMint || address;

    const cached =
      tokenMetadataCache.get(address) ??
      (knownMint ? tokenMetadataCache.get(resolvedAddress) : undefined);
    if (cached !== undefined) {
      // console.log(`✅ Cache HIT for ${address.slice(0, 8)}...`);
      results.set(address, cached);
    } else {
      toFetch.push(address);
    }
  }

  console.log(
    `📊 Cache stats: ${results.size} hits, ${toFetch.length} to fetch`,
  );

  // Fetch uncached addresses in parallel with batching to avoid rate limits
  if (toFetch.length > 0) {
    // Batch requests to avoid overwhelming the API (10 at a time)
    const BATCH_SIZE = 10;
    const batches: string[][] = [];
    for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
      batches.push(toFetch.slice(i, i + BATCH_SIZE));
    }

    // Process batches sequentially, but items within batch in parallel
    for (const batch of batches) {
      const fetchPromises = batch.map(async (address) => {
        try {
          // Resolve known symbols to their hardcoded mint address
          const knownMint = getKnownMintAddress(address);
          const resolvedAddress = knownMint || address;

          const response = await fetch(
            `https://datapi.jup.ag/v1/assets/search?query=${resolvedAddress}`,
            {
              // Add cache headers to leverage browser cache
              cache: "force-cache",
            },
          );

          if (!response.ok) {
            tokenMetadataCache.set(address, null);
            results.set(address, null);
            return;
          }

          const data = await response.json();

          // Jupiter API returns an array directly: [{ id, name, symbol, icon, ... }]
          if (!Array.isArray(data) || data.length === 0) {
            tokenMetadataCache.set(address, null);
            results.set(address, null);
            return;
          }

          // Get the first result that matches the resolved address (exact match preferred)
          // Then try exact symbol match (for when called with a symbol instead of a mint address)
          // Only fall back to data[0] as last resort
          const tokenData =
            data.find(
              (token: any) =>
                token.id?.toLowerCase() === resolvedAddress.toLowerCase(),
            ) ||
            data.find(
              (token: any) =>
                token.symbol?.toLowerCase() === address.toLowerCase(),
            ) ||
            data[0];

          const metadata: TokenMetadata = {
            icon: tokenData.icon || tokenData.image_uri || tokenData.logoURI,
            name: tokenData.name,
            symbol: tokenData.symbol,
            decimals: tokenData.decimals || 9,
            mint: tokenData.id,
          };

          // Cache under both the original input and the resolved mint address
          tokenMetadataCache.set(address, metadata);
          if (knownMint && address !== resolvedAddress) {
            tokenMetadataCache.set(resolvedAddress, metadata);
          }
          results.set(address, metadata);
        } catch (error) {
          console.error(
            `❌ Failed to fetch metadata for ${address.slice(0, 8)}...:`,
            error,
          );
          tokenMetadataCache.set(address, null);
          results.set(address, null);
        }
      });

      await Promise.all(fetchPromises);

      // Small delay between batches to avoid rate limiting (reduced from 50ms for faster fetch)
      if (batches.indexOf(batch) < batches.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
  }

  return results;
}
