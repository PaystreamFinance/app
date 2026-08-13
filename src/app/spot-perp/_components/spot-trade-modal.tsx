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
import { Slider } from "@/components/ui/slider";
import FundingRateChart from "@/app/strategies/_components/funding-rate-chart";
import { TokenLogo } from "./spot-columns";
import {
  executeSpotPerpTrade,
  type SpotPerpTradeRequest,
  type SpotPerpMarket,
} from "@/lib/spotperp-api";
import { fetchTokenMetadataWithCache } from "@/lib/token-metadata-cache";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { useHyperliquidBalance } from "@/hooks/use-hyperliquid-balance";
import { api } from "@/trpc/react";
import InfoTooltip from "@/components/info-tooltip";
import { usePositionToast } from "@/hooks/use-position-toast";
import { SimpleToast } from "@/components/simple-toast";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { fetchArbFees } from "@/lib/arbitrage-api";
import { triggerBalanceRefresh } from "@/lib/balance-refresh";
import { getPrivyAccessToken, getPrivyIdToken } from "@/lib/privy-auth";
import { isProtocolEnabled, TRADE_PROTOCOLS, DEFAULT_TRADE_PROTOCOL, pickBestPerpProtocol, getProtocolLabel } from "@/lib/protocol-registry";

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOL_MINT_ADDRESS = "So11111111111111111111111111111111111111112";
const USDC_DECIMALS = 6;
const USDC_MARKET_INDEX = 0; // USDC market index for Drift
const MIN_SPOT_BUY = 10;
const normalizeDexId = (dex: string) => dex.trim().toLowerCase();

interface JupiterQuoteResponse {
  priceImpactPct?: string;
}

interface SpotTradeModalProps {
  isMobile?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  marketData: SpotPerpMarket;
}

