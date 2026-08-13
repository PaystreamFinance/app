/* eslint-disable @next/next/no-img-element */
"use client";

import * as React from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { executeTrade, type TradeRequest, type TradeV2Request } from "@/lib/arbitrage-api";
import type { ArbitrageMarket } from "@/lib/arbitrage-api";
import { TokenLogo } from "@/app/strategies/_components/arbitrage-columns";
import { getUnderlyingLabel } from "@/lib/symbol-taxonomy";
import { fetchTokenMetadataWithCache } from "@/lib/token-metadata-cache";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { useHyperliquidBalance } from "@/hooks/use-hyperliquid-balance";
import { api } from "@/trpc/react";
import InfoTooltip from "@/components/info-tooltip";
import { Switch } from "@/components/ui/switch";
import { triggerBalanceRefresh } from "@/lib/balance-refresh";
import { triggerAsterPostTradeRefresh } from "@/hooks/use-protocol-balances";
import { isProtocolEnabled, TRADE_PROTOCOLS, DEFAULT_TRADE_PROTOCOL, getProtocolLabel, buildEnabledRates } from "@/lib/protocol-registry";
import { selectLongShort } from "@/lib/select-long-short";
import { getPrivyIdToken, getPrivyAccessToken } from "@/lib/privy-auth";
import { PERP_HEDGE_API_URL } from "@/lib/perp-api-url";

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const SOL_MINT_ADDRESS = "So11111111111111111111111111111111111111112";
const USDC_MARKET_INDEX = 0; // USDC market index for Drift
const MIN_PACIFICA_HYPERLIQUID_NOTIONAL = 10; // Minimum USD * leverage for Pacifica + Hyperliquid trades

interface ArbitrageTradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  marketData: ArbitrageMarket;
}

