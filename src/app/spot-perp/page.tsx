"use client";

import React, { useEffect, useMemo, useState } from "react";
import { parseAsInteger, useQueryState } from "nuqs";

import MaxWidthWrapper from "@/components/max-width-wrapper";
import { useSortedRows } from "@/hooks/use-sorted-rows";
import { useBetaMode } from "@/hooks/use-beta-mode";
import CommonAppLayout from "@/app/_components/common-app-layout";
import { DiscoverAndPoolTable } from "@/components/discover/discover-and-pool-table";
import {
  getSpotPerpColumns,
  type SpotPerpRowType,
} from "@/app/spot-perp/_components/spot-columns";
import PaginationAndFilters from "@/components/pagination-and-filters";
import { useSpotPerpMarkets } from "@/hooks/use-spotperp-market";
import { Skeleton } from "@/components/ui/skeleton";
import {
  transformSpotPerpMarketsToRows,
  isSolanaNativeToken,
} from "@/lib/spotperp-utils";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

const DEFAULT_PAGE = 1;
const DEFAULT_ITEMS_PER_PAGE = 20;

export default function SpotPerpPage() {
  const router = useRouter();
  const { betaMode } = useBetaMode();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (mounted && !betaMode) router.replace("/portfolio");
  }, [mounted, betaMode, router]);

  const [page, setPage] = useQueryState(
    "page",
    parseAsInteger.withDefault(DEFAULT_PAGE),
  );

  const [rowsPerPage, setRowsPerPage] = useQueryState(
    "rows",
    parseAsInteger.withDefault(DEFAULT_ITEMS_PER_PAGE),
  );

  // Fetch markets from API — only when beta mode is on so /arb/markets isn't
  // hit on behalf of the spot-perp page outside beta.
  const { data: marketsData, isLoading, error } = useSpotPerpMarkets(
    mounted && betaMode,
  );

  // Transform API data to table rows
  const allData = useMemo(() => {
    return transformSpotPerpMarketsToRows(marketsData);
  }, [marketsData]);

  // Filter: Solana-native tokens with all-positive funding rates
  const filteredData = useMemo(() => {
    const eligible = allData.filter((row) => {
      // Must be a Solana-native token
      if (!isSolanaNativeToken(row.symbol)) return false;

      // Collect available funding rates
      const rates = [
        row.fundingRateDrift,
        row.fundingRatePacifica,
        row.fundingRateHyperliquid,
      ].filter(Boolean) as string[];

      // Must have at least 2 funding rate data points
      if (rates.length < 2) return false;

      // at least one of the funding rates must be positive
      return rates.some((r) => {
        const num = parseFloat(r.replace("%", ""));
        return !isNaN(num) && num >= 0;
      });
    });
    // Assign contiguous OI rank over the eligible set
    return eligible.map((row, i) => ({ ...row, oiRank: i + 1 }));
  }, [allData]);

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

  const columns = useMemo(() => getSpotPerpColumns(), []);

  if (!mounted || !betaMode) return null;

  return (
    <CommonAppLayout>
      <MaxWidthWrapper className="h-full min-h-[calc(100vh-220px)] w-full px-8">
        <div className="mt-8 w-full space-y-6">
          <div className="mb-7 flex w-full items-center justify-start gap-5">
            {/* Back Button and Strategy Name */}
            <div className="relative flex items-center gap-4">
              <Button
                variant="ghost"
                onClick={() => router.back()}
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
            {/* Strategy Name - Centered */}
            <h1 className="text-2xl font-normal text-white">
              Spot-Perp Hedge Screener
            </h1>
          </div>
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
                {error instanceof Error ? error.message : "Unknown error"}
              </div>
            ) : (
              <DiscoverAndPoolTable<SpotPerpRowType, any>
                columns={columns}
                data={paginatedData}
                emptyMessage="No spot-perp opportunities found"
                noBorders
                stickyHeader
                className="max-h-[calc(100vh-300px)]"
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
