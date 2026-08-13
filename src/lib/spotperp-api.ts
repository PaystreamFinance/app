/**
 * Spot-Perp API client
 */

import { isBetaModeOn } from "@/hooks/use-beta-mode";

import { PERP_HEDGE_API_URL } from "@/lib/perp-api-url";

const SPOT_PERP_BETA_ERROR =
  "Spot-Perp is in beta. Enable beta mode in the footer to use it.";

/** Throws if beta mode is off — guards every /trade/spot-perp/* call. */
function assertBetaMode(): void {
  if (!isBetaModeOn()) {
    throw new Error(SPOT_PERP_BETA_ERROR);
  }
}

// /arb/markets is the same endpoint for both arb and spot-perp consumers.
// The canonical types live in arbitrage-api.ts; re-export here so spot-perp
// code can keep importing from "@/lib/spotperp-api" without keeping a
// duplicate (and drift-prone) shape around.
export {
  fetchMarkets,
  type ArbitrageMarket as SpotPerpMarket,
  type MarketsResponse,
} from "@/lib/arbitrage-api";

// Spot-Perp trade types for POST /api/trade/spot-perp
export interface SpotPerpTradeRequest {
  totalUsd: number;
  market: string;
  perpProtocol: "drift" | "pacifica" | "hyperliquid" | "aster" | "lighter" | "01";
  leverage: number;
  spotTokenMint: string;
  jitoFeeSol?: number;
}

export interface SpotPerpTradeResponse {
  status: string;
  message: string;
  data: {
    tradeId: number;
    totalUsd: number;
    spotUsd: number;
    spotTxnHash: string;
    spotAmount: number;
    perpNotionalUsd: number;
    perpMarginUsd: number;
    perpLeverage: number;
    perpProtocol: string;
    perpMarket: string;
    perpTxnHash: string;
    perpOrderId: string;
    perpBundleId: string;
    perpError: string | null;
    ethAddress: string;
  };
}

export interface SpotPerpPosition {
  tradeId: number;
  market: string;
  spotTokenMint: string;
  perpProtocol: string;
  totalUsd: number;
  spotUsd: number;
  spotAmount: string;
  spotTxnHash: string;
  perpMarginUsd: number;
  perpNotionalUsd: number;
  perpLeverage: number;
  perpTxnHash: string;
  perpOrderId: number;
  createdAt: string;
  perpPosition: {
    sizeUsd: number;
    pnl: number;
    entryPrice: number;
  };
}

export interface SpotPerpPositionsResponse {
  status: "success";
  positions: SpotPerpPosition[];
  totalPerpPnl: number;
}

export interface SpotPerpCloseResponse {
  status: "success" | "error";
  message: string;
}

/**
 * Execute a spot-perp trade (spot buy + perp short)
 */
export async function executeSpotPerpTrade(
  request: SpotPerpTradeRequest,
  idToken: string,
  accessToken?: string,
): Promise<SpotPerpTradeResponse> {
  assertBetaMode();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "privy-id-token": idToken,
  };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${PERP_HEDGE_API_URL}/trade/spot-perp`, {
    method: "POST",
    headers,
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(60_000),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error ||
        data.message ||
        `Failed to execute spot-perp trade: ${response.statusText}`,
    );
  }

  return data;
}

/**
 * Fetch user's spot-perp positions from /api/trade/spot-perp/positions
 */
export async function fetchSpotPerpPositions(
  idToken: string,
  accessToken?: string,
): Promise<SpotPerpPositionsResponse> {
  assertBetaMode();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "privy-id-token": idToken,
  };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const response = await fetch(
    `${PERP_HEDGE_API_URL}/trade/spot-perp/positions`,
    {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch spot-perp positions: ${response.statusText}`,
    );
  }

  return response.json();
}

/**
 * Close a spot-perp position by tradeId
 */
export async function closeSpotPerpPosition(
  tradeId: number,
  idToken: string,
  accessToken?: string,
): Promise<SpotPerpCloseResponse> {
  assertBetaMode();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "privy-id-token": idToken,
  };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${PERP_HEDGE_API_URL}/trade/spot-perp/close`, {
    method: "POST",
    headers,
    body: JSON.stringify({ tradeId }),
    signal: AbortSignal.timeout(60_000),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error ||
        data.message ||
        `Failed to close spot-perp position: ${response.statusText}`,
    );
  }

  return data;
}
