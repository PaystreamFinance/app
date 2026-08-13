"use client";

import React, { useState, useMemo } from "react";
import { useArbitrageMarkets } from "@/app/strategies/hooks/use-arbitrage-markets";
import { MobileStrategyCard } from "./strategies/mobile-strategy-card";
import { cn } from "@/lib/utils";
import { MobileArbitrageItem } from "./strategies/mobile-arbitrage-item";
import { ArbitrageTradeModal } from "@/app/m/_components/strategies/arbitrage-trade-modal";
import type { ArbitrageMarket } from "@/lib/arbitrage-api";
import type { ArbitrageRowType } from "@/app/strategies/_components/arbitrage-columns";
import { transformMarketsToRows, isArbableRow } from "@/lib/arbitrage-utils";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { DowntimeNotice } from "@/components/downtime-notice";

type StrategyType = "arbitrage" | null;
type SortField = "oiRank" | "maxArb" | null;
type SortDir = "asc" | "desc" | null;
type RateDisplay = "bps" | "apy";

export default function MobileStrategiesPage() {
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyType>(null);
  const [selectedArbitrageMarket, setSelectedArbitrageMarket] =
    useState<ArbitrageMarket | null>(null);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [rateDisplay, setRateDisplay] = useState<RateDisplay>("apy");

  const arbitrageCard = {
    icon: "/arbitrage/arbitrage.svg",
    strategyName: "Arbitrage Screener",
    expectedApy: "7.21%",
    description:
      "Discover arbitrage opportunities across different markets. Execute trades on Drift and Flash to capture funding rate differences and maximize returns.",
    risks: ["Impermanent loss", "Funding flips", "Hedge Errors", "Liquidation"],
  };

  const { data: marketsData, isLoading: isLoadingMarkets } =
    useArbitrageMarkets();

  // Use same transform as desktop
  const allData = useMemo(() => transformMarketsToRows(marketsData), [marketsData]);

  // Only surface arbable rows. Hides single-venue listings. oiRank is
  // already set absolutely in `transformMarketsToRows` — no renumbering.
  const filteredData = useMemo(() => {
    return allData.filter(isArbableRow);
  }, [allData]);

  // Sort
  const sortedData = useMemo(() => {
    if (!sortField || !sortDir) return filteredData;
    return [...filteredData].sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];
      const diff = (valA ?? 0) - (valB ?? 0);
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

  const renderContent = () => {
    if (selectedStrategy === "arbitrage") {
      return (
        <div>
          {/* BPS / APY toggle */}
          <div className="flex items-center justify-end px-4 pb-2">
            <div className="flex items-center border border-[#0F1F30]">
              <button
                onClick={() => setRateDisplay("bps")}
                className={cn(
                  "px-3 py-1.5 text-xs transition-colors",
                  rateDisplay === "bps"
                    ? "bg-[#0F1F30] text-white"
                    : "text-[#7192A5]",
                )}
              >
                BPS
              </button>
              <button
                onClick={() => setRateDisplay("apy")}
                className={cn(
                  "px-3 py-1.5 text-xs transition-colors",
                  rateDisplay === "apy"
                    ? "bg-[#0F1F30] text-white"
                    : "text-[#7192A5]",
                )}
              >
                APY
              </button>
            </div>
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
                    setExpandedItemId((prev) =>
                      prev === item.id ? null : item.id,
                    )
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
        </div>
      );
    }

    return null;
  };

  return (
    <div className="min-h-screen bg-[#000C1D] pb-20">
      {selectedStrategy === null ? (
        <div className="relative mt-4 aspect-[2.66/1] w-full overflow-hidden bg-[#000C1D] px-4">
          <div className="absolute inset-0 right-4 left-4 opacity-80">
            <img
              src="/images/strategies/strat-bg.webp"
              className="h-full w-full object-cover"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
          </div>
          <div className="relative z-10 flex h-full flex-col justify-center px-6">
            <div className="mb-1 flex w-full items-start justify-start">
              <h1 className="text-5xl font-normal text-white">Strategies</h1>
            </div>
            <p className="max-w-[80%] text-xs leading-relaxed text-[#7192A5]">
              Delta neutral strategies that generate yield from trading fees and
              funding rates.
            </p>
          </div>
        </div>
      ) : (
        <div className="sticky top-0 z-50 flex items-center gap-3 border-b border-[#0F1F30] bg-[#000C1D]/95 px-4 py-3 backdrop-blur-md">
          <button
            onClick={() => setSelectedStrategy(null)}
            className="flex h-8 w-8 items-center justify-center bg-[#152d47] text-[#BBEBFF]"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M10 12L6 8L10 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <h1 className="text-lg font-medium text-white">
            Arbitrage Screener
          </h1>
        </div>
      )}

      {selectedStrategy === "arbitrage" && (
        <div className="px-3 pt-3">
          <DowntimeNotice feature="arb-screener" />
        </div>
      )}

      <div
        className={cn(
          "relative z-20 mt-4 space-y-4",
          selectedStrategy === null ? "px-4" : "",
        )}
      >
        {selectedStrategy === null ? (
          <div className="space-y-4">
            <MobileStrategyCard
              {...arbitrageCard}
              onClick={() => setSelectedStrategy("arbitrage")}
            />
          </div>
        ) : (
          <div className="min-h-[500px]">{renderContent()}</div>
        )}
      </div>

      {selectedArbitrageMarket && (
        <ArbitrageTradeModal
          open={!!selectedArbitrageMarket}
          onOpenChange={(open) => !open && setSelectedArbitrageMarket(null)}
          marketData={selectedArbitrageMarket}
        />
      )}
    </div>
  );
}
