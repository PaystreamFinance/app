/* eslint-disable @next/next/no-img-element */
"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { cn } from "@/lib/utils";
import {
  PROTOCOL_LOGOS,
  PROTOCOL_LABELS,
  PROTOCOL_HOURS_PER_INTERVAL,
  isProtocolEnabled,
} from "@/lib/protocol-registry";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/hover-card";
import { SpotTradeModal } from "./spot-trade-modal";
import type { SpotPerpMarket } from "@/lib/spotperp-api";
import { ArrowUpRightIcon, ExternalLinkIcon } from "lucide-react";
import { getAssetLogo } from "@/lib/symbol-taxonomy";

/**
 * Trade button component for executing arbitrage trades
 */
const TradeButton: React.FC<{ marketData: SpotPerpMarket }> = ({
  marketData,
}) => {
  const [isModalOpen, setIsModalOpen] = React.useState(false);

  return (
    <>
      <div className="flex w-[100px] min-w-[100px] shrink-0 items-center justify-end">
        <Button
          variant="primary"
          onClick={() => setIsModalOpen(true)}
          className="font-ibm-plex-serif h-11 w-full cursor-pointer rounded-none border border-[#9CE0FF]/30 bg-[radial-gradient(circle_at_center,#142131_0%,#334D60_100%)] py-4 text-base font-medium text-[#9CE0FF] italic transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="text-[#9CE0FF]">Trade</span>
        </Button>
      </div>
      <SpotTradeModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        marketData={marketData}
      />
    </>
  );
};

/**
 * Funding rate cell with hover card showing detailed rate breakdown
 */
export type ProtocolKey = "drift" | "flash" | "pacifica" | "hyperliquid" | "aster" | "lighter" | "01";

/**
 * Token logo — taxonomy-declared local asset > /api/token/* > letter avatar.
 * See src/lib/symbol-taxonomy.ts to add new assets.
 */
export const TokenLogo: React.FC<{ symbol: string; className?: string }> = ({
  symbol,
  className = "h-6 w-6",
}) => {
  const taxonomy = getAssetLogo(symbol);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
  }, [symbol]);

  // Encode the symbol — upstream is API-derived, so an unexpected value like
  // "../admin" would otherwise resolve to a different route.
  const src = taxonomy?.src ?? `/api/token/${encodeURIComponent(symbol)}`;

  if (failed) {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#0F2A44] to-[#0A1B2E] ring-1 ring-inset ring-white/[0.06]",
          className,
        )}
      >
        <span className="text-[11px] font-semibold tracking-tight text-[#BCEBFF]">
          {symbol?.charAt(0) || "?"}
        </span>
      </div>
    );
  }

  return (
    <span
      className={cn(
        "relative inline-block shrink-0 overflow-hidden rounded-full ring-1 ring-inset ring-white/[0.06]",
        className,
      )}
      style={taxonomy?.bg ? { backgroundColor: taxonomy.bg } : undefined}
    >
      <img
        src={src}
        alt={symbol}
        className={cn(
          "block size-full",
          taxonomy?.bg ? "object-contain p-[14%]" : "object-cover",
        )}
        onError={() => setFailed(true)}
      />
    </span>
  );
};

function deriveRates(rawPct: number, hoursPerInterval: number) {
  // rawPct is the rate per interval as a percentage (e.g. -0.29308)
  const perHour = rawPct / hoursPerInterval;
  return {
    raw: rawPct * 100, // bps per interval
    "1hr": perHour * 100, // bps
    "8hr": perHour * 8 * 100,
    daily: perHour * 24 * 100,
    yearly: perHour * 24 * 365, // back to % for APY
  };
}

interface FundingRateCellProps {
  value: string | undefined;
  protocol: ProtocolKey;
  marketData: SpotPerpMarket;
}

