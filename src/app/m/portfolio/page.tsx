"use client";

import React from "react";
import { usePrivy, useIdentityToken } from "@privy-io/react-auth";

import { cn, formatUSD, formatUSDWithSubscript } from "@/lib/utils";
import { ChevronDown, Search } from "lucide-react";
import { usePortfolioHandlers } from "../../portfolio/hooks/use-portfolio-handlers";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import { useBetaMode } from "@/hooks/use-beta-mode";
import { useUnifiedActivity } from "../../portfolio/hooks/use-unified-activity";
import type { UnifiedActivityRow } from "../../portfolio/_components/unified-activity-columns";
import { fetchMultipleTokenMetadata } from "@/lib/token-metadata-cache";
import { TokenLogo } from "@/app/strategies/_components/arbitrage-columns";

import PortfolioChartRaw from "../../portfolio/_components/portfolio-chart";
import { useArbitragePositions } from "../../strategies/hooks/use-arbitrage-positions";
import { useArbitrageMarkets } from "../../strategies/hooks/use-arbitrage-markets";
import { useSpotPerpPositions } from "../../strategies/hooks/use-spotperp-positions";
import type { ArbitrageMarket, Position } from "@/lib/arbitrage-api";
import type { SpotPerpPosition } from "@/lib/spotperp-api";
import {
  calculateEntryBasis,
  type StrategyPositionRowType,
} from "../../portfolio/_components/strategy-positions-columns";
import type { SpotPerpPositionRowType } from "../../portfolio/_components/spot-perp-positions-columns";
import type { TotalPortfolioRowType } from "../../portfolio/_components/total-portfolio-columns";

type PortfolioChartPoint = {
  timestamp: number;
  dateLabel: string;
  totalPnl: number;
};

function computeOriginalMargin(position: { entryPrice?: number; size?: { asset?: number }; leverage?: number; margin?: number }): number {
  const ep = Number(position.entryPrice);
  const sz = position.size?.asset != null ? Math.abs(position.size.asset) : null;
  const lv = position.leverage ?? null;
  if (ep > 0 && sz != null && sz > 0 && lv != null && lv > 0) return (ep * sz) / lv;
  return position.margin ?? 0;
}

const RWA_MARKET_SYMBOL_ALIASES: Record<string, string[]> = {
  GOLD: ["GOLD", "PAXG", "XAU"],
  SILVER: ["SILVER", "XAG"],
  "WTI CRUDE": ["WTI CRUDE", "WTI", "CL", "OIL"],
  "BRENT CRUDE": ["BRENT CRUDE", "BRENT", "BRENTOIL"],
};

function findPortfolioMarket(
  markets: ArbitrageMarket[],
  ...symbols: Array<string | undefined>
): ArbitrageMarket | undefined {
  const wanted = new Set(
    symbols
      .filter((symbol): symbol is string => Boolean(symbol))
      .map((symbol) => symbol.toUpperCase()),
  );
  for (const [marketSymbol, aliases] of Object.entries(RWA_MARKET_SYMBOL_ALIASES)) {
    if (aliases.some((alias) => wanted.has(alias))) {
      wanted.add(marketSymbol);
      aliases.forEach((alias) => wanted.add(alias));
    }
  }
  return markets.find((market) => wanted.has(market.symbol.toUpperCase()));
}

const PortfolioChart = PortfolioChartRaw as React.ComponentType<{
  data: PortfolioChartPoint[];
}>;

type ActiveTab =
  | "positions"
  | "funding-perp"
  | "spot-perp"
  | "activity";

const ALL_TABS: { label: string; value: ActiveTab; betaOnly?: boolean }[] = [
  { label: "Total Portfolio", value: "positions" },
  { label: "Perp-Perp Arb", value: "funding-perp" },
  { label: "Spot-Perp", value: "spot-perp", betaOnly: true },
  { label: "Activity", value: "activity" },
];
const EMPTY_POSITIONS_GRACE_MS = 20_000;

