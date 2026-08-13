import type {
  AggregateBalanceData,
  AggregateBalanceEntry,
} from "@/lib/arbitrage-api";
import {
  getHip3Collateral,
  HIP3_PROTOCOL_IDS,
  isHip3ProtocolId,
  type Hip3ProtocolId,
} from "@/lib/protocol-registry";

export type HyperliquidBalanceProtocol = "hyperliquid" | Hip3ProtocolId;

type LinkedWalletLike = {
  type?: string;
  address?: string;
  chainType?: string;
  chain_type?: string;
  walletClientType?: string;
  wallet_client_type?: string;
};

interface HyperliquidClearinghouseState {
  assetPositions?: Array<{
    position?: {
      szi?: string;
    };
  }>;
  crossMarginSummary?: {
    accountValue?: string;
    totalNtlPos?: string;
    totalMarginUsed?: string;
  };
  marginSummary?: {
    accountValue?: string;
  };
  withdrawable?: string;
}

const HYPERLIQUID_INFO_URL = "https://api.hyperliquid.xyz/info";

function zeroBalanceData(quoteUnit: string): AggregateBalanceData {
  return {
    accountValue: "0.00",
    accountEquity: "0.00",
    availableToTrade: "0.00",
    withdrawable: "0.00",
    totalMarginUsed: "0.00",
    totalPositionValue: "0.00",
    positionsCount: 0,
    quoteUnit,
  };
}

function asNumber(value: string | undefined): number {
  const n = parseFloat(value ?? "0");
  return Number.isFinite(n) ? n : 0;
}

export function extractPrivyEmbeddedEthAddress(user: unknown): string | null {
  const linkedAccounts =
    (user as { linkedAccounts?: LinkedWalletLike[]; linked_accounts?: LinkedWalletLike[] } | null)
      ?.linkedAccounts ??
    (user as { linked_accounts?: LinkedWalletLike[] } | null)?.linked_accounts ??
    [];

  const wallet = linkedAccounts.find((account) => {
    const walletClientType =
      account.walletClientType ?? account.wallet_client_type;
    const chainType = account.chainType ?? account.chain_type;
    return (
      account.type === "wallet" &&
      (walletClientType === "privy" || walletClientType === "privy-v2") &&
      chainType?.toLowerCase() === "ethereum" &&
      !!account.address
    );
  });

  return wallet?.address?.toLowerCase() ?? null;
}

export function getHyperliquidQuoteUnit(protocol: HyperliquidBalanceProtocol): string {
  if (protocol === "hyperliquid") return "USDC";
  return getHip3Collateral(protocol) ?? "USDC";
}

export function parseHyperliquidBalance(
  state: HyperliquidClearinghouseState,
  quoteUnit: string,
): AggregateBalanceData {
  const accountValue = asNumber(state.crossMarginSummary?.accountValue);
  const totalMarginUsed = asNumber(state.crossMarginSummary?.totalMarginUsed);
  const accountEquity = asNumber(state.marginSummary?.accountValue);
  const withdrawable = asNumber(state.withdrawable);
  const totalPositionValue = asNumber(state.crossMarginSummary?.totalNtlPos);
  const positionsCount =
    state.assetPositions?.filter(
      (p) => asNumber(p.position?.szi) !== 0,
    ).length ?? 0;

  return {
    accountValue: accountValue.toFixed(2),
    accountEquity: accountEquity.toFixed(2),
    availableToTrade: Math.max(0, accountValue - totalMarginUsed).toFixed(2),
    withdrawable: withdrawable.toFixed(2),
    totalMarginUsed: totalMarginUsed.toFixed(2),
    totalPositionValue: totalPositionValue.toFixed(2),
    positionsCount,
    quoteUnit,
  };
}

export async function fetchHyperliquidBalance(
  ethAddress: string | null,
  protocol: HyperliquidBalanceProtocol,
): Promise<{ status: "success"; message: string; data: AggregateBalanceData }> {
  const quoteUnit = getHyperliquidQuoteUnit(protocol);
  if (!ethAddress) {
    return {
      status: "success",
      message: "No embedded Ethereum wallet found",
      data: zeroBalanceData(quoteUnit),
    };
  }

  const dex = isHip3ProtocolId(protocol) ? protocol.slice(3) : undefined;
  const response = await fetch(HYPERLIQUID_INFO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "clearinghouseState",
      user: ethAddress.toLowerCase(),
      ...(dex ? { dex } : {}),
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Hyperliquid balance: ${response.statusText}`);
  }

  const state = (await response.json()) as HyperliquidClearinghouseState;
  return {
    status: "success",
    message: "Balance fetched successfully",
    data: parseHyperliquidBalance(state, quoteUnit),
  };
}

export async function fetchAllHyperliquidBalances(
  ethAddress: string | null,
): Promise<Partial<Record<HyperliquidBalanceProtocol, AggregateBalanceEntry>>> {
  const protocols: HyperliquidBalanceProtocol[] = [
    "hyperliquid",
    ...HIP3_PROTOCOL_IDS,
  ];

  const results = await Promise.allSettled(
    protocols.map(async (protocol) => {
      const response = await fetchHyperliquidBalance(ethAddress, protocol);
      return [
        protocol,
        {
          dex: protocol,
          status: "success",
          message: response.message,
          data: response.data,
        } satisfies AggregateBalanceEntry,
      ] as const;
    }),
  );

  return Object.fromEntries(
    results.map((result, index) => {
      const protocol = protocols[index]!;
      if (result.status === "fulfilled") return result.value;
      return [
        protocol,
        {
          dex: protocol,
          status: "error",
          message: "Failed to fetch Hyperliquid balance",
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        } satisfies AggregateBalanceEntry,
      ] as const;
    }),
  ) as Partial<Record<HyperliquidBalanceProtocol, AggregateBalanceEntry>>;
}
