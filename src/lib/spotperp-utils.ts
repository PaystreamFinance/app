import type { SpotPerpMarket } from "@/lib/spotperp-api";
import type { SpotPerpRowType } from "@/app/spot-perp/_components/spot-columns";
import { parseFinite } from "@/lib/math/primitives";

/**
 * Hardcoded mapping of Solana-native token symbols to their mint addresses.
 * Used as the primary source of truth for token mint resolution in spot-perp
 * and arbitrage trade flows, avoiding unreliable fuzzy search from Jupiter API.
 *
 * Also serves as the canonical list of Solana-native tokens that appear on
 * perp markets (used to filter out non-Solana assets like BTC, ETH, DOGE, etc.).
 */
export const SOLANA_TOKEN_MINTS: Record<string, string> = {
  SOL: "So11111111111111111111111111111111111111112",
  RAY: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
  JUP: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  BONK: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  WIF: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
  POPCAT: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
  JTO: "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL",
  PYTH: "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3",
  TNSR: "TNSRxcUxoT9xBG3de7PiJyTDYu7kskLqcpddxnEJAS6",
  ORCA: "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE",
  MNDE: "MNDEFzGvMt87ueuHvVU9VcTqsAP5b3fTGPsHuuPA5ey",
  MSOL: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
  JITOSOL: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
  HNT: "hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux",
  MOBILE: "mb1eu7TzEc71KxDpsmsKoucSSuuoGLv1drys1oP2jh6",
  IOT: "iotEVVZLEywoTn1QdwNPddxPWszn3zFhEot3MfL9fns",
  W: "85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ",
  KMNO: "KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS",
  DRIFT: "DriFtupJYLTosbwoN8koMbEYSx54aFAVLddWsbksjwg7",
  FIDA: "EchesyfXePKdLtoiZSL8pBe8Myagyy8ZRqsACNCFGnvp",
  MNGO: "MangoCzJ36AjZyKwVj3VnYU4GTonjfVEnJmvvWaxLac",
  PRCL: "4LLbsb5ReP3yEtYzmXewyGjcir5uXtKFURtaEUVC2AHs",
  RENDER: "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof",
  MEW: "MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5",
  PENGU: "2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv",
  TRUMP: "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN",
  GOAT: "CzLSujWBLFsSjncfkh59rUFqvafWcY5tzedWJSuypump",
  FARTCOIN: "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump",
  GRASS: "Grass7B4RdKfBCjTKgSqnXkqjwiGvQyFbuSCUJr3XXjs",
  NOS: "nosXBVoaCTtYdLvKY6Csb4AC8JCdQKKAaWYtx2ZMoo7",
  ZEUS: "ZEUS1aR7aX8DFFJf5QjWj2ftDDdNTroMNGo8YoQm3Gq",
  SAMO: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  BSOL: "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1",
  STEP: "StepAscQoEioFxxWGnh2sLBDFp9d8rvKz2Yp39iDpyT",
  SLND: "SLNDpmoWTVADgEdndyvWzroNL7zSi1dF9PC3xHGtPwp",
  MEAN: "MEANeD3XDdUmNMsRGjASkSWdC8prLYsoRJ61pPeHctD",
  AI16Z: "HeLp6NuQkmYB4pYWo2zYs22mESHXPQYzXbB8n4V98jwC",
};

// Derived set for quick membership checks (case-insensitive via helper below)
const SOLANA_NATIVE_TOKENS = new Set(Object.keys(SOLANA_TOKEN_MINTS));

/**
 * Resolve a token symbol to its known Solana mint address (case-insensitive).
 * Returns undefined if the symbol is not in the hardcoded map.
 */
export function getKnownMintAddress(symbol: string): string | undefined {
  return SOLANA_TOKEN_MINTS[symbol.toUpperCase()];
}

/**
 * Check if a token symbol is a Solana-native token (case-insensitive).
 */
export function isSolanaNativeToken(symbol: string): boolean {
  return SOLANA_NATIVE_TOKENS.has(symbol.toUpperCase());
}

/**
 * Parse a funding-rate display string into a percent-unit number.
 * Strips a trailing "%" and validates via the shared finite-number primitive.
 * Returns null for unparseable or non-finite input.
 */
export function parseFundingRate(
  rateStr: string | undefined | null,
): number | null {
  if (!rateStr) return null;
  return parseFinite(rateStr.replace("%", "").trim());
}

/**
 * Extract the token price from market data using the first available oraclePrice.
 * Priority: drift > pacifica > hyperliquid > flash > 0
 */
function getTokenPrice(market: SpotPerpMarket): number {
  return (
    market.drift?.oraclePrice ??
    market.pacifica?.oraclePrice ??
    market.hyperliquid?.oraclePrice ??
    market.flash?.oraclePrice ??
    0
  );
}

/**
 * Compute total open interest for a spot-perp market by summing long + short across all protocols.
 */
function getTotalOI(market: SpotPerpMarket): number {
  return (
    (market.drift?.openInterest?.long ?? 0) + (market.drift?.openInterest?.short ?? 0) +
    (market.pacifica?.openInterest?.long ?? 0) + (market.pacifica?.openInterest?.short ?? 0) +
    (market.hyperliquid?.openInterest?.long ?? 0) + (market.hyperliquid?.openInterest?.short ?? 0)
  );
}

/**
 * Transform API market data into spot-perp table row format.
 * Similar to arbitrage-utils transformMarketsToRows but uses tokenPrice instead of maxArb.
 */
export function transformSpotPerpMarketsToRows(
  markets: SpotPerpMarket[] | undefined,
): SpotPerpRowType[] {
  if (!markets) return [];

  const sorted = [...markets].sort((a, b) => getTotalOI(b) - getTotalOI(a));

  return sorted.map((market, index) => {
    return {
      id: `market-${index}`,
      symbol: market.symbol,
      oiRank: 0, // Placeholder — re-ranked after filtering in each consumer
      tokenPrice: getTokenPrice(market),
      fundingRateDrift: market.drift?.fundingRate,
      fundingRateFlash: market.flash?.fees?.marginPerHour,
      fundingRatePacifica: market.pacifica?.fundingRate,
      fundingRateHyperliquid: market.hyperliquid?.fundingRate,
      fundingRateApr: market.drift?.fundingRateApr,
      fundingRatePct: (() => {
        if (!market.drift?.fundingRate) return undefined;
        const n = parseFinite(market.drift.fundingRate.replace("%", ""));
        return n === null ? undefined : n / 100;
      })(),
      fees: {
        drift: market.drift?.fees,
        flash: market.flash?.fees,
      },
      marketData: market,
    };
  });
}
