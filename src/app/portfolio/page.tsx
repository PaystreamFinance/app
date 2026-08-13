"use client";

import type { NextPage } from "next";
import React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQueryClient } from "@tanstack/react-query";
import { usePrivy, useIdentityToken } from "@privy-io/react-auth";

import MaxWidthWrapper from "@/components/max-width-wrapper";
import { cn, formatUSDWithSubscript } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useSearchParams } from "next/navigation";
import { PositionsTable } from "@/components/pool-positions/positions-table";
import { DiscoverAndPoolTable } from "@/components/discover/discover-and-pool-table";
import PaginationAndFilters from "@/components/pagination-and-filters";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import { useBetaMode } from "@/hooks/use-beta-mode";
import { useSortedRows } from "@/hooks/use-sorted-rows";
import { fetchMultipleTokenMetadata } from "@/lib/token-metadata-cache";

import CommonAppLayout from "../_components/common-app-layout";
import { getUnifiedActivityColumns } from "./_components/unified-activity-columns";
import { useUnifiedActivity, triggerTransferActivityPoll } from "./hooks/use-unified-activity";
import { Search } from "lucide-react";
import { usePortfolioHandlers } from "./hooks/use-portfolio-handlers";
import {
  calculateEntryBasis,
  getStrategyPositionsColumns,
  type StrategyPositionRowType,
} from "./_components/strategy-positions-columns";
import {
  getSpotPerpPositionsColumns,
  type SpotPerpPositionRowType,
} from "./_components/spot-perp-positions-columns";
import {
  getTotalPortfolioColumns,
  type TotalPortfolioRowType,
} from "./_components/total-portfolio-columns";
import { useArbitragePositions } from "../strategies/hooks/use-arbitrage-positions";
import { useArbitrageMarkets } from "../strategies/hooks/use-arbitrage-markets";
import { useSpotPerpPositions } from "../strategies/hooks/use-spotperp-positions";
import {
  useFundingRateHistoryAll,
  buildIntervalMap,
} from "./hooks/use-funding-rate-history";
import { useFundingPaymentsHistory } from "./hooks/use-funding-payments-history";
import type {
  Position,
  ArbitrageMarket,
  PositionsResponse,
  ArbitragePositionPair,
} from "@/lib/arbitrage-api";
import { getEffectiveMargin } from "@/lib/protocol-registry";
import type { SpotPerpPosition } from "@/lib/spotperp-api";
import PortfolioSubTabs from "./_components/portfolio-sub-tabs";
import FundingPerpExpandedRow from "./_components/funding-perp-expanded-row";
import SpotPerpExpandedRow from "./_components/spot-perp-expanded-row";
import { TpSlDialog, type TpSlDialogProps } from "@/components/tp-sl-dialog";

const VALID_TABS = new Set(["positions", "funding-perp", "spot-perp", "activity"]);

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

function getMarketProtocolFundingRate(
  market: ArbitrageMarket | undefined,
  protocol: string | undefined,
): string | null {
  if (!market || !protocol) return null;
  const quote = (
    market as unknown as Record<string, { fundingRate?: string | null } | null | undefined>
  )[protocol];
  return quote?.fundingRate ?? null;
}

