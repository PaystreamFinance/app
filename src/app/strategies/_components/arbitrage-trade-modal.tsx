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
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import FundingRateChart from "./funding-rate-chart";
import {
  executeTrade,
  fetchArbDepth,
  fetchArbFees,
  fetchPerpExecutionCost,
  type TradeRequest,
  type TradeV2Request,
  type ArbExecProtocol,
} from "@/lib/arbitrage-api";
import type { ArbitrageMarket } from "@/lib/arbitrage-api";
import { fetchTokenMetadataWithCache } from "@/lib/token-metadata-cache";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { api } from "@/trpc/react";
import InfoTooltip from "@/components/info-tooltip";
import { selectLongShort } from "@/lib/select-long-short";
import {
  isProtocolEnabled,
  TRADE_PROTOCOLS,
  DEFAULT_TRADE_PROTOCOL,
  buildEnabledRates,
  getProtocolLabel,
  getProtocolLogo,
  ORDERBOOK_SUPPORTED_IDS,
  getProtocolIntervalHours,
} from "@/lib/protocol-registry";
import { useProtocolBalances, triggerAsterPostTradeRefresh } from "@/hooks/use-protocol-balances";
import { useHyperliquidBalance } from "@/hooks/use-hyperliquid-balance";
import { usePositionToast } from "@/hooks/use-position-toast";
import { SimpleToast } from "@/components/simple-toast";
import { triggerBalanceRefresh } from "@/lib/balance-refresh";
import { getPrivyAccessToken, getPrivyIdToken } from "@/lib/privy-auth";
import { PERP_HEDGE_API_URL } from "@/lib/perp-api-url";
import { usePrivy } from "@privy-io/react-auth";
import { extractPrivyEmbeddedEthAddress } from "@/lib/hyperliquid-balance";
import { fetchLighterBalanceDirect } from "@/lib/lighter-balance";

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const SOL_MINT_ADDRESS = "So11111111111111111111111111111111111111112";
const USDC_MARKET_INDEX = 0; // USDC market index for Drift
const MIN_NOTIONAL = 20;
const normalizeDexId = (dex: string) => dex.trim().toLowerCase();
import { ArrowLeft, ChevronsUpDown, EyeIcon, EyeOffIcon, ShieldCheck } from "lucide-react";
import { TokenLogo } from "./arbitrage-columns";
import { getUnderlyingLabel } from "@/lib/symbol-taxonomy";
import { ProtocolVenueBadge } from "@/components/protocol-venue-badge";
import { isHip3ProtocolId } from "@/lib/protocol-registry";
import {
  BacktestingPanel,
  ChartTabButton,
  ChartWatermark,
} from "./backtesting-panel";
import { PerpOrderbookPanel } from "./perp-orderbook-panel";
import { LongShortPriceChart } from "./long-short-price-chart";
import { useLiveDivergencePrices } from "../hooks/use-live-divergence-prices";

const formatProtocolDisplay = (id: string) => getProtocolLabel(id);

/**
 * Shape used by the screener to pre-select the modal's long/short legs when
 * opening from a row. `symbol` is the native ticker quoted on the venue
 * (e.g. "CL" when long leg is Pacifica's WTI listing, "WTI" when short leg
 * is Lighter's). Falls back to marketData.symbol if absent.
 */
export interface ArbitrageTradeModalLeg {
  symbol: string;
  protocol: string;
}

interface ArbitrageTradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  marketData: ArbitrageMarket;
  isMobile?: boolean;
  presentation?: "modal" | "page";
  /** Optional pre-selected pair legs (from a RWA pair row in the screener). */
  initialLongLeg?: ArbitrageTradeModalLeg;
  initialShortLeg?: ArbitrageTradeModalLeg;
  /** Venue → source ticker from the merged screener row, used after manual dex switches. */
  sourceSymbolByVenue?: Partial<Record<string, string>>;
  /** Venue → all source tickers available in this merged row. */
  sourceSymbolsByVenue?: Partial<Record<string, string[]>>;
}

