"use client";

import type { NextPage } from "next";
import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useArbitrageMarkets } from "@/app/strategies/hooks/use-arbitrage-markets";
import { transformMarketsToRows, isArbableRow } from "@/lib/arbitrage-utils";
import { MobileArbitrageItem } from "../_components/strategies/mobile-arbitrage-item";
import { ArbitrageTradeModal } from "@/app/m/_components/strategies/arbitrage-trade-modal";
import type { ArbitrageMarket } from "@/lib/arbitrage-api";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { DowntimeNotice } from "@/components/downtime-notice";

type SortField = "oiRank" | "maxArb" | null;
type SortDir = "asc" | "desc" | null;
type RateDisplay = "bps" | "apy";

const ArbitragePage: NextPage = () => {
  const router = useRouter();
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [selectedArbitrageMarket, setSelectedArbitrageMarket] =
    useState<ArbitrageMarket | null>(null);
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [rateDisplay, setRateDisplay] = useState<RateDisplay>("apy");
  const [searchQuery, setSearchQuery] = useState("");

  // Listen for search from mobile navbar
  React.useEffect(() => {
    const handler = (e: Event) => {
      setSearchQuery((e as CustomEvent).detail as string);
    };
    window.addEventListener("navbar-search", handler);
    return () => window.removeEventListener("navbar-search", handler);
  }, []);

  const { data: marketsData, isLoading: isLoadingMarkets } =
    useArbitrageMarkets();
  const allData = useMemo(() => transformMarketsToRows(marketsData), [marketsData]);

  const filteredData = useMemo(() => {
    // Stable oiRank is assigned in `transformMarketsToRows`. Do not renumber
    // after filter — ranks must stay consistent as the arbable set flickers.
    let data = allData.filter(isArbableRow);
    if (searchQuery.trim()) {
      data = data.filter((row) =>
        row.searchableText.includes(searchQuery.toLowerCase()),
      );
    }
    return data;
  }, [allData, searchQuery]);

  const sortedData = useMemo(() => {
    if (!sortField || !sortDir) return filteredData;
    return [...filteredData].sort((a, b) => {
      const diff = (a[sortField] ?? 0) - (b[sortField] ?? 0);
      return sortDir === "asc" ? diff : -diff;
    });
  }, [filteredData, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDir === "asc") setSortDir("desc");
      else if (sortDir === "desc") { setSortField(null); setSortDir(null); }
      else setSortDir("asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronsUpDown className="size-3 text-[#7192A5]" />;
    if (sortDir === "asc") return <ChevronUp className="size-3 text-[#BCEAFF]" />;
    return <ChevronDown className="size-3 text-[#BCEAFF]" />;
  };

  return (
    <>
      {/* Header */}
      <div className="sticky top-0 z-50 flex items-center justify-between border-b border-[#0F1F30] bg-[#000C1D]/95 px-4 py-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex h-8 w-8 items-center justify-center bg-[#152d47] text-[#BBEBFF]"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h1 className="text-lg font-medium text-[#BCEBFF]">Perp-Perp Arb Screener</h1>
        </div>

        {/* BPS / APY toggle */}
        <div className="flex items-center border border-[#0F1F30]">
          <button
            onClick={() => setRateDisplay("bps")}
            className={cn(
              "px-3 py-1.5 text-xs transition-colors",
              rateDisplay === "bps" ? "bg-[#0F1F30] text-white" : "text-[#7192A5]",
            )}
          >
            BPS
          </button>
          <button
            onClick={() => setRateDisplay("apy")}
            className={cn(
              "px-3 py-1.5 text-xs transition-colors",
              rateDisplay === "apy" ? "bg-[#0F1F30] text-white" : "text-[#7192A5]",
            )}
          >
            APY
          </button>
        </div>
      </div>

      <div className="px-3 pt-3">
        <DowntimeNotice feature="arb-screener" />
      </div>

      <div className="divide-y divide-[#0F1F30]">
        {/* Sortable Header */}
        <div className="grid grid-cols-4 border-b border-[#0F1F30] bg-[#0D1E31] px-4 py-2 text-sm text-[#9EA5AD]">
          <div className="col-span-2">Symbol</div>
          <button
            onClick={() => handleSort("oiRank")}
            className="flex cursor-pointer items-center justify-center gap-1"
          >
            OI Rank <SortIcon field="oiRank" />
          </button>
          <button
            onClick={() => handleSort("maxArb")}
            className="flex cursor-pointer items-center justify-end gap-1"
          >
            Max ARB <SortIcon field="maxArb" />
          </button>
        </div>

        {isLoadingMarkets ? (
          <div className="p-8 text-center text-sm text-[#7192A5]">
            Loading markets...
          </div>
        ) : (
          sortedData.map((item) => (
            <MobileArbitrageItem
              key={item.id}
              data={item}
              isExpanded={expandedItemId === item.id}
              onToggle={() =>
                setExpandedItemId((prev) => (prev === item.id ? null : item.id))
              }
              onClick={() => {
                if (item.marketData) {
                  setSelectedArbitrageMarket(item.marketData);
                }
              }}
              rateDisplay={rateDisplay}
            />
          ))
        )}
      </div>

      {selectedArbitrageMarket && (
        <ArbitrageTradeModal
          open={!!selectedArbitrageMarket}
          onOpenChange={(open) => !open && setSelectedArbitrageMarket(null)}
          marketData={selectedArbitrageMarket}
        />
      )}
    </>
  );
};

export default ArbitragePage;
