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
} from "@/app/strategies/_components/arbitrage-columns";
import PaginationAndFilters from "@/components/pagination-and-filters";
import { useArbitrageMarkets } from "@/app/strategies/hooks/use-arbitrage-markets";
import { Skeleton } from "@/components/ui/skeleton";
import { usePncRwaMode } from "@/hooks/use-pnc-rwa-mode";
import { transformMarketsToRows, isArbableRow } from "@/lib/arbitrage-utils";
import { DowntimeNotice } from "@/components/downtime-notice";

const DEFAULT_PAGE = 1;
const DEFAULT_ITEMS_PER_PAGE = 20;

export default function ArbitragePage() {
  const { pncRwaEnabled } = usePncRwaMode();
  const [searchQuery, setSearchQuery] = React.useState("");

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

  // Only surface rows that represent an arbable pair. Hides single-venue
  // listings (HL's HIP-3 baskets etc.). `oiRank` is already assigned in
  // `transformMarketsToRows` based on absolute OI order — we intentionally
  // do NOT renumber after filtering, so a row's rank stays stable when
  // other rows flicker in/out of the arbable set.
  const filteredData = useMemo(() => {
    let data = displayData.filter(isArbableRow);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      data = data.filter((row) => row.searchableText.includes(q));
    }
    return data;
  }, [displayData, searchQuery]);

  // Sort the full filtered dataset BEFORE pagination — see useSortedRows
  // for the rationale. Resets to page 1 on sort change.
  const { sortedRows: sortedData, onSortingChange: handleSortingChange } =
    useSortedRows(filteredData, { onPageReset: () => void setPage(1) });

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
          <div className="mb-7">
            <h1 className="text-2xl font-normal text-[#BCEBFF]">
              Perp-Perp Arb Screener
            </h1>
          </div>
          <div className="relative">
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : error && !marketsData ? (
              <div className="flex h-32 items-center justify-center text-sm text-[#7192A5]">
                Error loading markets:{" "}
                {error instanceof Error ? error.message : "Unknown error"}
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
                manualSorting
                onSortingChange={handleSortingChange}
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
        </div>
      </MaxWidthWrapper>
    </CommonAppLayout>
  );
}
