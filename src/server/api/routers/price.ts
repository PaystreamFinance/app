import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { getCachedOrFetch } from "@/server/cache/server-cache";

const PRICE_CACHE_TTL = 60 * 1000; // 1 minute - avoid hitting Coingecko/Jupiter on every request

/**
 * Fetch a token price from CoinGecko by its CoinGecko ID.
 * Returns the USD price or null if the request fails.
 */
async function fetchCoinGeckoPrice(
  coingeckoId: string,
): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=usd`,
      { next: { revalidate: 60 } },
    );
    if (res.ok) {
      const json = await res.json();
      const price = json?.[coingeckoId]?.usd;
      if (typeof price === "number" && isFinite(price)) {
        return price;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export const priceRouter = createTRPCRouter({
  /**
   * Server-cached SOL price (Jupiter first, Coingecko fallback).
   * Use this instead of client-side fetches to avoid Coingecko rate limits.
   */
  getSolPrice: publicProcedure.query(async () => {
    return getCachedOrFetch(
      "sol-price-usd",
      async (): Promise<number | null> => {
        let price: number | undefined;

        // 1. Jupiter search
        try {
          const res = await fetch(
            "https://lite-api.jup.ag/tokens/v2/search?query=sol",
            { next: { revalidate: 60 } },
          );
          if (res.ok) {
            const json = await res.json();
            if (Array.isArray(json)) {
              const NATIVE_SOL = "So11111111111111111111111111111111111111112";
              const wrapped = json.find(
                (t: { id?: string }) => t?.id === NATIVE_SOL,
              );
              const primary =
                wrapped ??
                json.find(
                  (t: { symbol?: string }) =>
                    (t?.symbol ?? "").toUpperCase() === "SOL",
                );
              const candidate = primary ?? json[0];
              if (candidate && typeof candidate.usdPrice === "number") {
                price = candidate.usdPrice as number;
              }
            }
          }
        } catch {
          // ignore
        }

        // 2. Jupiter price API
        if (typeof price !== "number") {
          try {
            const res2 = await fetch(
              "https://price.jup.ag/v6/price?ids=So11111111111111111111111111111111111111112",
              { next: { revalidate: 60 } },
            );
            if (res2.ok) {
              const json2 = await res2.json();
              price =
                json2?.data?.So11111111111111111111111111111111111111112?.price;
            }
          } catch {
            // ignore
          }
        }

        // 3. Coingecko fallback (only when Jupiter fails - cached server-side)
        if (typeof price !== "number") {
          try {
            const cg = await fetch(
              "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
              { next: { revalidate: 60 } },
            );
            if (cg.ok) {
              const cgJson = await cg.json();
              price = cgJson?.solana?.usd;
            }
          } catch {
            // ignore
          }
        }

        return typeof price === "number" && isFinite(price) ? price : null;
      },
      PRICE_CACHE_TTL,
    );
  }),

  /**
   * Server-cached ETH price (CoinGecko).
   */
  getEthPrice: publicProcedure.query(async () => {
    return getCachedOrFetch(
      "eth-price-usd",
      () => fetchCoinGeckoPrice("ethereum"),
      PRICE_CACHE_TTL,
    );
  }),

  /**
   * Server-cached BTC price (CoinGecko).
   */
  getBtcPrice: publicProcedure.query(async () => {
    return getCachedOrFetch(
      "btc-price-usd",
      () => fetchCoinGeckoPrice("bitcoin"),
      PRICE_CACHE_TTL,
    );
  }),

  /**
   * Server-cached HYPE price (CoinGecko).
   */
  getHypePrice: publicProcedure.query(async () => {
    return getCachedOrFetch(
      "hype-price-usd",
      () => fetchCoinGeckoPrice("hyperliquid"),
      PRICE_CACHE_TTL,
    );
  }),
});