const PortfolioPage: NextPage = () => {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = React.useState<
    "positions" | "funding-perp" | "spot-perp" | "activity"
  >(initialTab && VALID_TABS.has(initialTab) ? (initialTab as any) : "positions");
  const [activitySearch, setActivitySearch] = React.useState("");
  const [activityPage, setActivityPage] = React.useState(1);
  const [activityRowsPerPage, setActivityRowsPerPage] = React.useState(10);
  const [positionSubTab] = React.useState<"positions">("positions");
  const [expandedFundingPerpRows, setExpandedFundingPerpRows] = React.useState<
    Set<string>
  >(new Set());
  const [expandedSpotPerpRows, setExpandedSpotPerpRows] = React.useState<
    Set<string>
  >(new Set());
  const [expandedTotalRows, setExpandedTotalRows] = React.useState<Set<string>>(
    new Set(),
  );
  const [tpSlPosition, setTpSlPosition] =
    React.useState<TpSlDialogProps["position"] | null>(null);
  const [, bumpAuthStorageVersion] = React.useReducer(
    (value: number) => value + 1,
    0,
  );
  const [spotTokenDecimalsMap, setSpotTokenDecimalsMap] = React.useState<
    Map<string, number>
  >(new Map());

  const queryClient = useQueryClient();
  const { getAccessToken, authenticated, user } = usePrivy();
  const { identityToken } = useIdentityToken();
  const { confirm, DialogComponent } = useConfirmDialog();
  const { betaMode } = useBetaMode();

  const { rows: unifiedActivityRows, summary: activitySummary, isPending: isUnifiedActivityPending } = useUnifiedActivity(authenticated);
  const unifiedActivityColumns = React.useMemo(() => getUnifiedActivityColumns(), []);
  const TYPE_LABELS: Record<string, string> = {
    open_arb: "open arb",
    close_arb: "close arb",
    auto_close: "auto close auto-close",
    liquidation: "liquidation",
    deposit: "deposit",
    withdrawal: "withdraw withdrawal",
    funding_settled: "funding settled",
    swap: "swap",
    error: "error failed",
  };

  const PROTOCOL_SEARCH_LABELS: Record<string, string> = {
    drift: "drift",
    pacifica: "pacifica",
    hyperliquid: "hyperliquid hype",
    aster: "aster",
    lighter: "lighter",
    "01": "01 exchange zero one",
    phoenix: "phoenix",
    privy: "privy",
    jupiter: "jupiter jup",
  };

  const filteredActivityRows = React.useMemo(() => {
    if (!activitySearch.trim()) return unifiedActivityRows;
    const q = activitySearch.toLowerCase();
    return unifiedActivityRows.filter((r) => {
      const typeLabel = TYPE_LABELS[r.type] ?? r.type;
      const fromLabel = PROTOCOL_SEARCH_LABELS[r.protocolFrom] ?? r.protocolFrom;
      const toLabel = r.protocolTo ? (PROTOCOL_SEARCH_LABELS[r.protocolTo] ?? r.protocolTo) : "";
      const note = r.protocolNote ?? "";

      return (
        r.id.toLowerCase().includes(q) ||
        r.token.toLowerCase().includes(q) ||
        r.value.toLowerCase().includes(q) ||
        fromLabel.toLowerCase().includes(q) ||
        toLabel.toLowerCase().includes(q) ||
        typeLabel.toLowerCase().includes(q) ||
        note.toLowerCase().includes(q)
      );
    });
  }, [unifiedActivityRows, activitySearch]);

  // Reset page when search changes
  React.useEffect(() => { setActivityPage(1); }, [activitySearch]);

  const totalActivityPages = Math.ceil(filteredActivityRows.length / activityRowsPerPage);
  // Sort the FULL filtered activity list before slicing the visible page —
  // otherwise sorting only orders the rows on the current page (TanStack
  // sorts the data prop, which is already paginated).
  const { sortedRows: sortedActivityRows, onSortingChange: handleActivitySortingChange } =
    useSortedRows(filteredActivityRows, { onPageReset: () => setActivityPage(1) });
  const paginatedActivityRows = React.useMemo(() => {
    const start = (activityPage - 1) * activityRowsPerPage;
    return sortedActivityRows.slice(start, start + activityRowsPerPage);
  }, [sortedActivityRows, activityPage, activityRowsPerPage]);

  // Store Privy tokens so strategy/spot-perp hooks can submit authed requests.
  // Only invalidate the positions caches when the token actually rotated —
  // unconditionally invalidating on every mount forces React Query to flip
  // `isFetching` true on every navigation back, which is what made the
  // portfolio feel like it reloads from scratch.
  React.useEffect(() => {
    const storeTokens = async () => {
      if (!authenticated || !user?.wallet?.address) return;
      try {
        const accessToken = await getAccessToken();
        if (accessToken) {
          sessionStorage.setItem("privy-access-token", accessToken);
        }
        const prevIdToken =
          typeof window !== "undefined"
            ? sessionStorage.getItem("privy-id-token")
            : null;
        const idTokenChanged =
          !!identityToken && identityToken !== prevIdToken;
        if (identityToken && typeof window !== "undefined") {
          sessionStorage.setItem("privy-id-token", identityToken);
          document.cookie = `privy-id-token=${identityToken}; path=/; max-age=86400; SameSite=Lax`;
        }
        bumpAuthStorageVersion();
        if (idTokenChanged) {
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["arbitrage-positions"] }),
            queryClient.invalidateQueries({ queryKey: ["spotperp-positions"] }),
          ]);
        }
      } catch (error) {
        console.error("Error storing Privy tokens:", error);
      }
    };
    void storeTokens();
  }, [
    authenticated,
    user?.wallet?.address,
    getAccessToken,
    identityToken,
    queryClient,
  ]);

  const strategyPositionsEnabled = authenticated;
  const {
    data: arbPositionsData,
    isPending: isStrategyPositionsPending,
    isFetching: isStrategyPositionsFetching,
    isBlocking: isStrategyPositionsBlocking,
    refetch: refetchStrategyPositions,
  } = useArbitragePositions(strategyPositionsEnabled);
  const { data: arbMarketsData } = useArbitrageMarkets(
    strategyPositionsEnabled,
  );
  const { data: allHistory } = useFundingRateHistoryAll();
  const intervalMap = React.useMemo(() => buildIntervalMap(allHistory), [allHistory]);
  // Funding payment history feeds (a) the header "Earned" pill next to PnL
  // and (b) the per-leg Funding Earned / Paid rows in FundingPerpExpandedRow.
  // One shared query — the expanded row reads the same cache via the hook.
  const {
    fundingEarned,
    fundingPaid,
    totalFundingUsd: fundingTotalUsd,
  } = useFundingPaymentsHistory(authenticated);
  const {
    data: spotPerpPositionsData,
    isPending: isSpotPerpPositionsPending,
    isFetching: isSpotPerpPositionsFetching,
    isBlocking: isSpotPerpPositionsBlocking,
    refetch: refetchSpotPerpPositions,
  } = useSpotPerpPositions(strategyPositionsEnabled);

  // Handlers
  const { handleCloseStrategyPosition, handleCloseSpotPerpPosition } =
    usePortfolioHandlers({
      authenticated,
      getAccessToken,
      confirm,
      refetchStrategyPositions,
      refetchSpotPerpPositions,
    });

  // Transform arbitrage positions into strategy position rows (Asset, Total Deposit, Long, Short, Fund Farm)
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
        getMarketProtocolFundingRate(market, pair.long.protocol) ??
        getMarketProtocolFundingRate(market, pair.short.protocol) ??
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
        publicId: pair.publicId,
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
        intervalMap,
        createdAt: pair.createdAt,
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
    // Group by symbol: for each symbol collect long and short.
    //
    // HIP-3 caveat: `BTC@hyperliquid` and `BTC@hl:hyna` are different markets,
    // so in principle a user can hold two distinct pairs on the same ticker.
    // /arb/positions/v2 covers HIP-3/HL paired venues and returns pre-matched
    // pairs — those land in `arbPositionsData.pairs` above and never reach
    // this fallback. Anything still in `positions` is from base venues, where
    // bucketing by symbol alone can collapse multi-pair-per-symbol cases into
    // one row (last-assigned wins). We log a dev-mode warning so the
    // collision is visible if it ever occurs in real usage.
    const bySymbol = new Map<
      string,
      {
        long?: { protocol: string; pos: Position };
        short?: { protocol: string; pos: Position };
      }
    >();
    for (const { protocol, pos } of flat) {
      const key = pos.symbol;
      let entry = bySymbol.get(key);
      if (!entry) {
        entry = {};
        bySymbol.set(key, entry);
      }
      if (pos.direction === "long") {
        if (entry.long && process.env.NODE_ENV === "development") {
          console.warn(
            `[portfolio] multi-pair collision on ${pos.symbol}: long leg overwritten (${entry.long.protocol} → ${protocol}). Base-venue fallback bucket — paired HIP-3/HL legs should arrive via /arb/positions/v2.`,
          );
        }
        entry.long = { protocol, pos };
      } else {
        if (entry.short && process.env.NODE_ENV === "development") {
          console.warn(
            `[portfolio] multi-pair collision on ${pos.symbol}: short leg overwritten (${entry.short.protocol} → ${protocol}). Base-venue fallback bucket — paired HIP-3/HL legs should arrive via /arb/positions/v2.`,
          );
        }
        entry.short = { protocol, pos };
      }
    }
    for (const [symbol, entry] of bySymbol) {
      const market = findPortfolioMarket(markets, symbol);
      const fundingRate =
        getMarketProtocolFundingRate(market, entry.long?.protocol) ??
        getMarketProtocolFundingRate(market, entry.short?.protocol) ??
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
        const totalDeposit = longMargin + shortMargin;
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
          totalDeposit,
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
          intervalMap,
        });
      } else if (entry.long ?? entry.short) {
        // Single-sided orphan leg — show it rather than silently dropping.
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
          intervalMap,
        });
      }
    }
    return rows;
  }, [arbPositionsData?.pairs, arbPositionsData?.positions, arbMarketsData, intervalMap]);

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

  const totalPortfolioRows: TotalPortfolioRowType[] = React.useMemo(() => {
    const rows: TotalPortfolioRowType[] = [];

    for (const r of strategyPositionsRows) {
      rows.push({
        id: r.id,
        _type: "funding-perp",
        _data: r,
        label: r.asset,
        deposit: r.originalTotalDeposit,
        pnlValue: 0,
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

  // Spot-perp data is beta-only. When beta is off the spot-perp query is
  // disabled (`enabled: betaMode && …`), which keeps `isPending` true and
  // `data` undefined. That state is fine — we just shouldn't treat it as
  // "still loading" and block the whole portfolio behind it.
  const spotPerpDataReady = !betaMode || !!spotPerpPositionsData;
  const isSpotPerpFirstLoad = betaMode && isSpotPerpPositionsBlocking;

  // Show a loader ONLY while we genuinely have no data (cold first load,
  // no localStorage cache). Once arbPositionsData is set — even if empty —
  // render the table immediately. Background refetches (isFetching) are
  // silent and never block the UI. Grace timers are gone: with pre-fetch
  // and localStorage cache, positions appear instantly on warm loads and
  // the brief skeleton on cold loads is better UX than a 20s spinner.
  const shouldShowTotalPortfolioSkeleton =
    (isStrategyPositionsBlocking || isSpotPerpFirstLoad) &&
    !arbPositionsData &&
    !spotPerpPositionsData;
  const shouldShowTotalPortfolioLoader =
    shouldShowTotalPortfolioSkeleton ||
    (authenticated &&
      activeTab === "positions" &&
      !arbPositionsData &&
      !spotPerpDataReady &&
      (isStrategyPositionsBlocking || isSpotPerpFirstLoad));
  const shouldShowFundingPositionsLoader =
    authenticated &&
    !arbPositionsData &&
    isStrategyPositionsBlocking;

  const fundingPerpMetrics = React.useMemo(() => {
    const totalInvested = strategyPositionsRows.reduce(
      (sum, r) => sum + r.originalTotalDeposit,
      0,
    );
    const activeCount = strategyPositionsRows.length;

    // Compute avg APY across all funding-perp positions
    const parseFR = (s?: string | null) => {
      if (!s) return null;
      const n = parseFloat(s.replace("%", ""));
      return isNaN(n) ? null : n;
    };
    const getRate = (market: typeof strategyPositionsRows[0]["marketData"], protocol: string) => {
      if (!market) return null;
      if (protocol === "drift") return parseFR(market.drift?.fundingRate);
      if (protocol === "pacifica") return parseFR(market.pacifica?.fundingRate);
      if (protocol === "hyperliquid") return parseFR(market.hyperliquid?.fundingRate);
      if (protocol === "aster") { const r = parseFR(market.aster?.fundingRate); const h = intervalMap[market.symbol ?? ""]?.aster ?? 8; return r !== null ? r / h : null; }
      if (protocol === "lighter") { const r = parseFR(market.lighter?.fundingRate); const h = intervalMap[market.symbol ?? ""]?.lighter ?? 8; return r !== null ? r / h : null; }
      if (protocol === "01") return parseFR(market["01"]?.fundingRate);
      const quote = (
        market as unknown as Record<string, { fundingRate?: string | null } | null | undefined>
      )[protocol];
      return parseFR(quote?.fundingRate);
    };

    const apys: number[] = [];
    for (const r of strategyPositionsRows) {
      const longRate = getRate(r.marketData, r.longProtocol);
      const shortRate = getRate(r.marketData, r.shortProtocol);
      if (longRate !== null && shortRate !== null) {
        apys.push(Math.abs(shortRate - longRate) * 24 * 365);
      }
    }
    const avgApy = apys.length > 0 ? apys.reduce((a, b) => a + b, 0) / apys.length : 0;

    return { totalInvested, activeCount, avgApy, totalPnL: arbPositionsData?.totalPnl ?? 0 };
  }, [strategyPositionsRows, intervalMap, arbPositionsData?.totalPnl]);

  const spotPerpMetrics = React.useMemo(() => {
    const totalInvested = spotPerpPositionsRows.reduce(
      (sum, r) => sum + r.totalUsd,
      0,
    );
    const activeCount = spotPerpPositionsRows.length;

    // Compute avg APY for spot-perp positions (short perp funding rate)
    const parseFR = (s?: string | null) => {
      if (!s) return null;
      const n = parseFloat(s.replace("%", ""));
      return isNaN(n) ? null : n;
    };
    const getRate = (market: ArbitrageMarket | undefined, protocol: string) => {
      if (!market) return null;
      if (protocol === "drift") return parseFR(market.drift?.fundingRate);
      if (protocol === "pacifica") return parseFR(market.pacifica?.fundingRate);
      if (protocol === "hyperliquid") return parseFR(market.hyperliquid?.fundingRate);
      if (protocol === "aster") { const r = parseFR(market.aster?.fundingRate); const h = intervalMap[market.symbol ?? ""]?.aster ?? 8; return r !== null ? r / h : null; }
      if (protocol === "lighter") { const r = parseFR(market.lighter?.fundingRate); const h = intervalMap[market.symbol ?? ""]?.lighter ?? 8; return r !== null ? r / h : null; }
      if (protocol === "01") return parseFR(market["01"]?.fundingRate);
      const quote = (
        market as unknown as Record<string, { fundingRate?: string | null } | null | undefined>
      )[protocol];
      return parseFR(quote?.fundingRate);
    };
    const markets = arbMarketsData ?? [];
    const apys: number[] = [];
    for (const r of spotPerpPositionsRows) {
      const market = markets.find((m) => m.symbol === r.asset);
      const rate = getRate(market, r.perpProtocol);
      if (rate !== null) {
        // Spot-perp earns funding when short perp rate is positive
        apys.push(Math.abs(rate) * 24 * 365);
      }
    }
    const avgApy = apys.length > 0 ? apys.reduce((a, b) => a + b, 0) / apys.length : 0;

    const totalPnL = spotPerpPositionsRows.reduce(
      (sum, r) => sum + (r.perpPnl ?? 0),
      0,
    );

    return { totalInvested, activeCount, avgApy, totalPnL };
  }, [spotPerpPositionsRows, arbMarketsData, intervalMap]);

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
            if (value?.decimals !== undefined) {
              merged.set(key, value.decimals);
            }
          });
          return merged;
        });
      } catch (err) {
        console.error("Failed to fetch spot token decimals:", err);
      }
    })();
  }, [spotPerpPositionsData?.positions, spotTokenDecimalsMap]);

  // Reset sub-tab and expanded rows when switching main tabs
  React.useEffect(() => {
    setExpandedFundingPerpRows(new Set());
    setExpandedSpotPerpRows(new Set());
    setExpandedTotalRows(new Set());
  }, [activeTab]);

  // Total value across all positions for the "positions" (Total Portfolio) tab
  const totalPortfolioValue = React.useMemo(() => {
    return fundingPerpMetrics.totalInvested + spotPerpMetrics.totalInvested;
  }, [fundingPerpMetrics.totalInvested, spotPerpMetrics.totalInvested]);

  const totalPortfolioPnl = React.useMemo(() => {
    return fundingPerpMetrics.totalPnL + spotPerpMetrics.totalPnL;
  }, [fundingPerpMetrics.totalPnL, spotPerpMetrics.totalPnL]);

  // Activity tab metrics
  const activityMetrics = React.useMemo(() => {
    const deposits = unifiedActivityRows.filter((r) => r.type === "deposit");
    const totalDeposited = deposits.reduce((s, r) => s + r.valueNum, 0);
    const totalPnl = activitySummary?.totalRealizedPnl ?? 0;
    const totalTrades = activitySummary?.totalPositions ?? unifiedActivityRows.filter((r) => r.type !== "deposit" && r.type !== "withdrawal").length;
    return { totalDeposited, totalPnl, totalTrades };
  }, [unifiedActivityRows, activitySummary]);

  return (
    <CommonAppLayout>
      {tpSlPosition && (
        <TpSlDialog
          open
          onClose={() => setTpSlPosition(null)}
          position={tpSlPosition}
          onSuccess={(applied) => {
            // Optimistically reflect just-set triggers in the positions cache
            // so the row updates immediately, before /arb/positions catches up.
            // Matched by (protocol, alias-aware market symbol, direction) —
            // RWA markets map across PAXG↔GOLD↔XAU so naïve string equality
            // would silently miss the leg and leave the row stuck on `_/_`.
            queryClient.setQueriesData<PositionsResponse>(
              { queryKey: ["arbitrage-positions"] },
              (prev) => {
                if (!prev) return prev;
                const target = tpSlPosition;
                const targetAliases = (() => {
                  const set = new Set<string>([target.market.toUpperCase()]);
                  for (const [marketSymbol, aliases] of Object.entries(
                    RWA_MARKET_SYMBOL_ALIASES,
                  )) {
                    if (aliases.some((a) => set.has(a))) {
                      set.add(marketSymbol);
                      aliases.forEach((a) => set.add(a));
                    }
                  }
                  return set;
                })();
                const sameLeg = (p: Position, protocol?: string) => {
                  if (target.protocol !== protocol) return false;
                  if (p.direction !== target.direction) return false;
                  const sym = p.symbol.replace(/-PERP$/i, "").toUpperCase();
                  return targetAliases.has(sym);
                };
                const patch = <T extends Position>(p: T): T =>
                  ({
                    ...p,
                    triggerPrices: {
                      ...(p.triggerPrices ?? {}),
                      ...(applied.takeProfitPrice !== undefined
                        ? { tp: applied.takeProfitPrice }
                        : {}),
                      ...(applied.stopLossPrice !== undefined
                        ? { sl: applied.stopLossPrice }
                        : {}),
                    },
                    ...(applied.takeProfitPrice !== undefined
                      ? { takeProfitPrice: applied.takeProfitPrice }
                      : {}),
                    ...(applied.stopLossPrice !== undefined
                      ? { stopLossPrice: applied.stopLossPrice }
                      : {}),
                  }) as T;
                const nextPositions = { ...prev.positions } as typeof prev.positions;
                (Object.keys(nextPositions) as Array<keyof typeof nextPositions>).forEach((proto) => {
                  const list = nextPositions[proto];
                  if (!Array.isArray(list)) return;
                  nextPositions[proto] = list.map((p) =>
                    sameLeg(p, proto as string) ? patch(p) : p,
                  ) as typeof list;
                });
                const nextPairs: ArbitragePositionPair[] | undefined = prev.pairs?.map(
                  (pair) => ({
                    ...pair,
                    long: sameLeg(pair.long, pair.long.protocol)
                      ? patch(pair.long)
                      : pair.long,
                    short: sameLeg(pair.short, pair.short.protocol)
                      ? patch(pair.short)
                      : pair.short,
                  }),
                );
                return { ...prev, positions: nextPositions, pairs: nextPairs };
              },
            );
            void refetchStrategyPositions();
            void refetchSpotPerpPositions();
          }}
        />
      )}
      <MaxWidthWrapper className="w-[min(99vw,100%-2rem)] px-8 pb-24">
        {!authenticated ? (
          <div className="flex h-[calc(100vh-200px)] w-full items-center justify-center">
            <div className="flex flex-col items-center gap-4 bg-[#041223] p-8 text-center">
              <svg
                className="h-16 w-16 text-[#7092A5]"
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
              <h2 className="text-2xl font-medium text-white">
                Connect Your Wallet
              </h2>
              <p className="max-w-md text-sm text-[#7092A5]">
                Please connect your wallet to view your portfolio, positions,
                and activity.
              </p>
            </div>
          </div>
        ) : (
          <div className="h-full min-h-[calc(100vh-145px)] w-full pb-8">
            <div className="mt-14 space-y-6">
              <div className="flex items-center justify-between gap-2 border-t border-b border-white/10">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    className={cn(
                      "h-auto cursor-pointer rounded-none border-0 border-b px-4 py-3 text-lg font-normal hover:bg-transparent hover:text-[#BCEAFF]",
                      activeTab === "positions"
                        ? "border-[#BCEAFF] text-[#BCEAFF]"
                        : "border-transparent bg-transparent text-[#7192A5]",
                    )}
                    onClick={() => setActiveTab("positions")}
                  >
                    Total Portfolio
                  </Button>
                  <Button
                    variant="ghost"
                    className={cn(
                      "h-auto cursor-pointer rounded-none border-0 border-b px-4 py-3 text-lg font-normal hover:bg-transparent hover:text-[#BCEAFF]",
                      activeTab === "funding-perp"
                        ? "border-[#BCEAFF] text-[#BCEAFF]"
                        : "border-transparent bg-transparent text-[#7192A5]",
                    )}
                    onClick={() => setActiveTab("funding-perp")}
                  >
                    Perp-Perp Arb
                  </Button>
                  {betaMode && (
                    <Button
                      variant="ghost"
                      className={cn(
                        "h-auto cursor-pointer rounded-none border-0 border-b px-4 py-3 text-lg font-normal hover:bg-transparent hover:text-[#BCEAFF]",
                        activeTab === "spot-perp"
                          ? "border-[#BCEAFF] text-[#BCEAFF]"
                          : "border-transparent bg-transparent text-[#7192A5]",
                      )}
                      onClick={() => setActiveTab("spot-perp")}
                    >
                      Spot-Perp Neutral
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    className={cn(
                      "h-auto cursor-pointer rounded-none border-0 border-b px-4 py-3 text-lg font-normal hover:bg-transparent hover:text-[#BCEAFF]",
                      activeTab === "activity"
                        ? "border-[#BCEAFF] text-[#BCEAFF]"
                        : "border-transparent bg-transparent text-[#7192A5]",
                    )}
                    onClick={() => { setActiveTab("activity"); triggerTransferActivityPoll(); }}
                  >
                    Activity
                  </Button>
                </div>
              </div>
            </div>
            <div className="mt-7 grid h-full grid-cols-12 gap-4">
              <div className="col-span-12">
                <div className="flex h-full flex-col gap-2">
                  {/* Primary metric */}
                  <div className="flex h-full items-center gap-1 bg-[#041223] p-4 px-8">
                    <div className="flex h-full w-full flex-col items-start justify-center gap-2">
                      <p className="mt-3 flex items-center gap-1 text-xs tracking-[-1%] text-nowrap text-[#7092A5]">
                        {activeTab === "activity"
                          ? "Total Deposited"
                          : activeTab === "funding-perp" || activeTab === "spot-perp"
                            ? "Total Invested"
                            : "Total Net Value"}
                      </p>
                      <p className="flex flex-col items-start gap-2 text-3xl font-medium tracking-[-1%] text-nowrap text-white">
                        {activeTab === "activity"
                          ? formatUSDWithSubscript(activityMetrics.totalDeposited, 2)
                          : activeTab === "funding-perp"
                            ? formatUSDWithSubscript(fundingPerpMetrics.totalInvested, 2)
                            : activeTab === "spot-perp"
                              ? formatUSDWithSubscript(spotPerpMetrics.totalInvested, 2)
                              : formatUSDWithSubscript(totalPortfolioValue, 2)}
                      </p>
                    </div>
                  </div>

                  {/* Secondary metrics */}
                  <div className="mt-2 flex w-full items-center gap-4">
                    <div className="flex w-full flex-col gap-2 bg-[#041223] p-4">
                      <p className="flex items-center gap-1 text-xs tracking-[-1%] text-[#7092A5]">
                        {activeTab === "activity"
                          ? "Total Trades"
                          : activeTab === "funding-perp"
                            ? "Active Perp"
                            : activeTab === "spot-perp"
                              ? "Active Perp"
                              : "Active Positions"}
                      </p>
                      <p className="text-3xl font-normal tracking-[-1%] text-white">
                        {activeTab === "activity"
                          ? activityMetrics.totalTrades
                          : activeTab === "funding-perp"
                            ? fundingPerpMetrics.activeCount
                            : activeTab === "spot-perp"
                              ? spotPerpMetrics.activeCount
                              : totalPortfolioRows.length}
                      </p>
                    </div>

                    <div className="flex w-full flex-col gap-2 bg-[#041223] p-4">
                      <p className="flex items-center gap-1 text-xs tracking-[-1%] text-[#7092A5]">
                        {activeTab === "spot-perp" ? "Avg APR" : "Total PnL"}
                      </p>
                      {activeTab === "activity" ? (
                        <p
                          className={cn(
                            "text-3xl font-normal tracking-[-1%] text-nowrap",
                            activityMetrics.totalPnl >= 0 ? "text-[#4ADE80]" : "text-[#FF6B6B]",
                          )}
                        >
                          {activityMetrics.totalPnl >= 0 ? "+" : ""}
                          {formatUSDWithSubscript(activityMetrics.totalPnl, 2)}
                        </p>
                      ) : activeTab === "positions" ? (
                        <p
                          className={cn(
                            "text-3xl font-normal tracking-[-1%] text-nowrap",
                            totalPortfolioPnl >= 0
                              ? "text-[#4ADE80]"
                              : "text-[#FF6B6B]",
                          )}
                        >
                          {totalPortfolioPnl >= 0 ? "+" : ""}
                          {formatUSDWithSubscript(totalPortfolioPnl, 2)}
                        </p>
                      ) : activeTab === "funding-perp" ? (
                        <p
                          className={cn(
                            "text-3xl font-normal tracking-[-1%] text-nowrap",
                            fundingPerpMetrics.totalPnL >= 0
                              ? "text-[#4ADE80]"
                              : "text-[#FF6B6B]",
                          )}
                        >
                          {fundingPerpMetrics.totalPnL >= 0 ? "+" : ""}
                          {formatUSDWithSubscript(
                            fundingPerpMetrics.totalPnL,
                            2,
                          )}
                        </p>
                      ) : (
                        <p
                          className={cn(
                            "text-3xl font-normal tracking-[-1%] text-nowrap",
                            spotPerpMetrics.avgApy >= 0
                              ? "text-[#4ADE80]"
                              : "text-[#FF6B6B]",
                          )}
                        >
                          {spotPerpMetrics.avgApy >= 0 ? "+" : ""}
                          {spotPerpMetrics.avgApy.toFixed(4)}%
                        </p>
                      )}
                    </div>

                    {/* Funding Earned — its own panel, only on tabs where
                        positions accrue funding (Total Portfolio + Perp-Perp
                        Arb). Subtitle shows the net (earned + paid) so the
                        paid side stays visible without crowding the headline
                        Earned figure. */}
                    {(activeTab === "positions" ||
                      activeTab === "funding-perp") && (
                      <div className="flex w-full flex-col gap-2 bg-[#041223] p-4">
                        <p className="flex items-center gap-1 text-xs tracking-[-1%] text-[#7092A5]">
                          Funding Earned
                        </p>
                        <p
                          className={cn(
                            "text-3xl font-normal tracking-[-1%] text-nowrap",
                            fundingEarned > 0 ? "text-[#4ADE80]" : "text-white",
                          )}
                        >
                          {fundingEarned > 0 ? "+" : ""}
                          {formatUSDWithSubscript(fundingEarned, 2)}
                        </p>
                        {(fundingPaid !== 0 || fundingTotalUsd !== fundingEarned) && (
                          <p className="text-xs tracking-tight text-[#7092A5]">
                            Net:{" "}
                            <span
                              className={cn(
                                "font-medium",
                                fundingTotalUsd >= 0
                                  ? "text-[#4ADE80]"
                                  : "text-[#FF6B6B]",
                              )}
                            >
                              {fundingTotalUsd >= 0 ? "+" : ""}
                              {formatUSDWithSubscript(fundingTotalUsd, 2)}
                            </span>
                            {fundingPaid < 0 && (
                              <>
                                {" · Paid: "}
                                <span className="font-medium text-[#FF6B6B]">
                                  -{formatUSDWithSubscript(Math.abs(fundingPaid), 2)}
                                </span>
                              </>
                            )}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Avg APR — keep visible on funding-perp tab as a
                        secondary metric (PnL took the primary slot above). */}
                    {activeTab === "funding-perp" && (
                      <div className="flex w-full flex-col gap-2 bg-[#041223] p-4">
                        <p className="flex items-center gap-1 text-xs tracking-[-1%] text-[#7092A5]">
                          Avg APR
                        </p>
                        <p
                          className={cn(
                            "text-3xl font-normal tracking-[-1%] text-nowrap",
                            fundingPerpMetrics.avgApy >= 0
                              ? "text-[#4ADE80]"
                              : "text-[#FF6B6B]",
                          )}
                        >
                          {fundingPerpMetrics.avgApy >= 0 ? "+" : ""}
                          {fundingPerpMetrics.avgApy.toFixed(4)}%
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-7">
              {/* Sub-tabs for tabs that need Positions/Closed */}
              {(activeTab === "funding-perp" ||
                activeTab === "spot-perp") && (
                <div className="mb-5">
                  <PortfolioSubTabs
                    activeSubTab={positionSubTab}
                    onSubTabChange={() => {}}
                  />
                </div>
              )}

              {/* === TOTAL PORTFOLIO (positions tab) === */}
              {activeTab === "positions" ? (
                shouldShowTotalPortfolioLoader ? (
                  <div className="flex h-64 items-center justify-center border border-[#0F1F30] bg-[#041223]">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#7092A5] border-t-transparent" />
                  </div>
                ) : totalPortfolioRows.length > 0 ? (
                  <PositionsTable
                    columns={getTotalPortfolioColumns({
                      onCloseFundingPerp: handleCloseStrategyPosition,
                      onCloseSpotPerp: handleCloseSpotPerpPosition,
                      onSetTpSlPosition: setTpSlPosition,
                    })}
                    data={totalPortfolioRows}
                    expandedRows={expandedTotalRows}
                    onToggleExpand={(id: string) => {
                      setExpandedTotalRows((prev) => {
                        const next = new Set(prev);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                      });
                    }}
                    renderExpandedContent={(row: TotalPortfolioRowType) => {
                      if (row._type === "funding-perp") {
                        return (
                          <FundingPerpExpandedRow
                            row={row._data}
                            onSetTpSlPosition={setTpSlPosition}
                          />
                        );
                      }
                      if (row._type === "spot-perp") {
                        return <SpotPerpExpandedRow row={row._data} />;
                      }
                      return null;
                    }}
                  />
                ) : (
                  <div className="flex h-64 items-center justify-center border border-[#0F1F30] bg-[#041223]">
                    <p className="text-sm text-[#7192A5]">
                      No active positions across any strategy.
                    </p>
                  </div>
                )
              ) : /* === FUNDING PERP === */
              activeTab === "funding-perp" ? (
                shouldShowFundingPositionsLoader ? (
                  <div className="flex h-64 items-center justify-center border border-[#0F1F30] bg-[#041223]">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#7092A5] border-t-transparent" />
                  </div>
                ) : strategyPositionsRows.length > 0 ? (
                  <PositionsTable
                    columns={getStrategyPositionsColumns({
                      onClosePosition: handleCloseStrategyPosition,
                      onSetTpSlPosition: setTpSlPosition,
                    })}
                    data={strategyPositionsRows}
                    expandedRows={expandedFundingPerpRows}
                    onToggleExpand={(id: string) => {
                      setExpandedFundingPerpRows((prev) => {
                        const next = new Set(prev);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                      });
                    }}
                    renderExpandedContent={(row: StrategyPositionRowType) => (
                      <FundingPerpExpandedRow
                        row={row}
                        onSetTpSlPosition={setTpSlPosition}
                      />
                    )}
                  />
                ) : (
                  <div className="flex h-64 items-center justify-center border border-[#0F1F30] bg-[#041223]">
                    <p className="text-sm text-[#7192A5]">
                      No funding rate farming positions. Open positions from the
                      Strategies page.
                    </p>
                  </div>
                )
              ) : /* === SPOT PERP === */
              activeTab === "spot-perp" ? (
                isSpotPerpFirstLoad && !spotPerpPositionsData ? (
                  <div className="flex h-64 items-center justify-center border border-[#0F1F30] bg-[#041223]">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#7092A5] border-t-transparent" />
                  </div>
                ) : spotPerpPositionsRows.length > 0 ? (
                  <PositionsTable
                    columns={getSpotPerpPositionsColumns({
                      onClosePosition: handleCloseSpotPerpPosition,
                      onSetTpSlPosition: setTpSlPosition,
                    })}
                    data={spotPerpPositionsRows}
                    expandedRows={expandedSpotPerpRows}
                    onToggleExpand={(id: string) => {
                      setExpandedSpotPerpRows((prev) => {
                        const next = new Set(prev);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                      });
                    }}
                    renderExpandedContent={(row: SpotPerpPositionRowType) => (
                      <SpotPerpExpandedRow row={row} />
                    )}
                  />
                ) : (
                  <div className="flex h-64 items-center justify-center border border-[#0F1F30] bg-[#041223]">
                    <p className="text-sm text-[#7192A5]">
                      No spot-perp positions. Open positions from the Spot Perp
                      page.
                    </p>
                  </div>
                )
              ) : /* === ACTIVITY === */
              activeTab === "activity" ? (
                <div className="flex flex-col gap-4 pb-16">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-normal text-white">Activity</h2>
                    <div className="flex items-center gap-2 border border-[#0F1F30] bg-[#041223] px-3 py-2">
                      <Search className="size-4 text-[#7092A5]" />
                      <input
                        value={activitySearch}
                        onChange={(e) => setActivitySearch(e.target.value)}
                        placeholder="Search"
                        className="w-[180px] bg-transparent text-sm text-white outline-none placeholder:text-[#7092A5]"
                      />
                    </div>
                  </div>
                  {isUnifiedActivityPending ? (
                    <div className="flex h-64 items-center justify-center border border-[#0F1F30] bg-[#041223]">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#7092A5] border-t-transparent" />
                    </div>
                  ) : filteredActivityRows.length > 0 ? (
                    <>
                      <DiscoverAndPoolTable
                        columns={unifiedActivityColumns}
                        data={paginatedActivityRows}
                        emptyMessage="No activity yet."
                        noBorders
                        stickyHeader
                        className="max-h-[calc(100vh-500px)] scroll-smooth"
                        manualSorting
                        onSortingChange={handleActivitySortingChange}
                      />
                      <PaginationAndFilters
                        totalPages={totalActivityPages}
                        currentPage={activityPage}
                        onPageChange={setActivityPage}
                        totalItems={filteredActivityRows.length}
                        canChangeRowsPerPage={filteredActivityRows.length > 10}
                        onRowsPerPageChange={(n) => { setActivityRowsPerPage(n); setActivityPage(1); }}
                        hideSetRowsPerPage={false}
                        rowsPerPageOptions={[10, 25, 50, 100]}
                        currentRowsPerPage={activityRowsPerPage}
                      />
                    </>
                  ) : (
                    <div className="flex h-64 items-center justify-center border border-[#0F1F30] bg-[#041223]">
                      <p className="text-sm text-[#7192A5]">No activity yet.</p>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </MaxWidthWrapper>

      {DialogComponent}
    </CommonAppLayout>
  );
};

export default PortfolioPage;