export const ArbitrageTradeModal: React.FC<ArbitrageTradeModalProps> = ({
  open,
  onOpenChange,
  marketData,
  isMobile,
  presentation = "modal",
  initialLongLeg,
  initialShortLeg,
  sourceSymbolByVenue,
  sourceSymbolsByVenue,
}) => {
  const [usdAmount, setUsdAmount] = React.useState("30");
  const [leverage, setLeverage] = React.useState("2");
  const [isLeverageEnabled, setIsLeverageEnabled] = React.useState(true);
  // Autoclose toggle — defaults OFF, which means the backend's ACLP
  // auto-close triggers (liquidation proximity, OI cascade, portfolio
  // equity drawdown) are suppressed. Funding-flip and delta-drift
  // auto-closes still fire regardless. Toggling ON re-enables every
  // backend trigger. The trade request sends
  // `disableAutoclose: !autoCloseEnabled`.
  const [autoCloseEnabled, setAutoCloseEnabled] = React.useState(false);
  const [isTrading, setIsTrading] = React.useState(false);
  const [isDepositing, setIsDepositing] = React.useState(false);
  const [depositAmount, setDepositAmount] = React.useState("");
  const [depositAsset, setDepositAsset] = React.useState<"usdc" | "usdt" | "sol">("usdc");
  const [depositProtocol, setDepositProtocol] = React.useState<
    "drift" | "pacifica" | "hyperliquid" | "aster" | "lighter" | "01" | "phoenix" | null
  >(null);
  const [hasManualProtocolSelection, setHasManualProtocolSelection] = React.useState(false);

  const [chartToggle, setChartToggle] = React.useState(isMobile ? false : true);
  const [chartTab, setChartTab] = React.useState<"price" | "backtest" | "orderbook" | "longShort">(
    presentation === "page" ? "longShort" : "price",
  );

  const positionToast = usePositionToast();
  const utils = api.useUtils();
  const depositToastIdRef = React.useRef<string | null>(null);

  // Auto-determine long/short based on funding rates
  const parsePercentValue = (
    rateStr: string | number | undefined | null,
  ): number | null => {
    if (rateStr === null || rateStr === undefined || rateStr === "") return null;
    const parsed = typeof rateStr === "number"
      ? rateStr
      : parseFloat(rateStr.replace("%", "").trim());
    if (isNaN(parsed) || Math.abs(parsed) < 0.00005) return null;
    return parsed;
  };

  const parseRawPercentValue = (
    rateStr: string | number | undefined | null,
  ): number | null => {
    if (rateStr === null || rateStr === undefined || rateStr === "") return null;
    const parsed = typeof rateStr === "number"
      ? rateStr
      : parseFloat(rateStr.replace("%", "").trim());
    return Number.isFinite(parsed) ? parsed : null;
  };

  const getVenueApr = React.useCallback(
    (protocol: string): number | null => {
      const venue = (marketData as unknown as Record<string, { fundingRateApr?: string } | undefined>)[protocol];
      return parsePercentValue(venue?.fundingRateApr);
    },
    [marketData],
  );

  const aprByProtocol = React.useMemo<Record<string, number | null>>(() => {
    const rates: Record<string, number | null> = {};
    for (const id of TRADE_PROTOCOLS) rates[id] = getVenueApr(id);
    return rates;
  }, [getVenueApr]);

  const hasVenueQuote = React.useCallback(
    (protocol: string): boolean => {
      const venue = (marketData as unknown as Record<string, {
        fundingRate?: string;
        openInterest?: { long?: number; short?: number };
        fees?: { marginPerHour?: string };
      } | null | undefined>)[protocol];
      if (!venue) return false;
      const rawRate =
        protocol === "flash" ? venue.fees?.marginPerHour : venue.fundingRate;
      const parsed = parseRawPercentValue(rawRate);
      if (parsed === null) return false;
      return parsed !== 0;
    },
    [marketData],
  );

  const getVenueHourlyRatePct = React.useCallback(
    (protocol: string): number | null => {
      const venue = (marketData as unknown as Record<string, {
        fundingRate?: string;
        fundingIntervalHours?: number;
        openInterest?: { long?: number; short?: number };
        fees?: { marginPerHour?: string };
      } | null | undefined>)[protocol];
      if (!venue) return null;
      const rawRate =
        protocol === "flash" ? venue.fees?.marginPerHour : venue.fundingRate;
      const parsed = parsePercentValue(rawRate);
      if (parsed === null) return null;
      const intervalHours =
        protocol === "flash"
          ? 1
          : protocol === "lighter"
            ? 8
            : (venue.fundingIntervalHours ?? getProtocolIntervalHours(protocol));
      return parsed / Math.max(intervalHours, 1);
    },
    [marketData],
  );

  const getVenuePriceSummary = React.useCallback(
    (protocol: string): {
      oraclePrice: number;
      markPrice: number;
      indexPrice: number | null;
      divergenceBps: number;
    } | null => {
      const venue = (marketData as unknown as Record<string, {
        oraclePrice?: number;
        markPrice?: number;
        mark_price?: number;
        markPx?: number;
        mark_px?: number;
        mark?: number;
        indexPrice?: number;
        index_price?: number;
        indexPx?: number;
        index_px?: number;
      } | null | undefined>)[protocol];
      if (!venue) return null;
      const oracle = venue.oraclePrice;
      const mark =
        venue.markPrice ??
        venue.mark_price ??
        venue.markPx ??
        venue.mark_px ??
        venue.mark;
      const index =
        venue.indexPrice ??
        venue.index_price ??
        venue.indexPx ??
        venue.index_px ??
        null;
      if (
        typeof oracle !== "number" ||
        typeof mark !== "number" ||
        !Number.isFinite(oracle) ||
        !Number.isFinite(mark) ||
        oracle <= 0 ||
        mark <= 0
      ) {
        return null;
      }
      return {
        oraclePrice: oracle,
        markPrice: mark,
        indexPrice:
          typeof index === "number" && Number.isFinite(index) && index > 0
            ? index
            : null,
        divergenceBps: ((mark - oracle) / oracle) * 10_000,
      };
    },
    [marketData],
  );

  // Determine long/short positions directly from backend annualized APRs.
  const suggestedPositions = selectLongShort(buildEnabledRates(aprByProtocol));

  // TradeProtocol widened to any ArbExecProtocol (base 5 + "01" + 6 HIP-3).
  // The execution seam (executeTrade → /arb/trade) is protocol-agnostic;
  // legacy per-protocol deposit/withdraw branches below gate-check with
  // isHip3ProtocolId() before taking the HL-venue-aware path. ArbExecProtocol
  // already includes "01" so this is the strict superset of staging's union.
  type TradeProtocol = ArbExecProtocol;
  // Prefer the row-supplied legs (exact pair the user clicked on) over the
  // auto-suggested best pair when this modal is opened from a pair row.
  const [longProtocol, setLongProtocol] = React.useState<TradeProtocol>(
    (initialLongLeg?.protocol ||
      suggestedPositions.long ||
      DEFAULT_TRADE_PROTOCOL) as TradeProtocol,
  );
  const [shortProtocol, setShortProtocol] = React.useState<TradeProtocol>(
    (initialShortLeg?.protocol ||
      suggestedPositions.short ||
      TRADE_PROTOCOLS[1] ||
      DEFAULT_TRADE_PROTOCOL) as TradeProtocol,
  );
  const getPreferredVenueTicker = React.useCallback(
    (protocol: TradeProtocol): string => {
      const sourceSymbol = sourceSymbolByVenue?.[protocol];
      if (!hasManualProtocolSelection) {
        if (initialLongLeg?.protocol === protocol && initialLongLeg.symbol) {
          return initialLongLeg.symbol;
        }
        if (initialShortLeg?.protocol === protocol && initialShortLeg.symbol) {
          return initialShortLeg.symbol;
        }
      }
      if (sourceSymbol) return sourceSymbol;
      const venue = (marketData as unknown as Record<string, { nativeSymbol?: string } | null | undefined>)[protocol];
      if (venue?.nativeSymbol) return venue.nativeSymbol;
      return marketData.symbol;
    },
    [
      hasManualProtocolSelection,
      initialLongLeg,
      initialShortLeg,
      marketData,
      sourceSymbolByVenue,
    ],
  );
  const venueSupportsTicker = React.useCallback(
    (protocol: TradeProtocol, ticker: string): boolean => {
      const supported = sourceSymbolsByVenue?.[protocol];
      return !!supported?.some(
        (symbol) => symbol.trim().toUpperCase() === ticker.trim().toUpperCase(),
      );
    },
    [sourceSymbolsByVenue],
  );
  const { longTradeTicker, shortTradeTicker } = React.useMemo(() => {
    const longTicker = getPreferredVenueTicker(longProtocol);
    const shortTicker = getPreferredVenueTicker(shortProtocol);
    if (!hasManualProtocolSelection) {
      return { longTradeTicker: longTicker, shortTradeTicker: shortTicker };
    }
    if (venueSupportsTicker(longProtocol, shortTicker)) {
      return { longTradeTicker: shortTicker, shortTradeTicker: shortTicker };
    }
    if (venueSupportsTicker(shortProtocol, longTicker)) {
      return { longTradeTicker: longTicker, shortTradeTicker: longTicker };
    }
    return { longTradeTicker: longTicker, shortTradeTicker: shortTicker };
  }, [
    getPreferredVenueTicker,
    hasManualProtocolSelection,
    longProtocol,
    shortProtocol,
    venueSupportsTicker,
  ]);
  const isCrossTickerTrade =
    longTradeTicker.trim().toUpperCase() !== shortTradeTicker.trim().toUpperCase();
  const tradePairLabel = isCrossTickerTrade
    ? `${longTradeTicker} / ${shortTradeTicker}`
    : longTradeTicker;

  // Dynamic max leverage = min of both protocols' maxLeverage for this market
  const maxLeverage = React.useMemo(() => {
    const longMax = (marketData[longProtocol] as any)?.maxLeverage as number | undefined;
    const shortMax = (marketData[shortProtocol] as any)?.maxLeverage as number | undefined;
    const values = [longMax, shortMax].filter((v): v is number => typeof v === "number" && v > 0);
    if (values.length === 0) return 10; // fallback
    return Math.floor(Math.min(...values));
  }, [marketData, longProtocol, shortProtocol]);

  // Clamp leverage when maxLeverage changes (e.g. switching protocols)
  React.useEffect(() => {
    const current = parseFloat(leverage);
    if (Number.isFinite(current) && current > maxLeverage) {
      setLeverage(maxLeverage.toString());
    }
  }, [maxLeverage, leverage]);
  // Reset protocol selection to best pair only when switching to a different
  // market AND the modal wasn't opened from a specific row (initialLongLeg /
  // initialShortLeg). When the user clicks a pair-row, the row-supplied legs
  // are the source of truth — a delayed `suggestedPositions` payload arriving
  // after mount must NOT overwrite the user's explicit selection.
  const prevSymbolRef = React.useRef("");
  React.useEffect(() => {
    if (prevSymbolRef.current === marketData.symbol) return;
    prevSymbolRef.current = marketData.symbol;
    setHasManualProtocolSelection(false);
    // If row-specific legs were supplied, prefer them and skip the
    // best-pair reset entirely. The leg `useState` initializers already
    // honor initialLongLeg/initialShortLeg on first render.
    if (initialLongLeg?.protocol || initialShortLeg?.protocol) return;
    if (suggestedPositions.long) setLongProtocol(suggestedPositions.long as TradeProtocol);
    if (suggestedPositions.short) setShortProtocol(suggestedPositions.short as TradeProtocol);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketData.symbol]);

  // Fetch wallet USDC balance
  const walletBalance = useTokenBalance(USDC_MINT);

  // Fetch wallet USDT balance (for Aster deposits)
  const usdtBalance = useTokenBalance(USDT_MINT);

  // Auth tokens — used in balance query keys and enabled guards
  const privyIdToken = getPrivyIdToken();
  const privyAccessToken = getPrivyAccessToken();

  // ETH address — needed for direct Lighter balance fetch
  const { user: privyUser } = usePrivy();
  const ethAddress = extractPrivyEmbeddedEthAddress(privyUser);

  // Fetch Drift balance using tRPC
  const { data: driftBalanceData, refetch: refetchDriftBalance } =
    api.drift.getBalance.useQuery(undefined, {
      enabled: isProtocolEnabled("drift") && open && !!privyIdToken && (longProtocol === "drift" || shortProtocol === "drift"),
      refetchInterval: 10000,
      staleTime: 8000,
      retry: 1,
      refetchOnWindowFocus: false,
    });

  // Fetch Pacifica balance using tRPC
  const { data: pacificaBalanceData, refetch: refetchPacificaBalance } =
    api.pacifica.getBalance.useQuery(undefined, {
      enabled:
        open && !!privyIdToken && (longProtocol === "pacifica" || shortProtocol === "pacifica"),
      refetchInterval: 10000,
      staleTime: 8000,
      retry: 1,
      refetchOnWindowFocus: false,
    });

  const { data: hyperliquidBalanceData, refetch: refetchHyperliquidBalance } =
    useHyperliquidBalance("hyperliquid", {
      enabled:
        open && !!privyIdToken &&
        (longProtocol === "hyperliquid" || shortProtocol === "hyperliquid"),
      refetchInterval: 10000,
      staleTime: 8000,
      retry: 1,
      refetchOnWindowFocus: false,
    });

  // Fetch Aster balance via REST API
  const { data: asterBalanceData, refetch: refetchAsterBalance } = useQuery({
    queryKey: ["asterBalance", privyIdToken],
    queryFn: async () => {
      if (!privyIdToken) {
        console.warn("[Aster Balance] No privy ID token available");
        return null;
      }
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        "privy-id-token": privyIdToken,
      };
      if (privyAccessToken) headers["Authorization"] = `Bearer ${privyAccessToken}`;
      const res = await fetch(
        `${PERP_HEDGE_API_URL}/arb/balance/aster`,
        { method: "GET", headers },
      );
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error(`[Aster Balance] API error ${res.status}: ${errText}`);
        return null;
      }
      const data = await res.json();
      console.log("[Aster Balance] Response:", data);
      return data;
    },
    enabled: open && !!privyIdToken && (longProtocol === "aster" || shortProtocol === "aster"),
    refetchInterval: 10000,
    staleTime: 8000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // Fetch Lighter balance directly from Lighter's public API (no backend needed)
  const { data: lighterBalanceData, refetch: refetchLighterBalance } = useQuery({
    queryKey: ["lighterBalance", ethAddress],
    queryFn: async () => {
      const entry = await fetchLighterBalanceDirect(ethAddress);
      // Wrap in the same envelope shape the rest of the modal expects
      return entry.status === "success" ? { data: entry.data } : null;
    },
    enabled: open && !!ethAddress && (longProtocol === "lighter" || shortProtocol === "lighter"),
    refetchInterval: 10000,
    staleTime: 8000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // Fetch 01 balance via REST API
  const { data: zeroOneBalanceData, refetch: refetchZeroOneBalance } = useQuery({
    queryKey: ["zeroOneBalance", privyIdToken],
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
      void refreshAllBalances("perp-perp-deposit");
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
      void refreshAllBalances("perp-perp-deposit");
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
        const txHash = data.txSignature ?? data.swapTxHash;
        positionToast.success(
          depositToastIdRef.current,
          txHash ? `https://solscan.io/tx/${txHash}` : "",
          `Deposit successful! ${data.amount ? `${(data.amount as number).toFixed(4)} SOL deposited.` : ""}`,
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
      void refreshAllBalances("perp-perp-deposit");
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

  // Get available balance from Aster
  const asterAvailableBalance = React.useMemo(() => {
    if (!asterBalanceData?.data?.availableToTrade) return 0;
    return parseFloat(asterBalanceData.data.availableToTrade);
  }, [asterBalanceData]);

  // Get available balance from Lighter
  const lighterAvailableBalance = React.useMemo(() => {
    if (!lighterBalanceData?.data?.availableToTrade) return 0;
    return parseFloat(lighterBalanceData.data.availableToTrade);
  }, [lighterBalanceData]);

  // Get available balance from 01
  const zeroOneAvailableBalance = React.useMemo(() => {
    if (!zeroOneBalanceData?.data?.availableToTrade) return 0;
    return parseFloat(zeroOneBalanceData.data.availableToTrade);
  }, [zeroOneBalanceData]);

  // HIP-3 venues each have their own isolated HL margin account scoped to a
  // collateral token. Reuse the centralized balance hook just for HIP-3 — the
  // base venues stay on their bespoke fetchers above.
  const { balances: protocolBalanceMap } = useProtocolBalances({ enabled: open });

  /** Trade venues where the current symbol actually lists. Placeholder
   *  zero-rate / zero-OI venue rows are treated as absent data. */
  const availableTradeProtocols = React.useMemo(() => {
    return TRADE_PROTOCOLS.filter((id) => hasVenueQuote(id));
  }, [hasVenueQuote]);

  /** Unified per-protocol balance lookup. Base venues use the existing
   *  per-venue vars; HIP-3 venues read from useProtocolBalances. */
  const getProtocolBalance = React.useCallback(
    (protocol: string): number => {
      switch (protocol) {
        case "drift":       return driftFreeCollateralUSD;
        case "pacifica":    return pacificaAvailableBalance;
        case "hyperliquid": return hyperliquidAvailableBalance;
        case "aster":       return asterAvailableBalance;
        case "lighter":     return lighterAvailableBalance;
        case "01":          return zeroOneAvailableBalance;
        case "phoenix":
          return protocolBalanceMap.phoenix?.freeCollateralUSD ?? 0;
        default:
          return (
            protocolBalanceMap[protocol as keyof typeof protocolBalanceMap]
              ?.balanceNum ?? 0
          );
      }
    },
    [
      driftFreeCollateralUSD,
      pacificaAvailableBalance,
      hyperliquidAvailableBalance,
      asterAvailableBalance,
      lighterAvailableBalance,
      zeroOneAvailableBalance,
      protocolBalanceMap,
    ],
  );

  // Extract token symbol from market symbol
  const tokenSymbol = marketData.symbol;

  // Fetch token metadata using symbol/name
  const { data: tokenMetadata } = useQuery({
    queryKey: ["tokenMetadata", tokenSymbol],
    queryFn: () => fetchTokenMetadataWithCache(tokenSymbol),
    enabled: !!tokenSymbol && open, // Only fetch when modal is open
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
  });

  // Fetch fees
  const { data: feesData } = useQuery({
    queryKey: ["arbFees", privyIdToken, privyAccessToken],
    queryFn: () => {
      if (!privyIdToken) throw new Error("No id token");
      return fetchArbFees(privyIdToken, privyAccessToken || undefined);
    },
    enabled: open && !!privyIdToken,
    staleTime: 5 * 60 * 1000,
  });

  const longFee = feesData?.data?.fees.find(
    (f) => normalizeDexId(f.dex) === normalizeDexId(longProtocol),
  );
  const shortFee = feesData?.data?.fees.find(
    (f) => normalizeDexId(f.dex) === normalizeDexId(shortProtocol),
  );

  const canUseBackendBestPair =
    !hasManualProtocolSelection &&
    !isCrossTickerTrade &&
    marketData.longProtocol === longProtocol &&
    marketData.shortProtocol === shortProtocol &&
    hasVenueQuote(longProtocol) &&
    hasVenueQuote(shortProtocol);

  const fundingSpreadPct1h = React.useMemo(() => {
    const backendMaxArb = parsePercentValue(marketData.maxArb);
    if (
      canUseBackendBestPair &&
      backendMaxArb !== null
    ) {
      return backendMaxArb;
    }

    const longHourly = getVenueHourlyRatePct(longProtocol);
    const shortHourly = getVenueHourlyRatePct(shortProtocol);
    if (longHourly === null || shortHourly === null) return 0;
    return Math.abs(shortHourly - longHourly);
  }, [
    canUseBackendBestPair,
    getVenueHourlyRatePct,
    longProtocol,
    marketData.maxArb,
    shortProtocol,
  ]);

  // Max ARB is annualized APR for display/PnL. The 1h spread above is kept
  // separate because execution-cost and depth math expect per-hour percent.
  const maxArb = React.useMemo(() => {
    const backendMaxArbApr = parsePercentValue(marketData.maxArbApr);
    if (canUseBackendBestPair && backendMaxArbApr !== null) {
      return backendMaxArbApr;
    }
    return fundingSpreadPct1h * 24 * 365;
  }, [canUseBackendBestPair, fundingSpreadPct1h, marketData.maxArbApr]);

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

  // maxArb is already annualized APR percentage from backend /markets.
  const apyPercent = maxArb;
  const expectedPnlUsd = (maxArb / 100) * (timeFrameDaysNum / 365) * usdAmountNum;

  const stats = {
    fundingRate: `${fundingSpreadPct1h >= 0 ? "" : ""}${fundingSpreadPct1h.toFixed(5)}%`,
    apy: `${apyPercent >= 0 ? "+" : ""}${apyPercent.toFixed(2)}%`,
    expectedPnl: `${expectedPnlUsd >= 0 ? "+" : ""}${expectedPnlUsd.toFixed(4)} USD`,
  };

  // SOL balance (for HL / Aster / 01 deposits when asset=sol)
  const solBalance = useTokenBalance(
    open && (depositProtocol === "hyperliquid" || depositProtocol === "aster" || depositProtocol === "01") ? SOL_MINT_ADDRESS : undefined,
  );

  const refreshAllBalances = React.useCallback(
    async (reason: string) => {
      void utils.drift.getBalance.invalidate();
      void utils.pacifica.getBalance.invalidate();

      await Promise.allSettled([
        refetchDriftBalance(),
        refetchPacificaBalance(),
        refetchHyperliquidBalance(),
        refetchAsterBalance(),
        refetchLighterBalance(),
        refetchZeroOneBalance(),
        walletBalance.refetch(),
        usdtBalance.refetch(),
        solBalance.refetch(),
      ]);

      triggerBalanceRefresh({ reason });
    },
    [
      refetchDriftBalance,
      refetchPacificaBalance,
      refetchHyperliquidBalance,
      refetchAsterBalance,
      refetchLighterBalance,
      refetchZeroOneBalance,
      solBalance,
      usdtBalance,
      utils,
      walletBalance,
    ],
  );

  // Check if minimum notional requirement is met
  const leverageNum = React.useMemo(() => {
    if (!isLeverageEnabled) return 1;
    const n = parseFloat(leverage);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }, [leverage, isLeverageEnabled]);

  // Delta-neutral max: 2 × min(longBalance, shortBalance) so each leg gets equal margin
  const getDeltaNeutralMax = React.useCallback(() => {
    const longBal = getProtocolBalance(longProtocol);
    const shortBal = getProtocolBalance(shortProtocol);
    const minLeg = Math.min(longBal, shortBal);
    return Math.max(0, minLeg * 2);
  }, [longProtocol, shortProtocol, getProtocolBalance]);

  const notionalValue = usdAmountNum * leverageNum;
  const meetsMinimumNotional = notionalValue >= MIN_NOTIONAL;
  const longTakerFeeBps = Math.abs(longFee?.takerFeeBps ?? 0);
  const shortTakerFeeBps = Math.abs(shortFee?.takerFeeBps ?? 0);
  const longPriceSummary = getVenuePriceSummary(longProtocol);
  const shortPriceSummary = getVenuePriceSummary(shortProtocol);
  const liveDivergencePrices = useLiveDivergencePrices({
    longProtocol,
    shortProtocol,
    longSymbol: longTradeTicker,
    shortSymbol: shortTradeTicker,
    longSnapshot: longPriceSummary
      ? {
          markPrice: longPriceSummary.markPrice,
          oraclePrice: longPriceSummary.oraclePrice,
          indexPrice: longPriceSummary.indexPrice,
        }
      : null,
    shortSnapshot: shortPriceSummary
      ? {
          markPrice: shortPriceSummary.markPrice,
          oraclePrice: shortPriceSummary.oraclePrice,
          indexPrice: shortPriceSummary.indexPrice,
        }
      : null,
    enabled: open,
  });
  const liveLongPriceSummary = liveDivergencePrices.long;
  const liveShortPriceSummary = liveDivergencePrices.short;

  const getOiUsd = (
    protocol: string,
    live: { openInterestUsd?: number | null },
  ): number | undefined => {
    if (protocol === "phoenix" && live.openInterestUsd != null && live.openInterestUsd > 0) {
      return live.openInterestUsd;
    }
    const venue = marketData[protocol as keyof typeof marketData] as any;
    if (!venue) return undefined;
    const oi = venue.openInterest as { long?: number; short?: number } | undefined;
    if (!oi) return undefined;
    const oiUsd = (oi.long ?? 0) + (oi.short ?? 0);
    return oiUsd > 0 ? oiUsd : undefined;
  };
  const longVenueOiUsd = getOiUsd(longProtocol, liveLongPriceSummary);
  const shortVenueOiUsd = getOiUsd(shortProtocol, liveShortPriceSummary);

  // If either venue has no OI data, arb depth cannot be reliably calculated.
  const oiUnavailableMsg = (() => {
    const missing: string[] = [];
    if (longVenueOiUsd === undefined) missing.push(longProtocol);
    if (shortVenueOiUsd === undefined && shortProtocol !== longProtocol) missing.push(shortProtocol);
    if (missing.length === 0) return null;
    return missing.map((p) => `${p.toUpperCase()} open interest is not available`).join(" · ");
  })();

  // Orderbook execution cost quotes are only available for these protocols
  const bothProtocolsSupported =
    ORDERBOOK_SUPPORTED_IDS.has(longProtocol) &&
    ORDERBOOK_SUPPORTED_IDS.has(shortProtocol);

  const executionQuoteRequired =
    open &&
    bothProtocolsSupported &&
    usdAmountNum > 0 &&
    leverageNum > 0 &&
    longProtocol !== shortProtocol;
  const executionQuoteNotionalPerLegUsd = (usdAmountNum * leverageNum) / 2;

  const {
    data: executionCostQuote,
    isFetching: isFetchingExecutionCostQuote,
    error: executionCostQuoteError,
  } = useQuery({
    queryKey: [
      "perpExecutionCostQuote",
      marketData.symbol,
      longTradeTicker,
      shortTradeTicker,
      longProtocol,
      shortProtocol,
      usdAmountNum,
      leverageNum,
      timeFrameDaysNum,
      longTakerFeeBps,
      shortTakerFeeBps,
      fundingSpreadPct1h,
      longVenueOiUsd ?? 0,
      shortVenueOiUsd ?? 0,
    ],
    queryFn: () =>
      fetchPerpExecutionCost({
        symbol: marketData.symbol,
        symbols: {
          long: longTradeTicker,
          short: shortTradeTicker,
        },
        openInterestUsd: {
          long: longVenueOiUsd,
          short: shortVenueOiUsd,
        },
        protocols: {
          long: longProtocol,
          short: shortProtocol,
        },
        totalMarginUsd: usdAmountNum,
        leverage: leverageNum,
        timeFrameDays: timeFrameDaysNum,
        fundingSpreadPct: fundingSpreadPct1h,
        feesBps: {
          longTakerBps: longTakerFeeBps,
          shortTakerBps: shortTakerFeeBps,
        },
      }),
    enabled: executionQuoteRequired,
    staleTime: 0,
    refetchInterval: 2_000,
    refetchOnWindowFocus: false,
    retry: 0,
  });

  const executionCostErrorMessage =
    executionCostQuoteError instanceof Error
      ? executionCostQuoteError.message
      : executionCostQuoteError
        ? "Failed to fetch execution cost quote"
        : null;

  // ── Arb Depth v4.0 ──
  const arbDepthEnabled =
    open &&
    fundingSpreadPct1h > 0 &&
    longProtocol !== shortProtocol &&
    (longProtocol as string) !== "drift" &&
    (shortProtocol as string) !== "drift";

  const { data: arbDepthData, isFetching: isFetchingArbDepth } = useQuery({
    queryKey: [
      "arbDepthV5",
      marketData.symbol,
      longTradeTicker,
      shortTradeTicker,
      longProtocol,
      shortProtocol,
      fundingSpreadPct1h,
      longTakerFeeBps,
      shortTakerFeeBps,
      longVenueOiUsd ?? 0,
      shortVenueOiUsd ?? 0,
    ],
    queryFn: () => fetchArbDepth({
      symbol: marketData.symbol,
      symbols: {
        long: longTradeTicker,
        short: shortTradeTicker,
      },
      longVenue: longProtocol,
      shortVenue: shortProtocol,
      r0Pct: fundingSpreadPct1h,
      longTakerFeeBps,
      shortTakerFeeBps,
      longVenueOiUsd,
      shortVenueOiUsd,
    }),
    enabled: arbDepthEnabled,
    staleTime: 5_000,
    refetchInterval: 10_000,
    refetchOnWindowFocus: false,
    retry: 0,
  });

  const arbDepthResult = arbDepthData?.data;
  const arbDepthUsd = arbDepthResult?.arbDepth;
  const optimalSizeUsd = arbDepthResult?.optimalSize;
  const markPriceDifference =
    liveLongPriceSummary.markPrice != null && liveShortPriceSummary.markPrice != null
      ? liveShortPriceSummary.markPrice - liveLongPriceSummary.markPrice
      : null;
  const oraclePriceDifference =
    liveLongPriceSummary.oraclePrice != null && liveShortPriceSummary.oraclePrice != null
      ? liveShortPriceSummary.oraclePrice - liveLongPriceSummary.oraclePrice
      : null;
  const indexPriceDifference =
    liveLongPriceSummary.indexPrice != null && liveShortPriceSummary.indexPrice != null
      ? liveShortPriceSummary.indexPrice - liveLongPriceSummary.indexPrice
      : null;
  const formatPrice = (value: number | null | undefined): string => {
    if (value === null || value === undefined || !Number.isFinite(value)) return "N/A";
    return value.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: value >= 1 ? 2 : 4,
      maximumFractionDigits: value >= 1 ? 2 : 6,
    });
  };
  const formatCompactPrice = (value: number | null | undefined): string => {
    if (value === null || value === undefined || !Number.isFinite(value)) return "N/A";
    const abs = Math.abs(value);
    const sign = value < 0 ? "-" : "";
    const formatted = abs.toLocaleString(undefined, {
      notation: abs >= 100_000 ? "compact" : "standard",
      maximumFractionDigits: abs >= 100_000 ? 2 : abs >= 1 ? 2 : 4,
      minimumFractionDigits: abs >= 1 && abs < 100_000 ? 2 : 0,
    });
    return `${sign}$${formatted}`;
  };
  const divergenceDeltaClass = (value: number | null | undefined): string => {
    if (value === null || value === undefined || !Number.isFinite(value) || value === 0) {
      return "text-white";
    }
    return value > 0 ? "text-[#4ADE80]" : "text-[#FF6B6B]";
  };
  const liveDivergenceStatus = React.useMemo(() => {
    const statuses = [liveLongPriceSummary.status, liveShortPriceSummary.status];
    const legSourceLabel = (status: (typeof statuses)[number]) => {
      if (status === "live") return "WebSocket";
      if (status === "fallback") return "REST API fallback";
      if (status === "error") return "Unavailable";
      return "Connecting";
    };
    const sourceDetails = `Long: ${legSourceLabel(liveLongPriceSummary.status)} · Short: ${legSourceLabel(liveShortPriceSummary.status)}`;
    if (statuses.every((status) => status === "live")) {
      return {
        label: "WebSocket",
        className: "border-[#153C2D] bg-[#051B16] text-[#4ADE80]",
        dotClassName: "bg-[#20D0B8]",
        tooltip: `Price data is updating from live WebSocket feeds. ${sourceDetails}`,
      };
    }
    if (statuses.some((status) => status === "error")) {
      return {
        label: "Unavailable",
        className: "border-[#442126] bg-[#1C0B10] text-[#FF6B6B]",
        dotClassName: "bg-[#D95F6A]",
        tooltip: `One or more live price feeds are unavailable. ${sourceDetails}`,
      };
    }
    if (statuses.some((status) => status === "fallback")) {
      return {
        label: "REST API",
        className: "border-[#442126] bg-[#1C0B10] text-[#FF6B6B]",
        dotClassName: "bg-[#D95F6A]",
        tooltip: `Price data is using REST API fallback instead of live WebSocket for at least one leg. ${sourceDetails}`,
      };
    }
    return {
      label: "Connecting",
      className: "border-[#442126] bg-[#1C0B10] text-[#FF6B6B]",
      dotClassName: "bg-[#D95F6A]",
      tooltip: `Connecting to live WebSocket price feeds. ${sourceDetails}`,
    };
  }, [liveLongPriceSummary.status, liveShortPriceSummary.status]);

  const hasInsufficientQuoteDepth =
    executionCostQuote?.hasInsufficientDepth ?? false;

  const slippageTooltipContent = React.useMemo(() => {
    const baseDescription =
      "Slippage is estimated by walking the live long ask book and short bid book at your per-leg notional. If the requested size exceeds the visible orderbook, the remaining size is extrapolated using venue open interest from the markets API.";

    if (!executionCostQuote) return baseDescription;

    const warningText = executionCostQuote.warnings
      .filter((warning) =>
        warning.includes("depth") ||
        warning.includes("extrapolated") ||
        warning.includes("understated"),
      )
      .join(" ");

    return warningText ? `${baseDescription} ${warningText}` : baseDescription;
  }, [executionCostQuote]);

  const executeBlockedByQuote =
    executionQuoteRequired &&
    (!executionCostQuote ||
      hasInsufficientQuoteDepth ||
      !!executionCostErrorMessage);

  const formatPct = (value: number | null | undefined, digits = 4): string => {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return "N/A";
    }
    return `${value.toFixed(digits)}%`;
  };

  const formatUsd = (value: number | null | undefined): string => {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return "N/A";
    }
    return value.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatPctWithUsd = (
    valuePct: number | null | undefined,
    notionalUsd = executionQuoteNotionalPerLegUsd,
  ): string => {
    if (executionQuoteRequired && isFetchingExecutionCostQuote) {
      return "Quoting...";
    }
    if (executionCostErrorMessage) return "Unavailable";
    if (
      valuePct === null ||
      valuePct === undefined ||
      !Number.isFinite(valuePct) ||
      notionalUsd === null ||
      notionalUsd === undefined ||
      !Number.isFinite(notionalUsd)
    ) {
      return "N/A";
    }

    return `${formatPct(valuePct)} (${formatUsd((valuePct / 100) * notionalUsd)})`;
  };

  const formatPaybackHours = (
    optimistic: number | null | undefined,
    conservative: number | null | undefined,
  ): string => {
    if (
      optimistic === null ||
      optimistic === undefined ||
      conservative === null ||
      conservative === undefined ||
      !Number.isFinite(optimistic) ||
      !Number.isFinite(conservative)
    ) {
      return "N/A";
    }

    const formatDuration = (hours: number): string => {
      if (hours < 1) {
        const minutes = Math.max(1, Math.round(hours * 60));
        return `${minutes} min`;
      }
      if (hours < 24) {
        return `${hours.toFixed(2)} hrs`;
      }
      const days = Math.floor(hours / 24);
      const remainingHours = Math.round(hours % 24);
      if (remainingHours === 0) return `${days}d`;
      return `${days}d ${remainingHours}h`;
    };

    const optimisticText = formatDuration(optimistic);
    const conservativeText = formatDuration(conservative);
    if (optimisticText === conservativeText) return conservativeText;
    return `${optimisticText}–${conservativeText}`;
  };

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
        symbol: "/api/token/usdc",
        amountTokenName: "USDC",
        pair: `${depositProtocol.charAt(0).toUpperCase() + depositProtocol.slice(1)} Deposit`,
        description: `Depositing to ${depositProtocol.charAt(0).toUpperCase() + depositProtocol.slice(1)}...`,
      });

      if (depositProtocol === "drift") {
        // Check wallet balance
        if (
          walletBalance.balance === null ||
          walletBalance.balance < depositValue
        ) {
          if (depositToastIdRef.current) {
            positionToast.failed(
              depositToastIdRef.current,
              "Insufficient wallet balance",
            );
            depositToastIdRef.current = null;
          }
          return;
        }
        await driftDepositMutation.mutateAsync({
          amount: depositValue,
          marketIndex: USDC_MARKET_INDEX,
        });
      } else if (depositProtocol === "pacifica") {
        // Check wallet balance
        if (
          walletBalance.balance === null ||
          walletBalance.balance < depositValue
        ) {
          if (depositToastIdRef.current) {
            positionToast.failed(
              depositToastIdRef.current,
              "Insufficient wallet balance",
            );
            depositToastIdRef.current = null;
          }
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
          if (depositToastIdRef.current) {
            positionToast.failed(
              depositToastIdRef.current,
              `Insufficient ${hlAssetLabel} balance. Required: ${depositValue.toFixed(hlDecimals)} ${hlAssetLabel}, Available: ${hlBalance?.toFixed(hlDecimals) ?? "0"} ${hlAssetLabel}`,
            );
            depositToastIdRef.current = null;
          }
          return;
        }
        if (depositValue <= 0) {
          if (depositToastIdRef.current) {
            positionToast.failed(depositToastIdRef.current, "Enter a deposit amount");
            depositToastIdRef.current = null;
          }
          return;
        }
        await hyperliquidDepositMutation.mutateAsync({
          asset: depositAsset,
          amount: depositValue,
        });
      } else if (depositProtocol === "aster") {
        const asterBalance =
          depositAsset === "sol" ? solBalance.balance :
          depositAsset === "usdt" ? usdtBalance.balance :
          walletBalance.balance;
        const asterAssetLabel = depositAsset.toUpperCase();
        const asterDecimals = depositAsset === "sol" ? 4 : 2;
        if (asterBalance === null || asterBalance < depositValue) {
          if (depositToastIdRef.current) {
            positionToast.failed(
              depositToastIdRef.current,
              `Insufficient ${asterAssetLabel} balance. Required: ${depositValue.toFixed(asterDecimals)} ${asterAssetLabel}, Available: ${asterBalance?.toFixed(asterDecimals) ?? "0"} ${asterAssetLabel}`,
            );
            depositToastIdRef.current = null;
          }
          return;
        }
        if (depositValue <= 0) {
          if (depositToastIdRef.current) {
            positionToast.failed(depositToastIdRef.current, "Enter a deposit amount");
            depositToastIdRef.current = null;
          }
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
          `${PERP_HEDGE_API_URL}/arb/deposit/aster`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ amount: depositValue, asset: depositAsset }),
          },
        );
        const data = await res.json() as { status?: string; message?: string; error?: string; txSignature?: string; pTxHash?: string; amount?: number };
        if (!res.ok || data.status === "error") {
          throw new Error(data.message || data.error || "Aster deposit failed");
        }
        if (depositToastIdRef.current) {
          const txHash = data.txSignature ?? data.pTxHash;
          positionToast.success(
            depositToastIdRef.current,
            txHash ? `https://solscan.io/tx/${txHash}` : "",
            `Deposit successful! ${data.amount ? `${data.amount.toFixed(2)} USDT deposited.` : data.message || ""}`,
          );
          depositToastIdRef.current = null;
        }
        setDepositAmount("");
        setDepositProtocol(null);
        void refreshAllBalances("perp-perp-deposit");
      } else if (depositProtocol === "01") {
        // 01 accepts USDC/USDT/SOL (Jupiter auto-swap), min 1 USDC equivalent
        const zeroOneBalance =
          depositAsset === "sol" ? solBalance.balance :
          depositAsset === "usdt" ? usdtBalance.balance :
          walletBalance.balance;
        const zeroOneAssetLabel = depositAsset.toUpperCase();
        const zeroOneDecimals = depositAsset === "sol" ? 4 : 2;
        if (zeroOneBalance === null || zeroOneBalance < depositValue) {
          if (depositToastIdRef.current) {
            positionToast.failed(
              depositToastIdRef.current,
              `Insufficient ${zeroOneAssetLabel} balance. Required: ${depositValue.toFixed(zeroOneDecimals)} ${zeroOneAssetLabel}, Available: ${zeroOneBalance?.toFixed(zeroOneDecimals) ?? "0"} ${zeroOneAssetLabel}`,
            );
            depositToastIdRef.current = null;
          }
          return;
        }
        if (depositAsset === "usdc" && depositValue < 1) {
          if (depositToastIdRef.current) {
            positionToast.failed(depositToastIdRef.current, "Minimum deposit is 1 USDC for 01");
            depositToastIdRef.current = null;
          }
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
        if (depositToastIdRef.current) {
          const txHash = data.txSignature ?? data.swapTxHash;
          positionToast.success(
            depositToastIdRef.current,
            txHash ? `https://solscan.io/tx/${txHash}` : "",
            `Deposit successful! ${data.amount ? `${data.amount.toFixed(2)} ${data.asset ?? "USDC"} deposited.` : data.message || ""}${data.warning ? ` ⚠️ ${data.warning}` : ""}`,
          );
          depositToastIdRef.current = null;
        }
        setDepositAmount("");
        setDepositProtocol(null);
        void refreshAllBalances("perp-perp-deposit");
      } else if (depositProtocol === "phoenix") {
        // Phoenix accepts USDC deposits only, minimum 1 USDC.
        if (
          walletBalance.balance === null ||
          walletBalance.balance < depositValue
        ) {
          if (depositToastIdRef.current) {
            positionToast.failed(
              depositToastIdRef.current,
              "Insufficient wallet balance",
            );
            depositToastIdRef.current = null;
          }
          return;
        }
        if (depositValue < 1) {
          if (depositToastIdRef.current) {
            positionToast.failed(
              depositToastIdRef.current,
              "Minimum deposit is 1 USDC for Phoenix",
            );
            depositToastIdRef.current = null;
          }
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
          `${PERP_HEDGE_API_URL}/arb/deposit/phoenix`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ amount: depositValue, asset: "usdc" }),
          },
        );
        const data = await res.json() as { status?: string; message?: string; error?: string; txSignature?: string; amount?: number; note?: string; warning?: string | null };
        if (!res.ok || data.status === "error") {
          throw new Error(data.message || data.error || "Phoenix deposit failed");
        }
        if (depositToastIdRef.current) {
          positionToast.success(
            depositToastIdRef.current,
            data.txSignature ? `https://solscan.io/tx/${data.txSignature}` : "",
            `Deposit successful! ${data.note || "Deposit will be credited to your Phoenix collateral once confirmed on-chain."}${data.warning ? ` ${data.warning}` : ""}`,
          );
          depositToastIdRef.current = null;
        }
        setDepositAmount("");
        setDepositProtocol(null);
        void refreshAllBalances("perp-perp-deposit");
      } else if (depositProtocol === "lighter") {
        // Lighter uses USDC deposits (min 5 USDC)
        if (
          walletBalance.balance === null ||
          walletBalance.balance < depositValue
        ) {
          if (depositToastIdRef.current) {
            positionToast.failed(
              depositToastIdRef.current,
              "Insufficient wallet balance",
            );
            depositToastIdRef.current = null;
          }
          return;
        }
        if (depositValue < 5) {
          if (depositToastIdRef.current) {
            positionToast.failed(
              depositToastIdRef.current,
              "Minimum deposit is 5 USDC for Lighter",
            );
            depositToastIdRef.current = null;
          }
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
          `${PERP_HEDGE_API_URL}/arb/deposit/lighter`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ amount: depositValue }),
          },
        );
        const data = await res.json();
        if (!res.ok || data.status === "error") {
          throw new Error(
            data.message || data.error || "Lighter deposit failed",
          );
        }
        if (depositToastIdRef.current) {
          positionToast.success(
            depositToastIdRef.current,
            data.txSignature ? `https://solscan.io/tx/${data.txSignature}` : "",
            `Deposit successful! ${data.message || ""}`,
          );
          depositToastIdRef.current = null;
        }
        setDepositAmount("");
        setDepositProtocol(null);
        void refreshAllBalances("perp-perp-deposit");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Deposit failed";
      if (depositToastIdRef.current) {
        positionToast.failed(depositToastIdRef.current, errorMessage);
        depositToastIdRef.current = null;
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
      toast.custom(() => (
        <SimpleToast
          type="error"
          title="Invalid USD Amount"
          description="Please enter a valid USD amount"
        />
      ));
      return;
    }

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

    const notionalValue = usdValue * leverageValue;
    if (notionalValue < MIN_NOTIONAL) {
      toast.custom(() => (
        <SimpleToast
          type="error"
          title="Minimum Notional"
          description={`Minimum notional (USD × Leverage) is $${MIN_NOTIONAL}. Current: $${notionalValue.toFixed(2)}`}
        />
      ));
      return;
    }

    // Calculate required balances (50% each)
    const requiredBalance = usdValue / 2;

    // Validate balances on each leg's venue (deduped so a same-venue both-legs
    // setup checks once). Generic over base + HIP-3 — getProtocolBalance routes
    // HIP-3 ids to the per-dex balance map.
    const legProtocols = [longProtocol, shortProtocol].filter(
      (p, i, arr) => arr.indexOf(p) === i,
    );
    for (const protocol of legProtocols) {
      const available = getProtocolBalance(protocol);
      if (available < requiredBalance) {
        const label = getProtocolLabel(protocol);
        toast.custom(() => (
          <SimpleToast
            type="error"
            title={label}
            description={`Insufficient ${label} balance. Required: $${requiredBalance.toFixed(2)}, Available: $${available.toFixed(2)}`}
          />
        ));
        return;
      }
    }

    // Slippage warnings — shown as toasts but never block execution.
    if (executionQuoteRequired && executionCostErrorMessage) {
      toast.custom(() => (
        <SimpleToast
          type="info"
          title="Slippage Unavailable"
          description="Could not fetch slippage quote — proceeding without it."
        />
      ));
    } else if (hasInsufficientQuoteDepth) {
      toast.custom(() => (
        <SimpleToast
          type="info"
          title="Low Orderbook Depth"
          description="Orderbook depth is low for this trade size — proceeding anyway."
        />
      ));
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
      pair: tradePairLabel,
      description: `Executing ${tradePairLabel} arbitrage trade...`,
    });

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

      console.log("[Trade] Full response:", JSON.stringify(result, null, 2));

      // Check for explicit error status
      if (result.status === "error") {
        const msg = result.error || result.message || "Trade failed";
        positionToast.failed(tradeToastId, msg);
        return;
      }

      // Check if both legs actually executed
      const longPos = result.positions[longProtocol];
      const shortPos = result.positions[shortProtocol];
      const longOk = longPos && longPos.status !== "error";
      const shortOk = shortPos && shortPos.status !== "error";

      if (result.status === "success" || result.status === "sent") {
        // Build explorer URL from first available tx signature
        const explorerTx =
          longPos?.txSignature ||
          shortPos?.txSignature ||
          result.bundleId ||
          "";

        if (longOk && shortOk) {
          // Both legs succeeded
          positionToast.success(
            tradeToastId,
            explorerTx ? `https://solscan.io/tx/${explorerTx}` : "",
            result.message || `Trade ${result.status}!`,
          );
        } else {
          // Partial success — one leg failed
          const failedProtocol = !longOk ? longProtocol : shortProtocol;
          const failedPos = !longOk ? longPos : shortPos;
          const failedMsg =
            failedPos?.error ||
            result.message ||
            `${failedProtocol} leg failed`;
          positionToast.failed(tradeToastId, `Partial failure: ${failedMsg}`);
        }
        if (longProtocol === "aster" || shortProtocol === "aster") {
          triggerAsterPostTradeRefresh();
        }
        await refreshAllBalances("perp-perp-open-position");
        if (longOk && shortOk) {
          onOpenChange(false); // Only close modal on full success
        }
      } else {
        // Handle unexpected status (e.g. "partial", unknown)
        const msg =
          result.error || result.message || "Trade returned unexpected status";
        positionToast.failed(tradeToastId, msg);
      }
    } catch (error) {
      console.error("[Trade] Error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to execute trade";
      positionToast.failed(tradeToastId, errorMessage);
    } finally {
      setIsTrading(false);
    }
  };

  const content = (
        <div
          className={cn(
            presentation === "page" ? "space-y-0" : "space-y-4 md:space-y-5",
            presentation === "modal" && "p-4 md:p-6",
            isMobile && "pt-0",
          )}
        >
          {/* ── Header ── */}
          <div
            className={cn(
              "flex items-center justify-between",
              presentation === "page" &&
                "flex-col items-stretch gap-3 overflow-hidden border-b border-[#0F1F30] bg-[#000D1E] px-3 py-2 sm:px-4 xl:flex-row xl:items-center",
            )}
          >
            <div
              className={cn(
                "flex min-w-0 items-center",
                presentation === "page" ? "w-full gap-2 pr-1 xl:w-[245px] xl:shrink-0 xl:gap-3" : "gap-3",
              )}
            >
              {presentation === "page" && (
                <a
                  href="/arb"
                  aria-label="Back to arb screener"
                  title="Back to arb screener"
                  className="flex size-7 shrink-0 items-center justify-center border border-[#0F1F30] bg-[#041223] text-[#7192A5] transition-colors hover:border-[#9CE0FF]/50 hover:text-[#BCEBFF]"
                >
                  <ArrowLeft className="size-3.5" />
                </a>
              )}
              <TokenLogo
                symbol={marketData.symbol}
                className={presentation === "page" ? "h-7 w-7 shrink-0" : "h-12 w-12"}
              />
              <div className="flex min-w-0 flex-col">
                <div className="flex min-w-0 items-center gap-1.5">
                  <h2
                    className={cn(
                      "font-medium text-white",
                      presentation === "page" ? "truncate text-base leading-none" : "text-2xl",
                    )}
                  >
                    {presentation === "page" ? marketData.symbol.toUpperCase() : getUnderlyingLabel(marketData.symbol).toUpperCase()}
                  </h2>
                </div>
                {/* Always show both legs with their protocol — even when the
                    two legs share the same ticker (e.g. SPX ↔ SPX) the
                    trader needs to know which two venues are being paired. */}
                <div
                  className={cn(
                    "mt-1 flex min-w-0 items-center text-[11px] leading-none tracking-tight text-[#7192A5]",
                    presentation === "page" ? "gap-1.5" : "gap-1.5",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-1">
                    <span className="font-medium text-[#BCEBFF]">
                      {longTradeTicker}
                    </span>
                    <span title={getProtocolLabel(longProtocol)}>
                      <ProtocolVenueBadge
                        protocol={longProtocol}
                        className="size-3.5"
                      />
                    </span>
                  </div>
                  <span className="shrink-0 px-0.5 text-[#4A6073]">↔</span>
                  <div className="flex min-w-0 items-center gap-1">
                    <span className="font-medium text-[#BCEBFF]">
                      {shortTradeTicker}
                    </span>
                    <span title={getProtocolLabel(shortProtocol)}>
                      <ProtocolVenueBadge
                        protocol={shortProtocol}
                        className="size-3.5"
                      />
                    </span>
                  </div>
                </div>
              </div>
            </div>
            {presentation === "page" && (
              <div className="grid min-w-0 flex-1 grid-cols-2 items-stretch gap-y-2 sm:grid-cols-4 lg:grid-cols-[minmax(86px,0.8fr)_minmax(62px,0.58fr)_minmax(94px,0.82fr)_minmax(94px,0.82fr)_minmax(74px,0.62fr)_repeat(3,minmax(132px,1fr))] lg:gap-y-0">
                <div className="min-w-0 border-l border-white/10 px-2 xl:px-3">
                  <div className="mb-0.5 flex items-center gap-1">
                    <p className="text-[11px] leading-none text-[#7192A5]">Funding Rate</p>
                    <InfoTooltip iconClassName="text-[#7192A5]">
                      Max ARB value of {marketData.symbol}
                    </InfoTooltip>
                  </div>
                  <p
                    className={cn(
                      "truncate text-[13px] font-medium",
                      fundingSpreadPct1h > 0
                        ? "text-[#4ADE80]"
                        : fundingSpreadPct1h < 0
                          ? "text-[#FF6B6B]"
                          : "text-white",
                    )}
                  >
                    {stats.fundingRate}
                  </p>
                </div>
                <div className="min-w-0 border-l border-white/10 px-2 xl:px-3">
                  <p className="mb-0.5 text-[11px] leading-none text-[#7192A5]">APR</p>
                  <p
                    className={cn(
                      "truncate text-[13px] font-medium",
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
                <div className="min-w-0 border-l border-white/10 px-2 xl:px-3">
                  <p className="mb-0.5 text-[11px] leading-none text-[#7192A5]">Expected PnL</p>
                  <p
                    className={cn(
                      "truncate text-[13px] font-medium",
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
                <div className="min-w-0 border-l border-white/10 px-2 xl:px-3">
                  <div className="mb-0.5 flex items-center gap-1">
                    <p className="text-[11px] leading-none text-[#7192A5]">Arb Depth</p>
                    {oiUnavailableMsg ? (
                      <InfoTooltip iconClassName="text-[#7192A5]">
                        {oiUnavailableMsg} — arb depth cannot be calculated
                      </InfoTooltip>
                    ) : arbDepthResult?.viable && arbDepthResult.smallDepthReason ? (
                      <InfoTooltip iconClassName="text-[#F59E0B]">
                        {arbDepthResult.smallDepthReason}
                      </InfoTooltip>
                    ) : null}
                  </div>
                  <p className={cn(
                    "truncate text-[13px] font-medium",
                    isFetchingArbDepth && "animate-pulse opacity-60",
                    !arbDepthResult ? "text-white"
                      : !arbDepthResult.viable ? "text-[#7192A5]"
                      : arbDepthUsd && notionalValue > arbDepthUsd ? "text-[#FF6B6B]"
                      : "text-[#4ADE80]",
                  )}>
                    {oiUnavailableMsg ? "—"
                      : !arbDepthEnabled ? "N/A"
                      : !arbDepthResult ? (isFetchingArbDepth ? "..." : "N/A")
                      : !arbDepthResult.viable ? "No spread"
                      : `$${arbDepthUsd!.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                  </p>
                </div>
                <div className="min-w-0 border-l border-white/10 px-2 xl:px-3">
                  <p className="mb-0.5 text-[11px] leading-none text-[#7192A5]">Time Frame</p>
                  <div className="relative inline-flex max-w-full items-center gap-1 text-[13px] font-medium text-[#9CCFE6]">
                    <select
                      aria-label="Time frame"
                      value={["0.5", "1", "3", "7", "30"].includes(timeFrameDays) ? timeFrameDays : "1"}
                      onChange={(e) => setTimeFrameDays(e.target.value)}
                      className="absolute inset-0 cursor-pointer opacity-0"
                    >
                      <option value="0.5">12 Hours</option>
                      <option value="1">1 Day</option>
                      <option value="3">3 Days</option>
                      <option value="7">7 Days</option>
                      <option value="30">30 Days</option>
                    </select>
                    <span className="truncate">
                      {timeFrameDays === "0.5" ? "12 Hours" : `${Number(timeFrameDays).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${Number(timeFrameDays) === 1 ? "Day" : "Days"}`}
                    </span>
                    <ChevronsUpDown className="size-3 shrink-0 text-[#7192A5]" />
                  </div>
                </div>
                {[
                  { label: "Mark", long: liveLongPriceSummary.markPrice, short: liveShortPriceSummary.markPrice, delta: markPriceDifference },
                  { label: "Oracle", long: liveLongPriceSummary.oraclePrice, short: liveShortPriceSummary.oraclePrice, delta: oraclePriceDifference },
                  { label: "Index", long: liveLongPriceSummary.indexPrice, short: liveShortPriceSummary.indexPrice, delta: indexPriceDifference },
                ].map((row) => (
                  <div key={row.label} className="min-w-0 border-l border-white/10 px-2 xl:px-3">
                    <div className="mb-0.5 flex min-w-0 items-center justify-between gap-2">
                      <div className="flex min-w-0 shrink-0 items-center gap-1">
                        <p className="text-[11px] leading-none text-[#7192A5]">{row.label}</p>
                        {row.label === "Mark" && (
                          <InfoTooltip
                            side="bottom"
                            className="max-w-[260px] text-xs leading-relaxed text-[#D8F2FF]"
                            trigger={
                              <span
                                aria-label={`Price data source: ${liveDivergenceStatus.label}`}
                                className={cn("block size-1.5 rounded-full", liveDivergenceStatus.dotClassName)}
                              />
                            }
                          >
                            {liveDivergenceStatus.tooltip}
                          </InfoTooltip>
                        )}
                      </div>
                      <span className={cn("min-w-0 truncate text-right text-[10px] font-medium leading-none", divergenceDeltaClass(row.delta))}>
                        Δ {formatCompactPrice(row.delta)}
                      </span>
                    </div>
                    <div className="flex min-w-0 items-center gap-1 text-[10px] leading-tight text-white xl:gap-2">
                      <span className="min-w-0 truncate whitespace-nowrap">
                        <span className="text-[#7192A5]">L</span> {formatCompactPrice(row.long)}
                      </span>
                      <span className="text-[#4A6073]">|</span>
                      <span className="min-w-0 truncate whitespace-nowrap">
                        <span className="text-[#7192A5]">S</span> {formatCompactPrice(row.short)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
          <div
            className={cn(
              presentation === "page"
                ? "hidden"
                : "grid grid-cols-2 gap-3 lg:grid-cols-6",
            )}
          >
            <div className={cn(presentation === "page" ? "min-w-[150px] border-r border-[#0F1F30] px-3 py-2.5" : "border border-[#0F1F30] bg-[#041223] p-4")}>
              <div className="mb-1 flex items-center gap-1">
                <p className="text-sm text-[#7192A5]">Funding Rate</p>
                <InfoTooltip iconClassName="text-[#7192A5]">
                  Max ARB value of {marketData.symbol}
                </InfoTooltip>
              </div>
              <p
                className={cn(
                  "text-lg font-normal",
                  fundingSpreadPct1h > 0
                    ? "text-[#4ADE80]"
                    : fundingSpreadPct1h < 0
                      ? "text-[#FF6B6B]"
                      : "text-white",
                )}
              >
                {stats.fundingRate}
              </p>
            </div>
            <div className={cn(presentation === "page" ? "min-w-[125px] border-r border-[#0F1F30] px-3 py-2.5" : "border border-[#0F1F30] bg-[#041223] p-4")}>
              <p className="mb-1 text-sm text-[#7192A5]">APR</p>
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
            <div className={cn(presentation === "page" ? "min-w-[170px] border-r border-[#0F1F30] px-3 py-2.5" : "border border-[#0F1F30] bg-[#041223] p-4")}>
              <p className="mb-1 text-sm text-[#7192A5]">Time Frame</p>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0.01}
                  step={0.5}
                  value={timeFrameDays}
                  onChange={(e) => setTimeFrameDays(e.target.value)}
                  className={cn(
                    "h-9 w-20 border-[#0F1F30] bg-[#02142B] text-base text-white placeholder:text-[#7192A5]",
                    presentation === "page" && "h-7 w-16 px-2 text-sm",
                  )}
                />
                <span className="text-sm text-[#7192A5]">days</span>
              </div>
            </div>
            <div className={cn(presentation === "page" ? "min-w-[160px] border-r border-[#0F1F30] px-3 py-2.5" : "border border-[#0F1F30] bg-[#041223] p-4")}>
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
            <div className={cn(presentation === "page" ? "min-w-[150px] border-r border-[#0F1F30] px-3 py-2.5" : "border border-[#0F1F30] bg-[#041223] p-4")}>
              <div className="mb-1 flex items-center gap-1">
                <p className="text-sm text-[#7192A5]">Arb Depth</p>
                {oiUnavailableMsg ? (
                  <InfoTooltip iconClassName="text-[#7192A5]">
                    {oiUnavailableMsg} — arb depth cannot be calculated
                  </InfoTooltip>
                ) : arbDepthResult?.viable && arbDepthResult.smallDepthReason ? (
                  <InfoTooltip iconClassName="text-[#F59E0B]">
                    {arbDepthResult.smallDepthReason}
                  </InfoTooltip>
                ) : null}
              </div>
              <p className={cn(
                "text-lg font-normal",
                isFetchingArbDepth && "animate-pulse opacity-60",
                !arbDepthResult ? "text-white"
                  : !arbDepthResult.viable ? "text-[#7192A5]"
                  : arbDepthUsd && notionalValue > arbDepthUsd ? "text-[#FF6B6B]"
                  : "text-[#4ADE80]",
              )}>
                {oiUnavailableMsg ? "—"
                  : !arbDepthEnabled ? "N/A"
                  : !arbDepthResult ? (isFetchingArbDepth ? "..." : "N/A")
                  : !arbDepthResult.viable ? "No spread"
                  : `$${arbDepthUsd!.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              </p>
            </div>
            <div className={cn(presentation === "page" ? "min-w-[300px] px-3 py-2.5" : "border border-[#0F1F30] bg-[#041223] p-4")}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1">
                  <p className="text-sm text-[#7192A5]">Divergence</p>
                  <InfoTooltip iconClassName="text-[#7192A5]">
                    <div className="max-w-[260px] space-y-1.5">
                      <div>Divergence Δ is calculated as short venue price minus long venue price.</div>
                      <div>Mark Δ: short venue mark price minus long venue mark price.</div>
                      <div>Oracle Δ: short venue oracle price minus long venue oracle price.</div>
                      <div>Index Δ: short venue index price minus long venue index price.</div>
                    </div>
                  </InfoTooltip>
                </div>
                <InfoTooltip
                  side="left"
                  className="max-w-[260px] text-xs leading-relaxed text-[#D8F2FF]"
                  trigger={
                    <span
                      aria-label={`Price data source: ${liveDivergenceStatus.label}`}
                      className={cn("block size-2.5 shrink-0 rounded-full", liveDivergenceStatus.dotClassName)}
                    />
                  }
                >
                  {liveDivergenceStatus.tooltip}
                </InfoTooltip>
              </div>
              <div className="mt-2 space-y-2 text-[11px] leading-tight">
                {[
                  {
                    label: "Mark",
                    long: liveLongPriceSummary.markPrice,
                    short: liveShortPriceSummary.markPrice,
                    delta: markPriceDifference,
                  },
                  {
                    label: "Oracle",
                    long: liveLongPriceSummary.oraclePrice,
                    short: liveShortPriceSummary.oraclePrice,
                    delta: oraclePriceDifference,
                  },
                  {
                    label: "Index",
                    long: liveLongPriceSummary.indexPrice,
                    short: liveShortPriceSummary.indexPrice,
                    delta: indexPriceDifference,
                  },
                ].map((row) => (
                  <div key={row.label} className="border-t border-[#0F1F30] pt-1.5 first:border-t-0 first:pt-0">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-[#7192A5]">{row.label}</span>
                      <span className={cn("font-medium", divergenceDeltaClass(row.delta))}>
                        Δ {formatCompactPrice(row.delta)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="min-w-0">
                        <span className="mr-1 text-[#7192A5]">L</span>
                        <span className="text-white">{formatCompactPrice(row.long)}</span>
                      </div>
                      <div className="min-w-0 text-right">
                        <span className="mr-1 text-[#7192A5]">S</span>
                        <span className="text-white">{formatCompactPrice(row.short)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Trade Workspace ── */}
          <div
            className={cn(
              presentation === "page"
                ? "grid min-w-0 grid-cols-1 gap-0 min-[1180px]:grid-cols-[minmax(520px,1fr)_minmax(300px,0.48fr)_minmax(300px,0.42fr)] 2xl:grid-cols-[minmax(0,1fr)_400px_375px]"
                : "grid grid-cols-1 gap-4 lg:grid-cols-12",
            )}
          >
            {/* Left Column — Chart ↔ Back Testing (tabs sit inline in header) */}
            {chartToggle && (
              <div
                className={cn(
                  "relative min-w-0",
                  presentation === "page"
                    ? "min-h-[420px] self-stretch border-b border-[#0F1F30] min-[1180px]:min-h-[560px] min-[1180px]:border-r min-[1180px]:border-b-0"
                    : "border border-[#0F1F30] lg:col-span-7",
                )}
              >
                {chartTab === "price" && (
                  <div className="relative h-full min-h-[420px] min-[1180px]:min-h-[560px]">
                    <ChartWatermark />
                    <FundingRateChart
                      symbol={marketData.symbol}
                      longSymbol={longTradeTicker}
                      shortSymbol={shortTradeTicker}
                      longProtocol={longProtocol}
                      shortProtocol={shortProtocol}
                      singleProtocol={undefined}
                      mergedLabel={presentation === "page" ? "Arb Spread" : "Max Funding arb"}
                      leftHeaderBefore={
                        presentation === "page" ? (
                          <ChartTabButton
                            label="Price"
                            active={false}
                            onClick={() => setChartTab("longShort")}
                          />
                        ) : undefined
                      }
                      leftHeaderExtra={
                        <>
                          <ChartTabButton
                            label={presentation === "page" ? "Backtesting" : "Back Testing"}
                            active={false}
                            onClick={() => setChartTab("backtest")}
                          />
                          {presentation !== "page" && (
                            <ChartTabButton
                              label="Price"
                              active={false}
                              onClick={() => setChartTab("longShort")}
                            />
                          )}
                          {presentation !== "page" && (
                            <ChartTabButton
                              label="Orderbook"
                              active={false}
                              onClick={() => setChartTab("orderbook")}
                            />
                          )}
                        </>
                      }
                    />
                  </div>
                )}

                {chartTab === "orderbook" && (
                  <PerpOrderbookPanel
                    longSymbol={longTradeTicker}
                    shortSymbol={shortTradeTicker}
                    longProtocol={longProtocol}
                    shortProtocol={shortProtocol}
                    longOpenInterestUsd={longVenueOiUsd}
                    shortOpenInterestUsd={shortVenueOiUsd}
                    headerTabs={
                      <>
                        <ChartTabButton
                          label="Max Funding arb"
                          active={false}
                          onClick={() => setChartTab("price")}
                        />
                        <ChartTabButton
                          label="Back Testing"
                          active={false}
                          onClick={() => setChartTab("backtest")}
                        />
                        <ChartTabButton
                          label="Price"
                          active={false}
                          onClick={() => setChartTab("longShort")}
                        />
                        <ChartTabButton
                          label="Orderbook"
                          active={true}
                          onClick={() => setChartTab("orderbook")}
                        />
                      </>
                    }
                  />
                )}

                {chartTab === "longShort" && (
                  <LongShortPriceChart
                    longSymbol={longTradeTicker}
                    shortSymbol={shortTradeTicker}
                    longProtocol={longProtocol}
                    shortProtocol={shortProtocol}
                    headerTabs={
                      presentation === "page" ? (
                        <>
                          <ChartTabButton
                            label="Price"
                            active
                            onClick={() => setChartTab("longShort")}
                          />
                          <ChartTabButton
                            label="Arb Spread"
                            active={false}
                            onClick={() => setChartTab("price")}
                          />
                          <ChartTabButton
                            label="Backtesting"
                            active={false}
                            onClick={() => setChartTab("backtest")}
                          />
                        </>
                      ) : (
                        <>
                          <ChartTabButton
                            label="Max Funding arb"
                            active={false}
                            onClick={() => setChartTab("price")}
                          />
                          <ChartTabButton
                            label="Back Testing"
                            active={false}
                            onClick={() => setChartTab("backtest")}
                          />
                          <ChartTabButton
                            label="Price"
                            active
                            onClick={() => setChartTab("longShort")}
                          />
                          <ChartTabButton
                            label="Orderbook"
                            active={false}
                            onClick={() => setChartTab("orderbook")}
                          />
                        </>
                      )
                    }
                  />
                )}

                {chartTab === "backtest" && (
                  <BacktestingPanel
                    longSymbol={longTradeTicker}
                    shortSymbol={shortTradeTicker}
                    longProtocol={longProtocol}
                    shortProtocol={shortProtocol}
                    headerTabs={
                      <>
                        <ChartTabButton
                          label="Price"
                          active={false}
                          onClick={() => setChartTab("longShort")}
                        />
                        <ChartTabButton
                          label={presentation === "page" ? "Arb Spread" : "Max Funding arb"}
                          active={false}
                          onClick={() => setChartTab("price")}
                        />
                        <ChartTabButton
                          label="Backtesting"
                          active={true}
                          onClick={() => setChartTab("backtest")}
                        />
                        {presentation !== "page" && (
                          <ChartTabButton
                            label="Orderbook"
                            active={false}
                            onClick={() => setChartTab("orderbook")}
                          />
                        )}
                      </>
                    }
                  />
                )}
              </div>
            )}

            {presentation === "page" && (
              <div className="min-w-0 border-b border-[#0F1F30] min-[1180px]:border-r min-[1180px]:border-b-0">
                <PerpOrderbookPanel
                  longSymbol={longTradeTicker}
                  shortSymbol={shortTradeTicker}
                  longProtocol={longProtocol}
                  shortProtocol={shortProtocol}
                  longOpenInterestUsd={longVenueOiUsd}
                  shortOpenInterestUsd={shortVenueOiUsd}
                />
              </div>
            )}

            {/* Right Column — Trade Panel */}
            <div
              className={cn(
                "flex min-w-0 flex-col gap-3 bg-[#000D1E] p-3",
                presentation === "page"
                  ? "border-b border-[#0F1F30] min-[1180px]:col-span-1 min-[1180px]:border-b-0"
                  : "border border-[#0F1F30] lg:col-span-5",
              )}
            >
              {/* <div className="border border-[#0F1F30] bg-[#041223] p-4 flex flex-col gap-3"> */}
              {/* Balance bar */}
              <div className="flex items-center gap-2 text-xs">
                {[longProtocol, shortProtocol].filter((p, i, arr) => arr.indexOf(p) === i).map((protocol) => {
                  return (
                    <div key={protocol} className="flex min-w-0 flex-1 items-center border border-[#0F1F30] bg-[#041223] p-2">
                      <span className="truncate text-sm text-[#7192A5]">
                        {formatProtocolDisplay(protocol)}:{" "}
                        <span className="font-medium text-white">
                          ${getProtocolBalance(protocol).toFixed(2)}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Protocol Selection */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-[#7192A5]">Long</label>
                  <select
                    value={longProtocol}
                    disabled={isTrading}
                    onChange={(e) => {
                      const newLong = e.target.value as TradeProtocol;
                      setHasManualProtocolSelection(true);
                      setLongProtocol(newLong);
                      if (newLong === shortProtocol) {
                        const other = availableTradeProtocols.find((p) => p !== newLong);
                        if (other) setShortProtocol(other as TradeProtocol);
                      }
                    }}
                    className="h-8 border border-[#0F1F30] bg-[#02142B] px-2 text-xs text-white outline-none focus:border-[#9CE0FF] disabled:opacity-50"
                  >
                    {availableTradeProtocols.map((id) => (
                      <option key={id} value={id} className="bg-[#02142B]">
                        {formatProtocolDisplay(id)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-[#7192A5]">Short</label>
                  <select
                    value={shortProtocol}
                    disabled={isTrading}
                    onChange={(e) => {
                      const newShort = e.target.value as TradeProtocol;
                      setHasManualProtocolSelection(true);
                      setShortProtocol(newShort);
                      if (newShort === longProtocol) {
                        const other = availableTradeProtocols.find((p) => p !== newShort);
                        if (other) setLongProtocol(other as TradeProtocol);
                      }
                    }}
                    className="h-8 border border-[#0F1F30] bg-[#02142B] px-2 text-xs text-white outline-none focus:border-[#9CE0FF] disabled:opacity-50"
                  >
                    {availableTradeProtocols.map((id) => (
                      <option key={id} value={id} className="bg-[#02142B]">
                        {formatProtocolDisplay(id)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Deposit Card (inline, shown when deposit button is clicked) */}
              {depositProtocol && (
                <div className="border border-[#0F1F30] bg-[#041223] p-3">
                  <div className="mb-2 flex items-center gap-1">
                    <div className="h-1.5 w-1.5 rounded-full bg-[#9CE0FF]" />
                    <span className="flex items-center gap-0.5 text-xs font-medium text-[#9BA2AE]">
                      Deposit to
                      <select
                        value={depositProtocol ?? DEFAULT_TRADE_PROTOCOL}
                        onChange={(e) => {
                          const newProto = e.target.value as
                            | "drift"
                            | "pacifica"
                            | "hyperliquid"
                            | "aster"
                            | "lighter"
                            | "01"
                            | "phoenix";
                          setDepositProtocol(newProto);
                          setDepositAmount("");
                          setDepositAsset("usdc");
                        }}
                        className="cursor-pointer border-b border-[#9CE0FF]/30 bg-transparent px-0 pb-px text-xs font-medium text-[#9CE0FF] outline-none"
                      >
                        {/* HIP-3 venues intentionally excluded from the
                            inline deposit shortcut — they require the
                            venue-routing flow in PerpDepositWithdrawModal
                            (USDC → collateral swap). Depositing to them
                            here would route as main HL and silently lose
                            the swap. */}
                        {TRADE_PROTOCOLS.filter(
                          (id) => !isHip3ProtocolId(id),
                        ).map((id) => (
                          <option key={id} value={id} className="bg-[#041223]">
                            {formatProtocolDisplay(id)}
                          </option>
                        ))}
                      </select>
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
                        className="h-8! rounded-none border-[#0F1F30] bg-[#02142B] pr-20 text-sm font-medium text-white ring-0 placeholder:text-[#7192A5]"
                        type="number"
                        step="0.01"
                        min={
                          depositProtocol === "lighter"
                            ? "5"
                            : depositAsset === "sol"
                              ? "0.12"
                              : "1"
                        }
                      />
                      {(depositProtocol === "hyperliquid" || depositProtocol === "aster" || depositProtocol === "01") ? (
                        <select
                          value={depositAsset}
                          onChange={(e) => {
                            setDepositAsset(e.target.value as "usdc" | "usdt" | "sol");
                            setDepositAmount("");
                          }}
                          className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer border-none bg-transparent text-[10px] font-medium text-[#BBEBFF] outline-none"
                        >
                          <option value="usdc" className="bg-[#041223] text-white">USDC</option>
                          <option value="usdt" className="bg-[#041223] text-white">USDT</option>
                          <option value="sol" className="bg-[#041223] text-white">SOL</option>
                        </select>
                      ) : (
                        <span className="absolute top-1/2 right-3 -translate-y-1/2 text-[10px] text-[#BBEBFF70]">
                          USDC
                        </span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (depositProtocol === "hyperliquid" || depositProtocol === "aster" || depositProtocol === "01") {
                          if (depositAsset === "sol") {
                            setDepositAmount((solBalance.balance || 0).toFixed(4));
                          } else if (depositAsset === "usdt") {
                            setDepositAmount((usdtBalance.balance || 0).toFixed(2));
                          } else {
                            setDepositAmount((walletBalance.balance || 0).toFixed(2));
                          }
                        } else {
                          setDepositAmount((walletBalance.balance || 0).toFixed(2));
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
                      // Reject scientific notation (1e3) and locale separators —
                      // type="number" lets Chrome accept "1,5" and "1e3" and
                      // surface NaN to downstream submission. Pin to digits +
                      // single decimal point.
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
                        // Floor to cents — toFixed rounds half-to-even, which
                        // can over-shoot the actual balance and cause the
                        // backend to reject for "insufficient funds".
                        const max = getDeltaNeutralMax();
                        setUsdAmount((Math.floor((max / 2) * 100) / 100).toFixed(2));
                      }}
                      className="cursor-pointer bg-[#0D1E31] px-2 py-0.5 transition-colors hover:bg-[#0F1F30] hover:text-white"
                    >
                      half
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const m = getDeltaNeutralMax();
                        setUsdAmount((Math.floor(m * 100) / 100).toFixed(2));
                      }}
                      className="cursor-pointer bg-[#0D1E31] px-2 py-0.5 transition-colors hover:bg-[#0F1F30] hover:text-white"
                    >
                      max
                    </button>
                  </div>
                  <span className="text-sm text-[#7192A5]">
                    Max: ${getDeltaNeutralMax().toFixed(2)}
                  </span>
                </div>
                {autoCloseEnabled && (
                  <div className="mt-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <div className="inline-flex cursor-pointer items-center gap-1.5 rounded-none bg-[#23C0FF14] px-2.5 py-1">
                          <ShieldCheck className="text-[#67D3FE]" style={{ width: 14, height: 14 }} />
                          <span className="text-xs text-[#67D3FE]">
                            Auto close protection
                          </span>
                          <div className="ml-0.5 flex size-3.5 items-center justify-center rounded-full border border-[#67D3FE]/40 text-[8px] text-[#67D3FE]/70">
                            !
                          </div>
                        </div>
                      </PopoverTrigger>
                      <PopoverContent
                        side="bottom"
                        align="start"
                        alignOffset={0}
                        sideOffset={12}
                        className="relative z-[10002] max-w-[280px] rounded-none border border-[#1A3550] bg-[#021835] px-4 py-3 font-['Helvetica_Neue']"
                      >
                        <div
                          className="absolute"
                          style={{
                            top: -9,
                            left: 16,
                            width: 0,
                            height: 0,
                            borderLeft: "9px solid transparent",
                            borderRight: "9px solid transparent",
                            borderBottom: "9px solid #1A3550",
                          }}
                        />
                        <div
                          className="absolute"
                          style={{
                            top: -7,
                            left: 17,
                            width: 0,
                            height: 0,
                            borderLeft: "8px solid transparent",
                            borderRight: "8px solid transparent",
                            borderBottom: "8px solid #021835",
                          }}
                        />
                        <p className="mb-2 text-sm font-medium text-white">
                          Auto Close Protection
                        </p>
                        <div className="mb-2 border-t border-[#1A3550]" />
                        <p className="text-xs leading-relaxed text-[#7192A5]">
                          This position is automatically closed before it becomes unprofitable. This is a safety feature to protect your deposited capital.
                        </p>
                      </PopoverContent>
                    </Popover>
                  </div>
                )}
              </div>
              {usdAmount && (
                <div className="border border-[#0F1F30] bg-[#041223] p-4">
                  <div className="text-xs text-[#7192A5]">
                    {longProtocol.charAt(0).toUpperCase() + longProtocol.slice(1)} margin will be ${parseFloat(usdAmount) / 2} and{" "}
                    {shortProtocol.charAt(0).toUpperCase() + shortProtocol.slice(1)} margin will be ${parseFloat(usdAmount) / 2} and total
                    notional will be $
                    {parseFloat(usdAmount) * parseFloat(leverage)} USD
                  </div>
                </div>
              )}

              {/* Leverage */}
              <div className="">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm text-[#7192A5]">Leverage</span>
                  {/* <Switch
                    checked={isLeverageEnabled}
                    onCheckedChange={(checked) => {
                      setIsLeverageEnabled(checked);
                      if (!checked) setLeverage("1");
                    }}
                  /> */}
                </div>

                <div
                  className={cn(
                    "flex items-stretch border border-[#0F1F30] bg-[#02142B] transition-opacity",
                    !isLeverageEnabled && "pointer-events-none opacity-50",
                  )}
                >
                  <div className="flex w-12 items-center justify-center border-r border-[#0F1F30] bg-[#041223]">
                    <span className="text-sm font-medium text-white">
                      {isLeverageEnabled ? leverage : "1"}x
                    </span>
                  </div>
                  <div className="flex flex-1 items-center gap-3 px-4 py-3">
                    <Slider
                      value={[parseFloat(leverage)]}
                      onValueChange={(vals) => {
                        if (vals?.[0] !== undefined)
                          setLeverage(vals[0].toString());
                      }}
                      min={1}
                      max={maxLeverage}
                      step={1}
                      disabled={!isLeverageEnabled}
                      className="cursor-pointer"
                    />
                    <span className="shrink-0 text-xs text-[#7192A5]">{maxLeverage}x</span>
                  </div>
                </div>
              </div>

              {/* Autoclose toggle — controls backend ACLP triggers.
                  OFF (default): liquidation-proximity / OI-cascade /
                  equity-drawdown auto-closes are suppressed. ON: every
                  trigger fires. Funding-flip and delta-drift auto-closes
                  remain active in either state. */}
              <div className="flex items-center justify-between border border-[#0F1F30] bg-[#02142B] px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-white">Autoclose</span>
                  <InfoTooltip>
                    {autoCloseEnabled
                      ? "ON: backend auto-closes the position on liquidation proximity, OI cascade, or portfolio equity drawdown. Funding-flip and delta-drift triggers always fire."
                      : "OFF (default): liquidation-proximity, OI-cascade and equity-drawdown auto-closes are suppressed. Funding-flip and delta-drift triggers still fire. If one leg is liquidated, backend places a tight stop on the surviving leg."}
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
              <button
                onClick={handleTrade}
                disabled={
                  isTrading ||
                  isDepositing ||
                  !meetsMinimumNotional
                }
                // style={{
                //   background:
                //     "linear-gradient(90deg, rgba(137,179,224,0.15) 0%, rgba(36,45,55,0.6) 30%, rgba(36,45,55,0.6) 70%, rgba(137,179,224,0.15) 100%)",
                // }}
                className="font-ibm-plex-serif h-11 w-full cursor-pointer border-2 border-[#9ce0ff33] bg-[#9CE0FF] text-base font-medium italic transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isTrading ? "Executing Trade..." : "Execute Trade"}
              </button>

              {!meetsMinimumNotional && (
                <p className="text-xs text-[#7192A5]">
                  Min notional should be at least ${MIN_NOTIONAL}. Current: $
                  {notionalValue.toFixed(2)}
                </p>
              )}
              {arbDepthResult?.viable && arbDepthUsd && notionalValue > arbDepthUsd && (
                <p className="text-xs text-[#D9A441]">
                  Position size (${notionalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}) exceeds rate-zero depth (${arbDepthUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}). At this size your position would push the funding rate to zero.
                </p>
              )}
              {/* </div> */}

              {/* Transaction Details */}
              <Accordion
                type="single"
                collapsible
                className="w-full"
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
                      <span className="text-[#7699AD]">Total Margin</span>
                      <span className="text-white">${usdAmount || "0"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#7699AD]">Leverage</span>
                      <span className="text-white">{leverage || "0"}x</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#7699AD]">Long</span>
                      <span className="text-white capitalize">
                        {longProtocol}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#7699AD]">Short</span>
                      <span className="text-white capitalize">
                        {shortProtocol}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#7699AD]">Max ARB</span>
                      <span className="text-[#4ADE80]">
                        {stats.fundingRate}
                      </span>
                    </div>
                    {arbDepthResult?.viable && (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-[#7699AD]">Optimal Size</span>
                          <span className="text-white">
                            ${optimalSizeUsd?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? "—"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1 text-[#7699AD]">
                            Arb Depth
                            {oiUnavailableMsg ? (
                              <InfoTooltip iconClassName="text-[#7192A5]">
                                {oiUnavailableMsg} — arb depth cannot be calculated
                              </InfoTooltip>
                            ) : arbDepthResult.smallDepthReason ? (
                              <InfoTooltip iconClassName="text-[#F59E0B]">
                                {arbDepthResult.smallDepthReason}
                              </InfoTooltip>
                            ) : null}
                          </span>
                          <span className={cn(arbDepthUsd && notionalValue > arbDepthUsd ? "text-[#FF6B6B]" : "text-white")}>
                            {oiUnavailableMsg ? "—" : `$${arbDepthUsd?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? "—"}`}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1 text-[#7699AD]">
                            Divergence
                            <InfoTooltip iconClassName="text-[#7192A5]">
                              Short venue price minus long venue price.
                            </InfoTooltip>
                          </span>
                          <span className="text-[#7192A5]">Short - Long</span>
                        </div>
                        <div className="flex items-center justify-between pl-3">
                          <span className="text-[#7699AD]">Mark Price Difference</span>
                          <span className="text-white">
                            {formatPrice(markPriceDifference)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between pl-3">
                          <span className="text-[#7699AD]">Oracle Price Difference</span>
                          <span className="text-white">
                            {formatPrice(oraclePriceDifference)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between pl-3">
                          <span className="text-[#7699AD]">Index Price Difference</span>
                          <span className="text-white">
                            {formatPrice(indexPriceDifference)}
                          </span>
                        </div>
                        {arbDepthResult.paybackConservative != null && (
                          <div className="flex items-center justify-between">
                            <span className="text-[#7699AD]">Payback</span>
                            <span className="text-white">
                              {formatPaybackHours(
                                arbDepthResult.paybackOptimistic,
                                arbDepthResult.paybackConservative,
                              )}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                    {longFee && (
                      <div className="flex items-center justify-between">
                        <span className="text-[#7699AD] capitalize">
                          {longProtocol} Fees
                        </span>
                        <span className="text-white">
                          Maker: {Math.abs(longFee.makerFeeBps).toFixed(2)} bps
                          / Taker: {Math.abs(longFee.takerFeeBps).toFixed(2)}{" "}
                          bps
                        </span>
                      </div>
                    )}
                    {shortFee && (
                      <div className="flex items-center justify-between">
                        <span className="text-[#7699AD] capitalize">
                          {shortProtocol} Fees
                        </span>
                        <span className="text-white">
                          Maker: {Math.abs(shortFee.makerFeeBps).toFixed(2)} bps
                          / Taker: {Math.abs(shortFee.takerFeeBps).toFixed(2)}{" "}
                          bps
                        </span>
                      </div>
                    )}
                    {bothProtocolsSupported && longProtocol !== shortProtocol && (
                      <>
                        <Accordion type="single" collapsible className="w-full">
                          <AccordionItem
                            value="slippage-breakdown"
                            className="border-0"
                          >
                            <AccordionTrigger className="py-1 text-xs font-normal text-[#7699AD] hover:no-underline">
                              <div className="flex flex-1 items-center justify-between pr-2">
                                <span className="flex items-center gap-1">
                                  Total Slippage
                                  <InfoTooltip iconClassName="text-[#7192A5]">
                                    {slippageTooltipContent}
                                  </InfoTooltip>
                                </span>
                                <span className="text-white">
                                  {formatPctWithUsd(executionCostQuote?.totalSlippagePct)}
                                </span>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="flex flex-col gap-2 pt-1 text-xs shadow-none">
                              <div className="flex items-center justify-between">
                                <span className="text-[#7699AD]">
                                  Long Slippage
                                </span>
                                <span className="text-white">
                                  {formatPctWithUsd(executionCostQuote?.long.slippagePct)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-[#7699AD]">
                                  Short Slippage
                                </span>
                                <span className="text-white">
                                  {formatPctWithUsd(executionCostQuote?.short.slippagePct)}
                                </span>
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                        <div className="flex items-center justify-between">
                          <span className="text-[#7699AD]">
                            Total Execution Cost
                          </span>
                          <span className="text-white">
                            {formatPctWithUsd(executionCostQuote?.totalExecutionCostPct)}
                          </span>
                        </div>
                      </>
                    )}
                    {/* <div className="flex items-center justify-between">
                      <span className="text-[#7699AD]">Quote Status</span>
                      <span
                        className={
                          executionCostQuote?.isProfitable
                            ? "text-[#4ADE80]"
                            : "text-[#FF6B6B]"
                        }
                      >
                        {executionCostQuote?.isProfitable
                          ? "Profitable"
                          : "Skip"}
                      </span>
                    </div> */}
                    {/* {executionCostQuote?.warnings?.[0] && (
                      <div className="text-[11px] text-[#D9A441]">
                        Warning: {executionCostQuote.warnings[0]}
                      </div>
                    )} */}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>
        </div>
  );

  if (presentation === "page") {
    return (
      <div className="w-full min-w-0 overflow-hidden border border-[#0F1F30] bg-[#000D1E]">
        {content}
      </div>
    );
  }

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
        onDismiss={() => onOpenChange(false)}
      >
        {content}
      </DialogContent>
    </Dialog>
  );
};
