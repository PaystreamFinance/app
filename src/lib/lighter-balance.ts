/**
 * Direct Lighter balance fetching via a Next.js proxy route.
 *
 * The Lighter API (mainnet.zklighter.elliot.ai) does not send CORS headers
 * that allow browser requests, so we proxy through /api/arb/lighter-balance.
 * No auth headers are needed — the account is public by ETH address.
 */

import type { AggregateBalanceData, AggregateBalanceEntry } from "@/lib/arbitrage-api";

// ─── EIP-55 checksum (no external deps) ───────────────────────────────────
// We can't use keccak256 in the browser without a lib, but the proxy is
// server-side and Lighter is lenient about case. We pass the lowercase
// address; if Lighter ever rejects it the proxy can add checksumming.

// ─── Raw API types ─────────────────────────────────────────────────────────

interface LighterPosition {
  position: string;
  position_value: string;
  unrealized_pnl: string;
}

interface LighterAccount {
  account_type: number;     // 0 = main cross-margin account
  available_balance: string;
  collateral: string;       // total collateral (accountValue)
  total_asset_value: string;
  positions: LighterPosition[];
}

interface LighterApiResponse {
  code: number;
  total: number;
  accounts: LighterAccount[];
}

// ─── Parser ────────────────────────────────────────────────────────────────

function parseLighterResponse(resp: LighterApiResponse): AggregateBalanceData {
  // Use the main cross-margin account (account_type === 0)
  const main = resp.accounts?.find((a) => a.account_type === 0) ?? resp.accounts?.[0];
  if (!main) return ZERO_BALANCE;

  const collateral = parseFloat(main.collateral);
  const available = parseFloat(main.available_balance);

  const nonZeroPositions = (main.positions ?? []).filter(
    (p) => parseFloat(p.position) !== 0,
  );

  let totalPositionValue = 0;
  let totalUnrealizedPnl = 0;
  for (const pos of nonZeroPositions) {
    totalPositionValue += Math.abs(parseFloat(pos.position_value));
    totalUnrealizedPnl += parseFloat(pos.unrealized_pnl);
  }

  return {
    accountValue: collateral.toFixed(2),
    accountEquity: (collateral + totalUnrealizedPnl).toFixed(2),
    availableToTrade: available.toFixed(2),
    withdrawable: available.toFixed(2),
    totalMarginUsed: Math.max(0, collateral - available).toFixed(2),
    totalPositionValue: totalPositionValue.toFixed(2),
    positionsCount: nonZeroPositions.length,
    quoteUnit: "USDC",
  };
}

const ZERO_BALANCE: AggregateBalanceData = {
  accountValue: "0.00",
  accountEquity: "0.00",
  availableToTrade: "0.00",
  withdrawable: "0.00",
  totalMarginUsed: "0.00",
  totalPositionValue: "0.00",
  positionsCount: 0,
  quoteUnit: "USDC",
};

// ─── Public fetcher ────────────────────────────────────────────────────────

/**
 * Fetch Lighter account balance via the Next.js proxy route.
 * Pass the raw ETH address (lowercase is fine).
 * Returns zeros (not an error entry) when the account doesn't exist yet.
 */
export async function fetchLighterBalanceDirect(
  rawEthAddress: string | null | undefined,
): Promise<AggregateBalanceEntry> {
  if (!rawEthAddress) {
    return {
      dex: "lighter",
      status: "success",
      message: "No ETH wallet",
      data: ZERO_BALANCE,
    };
  }

  const address = rawEthAddress.toLowerCase();
  const url = `/api/arb/lighter-balance?address=${encodeURIComponent(address)}`;

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  } catch (err) {
    return {
      dex: "lighter",
      status: "error",
      message: "Lighter proxy unreachable",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (!res.ok) {
    return {
      dex: "lighter",
      status: "error",
      message: `Lighter proxy error ${res.status}`,
      error: res.statusText,
    };
  }

  const json = (await res.json()) as { notFound?: boolean } & Partial<LighterApiResponse>;

  if (json.notFound) {
    return {
      dex: "lighter",
      status: "success",
      message: "No Lighter account",
      data: ZERO_BALANCE,
    };
  }

  return {
    dex: "lighter",
    status: "success",
    message: "OK",
    data: parseLighterResponse(json as LighterApiResponse),
  };
}