export default function MobilePortfolioPage() {
  const { authenticated, user, getAccessToken } = usePrivy();
  const { identityToken } = useIdentityToken();
  const { betaMode } = useBetaMode();
  const tabs = React.useMemo(() => ALL_TABS.filter((t) => !t.betaOnly || betaMode), [betaMode]);
  const [activeTab, setActiveTab] = React.useState<ActiveTab>("positions");
  const [activitySearch, setActivitySearch] = React.useState("");
  const { rows: activityRows, summary: activitySummary, isPending: isActivityPending } = useUnifiedActivity(authenticated);
  const filteredActivityRows = React.useMemo(() => {
    if (!activitySearch.trim()) return activityRows;
    const q = activitySearch.toLowerCase();
    return activityRows.filter((r) =>
      r.id.toLowerCase().includes(q) ||
      r.token.toLowerCase().includes(q) ||
      r.protocolFrom.toLowerCase().includes(q) ||
      (r.protocolTo?.toLowerCase().includes(q) ?? false) ||
      r.type.replace("_", " ").toLowerCase().includes(q),
    );
  }, [activityRows, activitySearch]);

  // Store Privy tokens so strategy/spot-perp hooks can run
  React.useEffect(() => {
    const storeTokens = async () => {
      if (authenticated && user?.wallet?.address) {
        try {
          const accessToken = await getAccessToken();
          if (accessToken) {
            sessionStorage.setItem("privy-access-token", accessToken);
          }
          if (identityToken && typeof window !== "undefined") {
            sessionStorage.setItem("privy-id-token", identityToken);
            document.cookie = `privy-id-token=${identityToken}; path=/; max-age=86400; SameSite=Lax`;
          }
        } catch (error) {
          console.error("Error storing Privy tokens:", error);
        }
      }
    };
    storeTokens();
  }, [authenticated, user?.wallet?.address, getAccessToken, identityToken]);

  const [spotTokenDecimalsMap, setSpotTokenDecimalsMap] = React.useState<
    Map<string, number>
  >(new Map());
  const [expandedRows, setExpandedRows] = React.useState<Set<string>>(
    new Set(),
  );

  const toggleExpand = React.useCallback((id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Reset expanded rows on tab change
  React.useEffect(() => {
    setExpandedRows(new Set());
  }, [activeTab]);

  const tabsScrollRef = React.useRef<HTMLDivElement>(null);

  // --- Data hooks ---

  // Strategy positions
  const {
    data: arbPositionsData,
    isPending: isStrategyPositionsPending,
    isFetching: isStrategyPositionsFetching,
    isBlocking: isStrategyPositionsBlocking,
    refetch: refetchStrategyPositions,
  } = useArbitragePositions(authenticated);
  const { data: arbMarketsData } = useArbitrageMarkets(authenticated);
  const {
    data: spotPerpPositionsData,
    isPending: isSpotPerpPositionsPending,
    isFetching: isSpotPerpPositionsFetching,
    isBlocking: isSpotPerpPositionsBlocking,
    refetch: refetchSpotPerpPositions,
  } = useSpotPerpPositions(authenticated);

  const { confirm, DialogComponent } = useConfirmDialog();
  const { handleCloseStrategyPosition, handleCloseSpotPerpPosition } = usePortfolioHandlers({
    authenticated,
    getAccessToken,
    confirm,
    refetchStrategyPositions,
    refetchSpotPerpPositions,
  });

  // --- Derived data ---

  // Strategy position rows
  const strategyPositionsRows: StrategyPositionRowType[] = React.useMemo(() => {
    const pairs = arbPositionsData?.pairs ?? [];
    const positions = arbPositionsData?.positions;
    const markets = arbMarketsData ?? [];
    const pairLegKey = (protocol: string, symbol: string, direction: string) =>
      `${protocol.toLowerCase()}|${symbol.toUpperCase()}|${direction}`;
    const pairedLegs = new Set<string>();
    const rows: StrategyPositionRowType[] = pairs.map((pair) => {
      const longSymbol = pair.long.symbol;
      const shortSymbol = pair.short.symbol;
      pairedLegs.add(pairLegKey(pair.long.protocol, longSymbol, "long"));
      pairedLegs.add(pairLegKey(pair.short.protocol, shortSymbol, "short"));
      const label =
        longSymbol === shortSymbol ? longSymbol : `${longSymbol} / ${shortSymbol}`;
      const market = findPortfolioMarket(
        markets,
        pair.symbol,
        longSymbol,
        shortSymbol,
      );
      const fundingRate =
        market?.drift?.fundingRate ??
        market?.flash?.fees?.marginPerHour ??
        market?.pacifica?.fundingRate ??
        market?.hyperliquid?.fundingRate ??
        market?.aster?.fundingRate ??
        market?.lighter?.fundingRate ??
        market?.["01"]?.fundingRate ??
        market?.phoenix?.fundingRate ??
        null;
      const longMargin = getEffectiveMargin(pair.long.protocol, pair.long.margin, pair.long.pnl);
      const shortMargin = getEffectiveMargin(pair.short.protocol, pair.short.margin, pair.short.pnl);
      const originalLongMargin = computeOriginalMargin(pair.long);
      const originalShortMargin = computeOriginalMargin(pair.short);
      const entryBasis = calculateEntryBasis(pair.long, pair.short);
      return {
        id: `strategy-${pair.pairId ?? pair.publicId ?? `${pair.long.protocol}:${longSymbol}|${pair.short.protocol}:${shortSymbol}`}`,
        pairId: pair.pairId,
        asset: label,
        closeMarket: pair.symbol ?? longSymbol,
        closeLegs: [
          {
            protocol: pair.long.protocol,
            market: longSymbol,
            direction: "long",
          },
          {
            protocol: pair.short.protocol,
            market: shortSymbol,
            direction: "short",
          },
        ],
        totalDeposit: longMargin + shortMargin,
        originalTotalDeposit: originalLongMargin + originalShortMargin,
        longProtocol: pair.long.protocol,
        longMargin,
        longSizeUsd: pair.long.size?.usd,
        shortProtocol: pair.short.protocol,
        shortMargin,
        shortSizeUsd: pair.short.size?.usd,
        ...entryBasis,
        fundingRate,
        longPosition: pair.long,
        shortPosition: pair.short,
        marketData: market,
      };
    });
    if (!positions) return rows;

    const flat: { protocol: string; pos: Position }[] = [];
    for (const [protocol, list] of Object.entries(positions)) {
      if (!Array.isArray(list) || list.length === 0) continue;
      for (const pos of list) {
        if (pairedLegs.has(pairLegKey(protocol, pos.symbol, pos.direction))) {
          continue;
        }
        flat.push({ protocol, pos });
      }
    }
    const bySymbol = new Map<
      string,
      {
        long?: { protocol: string; pos: Position };
        short?: { protocol: string; pos: Position };
      }
    >();
    for (const { protocol, pos } of flat) {
      let entry = bySymbol.get(pos.symbol);
      if (!entry) {
        entry = {};
        bySymbol.set(pos.symbol, entry);
      }
      if (pos.direction === "long") entry.long = { protocol, pos };
      else entry.short = { protocol, pos };
    }
    for (const [symbol, entry] of bySymbol) {
      const market = findPortfolioMarket(markets, symbol);
      const fundingRate =
        market?.drift?.fundingRate ??
        market?.flash?.fees?.marginPerHour ??
        market?.pacifica?.fundingRate ??
        market?.hyperliquid?.fundingRate ??
        market?.aster?.fundingRate ??
        market?.lighter?.fundingRate ??
        market?.["01"]?.fundingRate ??
        market?.phoenix?.fundingRate ??
        null;
      if (entry.long && entry.short) {
        const longMargin = getEffectiveMargin(entry.long.protocol, entry.long.pos.margin, entry.long.pos.pnl);
        const shortMargin = getEffectiveMargin(entry.short.protocol, entry.short.pos.margin, entry.short.pos.pnl);
        const originalTotalDeposit = computeOriginalMargin(entry.long.pos) + computeOriginalMargin(entry.short.pos);
        const entryBasis = calculateEntryBasis(entry.long.pos, entry.short.pos);
        rows.push({
          id: `strategy-${symbol}`,
          asset: symbol,
          closeMarket: symbol,
          closeLegs: [
            {
              protocol: entry.long.protocol,
              market: entry.long.pos.symbol,
              direction: "long",
            },
            {
              protocol: entry.short.protocol,
              market: entry.short.pos.symbol,
              direction: "short",
            },
          ],
          totalDeposit: longMargin + shortMargin,
          originalTotalDeposit,
          longProtocol: entry.long.protocol,
          longMargin,
          longSizeUsd: entry.long.pos.size?.usd,
          shortProtocol: entry.short.protocol,
          shortMargin,
          shortSizeUsd: entry.short.pos.size?.usd,
          ...entryBasis,
          fundingRate,
          longPosition: entry.long.pos,
          shortPosition: entry.short.pos,
          marketData: market,
        });
      } else if (entry.long ?? entry.short) {
        const side = (entry.long ?? entry.short)!;
        const sideMargin = getEffectiveMargin(side.protocol, side.pos.margin, side.pos.pnl);
        const originalSideMargin = computeOriginalMargin(side.pos);
        rows.push({
          id: `strategy-orphan-${symbol}-${side.protocol}`,
          asset: symbol,
          closeMarket: symbol,
          closeLegs: [{ protocol: side.protocol, market: side.pos.symbol, direction: side.pos.direction }],
          totalDeposit: sideMargin,
          originalTotalDeposit: originalSideMargin,
          longProtocol: entry.long ? side.protocol : "",
          longMargin: entry.long ? sideMargin : 0,
          longSizeUsd: entry.long ? side.pos.size?.usd : undefined,
          shortProtocol: entry.short ? side.protocol : "",
          shortMargin: entry.short ? sideMargin : 0,
          shortSizeUsd: entry.short ? side.pos.size?.usd : undefined,
          fundingRate,
          longPosition: entry.long?.pos,
          shortPosition: entry.short?.pos,
          marketData: market,
        });
      }
    }
    return rows;
  }, [arbPositionsData?.pairs, arbPositionsData?.positions, arbMarketsData]);

  // Spot-perp position rows
  const spotPerpPositionsRows: SpotPerpPositionRowType[] = React.useMemo(() => {
    const positions = spotPerpPositionsData?.positions ?? [];
    return positions.map((pos: SpotPerpPosition) => ({
      id: `spot-perp-${pos.tradeId}`,
      tradeId: pos.tradeId,
      asset: pos.market,
      totalUsd: pos.totalUsd,
      spotUsd: pos.spotUsd,
      perpProtocol: pos.perpProtocol,
      perpMarginUsd: pos.perpMarginUsd,
      perpNotionalUsd: pos.perpNotionalUsd,
      perpLeverage: pos.perpLeverage,
      perpPnl: pos.perpPosition?.pnl ?? 0,
      spotAmount: pos.spotAmount ?? "0",
      spotDecimals: spotTokenDecimalsMap.get(pos.spotTokenMint) ?? 9,
      spotTokenMint: pos.spotTokenMint ?? "",
      createdAt: pos.createdAt ?? "",
      perpEntryPrice: pos.perpPosition?.entryPrice ?? 0,
      perpSizeUsd: pos.perpPosition?.sizeUsd ?? 0,
    }));
  }, [spotPerpPositionsData?.positions, spotTokenDecimalsMap]);

  // Total portfolio rows (combines strategy + spot-perp)
  const totalPortfolioRows: TotalPortfolioRowType[] = React.useMemo(() => {
    const rows: TotalPortfolioRowType[] = [];
    for (const r of strategyPositionsRows) {
      rows.push({
        id: r.id,
        _type: "funding-perp",
        _data: r,
        label: r.asset,
        deposit: r.totalDeposit,
        pnlValue: (r.longPosition?.pnl ?? 0) + (r.shortPosition?.pnl ?? 0),
      });
    }
    for (const r of spotPerpPositionsRows) {
      rows.push({
        id: r.id,
        _type: "spot-perp",
        _data: r,
        label: r.asset,
        deposit: r.totalUsd,
        pnlValue: r.perpPnl,
      });
    }
    return rows;
  }, [strategyPositionsRows, spotPerpPositionsRows]);

  const fundingPerpMetrics = React.useMemo(() => {
    const totalInvested = strategyPositionsRows.reduce(
      (sum, r) => sum + r.totalDeposit,
      0,
    );
    const activeCount = strategyPositionsRows.length;
    const totalPnL = strategyPositionsRows.reduce((sum, r) => {
      const longPnl = r.longPosition?.pnl ?? 0;
      const shortPnl = r.shortPosition?.pnl ?? 0;
      return sum + longPnl + shortPnl;
    }, 0);
    return { totalInvested, activeCount, totalPnL };
  }, [strategyPositionsRows]);

  const spotPerpMetrics = React.useMemo(() => {
    const totalInvested = spotPerpPositionsRows.reduce(
      (sum, r) => sum + r.totalUsd,
      0,
    );
    const activeCount = spotPerpPositionsRows.length;
    const unrealizedPnl = spotPerpPositionsRows.reduce(
      (sum, r) => sum + r.perpPnl,
      0,
    );
    return { totalInvested, activeCount, unrealizedPnl };
  }, [spotPerpPositionsRows]);

  // Chart data (empty since activitiesSummaryResponse was removed)
  const portfolioChartData: PortfolioChartPoint[] = React.useMemo(() => {
    return [];
  }, []);

  // Fetch decimals for spot-perp token mints
  React.useEffect(() => {
    (async () => {
      const positions = spotPerpPositionsData?.positions ?? [];
      const missingMints = positions
        .map((p: SpotPerpPosition) => p.spotTokenMint)
        .filter((m: string) => m && !spotTokenDecimalsMap.has(m));
      if (missingMints.length === 0) return;
      try {
        const fetched = await fetchMultipleTokenMetadata(missingMints);
        setSpotTokenDecimalsMap((prev) => {
          const merged = new Map(prev);
          fetched.forEach((value, key) => {
            if (value?.decimals !== undefined) merged.set(key, value.decimals);
          });
          return merged;
        });
      } catch (err) {
        console.error("Failed to fetch spot token decimals:", err);
      }
    })();
  }, [spotPerpPositionsData?.positions, spotTokenDecimalsMap]);

  // --- Metric values per tab ---
  const totalNetValue = strategyPositionsRows.reduce((s, r) => s + r.totalDeposit, 0) + spotPerpPositionsRows.reduce((s, r) => s + r.totalUsd, 0);
  const totalPerpPnl = spotPerpPositionsRows.reduce((s, r) => s + r.perpPnl, 0);

  const metricCards = React.useMemo(() => {
    if (activeTab === "activity") {
      const deposits = activityRows.filter((r) => r.type === "deposit");
      const totalDeposited = deposits.reduce((s, r) => s + r.valueNum, 0);
      const totalPnl = activitySummary?.totalRealizedPnl ?? 0;
      const totalTrades = activitySummary?.totalPositions ?? activityRows.filter((r) => r.type !== "deposit" && r.type !== "withdrawal").length;
      return [
        {
          label: "Total Deposited",
          value: formatUSDWithSubscript(totalDeposited, 2),
          color: "text-white",
        },
        {
          label: "Total Trades",
          value: String(totalTrades),
          color: "text-white",
        },
        {
          label: "Total PnL",
          value: `${totalPnl >= 0 ? "+" : ""}${formatUSDWithSubscript(Math.abs(totalPnl), 2)}`,
          color: totalPnl >= 0 ? "text-[#4ADE80]" : "text-[#FF6B6B]",
        },
      ];
    }
    if (activeTab === "funding-perp") {
      return [
        {
          label: "Total Invested",
          value: formatUSDWithSubscript(fundingPerpMetrics.totalInvested, 2),
          color: "text-white",
        },
        {
          label: "Active Perp",
          value: String(fundingPerpMetrics.activeCount),
          color: "text-white",
        },
        {
          label: "Total PnL",
          value: `${fundingPerpMetrics.totalPnL >= 0 ? "+" : ""}${formatUSDWithSubscript(Math.abs(fundingPerpMetrics.totalPnL), 2)}`,
          color:
            fundingPerpMetrics.totalPnL >= 0
              ? "text-[#4ADE80]"
              : "text-[#FF6B6B]",
        },
      ];
    }
    if (activeTab === "spot-perp") {
      return [
        {
          label: "Total Invested",
          value: formatUSDWithSubscript(spotPerpMetrics.totalInvested, 2),
          color: "text-white",
        },
        {
          label: "Active Perp",
          value: String(spotPerpMetrics.activeCount),
          color: "text-white",
        },
        {
          label: "Unrealized PnL",
          value: `${spotPerpMetrics.unrealizedPnl >= 0 ? "+" : ""}${formatUSDWithSubscript(Math.abs(spotPerpMetrics.unrealizedPnl), 2)}`,
          color:
            spotPerpMetrics.unrealizedPnl >= 0
              ? "text-[#4ADE80]"
              : "text-[#FF6B6B]",
        },
      ];
    }
    return [
      {
        label: "Total Net Value",
        value: formatUSDWithSubscript(totalNetValue, 2),
        color: "text-white",
      },
      {
        label: "Current PnL",
        value: `${totalPerpPnl >= 0 ? "+" : ""}${formatUSDWithSubscript(Math.abs(totalPerpPnl), 2)}`,
        color:
          totalPerpPnl >= 0 ? "text-green-400" : "text-red-400",
      },
      {
        label: "Total PnL",
        value: `${totalPerpPnl >= 0 ? "+" : ""}${formatUSDWithSubscript(Math.abs(totalPerpPnl), 2)}`,
        color:
          totalPerpPnl >= 0 ? "text-green-400" : "text-red-400",
      },
    ];
  }, [activeTab, totalNetValue, totalPerpPnl, fundingPerpMetrics, spotPerpMetrics, activityRows, activitySummary]);

  type TableRow = {
    id: string;
    label: string;
    tickerLabel?: string;
    tokenXIcon?: string;
    tokenYIcon?: string;
    value: string;
    pnlValue: number;
    product: string;
    _type: "funding-perp" | "spot-perp" | "total";
    _data: StrategyPositionRowType | SpotPerpPositionRowType | TotalPortfolioRowType;
  };

  const tokenIconFromSymbol = (asset: string) =>
    `/api/token/${asset.replace(/-PERP$/i, "").toUpperCase()}`;

  const tickerLabelForStrategy = (row: StrategyPositionRowType) => {
    const longTicker = row.longPosition?.symbol;
    const shortTicker = row.shortPosition?.symbol;
    if (!longTicker && !shortTicker) return undefined;
    if (longTicker && shortTicker) {
      return longTicker === shortTicker ? longTicker : `${longTicker} ↔ ${shortTicker}`;
    }
    return longTicker ?? shortTicker;
  };

  const tableRows: TableRow[] = React.useMemo(() => {
    if (activeTab === "positions") {
      return totalPortfolioRows.map((row) => {
        const xIcon = tokenIconFromSymbol(row.label);
        const tickerLabel =
          row._type === "funding-perp"
            ? tickerLabelForStrategy(row._data)
            : undefined;
        return {
          id: row.id,
          label: row.label,
          tickerLabel,
          tokenXIcon: xIcon,
          tokenYIcon: undefined,
          value: formatUSDWithSubscript(row.deposit, 2),
          pnlValue: row.pnlValue,
          product:
            row._type === "funding-perp"
              ? "Perp-Perp"
              : "Spot-Perp",
          _type: "total" as const,
          _data: row,
        };
      });
    }
    if (activeTab === "funding-perp") {
      return strategyPositionsRows.map((row) => ({
        id: row.id,
        label: row.asset,
        tickerLabel: tickerLabelForStrategy(row),
        tokenXIcon: tokenIconFromSymbol(row.asset),
        tokenYIcon: undefined,
        value: formatUSDWithSubscript(row.totalDeposit, 2),
        pnlValue: (row.longPosition?.pnl ?? 0) + (row.shortPosition?.pnl ?? 0),
        product: `${row.longProtocol}/${row.shortProtocol}`,
        _type: "funding-perp" as const,
        _data: row,
      }));
    }
    if (activeTab === "spot-perp") {
      return spotPerpPositionsRows.map((row) => ({
        id: row.id,
        label: row.asset,
        tokenXIcon: tokenIconFromSymbol(row.asset),
        tokenYIcon: undefined,
        value: formatUSDWithSubscript(row.totalUsd, 2),
        pnlValue: row.perpPnl,
        product: row.perpProtocol,
        _type: "spot-perp" as const,
        _data: row,
      }));
    }
    return [];
  }, [
    activeTab,
    totalPortfolioRows,
    strategyPositionsRows,
    spotPerpPositionsRows,
  ]);

  const [emptyPositionsStateReady, setEmptyPositionsStateReady] =
    React.useState(false);

  React.useEffect(() => {
    if (!authenticated || activeTab === "activity" || tableRows.length > 0) {
      setEmptyPositionsStateReady(false);
      return;
    }
    setEmptyPositionsStateReady(false);
    const timer = window.setTimeout(
      () => setEmptyPositionsStateReady(true),
      EMPTY_POSITIONS_GRACE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [authenticated, activeTab, tableRows.length]);

  const isLoading =
    isStrategyPositionsBlocking ||
    isSpotPerpPositionsBlocking ||
    (authenticated &&
      activeTab !== "activity" &&
      tableRows.length === 0 &&
      (activeTab === "positions"
        ? !arbPositionsData ||
          !spotPerpPositionsData ||
          isStrategyPositionsPending ||
          isSpotPerpPositionsPending ||
          isStrategyPositionsFetching ||
          isSpotPerpPositionsFetching ||
          !emptyPositionsStateReady
        : activeTab === "funding-perp"
          ? !arbPositionsData ||
            isStrategyPositionsPending ||
            isStrategyPositionsFetching ||
            !emptyPositionsStateReady
          : activeTab === "spot-perp"
            ? !spotPerpPositionsData ||
              isSpotPerpPositionsPending ||
              isSpotPerpPositionsFetching ||
              !emptyPositionsStateReady
            : false));

  if (!authenticated) {
    return (
      <div className="flex h-[calc(100vh-80px)] w-full items-center justify-center px-4">
        <div className="flex flex-col items-center gap-4 bg-[#041223] p-8 text-center">
          <svg
            className="h-12 w-12 text-[#7092A5]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <title>Wallet connection required</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9"
            />
          </svg>
          <h2 className="text-xl font-medium text-white">
            Connect Your Wallet
          </h2>
          <p className="max-w-xs text-sm text-[#7092A5]">
            Connect your wallet to view your portfolio, positions, and activity.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000C1D] pb-20">
      {DialogComponent}
      {/* Scrollable Tabs */}
      <div
        ref={tabsScrollRef}
        className="scrollbar-none sticky top-0 z-10 overflow-x-auto border-b border-[#0F1F30] bg-[#000C1D]/95 backdrop-blur-md"
      >
        <div className="flex w-max min-w-full">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={cn(
                "whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                activeTab === tab.value
                  ? "border-[#BCEAFF] text-[#BCEAFF]"
                  : "border-transparent text-[#7192A5]",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bento Metric Cards */}
      <div className="flex gap-2 overflow-x-auto px-4 pt-4 pb-2">
        {metricCards.map((card, i) => (
          <div
            key={i}
            className="flex min-w-[120px] flex-1 flex-col gap-1 bg-[#041223] p-3"
          >
            <p className="text-[11px] tracking-tight text-[#7092A5]">
              {card.label}
            </p>
            <p className={cn("text-lg font-medium leading-tight", card.color)}>
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Chart — only show when data is available */}
      {portfolioChartData.length > 0 && (
        <div className="mx-4 mt-2 border border-[#0F1F30]">
          <PortfolioChart data={portfolioChartData} />
        </div>
      )}

      {/* Transaction History — hide on activity tab */}
      {activeTab !== "activity" && (
      <div className="mt-4 px-4">
        <h2 className="mb-3 text-base font-medium text-white">
          Transaction History
        </h2>

        {/* Table Header */}
        <div className="flex items-center border-b border-[#0F1F30] bg-[#0D1E31] px-3 py-2 text-[11px] text-[#7092A5]">
          <div className="w-5 shrink-0" />
          <div className="flex-4 pl-1">Token</div>
          <div className="flex-3 text-right">Value</div>
          <div className="flex-2 text-right">PnL</div>
          <div className="flex-3 text-right">Product</div>
        </div>

        {/* Table Rows */}
        {isLoading ? (
          <div className="space-y-0">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center border-b border-[#0F1F30] px-3 py-3"
              >
                <div className="w-5 shrink-0" />
                <div className="flex flex-4 items-center gap-2 pl-1">
                  <div className="h-6 w-6 animate-pulse rounded-full bg-[#0F1F30]" />
                  <div className="h-3 w-16 animate-pulse rounded bg-[#0F1F30]" />
                </div>
                <div className="flex flex-3 justify-end">
                  <div className="h-3 w-12 animate-pulse rounded bg-[#0F1F30]" />
                </div>
                <div className="flex flex-2 justify-end">
                  <div className="h-3 w-10 animate-pulse rounded bg-[#0F1F30]" />
                </div>
                <div className="flex flex-3 justify-end">
                  <div className="h-3 w-14 animate-pulse rounded bg-[#0F1F30]" />
                </div>
              </div>
            ))}
          </div>
        ) : tableRows.length === 0 ? (
          <div className="flex h-32 items-center justify-center border border-[#0F1F30] bg-[#041223]">
            <p className="text-sm text-[#7192A5]">No positions found</p>
          </div>
        ) : (
          <div>
            {tableRows.map((row) => {
              const isExpanded = expandedRows.has(row.id);
              return (
                <div key={row.id}>
                  {/* Row */}
                  <button
                    type="button"
                    onClick={() => toggleExpand(row.id)}
                    className={cn(
                      "flex w-full items-center border-b border-[#0F1F30] px-3 py-3 text-left transition-colors",
                      isExpanded && "bg-[#071a2e]",
                    )}
                  >
                    {/* Chevron */}
                    <div className="w-5 shrink-0">
                      <ChevronDown
                        className={cn(
                          "h-3.5 w-3.5 text-[#7092A5] transition-transform",
                          isExpanded && "rotate-180",
                        )}
                      />
                    </div>

                    {/* Token */}
                    <div className="flex flex-4 items-center gap-2 pl-1">
                      <div className="relative flex shrink-0 -space-x-1.5">
                        {row.tokenXIcon ? (
                          <img
                            src={row.tokenXIcon}
                            alt=""
                            width={22}
                            height={22}
                            className="h-[22px] w-[22px] rounded-full border border-[#0F1F30] object-cover"
                          />
                        ) : (
                          <div className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[#152d47] text-[9px] font-medium text-[#BCEAFF]">
                            {row.label?.charAt(0) ?? "?"}
                          </div>
                        )}
                        {row.tokenYIcon && (
                          <img
                            src={row.tokenYIcon}
                            alt=""
                            width={22}
                            height={22}
                            className="h-[22px] w-[22px] rounded-full border border-[#0F1F30] object-cover"
                          />
                        )}
                      </div>
                      <span className="max-w-[80px] truncate text-xs font-medium text-white">
                        {row.label}
                        {row.tickerLabel && (
                          <span className="block truncate text-[10px] font-normal leading-tight text-[#7192A5]">
                            {row.tickerLabel}
                          </span>
                        )}
                      </span>
                    </div>

                    {/* Value */}
                    <div className="flex-3 text-right text-xs text-white">
                      {row.value}
                    </div>

                    {/* PnL */}
                    <div
                      className={cn(
                        "flex-2 text-right text-xs",
                        row.pnlValue >= 0 ? "text-green-400" : "text-red-400",
                      )}
                    >
                      {row.pnlValue >= 0 ? "+" : ""}
                      {formatUSDWithSubscript(Math.abs(row.pnlValue), 2)}
                    </div>

                    {/* Product */}
                    <div className="flex flex-3 justify-end">
                      <span className="rounded bg-[#0D1E31] px-1.5 py-0.5 text-[10px] text-[#7092A5]">
                        {row.product}
                      </span>
                    </div>
                  </button>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <MobileExpandedRow
                      row={row}
                      onCloseStrategy={handleCloseStrategyPosition}
                      onCloseSpotPerp={handleCloseSpotPerpPosition}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* ═══ ACTIVITY TAB ═══ */}
      {activeTab === "activity" && (
        <div className="mt-4 px-4">
          {/* Search */}
          <div className="mb-3 flex items-center gap-2 border border-[#0F1F30] bg-[#041223] px-3 py-2">
            <Search className="size-4 text-[#7092A5]" />
            <input
              value={activitySearch}
              onChange={(e) => setActivitySearch(e.target.value)}
              placeholder="Search tokens, DEXes, status..."
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-[#7092A5]"
            />
          </div>

          {isActivityPending ? (
            <div className="space-y-0">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center border-b border-[#0F1F30] px-3 py-3">
                  <div className="h-3 w-16 animate-pulse rounded bg-[#0F1F30]" />
                  <div className="ml-auto h-3 w-12 animate-pulse rounded bg-[#0F1F30]" />
                </div>
              ))}
            </div>
          ) : filteredActivityRows.length === 0 ? (
            <div className="flex h-32 items-center justify-center border border-[#0F1F30] bg-[#041223]">
              <p className="text-sm text-[#7192A5]">No activity yet.</p>
            </div>
          ) : (
            <div>
              {filteredActivityRows.map((row) => (
                <MobileActivityRow key={row.id} row={row} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile Activity Row
// ---------------------------------------------------------------------------

const ACTIVITY_TYPE_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  open_arb: { label: "Open Arb", bg: "bg-[#102113]", text: "text-[#67E66A]" },
  close_arb: { label: "Close ARB", bg: "bg-[#242424]", text: "text-[#AFAFAF]" },
  auto_close: { label: "Auto-close", bg: "bg-[#191021]", text: "text-[#BC7EFF]" },
  liquidation: { label: "Liquidation", bg: "bg-[#211B10]", text: "text-[#FF9690]" },
  deposit: { label: "Deposit", bg: "bg-[#1F2110]", text: "text-[#D1FF90]" },
  withdrawal: { label: "Withdraw", bg: "bg-[#211B10]", text: "text-[#FF9690]" },
  funding_settled: { label: "Funding Settled", bg: "bg-[#191021]", text: "text-[#BC7EFF]" },
  swap: { label: "Swap", bg: "bg-[#1F2110]", text: "text-[#D1FF90]" },
  error: { label: "Failed to Open", bg: "bg-[#211210]", text: "text-[#FF6B6B]" },
};

const ACTIVITY_PROTOCOL_LABELS: Record<string, string> = {
  drift: "Drift",
  pacifica: "Pacifica",
  hyperliquid: "Hype",
  aster: "Aster",
  lighter: "Lighter",
  "01": "01",
  phoenix: "Phoenix",
  privy: "Privy",
  jupiter: "Jupiter",
};

const ACTIVITY_PROTOCOL_ICONS: Record<string, string> = {
  drift: "/images/markets-logo/drift.webp",
  pacifica: "/images/markets-logo/pacifica.webp",
  hyperliquid: "/images/markets-logo/hype.webp",
  aster: "/images/markets-logo/aster.webp",
  lighter: "/images/markets-logo/lighter.webp",
  "01": "/images/markets-logo/01.webp",
  phoenix: "/images/markets-logo/phoenix.svg",
  privy: "/icons/privy.svg",
  jupiter: "/icons/jup.svg",
};

function MobileActivityRow({ row }: { row: UnifiedActivityRow }) {
  const typeConfig = ACTIVITY_TYPE_CONFIG[row.type] ?? ACTIVITY_TYPE_CONFIG.close_arb ?? { label: row.type, bg: "bg-[#0F1F30]", text: "text-[#7192A5]" };
  const fromLabel = ACTIVITY_PROTOCOL_LABELS[row.protocolFrom] ?? row.protocolFrom;
  const toLabel = row.protocolTo ? (ACTIVITY_PROTOCOL_LABELS[row.protocolTo] ?? row.protocolTo) : null;

  const time = new Date(row.timestamp);
  const timeStr = time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  const dateStr = time.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div className="flex flex-col gap-2 border-b border-[#0F1F30] px-3 py-3">
      {/* Top: Token + Value + Type badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TokenLogo symbol={row.token} className="size-6" />
          <span className="text-sm font-medium text-white">{row.token}</span>
        </div>
        <div className="flex items-center gap-2">
          {row.isPending ? (
            <span className="text-sm text-[#D4940A]">Pending</span>
          ) : (
            <span className={cn("text-sm font-medium", row.isNegative ? "text-[#FF6B6B]" : row.valueSuffix ? "text-[#4ADE80]" : "text-white")}>
              {row.value}
              {row.valueSuffix && <span className="ml-0.5 text-[10px]">({row.valueSuffix})</span>}
            </span>
          )}
          {row.transferStatus && !row.isPending && (
            <span className={cn(
              "px-1.5 py-0.5 text-[10px] font-medium",
              row.transferStatus === "confirmed" ? "bg-[#102113] text-[#4ADE80]" :
              row.transferStatus === "failed" ? "bg-[#211210] text-[#FF6B6B]" :
              "bg-[#211B10] text-[#D4940A]"
            )}>
              {row.transferStatus === "confirmed" ? "Success" : row.transferStatus === "failed" ? "Failed" : "Pending"}
            </span>
          )}
          <span className={cn("px-1.5 py-0.5 text-[10px] font-medium", typeConfig.bg, typeConfig.text)}>
            {typeConfig.label}
          </span>
        </div>
      </div>

      {/* Bottom: Protocol + Time */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-xs text-[#7092A5]">
          {ACTIVITY_PROTOCOL_ICONS[row.protocolFrom] && (
            <img src={ACTIVITY_PROTOCOL_ICONS[row.protocolFrom]} alt="" className="size-3.5 rounded-full" />
          )}
          <span>{fromLabel}</span>
          {toLabel && (
            <>
              <span className="mx-0.5">→</span>
              {row.protocolTo && ACTIVITY_PROTOCOL_ICONS[row.protocolTo] && (
                <img src={ACTIVITY_PROTOCOL_ICONS[row.protocolTo]} alt="" className="size-3.5 rounded-full" />
              )}
              <span>{toLabel}</span>
            </>
          )}
          {row.protocolNote && <span className="text-[10px]">{row.protocolNote}</span>}
        </div>
        <span className="text-[11px] text-[#7092A5]">{timeStr} | {dateStr}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile-adapted expanded row content
// ---------------------------------------------------------------------------

import { PROTOCOL_ICONS, getEffectiveMargin } from "@/lib/protocol-registry";

function MobileExpandedRow({ row, onCloseStrategy, onCloseSpotPerp }: {
  row: { _type: string; _data: unknown };
  onCloseStrategy?: (pos: StrategyPositionRowType) => void;
  onCloseSpotPerp?: (pos: SpotPerpPositionRowType) => void;
}) {
  if (row._type === "total") {
    const totalRow = row._data as TotalPortfolioRowType;
    if (totalRow._type === "funding-perp")
      return <MobileFundingPerpExpanded data={totalRow._data as StrategyPositionRowType} onClose={onCloseStrategy} />;
    if (totalRow._type === "spot-perp")
      return <MobileSpotPerpExpanded data={totalRow._data as SpotPerpPositionRowType} onClose={onCloseSpotPerp} />;
    return null;
  }
  if (row._type === "funding-perp")
    return <MobileFundingPerpExpanded data={row._data as StrategyPositionRowType} onClose={onCloseStrategy} />;
  if (row._type === "spot-perp")
    return <MobileSpotPerpExpanded data={row._data as SpotPerpPositionRowType} onClose={onCloseSpotPerp} />;
  return null;
}

function ExpandedDetail({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="flex justify-between py-1">
      <span className="text-xs text-[#7092A5]">{label}</span>
      <span className={cn("text-xs text-white", valueClassName)}>{value}</span>
    </div>
  );
}

function formatSignedUsd(value: number, decimals = 2): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatUSD(Math.abs(value), decimals)}`;
}

function formatSignedBasisUsd(value: number): string {
  const absValue = Math.abs(value);
  const decimals = absValue > 0 && absValue < 0.01 ? 4 : 2;
  return formatSignedUsd(value, decimals);
}

function MobileFundingPerpExpanded({ data, onClose }: { data: StrategyPositionRowType; onClose?: (pos: StrategyPositionRowType) => void }) {
  const longPos = data.longPosition;
  const shortPos = data.shortPosition;
  const hasEntryBasis =
    typeof data.entryBasisPerUnit === "number" &&
    Number.isFinite(data.entryBasisPerUnit) &&
    typeof data.entryBasisUsd === "number" &&
    Number.isFinite(data.entryBasisUsd);
  return (
    <div className="border-b border-[#0F1F30] bg-[#0D1E31] px-4 py-4">
      {/* Close Button */}
      {onClose && (
        <button
          onClick={(e) => { e.stopPropagation(); onClose(data); }}
          className="mb-3 flex w-full items-center justify-center gap-2 border border-[#D86A47]/30 bg-[#1A1210] py-2.5 text-xs font-medium text-[#D86A47] transition-colors active:bg-[#2A1A14]"
        >
          Close Position
        </button>
      )}
      {hasEntryBasis && (
        <div className="mb-4 flex justify-center">
          <div className="flex min-w-[190px] items-center justify-center gap-2 border border-[#14304A] bg-[#0A1A2B] px-4 py-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#7192A5]">
              Entry Basis
            </span>
            <span
              className={cn(
                "text-sm font-semibold tabular-nums",
                data.entryBasisUsd! >= 0 ? "text-[#4ADE80]" : "text-[#FF6B6B]",
              )}
            >
              {formatSignedBasisUsd(data.entryBasisUsd!)}
            </span>
          </div>
        </div>
      )}
      {/* LONG */}
      <div className="mb-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="inline-block size-2 rounded-full bg-[#4ADE80]" />
          <span className="text-xs font-medium text-[#4ADE80]">LONG</span>
          {PROTOCOL_ICONS[data.longProtocol] && (
            <img src={PROTOCOL_ICONS[data.longProtocol]} alt="" className="ml-auto size-4" />
          )}
          <span className="text-xs text-[#7092A5] capitalize">{data.longProtocol}</span>
        </div>
        {longPos ? (
          <div>
            <ExpandedDetail label="Ticker" value={longPos.symbol} />
            <ExpandedDetail label="Entry price" value={`$${longPos.entryPrice}`} />
            <ExpandedDetail label="Position size" value={longPos.size?.asset ? `${longPos.size.asset.toFixed(3)} ${longPos.symbol ?? data.asset}` : "N/A"} />
            <ExpandedDetail label="Margin" value={formatUSD(data.longMargin)} />
            <ExpandedDetail label="Leverage" value={longPos.leverage ? `${longPos.leverage.toFixed(1)}x` : "N/A"} />
          </div>
        ) : (
          <p className="text-xs text-[#7192A5]">No long position</p>
        )}
      </div>
      <div className="my-3 h-px bg-[#7192A5]/20" />
      {/* SHORT */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <span className="inline-block size-2 rounded-full bg-[#FF6B6B]" />
          <span className="text-xs font-medium text-[#FF6B6B]">SHORT</span>
          {PROTOCOL_ICONS[data.shortProtocol] && (
            <img src={PROTOCOL_ICONS[data.shortProtocol]} alt="" className="ml-auto size-4" />
          )}
          <span className="text-xs text-[#7092A5] capitalize">{data.shortProtocol}</span>
        </div>
        {shortPos ? (
          <div>
            <ExpandedDetail label="Ticker" value={shortPos.symbol} />
            <ExpandedDetail label="Entry price" value={`$${shortPos.entryPrice}`} />
            <ExpandedDetail label="Position size" value={shortPos.size?.asset ? `${shortPos.size.asset.toFixed(3)} ${shortPos.symbol ?? data.asset}` : "N/A"} />
            <ExpandedDetail label="Margin" value={formatUSD(data.shortMargin)} />
            <ExpandedDetail label="Leverage" value={shortPos.leverage ? `${shortPos.leverage.toFixed(1)}x` : "N/A"} />
          </div>
        ) : (
          <p className="text-xs text-[#7192A5]">No short position</p>
        )}
      </div>
    </div>
  );
}

function MobileSpotPerpExpanded({ data, onClose }: { data: SpotPerpPositionRowType; onClose?: (pos: SpotPerpPositionRowType) => void }) {
  const createdDate = data.createdAt ? new Date(data.createdAt) : null;
  const daysHeld = createdDate
    ? Math.max(1, Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24)))
    : null;
  const rawAmt = parseFloat(data.spotAmount || "0");
  const spotAmt = rawAmt / Math.pow(10, data.spotDecimals);
  const currentPrice = spotAmt > 0 ? data.spotUsd / spotAmt : null;
  const gainLoss = data.spotUsd - data.perpMarginUsd;

  return (
    <div className="border-b border-[#0F1F30] bg-[#0D1E31] px-4 py-4">
      {/* Close Button */}
      {onClose && (
        <button
          onClick={(e) => { e.stopPropagation(); onClose(data); }}
          className="mb-3 flex w-full items-center justify-center gap-2 border border-[#D86A47]/30 bg-[#1A1210] py-2.5 text-xs font-medium text-[#D86A47] transition-colors active:bg-[#2A1A14]"
        >
          Close Position
        </button>
      )}
      {/* SPOT */}
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-block size-2 rounded-full bg-[#4ADE80]" />
        <span className="text-xs font-medium text-[#4ADE80]">SPOT</span>
        {PROTOCOL_ICONS[data.perpProtocol] && (
          <img src={PROTOCOL_ICONS[data.perpProtocol]} alt="" className="ml-auto size-4" />
        )}
        <span className="text-xs text-[#7092A5] capitalize">{data.perpProtocol}</span>
      </div>
      <ExpandedDetail label="Entry price" value={data.perpEntryPrice !== 0 ? `$${data.perpEntryPrice}` : "N/A"} />
      <ExpandedDetail label="Current price" value={currentPrice !== null ? `$${currentPrice}` : "N/A"} />
      <ExpandedDetail label="Holdings" value={spotAmt > 0 ? `${spotAmt < 0.01 ? spotAmt.toPrecision(3) : spotAmt.toFixed(2)} ${data.asset.replace("-PERP", "")}` : "N/A"} />
      <ExpandedDetail label="Position value" value={formatUSD(data.spotUsd)} />
      <ExpandedDetail
        label="Gain/Loss"
        value={`${gainLoss >= 0 ? "" : "-"}${formatUSD(Math.abs(gainLoss))}`}
        valueClassName={gainLoss >= 0 ? "text-[#4ADE80]" : "text-[#FF6B6B]"}
      />
      <div className="my-3 h-px bg-[#7192A5]/20" />
      <p className="mb-2 text-xs text-[#7192A5]">Details</p>
      <ExpandedDetail label="Entry date" value={createdDate ? createdDate.toLocaleDateString("en-GB", { day: "numeric", month: "numeric", year: "numeric" }) : "N/A"} />
      <ExpandedDetail label="Days held" value={daysHeld !== null ? `${daysHeld} days` : "N/A"} />
      <ExpandedDetail label="Margin used" value={formatUSD(data.perpMarginUsd)} />
    </div>
  );
}