export const SpotTradeModal: React.FC<SpotTradeModalProps> = ({
  isMobile = false,
  open,
  onOpenChange,
  marketData,
}) => {
  const [usdAmount, setUsdAmount] = React.useState("30");
  const [leverage, setLeverage] = React.useState("2");
  const [isTrading, setIsTrading] = React.useState(false);
  const [isDepositing, setIsDepositing] = React.useState(false);
  const [depositAmount, setDepositAmount] = React.useState("");
  type SpotPerpProtocol = "drift" | "pacifica" | "hyperliquid" | "aster" | "lighter" | "01";
  const [depositProtocol, setDepositProtocol] = React.useState<
    SpotPerpProtocol | null
  >(null);

  const [chartToggle, setChartToggle] = React.useState(isMobile ? false : true);

  const positionToast = usePositionToast();
  const utils = api.useUtils();
  const depositToastIdRef = React.useRef<string | null>(null);

  // Auto-determine long/short based on funding rates
  const parseFundingRate = (
    rateStr: string | undefined | null,
  ): number | null => {
    if (!rateStr) return null;
    const cleaned = rateStr.replace("%", "").trim();
    const parsed = parseFloat(cleaned);
    if (isNaN(parsed) || Math.abs(parsed) < 0.00005) return null;
    return parsed;
  };

  const driftRate = isProtocolEnabled("drift") ? parseFundingRate(marketData.drift?.fundingRate) : null;
  const pacificaRate = isProtocolEnabled("pacifica") ? parseFundingRate(marketData.pacifica?.fundingRate) : null;
  const hyperliquidRate = isProtocolEnabled("hyperliquid") ? parseFundingRate(marketData.hyperliquid?.fundingRate) : null;
  const zeroOneRate = isProtocolEnabled("01") ? parseFundingRate(marketData["01"]?.fundingRate) : null;

  const perpProtocol = React.useMemo((): SpotPerpProtocol => {
    return pickBestPerpProtocol({
      drift: driftRate,
      pacifica: pacificaRate,
      hyperliquid: hyperliquidRate,
      "01": zeroOneRate,
    }) as SpotPerpProtocol;
  }, [driftRate, pacificaRate, hyperliquidRate, zeroOneRate]);

  // Fetch wallet USDC balance
  const walletBalance = useTokenBalance(USDC_MINT);

  // Fetch Drift balance using tRPC
  const { data: driftBalanceData, refetch: refetchDriftBalance } =
    api.drift.getBalance.useQuery(undefined, {
      enabled: open && isProtocolEnabled("drift") && perpProtocol === "drift",
      refetchInterval: 10000,
      staleTime: 8000,
      retry: 1,
      refetchOnWindowFocus: false,
    });

  // Fetch Pacifica balance using tRPC
  const { data: pacificaBalanceData, refetch: refetchPacificaBalance } =
    api.pacifica.getBalance.useQuery(undefined, {
      enabled: open && perpProtocol === "pacifica",
      refetchInterval: 10000,
      staleTime: 8000,
      retry: 1,
      refetchOnWindowFocus: false,
    });

  const { data: hyperliquidBalanceData, refetch: refetchHyperliquidBalance } =
    useHyperliquidBalance("hyperliquid", {
      enabled: open && perpProtocol === "hyperliquid",
      refetchInterval: 10000,
      staleTime: 8000,
      retry: 1,
      refetchOnWindowFocus: false,
    });

  // Deposit mutation for Drift using tRPC
  const driftDepositMutation = api.drift.deposit.useMutation({
    onSuccess: (data) => {
      if (depositToastIdRef.current) {
        positionToast.success(
          depositToastIdRef.current,
          `https://solscan.io/tx/${data.data.txn_hash}`,
          `Deposit successful! Transaction: ${data.data.txn_hash.slice(0, 8)}...`,
        );
        depositToastIdRef.current = null;
      }
      setDepositAmount("");
      setDepositProtocol(null);
      void refreshAllBalances("spot-perp-deposit");
    },
    onError: (error) => {
      const errorMessage =
        error instanceof Error
          ? error.message
          : error?.message || "Failed to deposit to Drift";
      if (depositToastIdRef.current) {
        positionToast.failed(depositToastIdRef.current, errorMessage);
        depositToastIdRef.current = null;
      }
    },
  });

  // Deposit mutation for Pacifica using tRPC
  const pacificaDepositMutation = api.pacifica.deposit.useMutation({
    onSuccess: (data) => {
      if (depositToastIdRef.current) {
        positionToast.success(
          depositToastIdRef.current,
          data.txSignature ? `https://solscan.io/tx/${data.txSignature}` : "",
          `Deposit successful! Transaction: ${data.txSignature?.slice(0, 8) || "..."}...`,
        );
        depositToastIdRef.current = null;
      }
      setDepositAmount("");
      setDepositProtocol(null);
      void refreshAllBalances("spot-perp-deposit");
    },
    onError: (error) => {
      const errorMessage =
        error instanceof Error
          ? error.message
          : error?.message || "Failed to deposit to Pacifica";
      if (depositToastIdRef.current) {
        positionToast.failed(depositToastIdRef.current, errorMessage);
        depositToastIdRef.current = null;
      }
    },
  });

  // Deposit mutation for Hyperliquid using tRPC
  const hyperliquidDepositMutation = api.hyperliquid.deposit.useMutation({
    onSuccess: (data) => {
      if (depositToastIdRef.current) {
        positionToast.success(
          depositToastIdRef.current,
          data.txSignature ? `https://solscan.io/tx/${data.txSignature}` : "",
          `Deposit successful! Transaction: ${data.txSignature?.slice(0, 8) || "..."}...`,
        );
        depositToastIdRef.current = null;
      }
      toast.custom(() => (
        <SimpleToast
          type="info"
          title="Hyperliquid Deposit"
          description={
            data.note ||
            "Deposit will be credited to Hyperliquid within ~1 minute."
          }
        />
      ));
      setDepositAmount("");
      setDepositProtocol(null);
      void refreshAllBalances("spot-perp-deposit");
    },
    onError: (error) => {
      const errorMessage =
        error instanceof Error
          ? error.message
          : error?.message || "Failed to deposit to Hyperliquid";
      if (depositToastIdRef.current) {
        positionToast.failed(depositToastIdRef.current, errorMessage);
        depositToastIdRef.current = null;
      }
    },
  });

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

  // Extract token symbol from market symbol
  const tokenSymbol = marketData.symbol;

  // Fetch token metadata using symbol/name
  const { data: tokenMetadata } = useQuery({
    queryKey: ["tokenMetadata", tokenSymbol],
    queryFn: () => fetchTokenMetadataWithCache(tokenSymbol),
    enabled: !!tokenSymbol && open, // Only fetch when modal is open
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
  });

  console.log("[SpotTradeModal] tokenMetadata", tokenMetadata);

  const selectedFundingRate = React.useMemo(() => {
    if (perpProtocol === "drift") return driftRate;
    if (perpProtocol === "pacifica") return pacificaRate;
    return hyperliquidRate;
  }, [perpProtocol, driftRate, pacificaRate, hyperliquidRate]);

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

  const spotBuyValue = usdAmountNum / 2;
  const meetsMinimumSpotBuy = spotBuyValue >= MIN_SPOT_BUY;
  const spotBuyAmountBaseUnits = React.useMemo(() => {
    if (!Number.isFinite(spotBuyValue) || spotBuyValue <= 0) return null;

    const amountInBaseUnits = Math.round(
      spotBuyValue * Math.pow(10, USDC_DECIMALS),
    );
    if (amountInBaseUnits <= 0) return null;

    return amountInBaseUnits.toString();
  }, [spotBuyValue]);
  const deferredSpotBuyAmountBaseUnits = React.useDeferredValue(
    spotBuyAmountBaseUnits,
  );

  const { data: jupiterSpotQuote, isFetching: isFetchingJupiterSpotQuote } =
    useQuery({
      queryKey: [
        "jupiterSpotQuoteSlippage",
        tokenMetadata?.mint,
        deferredSpotBuyAmountBaseUnits,
      ],
      queryFn: async (): Promise<JupiterQuoteResponse | null> => {
        if (!tokenMetadata?.mint || !deferredSpotBuyAmountBaseUnits)
          return null;

        const params = new URLSearchParams({
          inputMint: USDC_MINT,
          outputMint: tokenMetadata.mint,
          amount: deferredSpotBuyAmountBaseUnits,
          swapMode: "ExactIn",
        });

        const response = await fetch(
          `https://lite-api.jup.ag/swap/v1/quote?${params.toString()}`,
        );

        if (!response.ok) {
          throw new Error(`Jupiter quote failed: ${response.status}`);
        }

        return (await response.json()) as JupiterQuoteResponse;
      },
      enabled:
        !!tokenMetadata?.mint && !!deferredSpotBuyAmountBaseUnits && open,
      refetchOnWindowFocus: false,
      staleTime: 15_000,
      retry: 1,
    });

  const slippagePct = React.useMemo(() => {
    const rawPriceImpact = jupiterSpotQuote?.priceImpactPct;
    if (!rawPriceImpact) return null;

    const parsed = Number(rawPriceImpact);
    if (!Number.isFinite(parsed)) return null;

    return Math.abs(parsed * 100);
  }, [jupiterSpotQuote?.priceImpactPct]);

  // APY based on selected funding rate
  const fundingRateValue = selectedFundingRate ?? 0;
  const apyPercent = fundingRateValue * 24 * 365;
  // Expected PnL in USD = (funding rate / 100) * 24 * time * usdAmount
  const expectedPnlUsd =
    (fundingRateValue / 100) * 24 * timeFrameDaysNum * usdAmountNum;

  const stats = {
    fundingRate: `${fundingRateValue >= 0 ? "" : ""}${fundingRateValue.toFixed(4)}%`,
    apy: `${apyPercent >= 0 ? "+" : ""}${apyPercent.toFixed(2)}%`,
    expectedPnl: `${expectedPnlUsd >= 0 ? "+" : ""}${expectedPnlUsd.toFixed(4)} USD`,
  };

  // Fetch SOL balance for Hyperliquid deposits
  const solBalance = useTokenBalance(
    open && depositProtocol === "hyperliquid" ? SOL_MINT_ADDRESS : undefined,
  );

  const refreshAllBalances = React.useCallback(
    async (reason: string) => {
      void utils.drift.getBalance.invalidate();
      void utils.pacifica.getBalance.invalidate();

      await Promise.allSettled([
        refetchDriftBalance(),
        refetchPacificaBalance(),
        refetchHyperliquidBalance(),
        walletBalance.refetch(),
        solBalance.refetch(),
      ]);

      triggerBalanceRefresh({ reason });
    },
    [
      refetchDriftBalance,
      refetchPacificaBalance,
      refetchHyperliquidBalance,
      solBalance,
      utils,
      walletBalance,
    ],
  );

  const leverageNum = React.useMemo(() => {
    const n = parseFloat(leverage);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }, [leverage]);

  // Handle deposit to Drift, Pacifica, or Hyperliquid
  const handleDeposit = async () => {
    const depositValue = parseFloat(depositAmount);

    // Validate deposit amount
    if (isNaN(depositValue) || depositValue <= 0) {
      toast.custom(() => (
        <SimpleToast
          type="error"
          title="Invalid Deposit Amount"
          description="Please enter a valid deposit amount"
        />
      ));
      return;
    }

    if (!depositProtocol) {
      toast.custom(() => (
        <SimpleToast
          type="error"
          title="No Protocol Selected"
          description="Please select a protocol to deposit to"
        />
      ));
      return;
    }

    setIsDepositing(true);
    try {
      // Open position toast before starting deposit
      depositToastIdRef.current = positionToast.open({
        amount: depositAmount,
        symbol:
          depositProtocol === "hyperliquid"
            ? "/icons/sol.svg"
            : "/api/token/usdc",
        amountTokenName: depositProtocol === "hyperliquid" ? "SOL" : "USDC",
        pair: `${depositProtocol.charAt(0).toUpperCase() + depositProtocol.slice(1)} Deposit`,
        description: `Depositing to ${depositProtocol.charAt(0).toUpperCase() + depositProtocol.slice(1)}...`,
      });

      if (depositProtocol === "drift") {
        // Check wallet balance (use usdValue for USDC)
        if (
          walletBalance.usdValue === null ||
          walletBalance.usdValue < depositValue
        ) {
          toast.custom(() => (
            <SimpleToast
              type="error"
              title="Insufficient Wallet Balance"
              description="Insufficient wallet balance"
            />
          ));
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
          toast.custom(() => (
            <SimpleToast
              type="error"
              title="Insufficient Wallet Balance"
              description="Insufficient wallet balance"
            />
          ));
          return;
        }
        await pacificaDepositMutation.mutateAsync({
          amountUsdc: depositValue,
        });
      } else if (depositProtocol === "hyperliquid") {
        // Check SOL balance (Hyperliquid uses SOL, not USDC)
        if (solBalance.balance === null || solBalance.balance < depositValue) {
          toast.custom(() => (
            <SimpleToast
              type="error"
              title="Insufficient SOL Balance"
              description={`Insufficient SOL balance. Required: ${depositValue.toFixed(4)} SOL, Available: ${solBalance.balance?.toFixed(4) || "0"} SOL`}
            />
          ));
          return;
        }
        // Validate minimum deposit
        if (depositValue < 0.12) {
          toast.custom(() => (
            <SimpleToast
              type="error"
              title="Minimum Deposit"
              description="Minimum deposit is 0.12 SOL"
            />
          ));
          return;
        }
        await hyperliquidDepositMutation.mutateAsync({
          asset: "sol",
          amount: depositValue,
        });
      }
    } finally {
      setIsDepositing(false);
    }
  };

  const handleTrade = async () => {
    const usdValue = parseFloat(usdAmount);
    console.log("[SpotTradeModal] usdValue", usdValue);
    const leverageValue = parseFloat(leverage);
    console.log("[SpotTradeModal] leverageValue", leverageValue);

    // Validate inputs
    if (isNaN(usdValue) || usdValue <= 0) {
      toast.custom(() => (
        <SimpleToast
          type="error"
          title="Invalid USD Amount"
          description="Please enter a valid USD amount"
        />
      ));
      return;
    }
    console.log(
      "[SpotTradeModal] isNaN(usdValue) || usdValue <= 0",
      isNaN(usdValue) || usdValue <= 0,
    );
    if (isNaN(leverageValue) || leverageValue <= 0) {
      toast.custom(() => (
        <SimpleToast
          type="error"
          title="Invalid Leverage Value"
          description="Please enter a valid leverage value"
        />
      ));
      return;
    }

    const spotBuy = usdValue / 2;
    if (spotBuy < MIN_SPOT_BUY) {
      toast.custom(() => (
        <SimpleToast
          type="error"
          title="Minimum Spot Buy"
          description={`Minimum spot buy value is $${MIN_SPOT_BUY}. Current: $${spotBuy.toFixed(2)}`}
        />
      ));
      return;
    }

    const requiredBalance = usdValue / 2 / leverageValue;

    if (perpProtocol === "drift" && driftFreeCollateralUSD < requiredBalance) {
      toast.custom(() => (
        <SimpleToast
          type="error"
          title="Drift"
          description={`Insufficient Drift balance. Required: $${requiredBalance.toFixed(2)}, Available: $${driftFreeCollateralUSD.toFixed(2)}`}
        />
      ));
      return;
    }

    if (
      perpProtocol === "pacifica" &&
      pacificaAvailableBalance < requiredBalance
    ) {
      toast.custom(() => (
        <SimpleToast
          type="error"
          title="Pacifica"
          description={`Insufficient Pacifica balance. Required: $${requiredBalance.toFixed(2)}, Available: $${pacificaAvailableBalance.toFixed(2)}`}
        />
      ));
      return;
    }

    if (
      perpProtocol === "hyperliquid" &&
      hyperliquidAvailableBalance < requiredBalance
    ) {
      toast.custom(() => (
        <SimpleToast
          type="error"
          title="Hyperliquid"
          description={`Insufficient Hyperliquid balance. Required: $${requiredBalance.toFixed(2)}, Available: $${hyperliquidAvailableBalance.toFixed(2)}`}
        />
      ));
      return;
    }

    // Get auth tokens
    const idToken = getPrivyIdToken();
    const accessToken = getPrivyAccessToken();

    if (!idToken) {
      toast.custom(() => (
        <SimpleToast
          type="error"
          title="Authentication Required"
          description="Authentication required. Please connect your wallet."
        />
      ));
      return;
    }

    setIsTrading(true);
    const tradeToastId = positionToast.open({
      amount: usdAmount,
      symbol: "/api/token/usdc",
      amountTokenName: "USDC",
      pair: marketData.symbol,
      description: `Executing ${marketData.symbol} spot-perp trade...`,
    });

    try {
      if (!tokenMetadata?.mint) {
        toast.custom(() => (
          <SimpleToast
            type="error"
            title="Token Metadata"
            description="Unable to resolve token mint for Jupiter spot buy."
          />
        ));
        return;
      }

      console.log("[SpotTradeModal] tokenMetadata.mint", tokenMetadata.mint);
      const tradeRequest: SpotPerpTradeRequest = {
        totalUsd: usdValue,
        market: marketData.symbol,
        perpProtocol,
        leverage: leverageValue,
        spotTokenMint: tokenMetadata.mint,
        jitoFeeSol: 0.0001,
      };

      const result = await executeSpotPerpTrade(
        tradeRequest,
        idToken,
        accessToken || undefined,
      );

      if (result.status === "success" || result.status === "sent") {
        const explorerTx = result.data?.spotTxnHash || result.data?.perpTxnHash;
        positionToast.success(
          tradeToastId,
          explorerTx ? `https://solscan.io/tx/${explorerTx}` : "",
          result.message || `Trade ${result.status}!`,
        );
        if (result.data?.spotTxnHash) {
          toast.custom(() => (
            <SimpleToast
              type="info"
              title="Spot"
              description={`TX: ${result.data!.spotTxnHash.slice(0, 8)}...`}
            />
          ));
        }
        if (result.data?.perpTxnHash) {
          toast.custom(() => (
            <SimpleToast
              type="info"
              title="Perp"
              description={`TX: ${result.data!.perpTxnHash.slice(0, 8)}...`}
            />
          ));
        }
        if (result.data?.perpBundleId) {
          toast.custom(() => (
            <SimpleToast
              type="info"
              title="Bundle"
              description={`ID: ${result.data!.perpBundleId.slice(0, 8)}...`}
            />
          ));
        }
        await refreshAllBalances("spot-perp-open-position");
        onOpenChange(false);
      } else {
        // Backend returned a non-success status. Surface it as a hard
        // failure so the pending toast resolves and the user doesn't
        // re-click the live button (which would double-execute the trade).
        const errMsg =
          ("error" in result && typeof (result as { error?: unknown }).error === "string"
            ? (result as { error: string }).error
            : null) ||
          result.message ||
          `Trade ${result.status ?? "failed"}`;
        positionToast.failed(tradeToastId, errMsg);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to execute trade";
      positionToast.failed(tradeToastId, errorMessage);
    } finally {
      setIsTrading(false);
    }
  };

  // Fetch fees
  const privyIdToken = getPrivyIdToken();
  const privyAccessToken = getPrivyAccessToken();
  const { data: feesData } = useQuery({
    queryKey: ["arbFees", privyIdToken, privyAccessToken],
    queryFn: () => {
      if (!privyIdToken) throw new Error("No id token");
      return fetchArbFees(privyIdToken, privyAccessToken || undefined);
    },
    enabled: open && !!privyIdToken,
    staleTime: 5 * 60 * 1000,
  });

  const perpFee = feesData?.data?.fees.find(
    (f) => normalizeDexId(f.dex) === normalizeDexId(perpProtocol),
  );

  const totalFees = React.useMemo(() => {
    return (
      Math.abs(perpFee?.makerFeeBps || 0) + Math.abs(perpFee?.takerFeeBps || 0)
    );
  }, [perpFee?.makerFeeBps, perpFee?.takerFeeBps]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant={isMobile ? "bottom-sheet" : "default"}
        className={cn(
          "overflow-y-auto border border-[#0F1F30] bg-[#000D1E] p-0",
          isMobile
            ? "max-h-[80dvh] w-full max-w-full"
            : "max-h-[90vh] w-[95vw] max-w-6xl",
        )}
        closeIcon
      >
        {isMobile && (
          <div className="flex justify-center pt-2 pb-0">
            <div className="h-1.5 w-10 rounded-full bg-[#7192A5]/40" />
          </div>
        )}
        <div
          className={cn(
            "space-y-4 p-4 md:space-y-5 md:p-6",
            isMobile && "pt-0",
          )}
        >
          {/* ── Header ── */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TokenLogo
                symbol={marketData.symbol}
                className="h-12 w-12"
              />
              <h2 className="text-2xl font-medium text-white">
                {marketData.symbol}
              </h2>
            </div>
            {isMobile && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setChartToggle((prev) => !prev)}
                className="flex items-center gap-2 rounded-none! border border-[white]/20 bg-[#041223] p-2 hover:bg-transparent hover:text-[#9CE0FF] hover:opacity-80"
              >
                {chartToggle ? (
                  <EyeIcon className="h-4 w-4" />
                ) : (
                  <EyeOffIcon className="h-4 w-4" />
                )}
                {chartToggle ? "Hide Chart" : "Show Chart"}
              </Button>
            )}
          </div>

          {/* ── Stat Cards ── */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="border border-[#0F1F30] bg-[#041223] p-4">
              <div className="mb-1 flex items-center gap-1">
                <p className="text-sm text-[#7192A5]">Funding Rate</p>
                <InfoTooltip iconClassName="text-[#7192A5]">
                  Selected perp protocol funding rate for {marketData.symbol}
                </InfoTooltip>
              </div>
              <p
                className={cn(
                  "text-lg font-normal",
                  fundingRateValue > 0
                    ? "text-[#4ADE80]"
                    : fundingRateValue < 0
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

          {/* ── Two-Column Body: Chart (left) + Trade Panel (right) ── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            {/* Left Column — Chart */}
            {chartToggle && (
              <div className="min-h-[350px] border border-[#0F1F30] lg:col-span-7">
                <FundingRateChart
                  symbol={marketData.symbol}
                  longProtocol={perpProtocol}
                  shortProtocol={perpProtocol}
                  singleProtocol={perpProtocol}
                />
              </div>
            )}

            {/* Right Column — Trade Panel */}
            <div className="flex flex-col gap-3 border border-[#0F1F30] bg-[#000D1E] p-3 lg:col-span-5">
              {/* <div className="border border-[#0F1F30] bg-[#041223] p-4 flex flex-col gap-3"> */}
              {/* Balance bar */}
              <div className="flex items-center gap-2 text-xs">
                <div className="w-full border border-[#0F1F30] bg-[#041223] p-2">
                  <span className="text-sm text-[#7192A5]">
                    Wallet:{" "}
                    <span className="font-medium text-white">
                      ${(walletBalance.usdValue || 0).toFixed(2)}
                    </span>
                  </span>
                </div>
                {perpProtocol === "drift" && (
                  <div className="w-full border border-[#0F1F30] bg-[#041223] p-2">
                    <span className="text-sm text-[#7192A5]">
                      Drift Bal:{" "}
                      <span className="font-medium text-white">
                        ${driftFreeCollateralUSD.toFixed(2)}
                      </span>
                    </span>
                  </div>
                )}
                {perpProtocol === "pacifica" && (
                  <div className="w-full border border-[#0F1F30] bg-[#041223] p-2">
                    <span className="text-sm text-[#7192A5]">
                      Pacifica:{" "}
                      <span className="font-medium text-white">
                        ${pacificaAvailableBalance.toFixed(2)}
                      </span>
                    </span>
                  </div>
                )}
                {perpProtocol === "hyperliquid" && (
                  <div className="w-full border border-[#0F1F30] bg-[#041223] p-2">
                    <span className="text-sm text-[#7192A5]">
                      Hyperliquid:{" "}
                      <span className="font-medium text-white">
                        ${hyperliquidAvailableBalance.toFixed(2)}
                      </span>
                    </span>
                  </div>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const protocol = perpProtocol;

                    const required = parseFloat(usdAmount) || 0;
                    if (protocol === "drift") {
                      const needed = Math.max(
                        0,
                        required - driftFreeCollateralUSD,
                      );
                      setDepositAmount(needed > 0 ? needed.toFixed(2) : "0");
                    } else if (protocol === "pacifica") {
                      const needed = Math.max(
                        0,
                        required - pacificaAvailableBalance,
                      );
                      setDepositAmount(needed > 0 ? needed.toFixed(2) : "0");
                    } else {
                      const needed = Math.max(
                        0,
                        required - hyperliquidAvailableBalance,
                      );
                      const solPrice = solBalance.price || 150;
                      const solNeeded = needed / solPrice;
                      setDepositAmount(
                        solNeeded > 0 ? solNeeded.toFixed(4) : "0",
                      );
                    }
                    setDepositProtocol(protocol);
                  }}
                  style={{
                    background:
                      "linear-gradient(90deg, rgba(137,179,224,0.15) 0%, rgba(36,45,55,0.6) 30%, rgba(36,45,55,0.6) 70%, rgba(137,179,224,0.15) 100%)",
                  }}
                  className="ml-auto h-[34px] cursor-pointer rounded-none border border-[#9ce0ff33] px-4 text-xs font-medium text-[#9CE0FF] hover:bg-transparent hover:text-[#9CE0FF] hover:opacity-80"
                >
                  Deposit +
                </Button>
              </div>

              {/* Deposit Card (inline, shown when deposit button is clicked) */}
              {depositAmount !== "" && depositProtocol && (
                <div className="border border-[#0F1F30] bg-[#041223] p-3">
                  <div className="mb-2 flex items-center gap-1">
                    <div className="h-1.5 w-1.5 rounded-full bg-[#9CE0FF]" />
                    <span className="flex items-center gap-0.5 text-xs font-medium text-[#9BA2AE]">
                      Deposit to
                      <span className="border-b border-[#9CE0FF]/30 px-0 pb-px text-xs font-medium text-[#9CE0FF]">
                        {depositProtocol}
                      </span>
                    </span>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-stretch gap-2">
                    <div className="relative min-w-0">
                      <Input
                        value={depositAmount}
                        onChange={(e) => {
                          e.stopPropagation();
                          setDepositAmount(e.target.value);
                        }}
                        placeholder="0.00"
                        className="h-8! rounded-none border-[#0F1F30] bg-[#02142B] pr-14 text-sm font-medium text-white ring-0 placeholder:text-[#7192A5]"
                        type="number"
                        step="0.01"
                        min={depositProtocol === "hyperliquid" ? "0.12" : "0"}
                      />
                      <span className="absolute top-1/2 right-3 -translate-y-1/2 text-[10px] text-[#BBEBFF70]">
                        {depositProtocol === "hyperliquid" ? "SOL" : "USDC"}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (depositProtocol === "hyperliquid") {
                          setDepositAmount(
                            (solBalance.balance || 0).toFixed(4),
                          );
                        } else {
                          setDepositAmount(
                            (walletBalance.usdValue || 0).toFixed(2),
                          );
                        }
                      }}
                      className="h-8! min-w-[52px] cursor-pointer rounded-none border border-[#0F1F30] px-3 text-xs font-semibold text-[#9CE0FF] hover:bg-[#0F1F2F]"
                    >
                      Max
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleDeposit}
                      disabled={
                        isDepositing ||
                        !depositAmount ||
                        parseFloat(depositAmount) <= 0
                      }
                      className="font-ibm-plex-serif h-8! min-w-[90px] cursor-pointer rounded-none px-4 text-xs font-medium italic"
                    >
                      {isDepositing ? "..." : "Deposit"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setDepositAmount("");
                        setDepositProtocol(null);
                      }}
                      className="h-8! min-w-[36px] cursor-pointer rounded-none border border-[#0F1F30] px-2 text-xs text-[#7192A5] hover:bg-[#0F1F2F]"
                    >
                      ✕
                    </Button>
                  </div>
                </div>
              )}

              {/* USDC Amount Input */}
              <div className="border border-[#0F1F30] bg-[#041223] p-4">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <TokenLogo symbol="USDC" className="h-8 w-8" />
                    <span className="text-xl text-[#BCEBFF]">USDC</span>
                  </div>
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
                    className="w-32 border-0 bg-transparent text-right text-2xl font-medium text-[#BCEBFF] shadow-none ring-0 outline-none placeholder:text-[#BCEBFF]/60 md:text-2xl"
                    placeholder="0.00"
                    type="text"
                    inputMode="decimal"
                  />
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-[#7192A5]">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        // Floor — never round up over actual balance.
                        const half = (walletBalance.usdValue || 0) / 2;
                        const flr = Math.floor(half * 100) / 100;
                        setUsdAmount(flr > 0 ? flr.toFixed(2) : "0");
                      }}
                      className="cursor-pointer bg-[#0D1E31] px-2 py-0.5 transition-colors hover:bg-[#0F1F30] hover:text-white"
                    >
                      half
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const max = walletBalance.usdValue || 0;
                        setUsdAmount((Math.floor(max * 100) / 100).toFixed(2));
                      }}
                      className="cursor-pointer bg-[#0D1E31] px-2 py-0.5 transition-colors hover:bg-[#0F1F30] hover:text-white"
                    >
                      max
                    </button>
                  </div>
                  <span className="text-sm text-[#7192A5]">
                    ${usdAmount ? parseFloat(usdAmount).toFixed(2) : "0.00"}
                  </span>
                </div>
              </div>

              <div className="border border-[#0F1F30] bg-[#041223] p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#7192A5]">Perp Protocol</span>
                  <span className="text-sm font-medium text-white capitalize">
                    {getProtocolLabel(perpProtocol)}
                  </span>
                </div>
              </div>

              {usdAmount && leverage && (
                <div className="border border-[#0F1F30] bg-[#041223] p-4">
                  <div className="text-xs text-[#7192A5]">
                    Spot buy will be ${parseFloat(usdAmount) / 2} and the perp
                    margin will be $
                    {(parseFloat(usdAmount) / 2 / parseFloat(leverage)).toFixed(
                      2,
                    )}
                    and the notional will be ${parseFloat(usdAmount) / 2}
                  </div>
                </div>
              )}

              {/* Leverage */}
              <div className="">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm text-[#7192A5]">Leverage</span>
                  {/* Leverage slider enabled by default */}
                </div>

                <div className="flex items-stretch border border-[#0F1F30] bg-[#02142B]">
                  <div className="flex w-12 items-center justify-center border-r border-[#0F1F30] bg-[#041223]">
                    <span className="text-sm font-medium text-white">
                      {leverage}x
                    </span>
                  </div>
                  <div className="flex flex-1 items-center px-4 py-3">
                    <Slider
                      value={[parseFloat(leverage)]}
                      onValueChange={(vals) => {
                        if (vals?.[0] !== undefined)
                          setLeverage(vals[0].toString());
                      }}
                      min={1}
                      max={10}
                      step={0.5}
                      className="cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Execute Trade Button - Gradient Style */}
              <button
                type="button"
                onClick={handleTrade}
                disabled={isTrading || isDepositing || !meetsMinimumSpotBuy}
                // style={{
                //   background:
                //     "linear-gradient(90deg, rgba(137,179,224,0.15) 0%, rgba(36,45,55,0.6) 30%, rgba(36,45,55,0.6) 70%, rgba(137,179,224,0.15) 100%)",
                // }}
                className="font-ibm-plex-serif h-11 w-full cursor-pointer border-2 border-[#9ce0ff33] bg-[#9CE0FF] text-base font-medium italic transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isTrading ? "Executing Trade..." : "Execute Trade"}
              </button>

              {!meetsMinimumSpotBuy && usdAmountNum > 0 && (
                <p className="text-xs text-[#7192A5]">
                  Min spot buy value is ${MIN_SPOT_BUY}. Current: $
                  {spotBuyValue.toFixed(2)}
                </p>
              )}

              {/* Transaction Details */}
              <Accordion
                type="single"
                collapsible
                className="w-full"
                defaultValue="1"
              >
                <AccordionItem value="1" className="border-0">
                  <AccordionTrigger className="py-2 text-sm font-normal text-white hover:no-underline">
                    <div className="flex w-full items-center justify-between">
                      Transaction Details
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="flex flex-col gap-2 text-xs shadow-none">
                    <div className="flex items-center justify-between">
                      <span className="text-[#7699AD]">Market</span>
                      <span className="text-white">{marketData.symbol}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#7699AD]">Total USD</span>
                      <span className="text-white">${usdAmount || "0"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#7699AD]">Leverage</span>
                      <span className="text-white">{leverage || "0"}x</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#7699AD]">Perp Protocol</span>
                      <span className="text-white capitalize">
                        {getProtocolLabel(perpProtocol)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#7699AD]">Slippage</span>
                      <span className="text-[#de4a4a]">
                        -
                        {slippagePct !== null
                          ? `${slippagePct.toFixed(2)}%`
                          : isFetchingJupiterSpotQuote
                            ? "..."
                            : "N/A"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[#7699AD]">Maker Fees</span>
                      <span className="text-[#4ADE80]">
                        {Math.abs(perpFee?.makerFeeBps || 0).toFixed(3)} bps /{" "}
                        {(Math.abs(perpFee?.makerFeeBps || 0) / 100).toFixed(3)}
                        %
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#7699AD]">Taker Fees</span>
                      <span className="text-[#4ADE80]">
                        {Math.abs(perpFee?.takerFeeBps || 0).toFixed(3)} bps /{" "}
                        {(Math.abs(perpFee?.takerFeeBps || 0) / 100).toFixed(3)}
                        %
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#7699AD]">
                        Total Execution Cost
                      </span>
                      <span className="text-[#4ADE80]">
                        {(
                          (Math.abs(perpFee?.makerFeeBps || 0) +
                            Math.abs(perpFee?.takerFeeBps || 0)) /
                          100
                        ).toFixed(3)}{" "}
                        bps /{" "}
                        {(
                          (Math.abs(perpFee?.makerFeeBps || 0) +
                            Math.abs(perpFee?.takerFeeBps || 0)) /
                          100
                        ).toFixed(3)}
                        %
                      </span>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