const FundingRateCell: React.FC<FundingRateCellProps> = ({
  value,
  protocol,
  marketData,
}) => {
  if (!value || value === "-") {
    return (
      <div className="flex w-[120px] min-w-[120px] items-center">
        <span className="text-sm text-[#7192A5]">N/A</span>
      </div>
    );
  }

  const numValue = parseFloat(value.replace("%", ""));
  const isPositive = numValue >= 0;
  const hoursPerInterval = PROTOCOL_HOURS_PER_INTERVAL[protocol] ?? 1;
  const intervalLabel = `${hoursPerInterval}hr`;
  const rates = deriveRates(numValue, hoursPerInterval);

  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div className="flex w-[120px] min-w-[120px] cursor-pointer items-center rounded-none">
          <span
            className={cn(
              "text-sm font-normal underline decoration-dotted underline-offset-4",
              isPositive ? "text-[#FF6B6B]" : "text-[#4ADE80]",
            )}
          >
            {value}
          </span>
        </div>
      </HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        sideOffset={8}
        className="w-56 rounded-none border border-[#0F1F30] bg-[#041223] p-0 text-sm shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#0F1F30] px-4 py-2.5">
          <div className="flex items-center gap-2">
            <img
              src={PROTOCOL_LOGOS[protocol]}
              alt={PROTOCOL_LABELS[protocol]}
              className="h-4 w-4 shrink-0 rounded-full"
            />
            <span className="font-medium text-white">
              {PROTOCOL_LABELS[protocol]}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[#7192A5]">{marketData.symbol}</span>
          </div>
        </div>

        {/* Rates */}
        <div className="space-y-1.5 px-4 py-3 text-xs">
          <div className="flex justify-between">
            <span className="text-[#7192A5]">Interval:</span>
            <span className="text-white">{intervalLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#7192A5]">Raw:</span>
            <span className="text-white">{rates.raw.toFixed(1)} bps</span>
          </div>
          <div className="my-1.5 border-t border-[#0F1F30]" />
          <div className="flex justify-between">
            <span className="text-[#7192A5]">1hr:</span>
            <span className="text-white">{rates["1hr"].toFixed(1)} bps</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#7192A5]">8hr:</span>
            <span className="text-white">{rates["8hr"].toFixed(1)} bps</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#7192A5]">Daily:</span>
            <span className="text-white">{rates.daily.toFixed(1)} bps</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#7192A5]">Yearly:</span>
            <span className="text-white">{rates.yearly.toFixed(1)}% APY</span>
          </div>
          <div className="my-1.5 border-t border-[#0F1F30]" />
          <div className="flex items-center justify-center gap-1">
            <span className="font-ibm-plex-serif text-xs text-[#7192A5] italic">
              Click to open {PROTOCOL_LABELS[protocol]} in new tab
            </span>
            <ArrowUpRightIcon className="h-4 w-4 text-[#7192A5]" />
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};

export interface SpotPerpRowType {
  id: string;
  symbol: string;
  oiRank: number; // Index/rank based on funding rate
  tokenPrice: number; // Oracle price of the token in USD
  fundingRateDrift?: string;
  fundingRateFlash?: string;
  fundingRatePacifica?: string;
  fundingRateHyperliquid?: string;
  fundingRateApr?: string;
  fundingRatePct?: number;
  fees?: {
    drift?: {
      taker: string;
      maker: string;
    };
    flash?: {
      open: string;
      marginPerHour: string;
    };
  };
  marketData: SpotPerpMarket; // Store full market data for trade execution
}

export const getSpotPerpColumns = (): ColumnDef<SpotPerpRowType>[] => [
  {
    accessorKey: "symbol",
    header: () => (
      <p className="shrink-0 pl-8 text-lg font-light tracking-[-1%] text-[#7192A5]">
        Symbol
      </p>
    ),
    cell: ({ row }) => {
      const symbol = row.original.symbol;
      return (
        <div className="flex w-[200px] min-w-[200px] items-center gap-2.5 pl-7">
          <TokenLogo symbol={symbol} className="h-8 w-8" />
          <span className="shrink-0 text-lg font-normal tracking-[-1%] text-white">
            {symbol}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "oiRank",
    enableSorting: true,
    header: ({ column }) => (
      <button
        type="button"
        className="ml-5 flex shrink-0 cursor-pointer items-center gap-1 text-lg font-light tracking-[-1%] text-[#7192A5] hover:text-[#BBEBFF]"
        onClick={() => column.toggleSorting()}
      >
        OI Rank
        <span className="text-xs">
          {column.getIsSorted() === "asc"
            ? "▲"
            : column.getIsSorted() === "desc"
              ? "▼"
              : "⇅"}
        </span>
      </button>
    ),
    cell: ({ row }) => {
      return (
        <div className="ml-5 flex w-[120px] min-w-[120px] items-center justify-start">
          <span className="ml-5 text-lg font-normal text-white">
            {row.original.oiRank}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "tokenPrice",
    enableSorting: true,
    header: ({ column }) => (
      <button
        type="button"
        className="flex shrink-0 cursor-pointer items-center gap-1 text-lg font-light tracking-[-1%] text-[#7192A5] hover:text-[#BBEBFF]"
        onClick={() => column.toggleSorting()}
      >
        Token Price
        <span className="text-xs">
          {column.getIsSorted() === "asc"
            ? "▲"
            : column.getIsSorted() === "desc"
              ? "▼"
              : "⇅"}
        </span>
      </button>
    ),
    cell: ({ row }) => {
      const value = row.original.tokenPrice;
      // Format as USD price
      const formattedValue =
        typeof value === "number" && value > 0
          ? value >= 1
            ? `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : `$${value.toFixed(6)}`
          : "$0.00";
      return (
        <div className="flex w-[120px] min-w-[120px] items-center">
          <span className="text-sm font-normal text-white">
            {formattedValue}
          </span>
        </div>
      );
    },
  },
  ...(isProtocolEnabled("drift")
    ? [
        {
          accessorKey: "fundingRateDrift",
          header: () => (
            <div className="flex shrink-0 items-center gap-1.5">
              <img
                src={PROTOCOL_LOGOS["drift"]}
                alt={PROTOCOL_LABELS["drift"]}
                className="h-6 w-6 rounded-full"
              />
              <span className="text-lg font-light tracking-[-1%] text-[#7192A5]">
                {PROTOCOL_LABELS["drift"]}
              </span>
            </div>
          ),
          cell: ({ row }: { row: { original: SpotPerpRowType } }) => (
            <FundingRateCell
              value={row.original.fundingRateDrift}
              protocol="drift"
              marketData={row.original.marketData}
            />
          ),
        } satisfies ColumnDef<SpotPerpRowType>,
      ]
    : []),
  ...(isProtocolEnabled("pacifica")
    ? [
        {
          accessorKey: "fundingRatePacifica",
          header: () => (
            <div className="flex shrink-0 items-center gap-1.5">
              <img
                src={PROTOCOL_LOGOS["pacifica"]}
                alt={PROTOCOL_LABELS["pacifica"]}
                className="h-6 w-6 rounded-full"
              />
              <span className="text-lg font-light tracking-[-1%] text-[#7192A5]">
                {PROTOCOL_LABELS["pacifica"]}
              </span>
            </div>
          ),
          cell: ({ row }: { row: { original: SpotPerpRowType } }) => (
            <FundingRateCell
              value={row.original.fundingRatePacifica}
              protocol="pacifica"
              marketData={row.original.marketData}
            />
          ),
        } satisfies ColumnDef<SpotPerpRowType>,
      ]
    : []),
  ...(isProtocolEnabled("hyperliquid")
    ? [
        {
          accessorKey: "fundingRateHyperliquid",
          header: () => (
            <div className="flex shrink-0 items-center gap-3">
              <img
                src={PROTOCOL_LOGOS["hyperliquid"]}
                alt={PROTOCOL_LABELS["hyperliquid"]}
                className="h-6 w-6 rounded-full"
              />
              <span className="text-lg font-light tracking-[-1%] text-[#7192A5]">
                {PROTOCOL_LABELS["hyperliquid"]}
              </span>
            </div>
          ),
          cell: ({ row }: { row: { original: SpotPerpRowType } }) => (
            <FundingRateCell
              value={row.original.fundingRateHyperliquid}
              protocol="hyperliquid"
              marketData={row.original.marketData}
            />
          ),
        } satisfies ColumnDef<SpotPerpRowType>,
      ]
    : []),
  {
    id: "action",
    header: () => (
      <p className="w-full shrink-0 text-center text-lg font-light tracking-[-1%] text-[#7192A5]">
        Action
      </p>
    ),
    cell: ({ row }) => {
      return (
        <div className="flex w-full items-center justify-center">
          <TradeButton marketData={row.original.marketData} />
        </div>
      );
    },
  },
];