export const ArbitrageTradeModal: React.FC<ArbitrageTradeModalProps> = ({
  open,
  onOpenChange,
  marketData,
}) => {
  const [usdAmount, setUsdAmount] = React.useState("30");
  const [leverage, setLeverage] = React.useState("2");
  // Autoclose toggle — defaults OFF (suppresses ACLP backend triggers).
  // See desktop trade modal for full semantics. Trade request sends
  // `disableAutoclose: !autoCloseEnabled`.
  const [autoCloseEnabled, setAutoCloseEnabled] = React.useState(false);
  const [leverageEnabled, setLeverageEnabled] = React.useState(true);
  const [isTrading, setIsTrading] = React.useState(false);
  const [isDepositing, setIsDepositing] = React.useState(false);
  const [depositAmount, setDepositAmount] = React.useState("");
  const [depositAsset, setDepositAsset] = React.useState<"usdc" | "usdt" | "sol">("usdc");
  const [depositProtocol, setDepositProtocol] = React.useState<
    "drift" | "pacifica" | "hyperliquid" | "aster" | "lighter" | "01" | null
  >(null);
  const utils = api.useUtils();

  // Auto-determine long/short from backend /markets values.
  const parsePercentValue = (
    rateStr: string | undefined | null,
  ): number | null => {
    if (!rateStr) return null;
    const cleaned = rateStr.replace("%", "").trim();
    const parsed = parseFloat(cleaned);
    if (isNaN(parsed) || Math.abs(parsed) < 0.00005) return null;
    return parsed;
  };

  const getVenueApr = React.useCallback(
    (protocol: string): number | null => {
      const venue = (marketData as unknown as Record<string, { fundingRateApr?: string } | undefined>)[protocol];
      return parsePercentValue(venue?.fundingRateApr);
    },
    [marketData],
  );

  const getVenueRate = React.useCallback(
    (protocol: string): number | null => {
      if (protocol === "flash") {
        return parsePercentValue(marketData.flash?.fees?.marginPerHour);
      }
      const venue = (marketData as unknown as Record<string, { fundingRate?: string } | undefined>)[protocol];
      return parsePercentValue(venue?.fundingRate);
    },
    [marketData],
  );

  const driftApr = isProtocolEnabled("drift") ? getVenueApr("drift") : null;
  const flashApr = isProtocolEnabled("flash") ? null : null;
  const pacificaApr = isProtocolEnabled("pacifica") ? getVenueApr("pacifica") : null;
  const hyperliquidApr = isProtocolEnabled("hyperliquid") ? getVenueApr("hyperliquid") : null;
  const asterApr = isProtocolEnabled("aster") ? getVenueApr("aster") : null;
  const lighterApr = isProtocolEnabled("lighter") ? getVenueApr("lighter") : null;
  const zeroOneApr = isProtocolEnabled("01") ? getVenueApr("01") : null;

  // Use selectLongShort with buildEnabledRates for all enabled protocols
  const suggestedPositions = selectLongShort(buildEnabledRates({
    drift: driftApr,
    flash: flashApr,
    pacifica: pacificaApr,
    hyperliquid: hyperliquidApr,
    aster: asterApr,
    lighter: lighterApr,
    "01": zeroOneApr,
  }));

  type MobileTradeProtocol = "drift" | "flash" | "pacifica" | "hyperliquid" | "aster" | "lighter" | "01";
  const [longProtocol, setLongProtocol] = React.useState<MobileTradeProtocol>(
    (suggestedPositions.long || DEFAULT_TRADE_PROTOCOL) as MobileTradeProtocol,
  );
  const [shortProtocol, setShortProtocol] = React.useState<MobileTradeProtocol>(
    (suggestedPositions.short || TRADE_PROTOCOLS[1] || DEFAULT_TRADE_PROTOCOL) as MobileTradeProtocol,
  );
  const getTradeTicker = React.useCallback(
    (protocol: MobileTradeProtocol): string => {
      const venue = (marketData as unknown as Record<string, { nativeSymbol?: string } | null | undefined>)[protocol];
      return venue?.nativeSymbol || marketData.symbol;
    },
    [marketData],
  );
  const longTradeTicker = getTradeTicker(longProtocol);
  const shortTradeTicker = getTradeTicker(shortProtocol);
  const isCrossTickerTrade =
    longTradeTicker.trim().toUpperCase() !== shortTradeTicker.trim().toUpperCase();

  // Fetch wallet USDC balance
  const walletBalance = useTokenBalance(USDC_MINT);
  const usdtBalance = useTokenBalance(USDT_MINT);

  // Fetch Drift balance using tRPC
  const { data: driftBalanceData, refetch: refetchDriftBalance } =
    api.drift.getBalance.useQuery(undefined, {
      enabled: isProtocolEnabled("drift") && open && (longProtocol === "drift" || shortProtocol === "drift"), // Only fetch when modal is open and Drift is selected
      refetchInterval: 10000, // Refetch every 10 seconds
    });

  // Fetch Pacifica balance using tRPC
  const { data: pacificaBalanceData, refetch: refetchPacificaBalance } =
    api.pacifica.getBalance.useQuery(undefined, {
      enabled:
        open && (longProtocol === "pacifica" || shortProtocol === "pacifica"), // Only fetch when modal is open and Pacifica is selected
      refetchInterval: 10000, // Refetch every 10 seconds
    });

  const { data: hyperliquidBalanceData, refetch: refetchHyperliquidBalance } =
    useHyperliquidBalance("hyperliquid", {
      enabled:
        open &&
        (longProtocol === "hyperliquid" || shortProtocol === "hyperliquid"), // Only fetch when modal is open and Hyperliquid is selected
      refetchInterval: 10000, // Refetch every 10 seconds
    });

  // Deposit mutation for Drift using tRPC
  const driftDepositMutation = api.drift.deposit.useMutation({
    onSuccess: (data) => {
      toast.success(
        `Deposit successful! Transaction: ${data.data.txn_hash.slice(0, 8)}...`,
      );
      setDepositAmount("");
      setDepositProtocol(null);
      void refreshAllBalances("perp-perp-deposit");
    },
    onError: (error) => {
      const errorMessage =
        error instanceof Error
          ? error.message
          : error?.message || "Failed to deposit to Drift";
      toast.error(errorMessage);
    },
  });

  // Deposit mutation for Pacifica using tRPC
  const pacificaDepositMutation = api.pacifica.deposit.useMutation({
    onSuccess: (data) => {
      toast.success(
        `Deposit successful! Transaction: ${data.data.txSignature.slice(0, 8)}...`,
      );
      setDepositAmount("");
      setDepositProtocol(null);
      void refreshAllBalances("perp-perp-deposit");
    },
    onError: (error) => {
      const errorMessage =
        error instanceof Error
          ? error.message
          : error?.message || "Failed to deposit to Pacifica";
      toast.error(errorMessage);
    },
  });

  // Deposit mutation for Hyperliquid using tRPC
  const hyperliquidDepositMutation = api.hyperliquid.deposit.useMutation({
    onSuccess: (data) => {
      const txHash = data.txSignature ?? (data as { swapTxHash?: string }).swapTxHash;
      toast.success(
        `Deposit successful! Transaction: ${txHash?.slice(0, 8) || "..."}...`,
      );
      toast.info(
        (data as { note?: string }).note ||
          "Deposit will be credited to Hyperliquid within ~1 minute.",
      );
      setDepositAmount("");
      setDepositProtocol(null);
      void refreshAllBalances("perp-perp-deposit");
    },
    onError: (error) => {
      const errorMessage =
        error instanceof Error
          ? error.message
          : error?.message || "Failed to deposit to Hyperliquid";
      toast.error(errorMessage);
    },
  });

  // Get USDC balance from Drift
  const driftUsdcBalance = React.useMemo(() => {
    if (!driftBalanceData?.data?.spotBalances) return null;
    const usdcBalance = driftBalanceData.data.spotBalances.find(
      (b: { marketIndex: number; marketName: string }) =>
        b.marketIndex === USDC_MARKET_INDEX || b.marketName === "USDC",
    );
    return usdcBalance ? parseFloat(usdcBalance.balanceHuman) : 0;
  }, [driftBalanceData]);

  // Get free collateral in USD from Drift
  const driftFreeCollateralUSD = React.useMemo(() => {
    if (!driftBalanceData?.data?.freeCollateralUSD) return 0;
    return parseFloat(driftBalanceData.data.freeCollateralUSD);
  }, [driftBalanceData]);

  // Get available balance from Pacifica
  const pacificaAvailableBalance = React.useMemo(() => {
    if (!pacificaBalanceData?.data?.availableToSpend) return 0;
    return parseFloat(pacificaBalanceData.data.availableToSpend);
  }, [pacificaBalanceData]);

  // Get available balance from Hyperliquid
  const hyperliquidAvailableBalance = React.useMemo(() => {
    if (!hyperliquidBalanceData?.data?.availableToTrade) return 0;
    return parseFloat(hyperliquidBalanceData.data.availableToTrade);
  }, [hyperliquidBalanceData]);

  // Fetch 01 balance via REST API
  const privyIdToken = getPrivyIdToken();
  const privyAccessToken = getPrivyAccessToken();
  const { data: zeroOneBalanceData, refetch: refetchZeroOneBalance } = useQuery({
    queryKey: ["mobileZeroOneBalance", privyIdToken],
    queryFn: async () => {
      if (!privyIdToken) return null;
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        "privy-id-token": privyIdToken,
      };
      if (privyAccessToken) headers["Authorization"] = `Bearer ${privyAccessToken}`;
      const res = await fetch(
        `${PERP_HEDGE_API_URL}/arb/balance/01`,
        { method: "GET", headers },
      );
      if (!res.ok) return null;
      return await res.json().catch(() => null);
    },
    enabled: open && !!privyIdToken && (longProtocol === "01" || shortProtocol === "01"),
    refetchInterval: 10000,
    staleTime: 8000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const zeroOneAvailableBalance = React.useMemo(() => {
    if (!zeroOneBalanceData?.data?.availableToTrade) return 0;
    return parseFloat(zeroOneBalanceData.data.availableToTrade);
  }, [zeroOneBalanceData]);

  // Delta-neutral max: 2 × min(longBalance, shortBalance)
  const getDeltaNeutralMax = React.useCallback(() => {
    const getProtocolBalance = (protocol: string): number => {
      switch (protocol) {
        case "drift": return driftFreeCollateralUSD;
        case "pacifica": return pacificaAvailableBalance;
        case "hyperliquid": return hyperliquidAvailableBalance;
        case "01": return zeroOneAvailableBalance;
        default: return 0;
      }
    };
    const longBal = getProtocolBalance(longProtocol);
    const shortBal = getProtocolBalance(shortProtocol);
    const minLeg = Math.min(longBal, shortBal);
    return Math.max(0, minLeg * 2);
  }, [longProtocol, shortProtocol, driftFreeCollateralUSD, pacificaAvailableBalance, hyperliquidAvailableBalance, zeroOneAvailableBalance]);

  // Extract token symbol from market symbol
  const tokenSymbol = marketData.symbol;

  // Fetch token metadata using symbol/name
  const { data: tokenMetadata } = useQuery({
    queryKey: ["tokenMetadata", tokenSymbol],
    queryFn: () => fetchTokenMetadataWithCache(tokenSymbol),
    enabled: !!tokenSymbol && open, // Only fetch when modal is open
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
  });

  // Max ARB = difference of absolute funding rates of selected long and short protocols
  const maxArb = React.useMemo(() => {
    const aprMap: Record<string, number | null> = {
      drift: driftApr,
      flash: flashApr,
      pacifica: pacificaApr,
      hyperliquid: hyperliquidApr,
      aster: asterApr,
      lighter: lighterApr,
      "01": zeroOneApr,
    };
    const longApr = aprMap[longProtocol] ?? null;
    const shortApr = aprMap[shortProtocol] ?? null;
    if (longApr === null || shortApr === null) return 0;
    return Math.abs(shortApr - longApr);
  }, [
    longProtocol,
    shortProtocol,
    driftApr,
    flashApr,
    pacificaApr,
    hyperliquidApr,
    asterApr,
    lighterApr,
    zeroOneApr,
  ]);

  // Time frame in days for Expected PnL (default 1)
  const [timeFrameDays, setTimeFrameDays] = React.useState<string>("1");
  const timeFrameDaysNum = React.useMemo(() => {
    const n = parseFloat(timeFrameDays);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }, [timeFrameDays]);

  // Get USD amount from input for Expected PnL calculation
  const usdAmountNum = React.useMemo(() => {
    const n = parseFloat(usdAmount);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [usdAmount]);

  const apyPercent = maxArb;
  const expectedPnlUsd = (maxArb / 100) * (timeFrameDaysNum / 365) * usdAmountNum;

  const stats = {
    fundingRate: `${maxArb >= 0 ? "" : ""}${maxArb.toFixed(4)}%`,
    apy: `${apyPercent >= 0 ? "+" : ""}${apyPercent.toFixed(2)}%`,
    expectedPnl: `${expectedPnlUsd >= 0 ? "+" : ""}${expectedPnlUsd.toFixed(4)} USD`,
  };

  // Fetch SOL balance for Hyperliquid / 01 deposits
  const solBalance = useTokenBalance(
    open && (depositProtocol === "hyperliquid" || depositProtocol === "01") && depositAsset === "sol" ? SOL_MINT_ADDRESS : undefined,
  );

  const refreshAllBalances = React.useCallback(
    async (reason: string) => {
      void utils.drift.getBalance.invalidate();
      void utils.pacifica.getBalance.invalidate();

      await Promise.allSettled([
        refetchDriftBalance(),
        refetchPacificaBalance(),
        refetchHyperliquidBalance(),
        refetchZeroOneBalance(),
        walletBalance.refetch(),
        solBalance.refetch(),
      ]);

      triggerBalanceRefresh({ reason });
    },
    [
      refetchDriftBalance,
      refetchPacificaBalance,
      refetchHyperliquidBalance,
      refetchZeroOneBalance,
      solBalance,
      utils,
      walletBalance,
    ],
  );

  // Check if both protocols are Pacifica and Hyperliquid
  const isPacificaHyperliquidPair =
    (longProtocol === "pacifica" && shortProtocol === "hyperliquid") ||
    (longProtocol === "hyperliquid" && shortProtocol === "pacifica");

  // Check if minimum notional requirement is met for Pacifica + Hyperliquid trades
  const leverageNum = React.useMemo(() => {
    const n = parseFloat(leverage);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [leverage]);

  const notionalValue = usdAmountNum * leverageNum;
  const meetsMinimumNotional =
    !isPacificaHyperliquidPair ||
    notionalValue >= MIN_PACIFICA_HYPERLIQUID_NOTIONAL;

  // Handle deposit to Drift, Pacifica, or Hyperliquid
  const handleDeposit = async () => {
    const depositValue = parseFloat(depositAmount);

    // Validate deposit amount
    if (isNaN(depositValue) || depositValue <= 0) {
      toast.error("Please enter a valid deposit amount");
      return;
    }

    if (!depositProtocol) {
      toast.error("Please select a protocol to deposit to");
      return;
    }

    setIsDepositing(true);
    try {
      if (depositProtocol === "drift" && isProtocolEnabled("drift")) {
        // Check wallet balance (use usdValue for USDC)
        if (
          walletBalance.usdValue === null ||
          walletBalance.usdValue < depositValue
        ) {
          toast.error("Insufficient wallet balance");
          return;
        }
        await driftDepositMutation.mutateAsync({
          amount: depositValue,
          marketIndex: USDC_MARKET_INDEX,
        });
      } else if (depositProtocol === "pacifica") {
        // Check wallet balance (use usdValue for USDC)
        if (
          walletBalance.usdValue === null ||
          walletBalance.usdValue < depositValue
        ) {
          toast.error("Insufficient wallet balance");
          return;
        }
        await pacificaDepositMutation.mutateAsync({
          amountUsdc: depositValue,
        });
      } else if (depositProtocol === "hyperliquid") {
        const hlBalance =
          depositAsset === "sol" ? solBalance.balance :
          depositAsset === "usdt" ? usdtBalance.balance :
          walletBalance.balance;
        const hlAssetLabel = depositAsset.toUpperCase();
        const hlDecimals = depositAsset === "sol" ? 4 : 2;
        if (hlBalance === null || hlBalance < depositValue) {
          toast.error(
            `Insufficient ${hlAssetLabel} balance. Required: ${depositValue.toFixed(hlDecimals)} ${hlAssetLabel}, Available: ${hlBalance?.toFixed(hlDecimals) ?? "0"} ${hlAssetLabel}`,
          );
          return;
        }
        await hyperliquidDepositMutation.mutateAsync({
          asset: depositAsset,
          amount: depositValue,
        });
      } else if (depositProtocol === "01") {
        // 01 accepts USDC/USDT/SOL (Jupiter auto-swap), min 1 USDC equivalent
        const zeroOneBalance =
          depositAsset === "sol" ? solBalance.balance :
          depositAsset === "usdt" ? usdtBalance.balance :
          walletBalance.balance;
        const zeroOneAssetLabel = depositAsset.toUpperCase();
        const zeroOneDecimals = depositAsset === "sol" ? 4 : 2;
        if (zeroOneBalance === null || zeroOneBalance < depositValue) {
          toast.error(
            `Insufficient ${zeroOneAssetLabel} balance. Required: ${depositValue.toFixed(zeroOneDecimals)} ${zeroOneAssetLabel}, Available: ${zeroOneBalance?.toFixed(zeroOneDecimals) ?? "0"} ${zeroOneAssetLabel}`,
          );
          return;
        }
        if (depositAsset === "usdc" && depositValue < 1) {
          toast.error("Minimum deposit is 1 USDC for 01");
          return;
        }
        const idToken = getPrivyIdToken();
        const accessToken = getPrivyAccessToken();
        if (!idToken) throw new Error("No auth token");
        const headers: HeadersInit = {
          "Content-Type": "application/json",
          "privy-id-token": idToken,
        };
        if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
        const res = await fetch(
          `${PERP_HEDGE_API_URL}/arb/deposit/01`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ amount: depositValue, asset: depositAsset }),
          },
        );
        const data = await res.json() as { status?: string; message?: string; error?: string; txSignature?: string; swapTxHash?: string; asset?: string; amount?: number; warning?: string | null };
        if (!res.ok || data.status === "error") {
          throw new Error(data.message || data.error || "01 deposit failed");
        }
        toast.success(
          `Deposit successful! ${data.amount ? `${data.amount.toFixed(2)} ${data.asset ?? "USDC"} deposited.` : data.message || ""}`,
        );
        if (data.warning) toast.warning(data.warning);
        setDepositAmount("");
        setDepositProtocol(null);
        void refreshAllBalances("perp-perp-deposit");
      }
    } finally {
      setIsDepositing(false);
    }
  };

  const handleTrade = async () => {
    const usdValue = parseFloat(usdAmount);
    const leverageValue = parseFloat(leverage);

    // Validate inputs
    if (isNaN(usdValue) || usdValue <= 0) {
      toast.error("Please enter a valid USD amount");
      return;
    }

    if (isNaN(leverageValue) || leverageValue <= 0) {
      toast.error("Please enter a valid leverage value");
      return;
    }

    // Validate minimum notional for Pacifica + Hyperliquid trades
    const isPacificaHyperliquidPair =
      (longProtocol === "pacifica" && shortProtocol === "hyperliquid") ||
      (longProtocol === "hyperliquid" && shortProtocol === "pacifica");

    if (isPacificaHyperliquidPair) {
      const notionalValue = usdValue * leverageValue;
      if (notionalValue < MIN_PACIFICA_HYPERLIQUID_NOTIONAL) {
        toast.error(
          `Minimum notional (USD × Leverage) for Pacifica + Hyperliquid trades is $${MIN_PACIFICA_HYPERLIQUID_NOTIONAL}. Current: $${notionalValue.toFixed(2)}`,
        );
        return;
      }
    }

    // Calculate required balances (50% each)
    const requiredBalance = usdValue / 2;

    // Validate balances based on selected protocols
    if (longProtocol === "drift" || shortProtocol === "drift") {
      if (driftFreeCollateralUSD < requiredBalance) {
        toast.error(
          `Insufficient Drift balance. Required: $${requiredBalance.toFixed(2)}, Available: $${driftFreeCollateralUSD.toFixed(2)}`,
        );
        return;
      }
    }

    if (longProtocol === "pacifica" || shortProtocol === "pacifica") {
      if (pacificaAvailableBalance < requiredBalance) {
        toast.error(
          `Insufficient Pacifica balance. Required: $${requiredBalance.toFixed(2)}, Available: $${pacificaAvailableBalance.toFixed(2)}`,
        );
        return;
      }
    }

    if (longProtocol === "hyperliquid" || shortProtocol === "hyperliquid") {
      if (hyperliquidAvailableBalance < requiredBalance) {
        toast.error(
          `Insufficient Hyperliquid balance. Required: $${requiredBalance.toFixed(2)}, Available: $${hyperliquidAvailableBalance.toFixed(2)}`,
        );
        return;
      }
    }

    // Validate wallet balance (only needed if Flash is selected, as Flash uses wallet)
    if (longProtocol === "flash" || shortProtocol === "flash") {
      if (walletBalance.balance === null || walletBalance.usdValue === null) {
        toast.error("Unable to fetch wallet balance. Please try again.");
        return;
      }

      if (walletBalance.usdValue < requiredBalance) {
        toast.error(
          `Insufficient wallet balance. Required: $${requiredBalance.toFixed(2)}, Available: $${walletBalance.usdValue.toFixed(2)}`,
        );
        return;
      }
    }

    // Get auth tokens
    const idToken =
      typeof window !== "undefined"
        ? sessionStorage.getItem("privy-id-token")
        : null;
    const accessToken =
      typeof window !== "undefined"
        ? sessionStorage.getItem("privy-access-token")
        : null;

    if (!idToken) {
      toast.error("Authentication required. Please connect your wallet.");
      return;
    }

    setIsTrading(true);
    try {
      const disableAutoclose = !autoCloseEnabled;
      const tradeRequest: TradeRequest | TradeV2Request = isCrossTickerTrade
        ? {
            long: { dex: longProtocol, ticker: longTradeTicker },
            short: { dex: shortProtocol, ticker: shortTradeTicker },
            totalMarginUsd: usdValue,
            leverage: leverageValue,
            jitoFeeSol: 0.0001, // Match v1 default for parity
            disableAutoclose,
          }
        : {
            market: longTradeTicker,
            totalMarginUsd: usdValue,
            leverage: leverageValue,
            protocols: {
              long: longProtocol,
              short: shortProtocol,
            },
            jitoFeeSol: 0.0001, // Default Jito fee
            disableAutoclose,
          };

      const result = await executeTrade(
        tradeRequest,
        idToken,
        accessToken || undefined,
        { paired: isCrossTickerTrade },
      );

      if (result.status === "success" || result.status === "sent") {
        toast.success(result.message || `Trade ${result.status}!`);
        // Show transaction signatures for each protocol
        if (result.positions.drift?.txSignature) {
          toast.info(
            `Drift TX: ${result.positions.drift.txSignature.slice(0, 8)}...`,
          );
        }
        if (result.positions.flash?.txSignature) {
          toast.info(
            `Flash TX: ${result.positions.flash.txSignature.slice(0, 8)}...`,
          );
        }
        if (result.positions.pacifica?.txSignature) {
          toast.info(
            `Pacifica Order ID: ${result.positions.pacifica.txSignature.slice(0, 8)}...`,
          );
        }
        if (result.positions.hyperliquid?.txSignature) {
          toast.info(
            `Hyperliquid Order ID: ${result.positions.hyperliquid.txSignature.slice(0, 8)}...`,
          );
        }
        if (result.bundleId) {
          toast.info(`Bundle ID: ${result.bundleId.slice(0, 8)}...`);
        }
        if (longProtocol === "aster" || shortProtocol === "aster") {
          triggerAsterPostTradeRefresh();
        }
        await refreshAllBalances("perp-perp-open-position");
        onOpenChange(false); // Close modal on success
      } else {
        // Backend reported a non-success status. Surface a hard error so the
        // user doesn't think the trade landed (and so the spinner doesn't
        // stay live and tempt a re-click that would double-send).
        const errMsg =
          ("error" in result && typeof result.error === "string" && result.error) ||
          result.message ||
          `Trade ${result.status ?? "failed"}`;
        toast.error(errMsg);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to execute trade",
      );
    } finally {
      setIsTrading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="bottom-sheet"
        className="max-h-[90vh] overflow-y-auto border border-[#0F1F30] bg-[#000D1E] p-0"
        closeIcon
        onDismiss={() => onOpenChange(false)}
      >
        <div className="space-y-4 p-4 pb-0 md:space-y-6 md:p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <TokenLogo
                symbol={marketData.symbol}
                className="h-12 w-12"
              />
              <div className="flex min-w-0 flex-col">
                <h2 className="text-2xl font-medium text-white">
                  {getUnderlyingLabel(marketData.symbol).toUpperCase()}
                </h2>
              </div>
            </div>
            <p className="text-right text-xs text-[#7192A5]">
              Execute arbitrage trade across{" "}
              {TRADE_PROTOCOLS.map((id) => getProtocolLabel(id)).join(", ")}{" "}
              markets
            </p>
          </div>

          {/* Key Statistics Section */}
          <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
            <div className="border border-[#0F1F30] bg-[#041223] p-4">
              <div className="mb-1 flex items-center gap-1">
                <p className="text-sm text-[#7192A5]">Funding Rate</p>
                <InfoTooltip iconClassName="text-[#7192A5]">
                  Max ARB value of {marketData.symbol}
                </InfoTooltip>
              </div>
              <p
                className={cn(
                  "text-lg font-normal",
                  maxArb > 0
                    ? "text-[#4ADE80]"
                    : maxArb < 0
                      ? "text-[#FF6B6B]"
                      : "text-white",
                )}
              >
                {stats.fundingRate}
              </p>
            </div>
            <div className="border border-[#0F1F30] bg-[#041223] p-4">
              <p className="mb-1 text-sm text-[#7192A5]">APY</p>
              <p
                className={cn(
                  "text-lg font-normal",
                  apyPercent > 0
                    ? "text-[#4ADE80]"
                    : apyPercent < 0
                      ? "text-[#FF6B6B]"
                      : "text-white",
                )}
              >
                {stats.apy}
              </p>
            </div>
            <div className="border border-[#0F1F30] bg-[#041223] p-4">
              <p className="mb-1 text-sm text-[#7192A5]">Time Frame</p>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0.01}
                  step={0.5}
                  value={timeFrameDays}
                  onChange={(e) => setTimeFrameDays(e.target.value)}
                  className="h-9 w-20 border-[#0F1F30] bg-[#02142B] text-base text-white placeholder:text-[#7192A5]"
                />
                <span className="text-sm text-[#7192A5]">days</span>
              </div>
            </div>
            <div className="border border-[#0F1F30] bg-[#041223] p-4">
              <p className="mb-1 text-sm text-[#7192A5]">Expected PnL</p>
              <p
                className={cn(
                  "text-lg font-normal",
                  expectedPnlUsd > 0
                    ? "text-[#4ADE80]"
                    : expectedPnlUsd < 0
                      ? "text-[#FF6B6B]"
                      : "text-white",
                )}
              >
                {stats.expectedPnl}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center gap-0">
            {/* Balance Boxes Row */}
            <div className="grid w-full auto-cols-fr grid-flow-col border border-[#0F1F30] bg-[#041223]">
              {/* Protocol Balances */}
              {(longProtocol === "drift" || shortProtocol === "drift") && (
                <div className="flex items-center gap-2 border-r border-[#0F1F30] px-3 py-3">
                  <span className="text-xs whitespace-nowrap text-[#7192A5]">
                    Drift:
                  </span>
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      driftBalanceData
                        ? driftFreeCollateralUSD >=
                          (parseFloat(usdAmount) || 0) / 2
                          ? "text-[#4ADE80]"
                          : "text-[#FF6B6B]"
                        : "text-[#7192A5]",
                    )}
                  >
                    {driftBalanceData
                      ? `$${driftFreeCollateralUSD.toFixed(1)}`
                      : "..."}
                  </span>
                </div>
              )}
              {(longProtocol === "pacifica" ||
                shortProtocol === "pacifica") && (
                <div className="flex items-center gap-2 border-r border-[#0F1F30] px-3 py-3">
                  <span className="text-xs whitespace-nowrap text-[#7192A5]">
                    Pacifica:
                  </span>
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      pacificaBalanceData
                        ? pacificaAvailableBalance >=
                          (parseFloat(usdAmount) || 0) / 2
                          ? "text-[#4ADE80]"
                          : "text-[#FF6B6B]"
                        : "text-[#7192A5]",
                    )}
                  >
                    {pacificaBalanceData
                      ? `$${pacificaAvailableBalance.toFixed(1)}`
                      : "..."}
                  </span>
                </div>
              )}
              {(longProtocol === "hyperliquid" ||
                shortProtocol === "hyperliquid") && (
                <div className="flex items-center gap-2 border-r border-[#0F1F30] px-3 py-3">
                  <span className="text-xs whitespace-nowrap text-[#7192A5]">
                    HL:
                  </span>
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      hyperliquidBalanceData
                        ? hyperliquidAvailableBalance >=
                          (parseFloat(usdAmount) || 0) / 2
                          ? "text-[#4ADE80]"
                          : "text-[#FF6B6B]"
                        : "text-[#7192A5]",
                    )}
                  >
                    {hyperliquidBalanceData
                      ? `$${hyperliquidAvailableBalance.toFixed(1)}`
                      : "..."}
                  </span>
                </div>
              )}
              {/* Wallet Balance */}
              <div className="flex items-center gap-2 border-r border-[#0F1F30] px-3 py-3">
                <span className="text-xs whitespace-nowrap text-[#7192A5]">
                  Wallet:
                </span>
                <span className="text-sm font-semibold text-white">
                  {walletBalance.usdValue !== null
                    ? `$${walletBalance.usdValue.toFixed(1)}`
                    : walletBalance.isLoading
                      ? "..."
                      : "$0.0"}
                </span>
              </div>
              {/* Deposit Button */}
              <button
                onClick={() => {
                  const firstProtocol =
                    longProtocol === "drift" || shortProtocol === "drift"
                      ? "drift"
                      : longProtocol === "pacifica" ||
                          shortProtocol === "pacifica"
                        ? "pacifica"
                        : "hyperliquid";
                  const required = (parseFloat(usdAmount) || 0) / 2;
                  let needed = 0;
                  if (firstProtocol === "drift") {
                    needed = Math.max(0, required - driftFreeCollateralUSD);
                  } else if (firstProtocol === "pacifica") {
                    needed = Math.max(0, required - pacificaAvailableBalance);
                  } else {
                    needed = Math.max(0, required - hyperliquidAvailableBalance);
                  }
                  setDepositAmount(needed > 0 ? needed.toFixed(2) : "");
                  setDepositProtocol(firstProtocol);
                }}
                className="flex shrink-0 items-center gap-1 bg-[#0A2A4A] px-3 py-3 text-xs font-medium text-[#9CE0FF] transition-colors hover:bg-[#0F3560]"
              >
                Deposit
                <span className="text-[#9CE0FF]">+</span>
              </button>
            </div>

            {/* Deposit Input Card (shown when deposit button is clicked) */}
            {depositAmount !== "" && depositProtocol && (
              <div className="w-full border border-t-0 border-[#0F1F30] bg-[#041223] p-4">
                <div className="mb-3 flex items-center gap-2">
                  <div className="h-1.5 w-1.5 bg-[#9CE0FF]"></div>
                  <span className="text-xs font-medium text-[#9BA2AE]">
                    Deposit to{" "}
                    {depositProtocol ? getProtocolLabel(depositProtocol) : ""}
                  </span>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Input
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        placeholder="0.00"
                        className="h-8 border-[#0F1F30] bg-[#02142B] pr-20 text-base font-medium text-white ring-0 placeholder:text-[#7192A5]"
                        type="number"
                        step="0.01"
                        min={depositAsset === "sol" ? "0.12" : "1"}
                      />
                      {depositProtocol === "hyperliquid" ? (
                        <select
                          value={depositAsset}
                          onChange={(e) => {
                            setDepositAsset(e.target.value as "usdc" | "usdt" | "sol");
                            setDepositAmount("");
                          }}
                          className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer border-none bg-transparent text-xs font-medium text-[#BBEBFF] outline-none"
                        >
                          <option value="usdc" className="bg-[#041223] text-white">USDC</option>
                          <option value="usdt" className="bg-[#041223] text-white">USDT</option>
                          <option value="sol" className="bg-[#041223] text-white">SOL</option>
                        </select>
                      ) : (
                        <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs! text-[#BBEBFF70]">
                          USDC
                        </span>
                      )}
                    </div>
                    {walletBalance.usdValue !== null &&
                      walletBalance.usdValue > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const required = (parseFloat(usdAmount) || 0) / 2;
                            const currentBalance =
                              depositProtocol === "drift"
                                ? driftFreeCollateralUSD
                                : depositProtocol === "pacifica"
                                  ? pacificaAvailableBalance
                                  : 0;
                            const needed = Math.max(
                              0,
                              required - currentBalance,
                            );
                            const maxAmount = Math.min(
                              walletBalance.usdValue || 0,
                              needed > 0
                                ? needed
                                : walletBalance.usdValue || 0,
                            );
                            setDepositAmount(
                              maxAmount > 0 ? maxAmount.toFixed(2) : "",
                            );
                          }}
                          className="h-8 cursor-pointer border-[#0F1F30] px-3 text-xs! font-normal text-[#9CE0FF] hover:bg-[#0F1F2F] hover:text-[#BBEBFF]"
                        >
                          Max
                        </Button>
                      )}
                  </div>
                  {depositProtocol === "hyperliquid" && (
                    <p className="text-xs text-[#7192A5]">
                      Deposit USDC — backend swaps to SOL and deposits. Credited within ~1 minute.
                    </p>
                  )}
                  <div className="flex flex-row-reverse items-center gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleDeposit}
                      disabled={
                        isDepositing ||
                        !depositAmount ||
                        parseFloat(depositAmount) <= 0
                      }
                      className="font-ibm-plex-serif h-10! flex-1 cursor-pointer font-medium italic"
                    >
                      {isDepositing ? "Depositing..." : "Confirm Deposit"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setDepositAmount("");
                        setDepositProtocol(null);
                      }}
                      className="h-10 cursor-pointer px-4 text-xs! font-medium text-[#7192A5] hover:bg-[#0F1F2F] hover:text-[#BBEBFF]"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* USDC Amount Input */}
            <div className="relative w-full">
              <div className="flex w-full flex-col border-t-2 border-[#000E1E] bg-[#021935] p-5">
                <div className="flex items-center gap-3">
                  {/* USDC Icon */}
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2775CA]">
                    <span className="text-xs font-bold text-white">$</span>
                  </div>
                  <span className="text-sm font-medium text-white">USDC</span>
                  <div className="ml-auto">
                    <Input
                      value={usdAmount}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "" || /^\d*\.?\d*$/.test(v)) setUsdAmount(v);
                      }}
                      onKeyDown={(e) => {
                        if (["e", "E", "+", "-"].includes(e.key))
                          e.preventDefault();
                      }}
                      className="w-32 border-0 bg-transparent text-right text-2xl font-medium text-white shadow-none ring-0 outline-none placeholder:text-white/60"
                      placeholder="0.00"
                      type="text"
                      inputMode="decimal"
                    />
                  </div>
                </div>

                <div className="mt-3 flex w-full items-center justify-between">
                  {/* half / max buttons */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        // Floor — never round up over actual balance.
                        const max = getDeltaNeutralMax();
                        setUsdAmount((Math.floor((max / 2) * 100) / 100).toFixed(2));
                      }}
                      className="border border-[#0F1F30] bg-[#02142B] px-3 py-1 text-xs text-[#7192A5] transition-colors hover:bg-[#0A2A4A] hover:text-white"
                    >
                      half
                    </button>
                    <button
                      onClick={() => {
                        const m = getDeltaNeutralMax();
                        setUsdAmount((Math.floor(m * 100) / 100).toFixed(2));
                      }}
                      className="border border-[#0F1F30] bg-[#02142B] px-3 py-1 text-xs text-[#7192A5] transition-colors hover:bg-[#0A2A4A] hover:text-white"
                    >
                      max
                    </button>
                  </div>
                  <span className="text-xs text-[#7192A5]">
                    Max: ${getDeltaNeutralMax().toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Protocol Selection */}
            <div className="relative w-full">
              <div className="flex w-full flex-col border-t-2 border-[#000E1E] bg-[#021935] p-5">
                <p className="text-sm text-[#9AA3AE]">Protocol Selection</p>

                <div className="mt-5 grid grid-cols-2 gap-4">
                  {/* Long Protocol */}
                  <div className="flex flex-col gap-2">
                    <label className="text-xs text-[#7192A5]">
                      Long Position
                    </label>
                    <select
                      value={longProtocol}
                      onChange={(e) => {
                        const newLong = e.target.value as
                          | "drift"
                          | "flash"
                          | "pacifica"
                          | "hyperliquid";
                        setLongProtocol(newLong);
                        // Ensure short is different
                        if (newLong === shortProtocol) {
                          const otherProtocols = TRADE_PROTOCOLS.filter(
                            (p) => p !== newLong,
                          );
                          if (otherProtocols.length > 0) {
                            setShortProtocol(otherProtocols[0]! as typeof shortProtocol);
                          }
                        }
                      }}
                      className="h-10 border border-[#0F1F30] bg-[#02142B] px-3 text-sm text-white outline-none focus:border-[#9CE0FF]"
                    >
                      {TRADE_PROTOCOLS.map((id) => (
                        <option key={id} value={id}>{getProtocolLabel(id)}</option>
                      ))}
                    </select>
                  </div>

                  {/* Short Protocol */}
                  <div className="flex flex-col gap-2">
                    <label className="text-xs text-[#7192A5]">
                      Short Position
                    </label>
                    <select
                      value={shortProtocol}
                      onChange={(e) => {
                        const newShort = e.target.value as
                          | "drift"
                          | "flash"
                          | "pacifica"
                          | "hyperliquid";
                        setShortProtocol(newShort);
                        // Ensure long is different
                        if (newShort === longProtocol) {
                          const otherProtocols = TRADE_PROTOCOLS.filter(
                            (p) => p !== newShort,
                          );
                          if (otherProtocols.length > 0) {
                            setLongProtocol(otherProtocols[0]! as typeof longProtocol);
                          }
                        }
                      }}
                      className="h-10 border border-[#0F1F30] bg-[#02142B] px-3 text-sm text-white outline-none focus:border-[#9CE0FF]"
                    >
                      {TRADE_PROTOCOLS.map((id) => (
                        <option key={id} value={id}>{getProtocolLabel(id)}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Leverage Section */}
            <div className="relative w-full">
              <div className="flex w-full flex-col border-t-2 border-[#000E1E] bg-[#021935] p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-[#9AA3AE]">Leverage</p>
                  {/* Toggle */}
                  <button
                    onClick={() => {
                      setLeverageEnabled(!leverageEnabled);
                      if (leverageEnabled) {
                        setLeverage("1");
                      } else {
                        setLeverage("2");
                      }
                    }}
                    className={cn(
                      "relative h-6 w-11 rounded-full transition-colors",
                      leverageEnabled ? "bg-[#9CE0FF]" : "bg-[#1A2A3A]",
                    )}
                  >
                    <div
                      className={cn(
                        "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                        leverageEnabled ? "translate-x-5" : "translate-x-0.5",
                      )}
                    />
                  </button>
                </div>

                {leverageEnabled && (
                  <div className="mt-4 flex items-center gap-4">
                    <div className="flex h-10 w-14 items-center justify-center border border-[#0F1F30] bg-[#02142B]">
                      <span className="text-lg font-medium text-white">
                        {leverage}x
                      </span>
                    </div>
                    <div className="relative flex-1">
                      <input
                        type="range"
                        min="1"
                        max="20"
                        step="1"
                        value={leverage}
                        onChange={(e) => setLeverage(e.target.value)}
                        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[#1A2A3A] accent-[#9CE0FF] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#9CE0FF] [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(156,224,255,0.4)]"
                        style={{
                          background: `linear-gradient(to right, #9CE0FF 0%, #9CE0FF ${((parseFloat(leverage) - 1) / 19) * 100}%, #1A2A3A ${((parseFloat(leverage) - 1) / 19) * 100}%, #1A2A3A 100%)`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Autoclose toggle — see desktop modal for full semantics.
                OFF (default): backend ACLP triggers (liquidation proximity,
                OI cascade, equity drawdown) are suppressed. Funding-flip
                and delta-drift auto-closes still fire. */}
            <div className="mt-3 flex items-center justify-between border border-[#0F1F30] bg-[#02142B] px-4 py-3">
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-white">Autoclose</span>
                <InfoTooltip iconClassName="text-[#7192A5]">
                  {autoCloseEnabled
                    ? "ON: backend auto-closes the position on liquidation proximity, OI cascade, or portfolio equity drawdown."
                    : "OFF: liquidation-proximity, OI-cascade and equity-drawdown auto-closes are suppressed. Funding-flip and delta-drift triggers still fire."}
                </InfoTooltip>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "text-xs",
                    autoCloseEnabled ? "text-[#4ADE80]" : "text-[#7192A5]",
                  )}
                >
                  {autoCloseEnabled ? "ON" : "OFF"}
                </span>
                <Switch
                  checked={autoCloseEnabled}
                  onCheckedChange={setAutoCloseEnabled}
                />
              </div>
            </div>

            {/* Execute Trade Button - Gradient Style */}
            <div className="mt-4 flex w-full items-center justify-center px-0">
              <button
                onClick={handleTrade}
                disabled={isTrading || isDepositing || !meetsMinimumNotional}
                style={{
                  background:
                    "linear-gradient(90deg, rgba(137,179,224,0.15) 0%, rgba(36,45,55,0.6) 30%, rgba(36,45,55,0.6) 70%, rgba(137,179,224,0.15) 100%)",
                }}
                className="font-ibm-plex-serif h-fit w-full cursor-pointer border-2 border-[#9ce0ff33] p-3 px-4 text-[16px] text-[#9CE0FF] italic transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isTrading ? "Executing Trade..." : "Execute Trade"}
              </button>
            </div>

            {isPacificaHyperliquidPair && !meetsMinimumNotional && (
              <p className="mt-2 text-sm text-yellow-500">
                Minimum notional (USD × Leverage) for Pacifica + Hyperliquid
                trades is ${MIN_PACIFICA_HYPERLIQUID_NOTIONAL}. Current: $
                {notionalValue.toFixed(2)}
              </p>
            )}

            <Accordion
              type="single"
              collapsible
              className="mt-1 w-full"
              defaultValue="item-1"
            >
              <AccordionItem value="1" className="border-0">
                <AccordionTrigger className="py-2 text-sm font-normal text-white hover:no-underline">
                  <div className="flex w-full items-center justify-between">
                    Trade Details
                  </div>
                </AccordionTrigger>
                <AccordionContent className="flex flex-col gap-3 border border-[#213548] p-3 px-4 shadow-none">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-normal tracking-[-1%] text-[#7699AD]">
                      Market
                    </span>
                    <span className="text-sm font-normal text-white">
                      {marketData.symbol}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-normal tracking-[-1%] text-[#7699AD]">
                      Total Margin
                    </span>
                    <span className="text-sm font-normal text-white">
                      ${usdAmount || "0"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-normal tracking-[-1%] text-[#7699AD]">
                      Leverage
                    </span>
                    <span className="text-sm font-normal text-white">
                      {leverage || "0"}x
                    </span>
                  </div>
                  {marketData.drift?.fundingRateApr && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-normal tracking-[-1%] text-[#7699AD]">
                        Max ARB
                      </span>
                      <span className="text-sm font-normal text-[#4ADE80]">
                        {marketData.drift.fundingRateApr}
                      </span>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
