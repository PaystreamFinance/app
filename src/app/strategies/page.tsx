"use client";

import React, { useMemo } from "react";
import { parseAsInteger, useQueryState } from "nuqs";

import MaxWidthWrapper from "@/components/max-width-wrapper";
import { useSortedRows } from "@/hooks/use-sorted-rows";
import CommonAppLayout from "@/app/_components/common-app-layout";
import { DiscoverAndPoolTable } from "@/components/discover/discover-and-pool-table";
import {
  getArbitrageColumns,
  type ArbitrageRowType,
} from "./_components/arbitrage-columns";
import PaginationAndFilters from "@/components/pagination-and-filters";
import { Button } from "@/components/ui/button";
import { useArbitrageMarkets } from "./hooks/use-arbitrage-markets";
import { Skeleton } from "@/components/ui/skeleton";
import { useBetaMode } from "@/hooks/use-beta-mode";
import { usePncRwaMode } from "@/hooks/use-pnc-rwa-mode";
import { transformMarketsToRows, isArbableRow } from "@/lib/arbitrage-utils";
import { StrategyCard } from "./_components/strategy-card";
import { DowntimeNotice } from "@/components/downtime-notice";

const DEFAULT_PAGE = 1;
const DEFAULT_ITEMS_PER_PAGE = 20;

type StrategyType = "arbitrage" | null;

