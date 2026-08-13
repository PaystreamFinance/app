"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSpotPerpMarkets } from "@/hooks/use-spotperp-market";
import { useBetaMode } from "@/hooks/use-beta-mode";
import {
  transformSpotPerpMarketsToRows,
  isSolanaNativeToken,
} from "@/lib/spotperp-utils";
import { MobileSpotPerpItem } from "../_components/strategies/mobile-spot-perp-item";
import { SpotTradeModal } from "@/app/spot-perp/_components/spot-trade-modal";
import type { SpotPerpMarket } from "@/lib/spotperp-api";

export default function SpotPerpPage() {
  const router = useRouter();
  const { betaMode } = useBetaMode();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (mounted && !betaMode) router.replace("/m/portfolio");
  }, [mounted, betaMode, router]);

  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [selectedMarket, setSelectedMarket] = useState<SpotPerpMarket | null>(
    null,
  );

  const { data: marketsData, isLoading, error } = useSpotPerpMarkets(
    mounted && betaMode,
  );

  const allData = useMemo(() => {
    return transformSpotPerpMarketsToRows(marketsData);
  }, [marketsData]);

  const filteredData = useMemo(() => {
    const eligible = allData.filter((row) => {
      if (!isSolanaNativeToken(row.symbol)) return false;

      const rates = [
        row.fundingRateDrift,
        row.fundingRatePacifica,
        row.fundingRateHyperliquid,
      ].filter(Boolean) as string[];

      if (rates.length < 2) return false;

      return rates.some((r) => {
        const num = parseFloat(r.replace("%", ""));
        return !isNaN(num) && num >= 0;
      });
    });
    return eligible.map((row, i) => ({ ...row, oiRank: i + 1 }));
  }, [allData]);

  if (!mounted || !betaMode) return null;

  return (
    <>
      <div className="sticky top-0 flex items-center gap-3 border-b border-[#0F1F30] bg-[#000C1D]/95 px-4 py-4 backdrop-blur-md">
        <button
          onClick={() => router.back()}
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
          Spot-Perp Hedge Screener
        </h1>
      </div>

      <div className="divide-y divide-[#0F1F30]">
        <div className="grid grid-cols-4 border-b border-[#0F1F30] bg-[#0D1E31] px-4 py-2 text-sm text-[#9EA5AD]">
          <div className="col-span-2">Symbol</div>
          <div className="text-center">Token Price</div>
          <div className="text-right">OI Rank</div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-[#7192A5]">
            Loading markets...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-[#FF6B6B]">
            Error loading markets:{" "}
            {error instanceof Error ? error.message : "Unknown error"}
          </div>
        ) : filteredData.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#7192A5]">
            No spot-perp opportunities found
          </div>
        ) : (
          filteredData.map((item) => (
            <MobileSpotPerpItem
              key={item.id}
              data={item}
              isExpanded={expandedItemId === item.id}
              onToggle={() =>
                setExpandedItemId((prev) => (prev === item.id ? null : item.id))
              }
              onClick={() => {
                setSelectedMarket(item.marketData);
              }}
            />
          ))
        )}
      </div>

      {selectedMarket && (
        <SpotTradeModal
          isMobile
          open={!!selectedMarket}
          onOpenChange={(open) => !open && setSelectedMarket(null)}
          marketData={selectedMarket}
        />
      )}
    </>
  );
}