const ArbitrageScreenerPage: React.FC = () => {
  const { betaMode } = useBetaMode();
  const { pncRwaEnabled } = usePncRwaMode();
  const [selectedStrategy, setSelectedStrategy] = React.useState<StrategyType>(null);
  const [searchQuery, setSearchQuery] = React.useState("");

  // When beta is off, skip card selection — go straight to screener
  React.useEffect(() => {
    if (!betaMode && selectedStrategy === null) {
      setSelectedStrategy("arbitrage");
    }
  }, [betaMode, selectedStrategy]);

  // Listen for search from navbar
  React.useEffect(() => {
    const handler = (e: Event) => {
      const value = (e as CustomEvent).detail as string;
      setSearchQuery(value);
    };
    window.addEventListener("navbar-search", handler);
    return () => window.removeEventListener("navbar-search", handler);
  }, []);

  const [page, setPage] = useQueryState(
    "page",
    parseAsInteger.withDefault(DEFAULT_PAGE),
  );

  const [rowsPerPage, setRowsPerPage] = useQueryState(
    "rows",
    parseAsInteger.withDefault(DEFAULT_ITEMS_PER_PAGE),
  );

  // Fetch markets from API
  const { data: marketsData, isLoading, error } = useArbitrageMarkets();

  // Debug: Log markets data and errors
  React.useEffect(() => {
    if (error) {
      console.error("[ArbitrageScreenerPage] Error fetching markets:", error);
    }
    if (marketsData) {
      // Count markets with/without Drift data
      const marketsWithDrift = marketsData.filter((m) => m.drift !== null);
      const marketsWithoutDrift = marketsData.filter((m) => m.drift === null);

      console.log("[ArbitrageScreenerPage] Markets data received:", {
        totalCount: marketsData.length,
        marketsWithDrift: marketsWithDrift.length,
        marketsWithoutDrift: marketsWithoutDrift.length,
        sampleWithDrift: marketsWithDrift.slice(0, 3).map((m) => ({
          symbol: m.symbol,
          fundingRate: m.drift?.fundingRate,
        })),
        sampleWithoutDrift: marketsWithoutDrift.slice(0, 5).map((m) => ({
          symbol: m.symbol,
          hasPacifica: !!m.pacifica,
          hasHyperliquid: !!m.hyperliquid,
        })),
      });
    }
  }, [marketsData, error]);

  // Transform API data to table rows
  const allData = useMemo(() => {
    return transformMarketsToRows(marketsData);
  }, [marketsData]);

  const displayData = useMemo(() => {
    if (pncRwaEnabled) return allData;
    return allData
      .filter((row) => row.pairKind !== "pair")
      .map((row) => {
        if (row.pairKind !== "group") return row;
        const { subPools: _subPools, pairCount: _pairCount, ...rest } = row;
        return {
          ...rest,
          searchableText: [
            row.underlying,
            row.category,
            row.symbol,
            ...row.constituentSymbols,
            row.longLeg?.symbol ?? "",
            row.longLeg?.protocol ?? "",
            row.shortLeg?.symbol ?? "",
            row.shortLeg?.protocol ?? "",
          ].join(" ").toLowerCase(),
        };
      });
  }, [allData, pncRwaEnabled]);

  // Filter data based on search query
  const filteredData = useMemo(() => {
    let data = displayData;

    // Only surface rows that represent an arbable pair. Pair rows (RWA)
    // always qualify; single rows require ≥2 venues. Hides single-venue
    // listings (HL's HIP-3 baskets etc.) AND covers the "01" venue + any
    // future HIP-3 dex without listing each cell explicitly.
    //
    // `oiRank` is assigned absolutely in `transformMarketsToRows` (sorted
    // by total OI across all underlyings). We do NOT renumber after the
    // filter — stability matters so a user watching the screener doesn't
    // see their row's rank jump because another row's Aster rate
    // flickered in or out.
    data = data.filter(isArbableRow);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      data = data.filter((row) => row.searchableText.includes(q));
    }
    return data;
  }, [displayData, searchQuery]);

  // Sort the full filtered dataset BEFORE pagination — see useSortedRows
  // for the rationale. Resets to page 1 on sort change so the user lands
  // on the new top-ranked rows.
  const { sortedRows: sortedData, onSortingChange: handleSortingChange } =
    useSortedRows(filteredData, { onPageReset: () => void setPage(1) });

  // Paginate the sorted data
  const paginatedData = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    return sortedData.slice(start, end);
  }, [sortedData, page, rowsPerPage]);

  const totalPages = Math.ceil(filteredData.length / rowsPerPage);
  const totalItems = filteredData.length;

  const columns = useMemo(
    () => getArbitrageColumns({ showPncRwaPairs: pncRwaEnabled }),
    [pncRwaEnabled],
  );

  return (
    <CommonAppLayout>
      <MaxWidthWrapper className="h-full min-h-[calc(100vh-220px)] w-full px-8">
        <div className="mt-8 w-full space-y-6">
          <DowntimeNotice feature="arb-screener" />
          {selectedStrategy === null && (
            <div className="relative mt-4 aspect-[7.29/1] w-full overflow-hidden">
              <div className="absolute inset-0 opacity-80">
                <img
                  src="/images/strategies/strat-bigbg.webp"
                  className="h-full w-full object-cover"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                />
              </div>

              <div className="relative z-10 flex h-full flex-col justify-start px-6">
                <div className="flex w-full flex-col items-start justify-start gap-2 pt-6 pl-4">
                  <h1 className="text-6xl font-normal text-white">
                    Strategies
                  </h1>
                  <p className="max-w-[80%] text-sm leading-relaxed text-[#7192A5]">
                    Delta nutral strategies that generate yield from trading
                    fees and funding rates.
                  </p>
                </div>
              </div>
            </div>
          )}
          {/* Strategy Cards - Show initially when no strategy is selected */}
          {selectedStrategy === null && (
            <div className="grid grid-cols-4 gap-6 md:grid-cols-4">
              <StrategyCard
                icon="/arbitrage/arbitrage.svg"
                strategyName="Funding Rate Farming"
                expectedApy="12%"
                description="Discover arbitrage opportunities across different markets. Execute trades on Drift and Flash to capture funding rate differences and maximize returns."
                risks={[
                  "Market volatility",
                  "Slippage",
                  "Execution risk",
                  "Funding rate changes",
                ]}
                isSelected={false}
                onClick={() => setSelectedStrategy("arbitrage")}
              />
            </div>
          )}

          {/* Filters and Search - Show when strategy is selected */}
          {selectedStrategy !== null && (
            <div className="mb-7 flex w-full items-center justify-start gap-5">
              {/* Back Button and Strategy Name */}
              <div className="relative flex items-center gap-4">
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (!betaMode) {
                      window.history.back();
                      return;
                    }
                    setSelectedStrategy(null);
                    setSearchQuery("");
                    setPage(1);
                  }}
                  className="h-8 w-8 cursor-pointer rounded-none border border-[#0D1E31] bg-[#000D1E] text-base font-normal text-[#7192A5] hover:bg-[#0D1E31] hover:text-[#BBEBFF]"
                >
                  <svg className="size-6" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M10 12L6 8L10 4"
                      stroke="#7192A5"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </Button>
              </div>
              {/* Strategy Name */}
              <h1 className="text-2xl font-normal text-white">
                Funding Rate Farming Screener
              </h1>
            </div>
          )}

          {/* Table - Show when strategy is selected */}
          {selectedStrategy !== null && (
            <>
              <div className="relative">
                {isLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : error ? (
                  <div className="flex h-32 items-center justify-center text-sm text-[#7192A5]">
                    Error loading markets:{" "}
                    {error instanceof Error
                      ? error.message
                      : "Unknown error"}
                  </div>
                ) : (
                  <DiscoverAndPoolTable<ArbitrageRowType, any>
                    key={pncRwaEnabled ? "pnc-rwa-on" : "pnc-rwa-off"}
                    columns={columns}
                    data={paginatedData}
                    emptyMessage="No arbitrage opportunities found"
                    noBorders
                    rowDividers
                    stickyHeader
                    className="max-h-[calc(100vh-300px)]"
                    disableExpansion={!pncRwaEnabled}
                    // manualSorting=true tells the table to defer ordering to
                    // the parent's sortedData useMemo (which sorts the full
                    // dataset), instead of running getSortedRowModel locally
                    // on the already-paginated slice.
                    manualSorting
                    onSortingChange={handleSortingChange}
                    getRowId={(row) => row.id}
                  />
                )}
              </div>

              {/* Pagination */}
              <PaginationAndFilters
                totalPages={totalPages}
                currentPage={page}
                onPageChange={setPage}
                totalItems={totalItems}
                canChangeRowsPerPage={totalItems > 10}
                onRowsPerPageChange={setRowsPerPage}
                hideSetRowsPerPage={false}
                rowsPerPageOptions={[10, 15, 20, 30]}
                currentRowsPerPage={rowsPerPage}
              />
            </>
          )}
        </div>
      </MaxWidthWrapper>
    </CommonAppLayout>
  );
};

export default ArbitrageScreenerPage;
