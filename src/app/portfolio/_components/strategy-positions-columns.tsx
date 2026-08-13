"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { X } from "lucide-react";
import { cn, formatUSD } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Position, ArbitrageMarket } from "@/lib/arbitrage-api";
import { type TpSlDialogProps } from "@/components/tp-sl-dialog";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/hover-card";

import { type ProtocolId, PROTOCOL_LABELS as protocolLabels, PROTOCOL_ICONS } from "@/lib/protocol-registry";
import { TokenLogo } from "@/app/strategies/_components/arbitrage-columns";

type ProtocolKey = ProtocolId;

function parseFundingRate(rate?: string | null): number | null {
  if (!rate) return null;
  const parsed = parseFloat(rate.replace("%", ""));
  if (isNaN(parsed) || Math.abs(parsed) < 0.00005) return null;
  return parsed;
}

function getProtocolRate(
  market: ArbitrageMarket | undefined,
  protocol: string,
  intervalMap?: Record<string, Partial<Record<"aster" | "lighter", number>>>,
): number | null {
  if (!market) return null;
  // All rates normalized to per-hour from live market data.
  // drift, hyperliquid, pacifica, flash: fixed 1hr intervals.
  // aster, lighter: variable; use intervalMap when available, else /8 fallback.
  if (protocol === "drift") return parseFundingRate(market.drift?.fundingRate);
  if (protocol === "pacifica")
    return parseFundingRate(market.pacifica?.fundingRate);
  if (protocol === "hyperliquid")
    return parseFundingRate(market.hyperliquid?.fundingRate);
  if (protocol === "aster") {
    const raw = parseFundingRate(market.aster?.fundingRate);
    const hours = intervalMap?.[market.symbol ?? ""]?.aster ?? 8;
    return raw !== null ? raw / hours : null;
  }
  if (protocol === "lighter") {
    const raw = parseFundingRate(market.lighter?.fundingRate);
    const hours = intervalMap?.[market.symbol ?? ""]?.lighter ?? 8;
    return raw !== null ? raw / hours : null;
  }
  if (protocol === "01") return parseFundingRate(market["01"]?.fundingRate);
  const quote = (
    market as unknown as Record<string, { fundingRate?: string | null } | null | undefined>
  )[protocol];
  return parseFundingRate(quote?.fundingRate);
}

export interface StrategyPositionRowType {
  id: string;
  asset: string;
  pairId?: number;
  publicId?: string;
  closeMarket?: string;
  closeLegs?: Array<{
    protocol: string;
    market: string;
    direction: "long" | "short";
  }>;
  totalDeposit: number;
  originalTotalDeposit: number;
  longProtocol: string;
  longMargin: number;
  longSizeUsd?: number;
  shortProtocol: string;
  shortMargin: number;
  shortSizeUsd?: number;
  entryBasisPerUnit?: number;
  entryBasisUsd?: number;
  entryBasisSize?: number;
  fundingRate: string | null;
  longPosition?: Position;
  shortPosition?: Position;
  marketData?: ArbitrageMarket;
  intervalMap?: Record<string, Partial<Record<"aster" | "lighter", number>>>;
  /** ISO string from the backend — used to filter funding payments to only
   *  those that accrued after the position was opened. */
  createdAt?: string;
}

export function calculateEntryBasis(
  longPosition: Position | undefined,
  shortPosition: Position | undefined,
): Pick<
  StrategyPositionRowType,
  "entryBasisPerUnit" | "entryBasisUsd" | "entryBasisSize"
> {
  const longEntry = Number(longPosition?.entryPrice);
  const shortEntry = Number(shortPosition?.entryPrice);
  const longSize = Math.abs(Number(longPosition?.size?.asset));
  const shortSize = Math.abs(Number(shortPosition?.size?.asset));
  if (
    !Number.isFinite(longEntry) ||
    !Number.isFinite(shortEntry) ||
    !Number.isFinite(longSize) ||
    !Number.isFinite(shortSize) ||
    longSize <= 0 ||
    shortSize <= 0
  ) {
    return {};
  }

  const entryBasisPerUnit = shortEntry - longEntry;
  const entryBasisSize = Math.min(longSize, shortSize);
  return {
    entryBasisPerUnit,
    entryBasisSize,
    entryBasisUsd: entryBasisPerUnit * entryBasisSize,
  };
}

function getTickerLabel(row: StrategyPositionRowType): string | null {
  const longTicker = row.longPosition?.symbol;
  const shortTicker = row.shortPosition?.symbol;
  if (!longTicker && !shortTicker) return null;
  if (longTicker && shortTicker) {
    return longTicker === shortTicker ? longTicker : `${longTicker} ↔ ${shortTicker}`;
  }
  return longTicker ?? shortTicker ?? null;
}

interface StrategyPositionsColumnsOptions {
  onClosePosition?: (row: StrategyPositionRowType) => void;
  onSetTpSlPosition?: (position: TpSlDialogProps["position"]) => void;
}

export function getStrategyPositionsColumns(
  options?: StrategyPositionsColumnsOptions,
): ColumnDef<StrategyPositionRowType>[] {
  const ActionsCell = ({ row }: { row: any }) => {
    const position: StrategyPositionRowType = row.original;

    return (
      <div className="flex w-[132px] items-center justify-end pr-4">
        <Button
          className="h-8 cursor-pointer rounded-lg border border-[#0D1E30] bg-[#041122] px-3 text-xs text-[#D86A47] transition-colors hover:bg-[#041122] hover:opacity-90"
          onClick={(e) => {
            e.stopPropagation();
            options?.onClosePosition?.(position);
          }}
          data-prevent-row-click
        >
          Close
          <X className="size-3 text-[#D86A47]" />
        </Button>
      </div>
    );
  };

  return [
    {
      accessorKey: "asset",
      header: () => (
        <p className="shrink-0 pl-8 text-xs font-normal tracking-[-1%] text-[#7092A5]">
          Pools
        </p>
      ),
      cell: ({ row }) => (
        <div className="flex w-[180px] min-w-[180px] items-center gap-3 pl-7">
          <TokenLogo
            symbol={row.original.longPosition?.symbol ?? row.original.asset}
            className="size-5"
          />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-normal text-white">
              {row.original.asset}
            </span>
            {getTickerLabel(row.original) && (
              <span className="truncate text-[11px] leading-tight text-[#7192A5]">
                {getTickerLabel(row.original)}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "originalTotalDeposit",
      header: () => (
        <p className="shrink-0 text-xs font-normal tracking-[-1%] text-[#7092A5]">
          Deposit
        </p>
      ),
      cell: ({ row }) => (
        <div className="flex w-[120px] min-w-[120px] items-center">
          <span className="text-sm font-normal text-white">
            {formatUSD(row.original.originalTotalDeposit)}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "longProtocol",
      header: () => (
        <p className="shrink-0 text-xs font-normal tracking-[-1%] text-[#7092A5]">
          Position A (Long)
        </p>
      ),
      cell: ({ row }) => {
        const { longProtocol, longMargin, longPosition } = row.original;
        const icon = PROTOCOL_ICONS[longProtocol];
        return (
          <div className="flex w-[180px] min-w-[180px] items-center gap-2">
            {icon && <img src={icon} alt={longProtocol} className="size-5" />}
            <div className="flex min-w-0 flex-col">
              <span className="text-sm font-normal text-[#4ADE80]">
                {formatUSD(longMargin)}
              </span>
              {longPosition?.symbol && (
                <span className="truncate text-[11px] leading-tight text-[#7192A5]">
                  {longPosition.symbol}
                </span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "shortProtocol",
      header: () => (
        <p className="shrink-0 text-xs font-normal tracking-[-1%] text-[#7092A5]">
          Position B (Short)
        </p>
      ),
      cell: ({ row }) => {
        const { shortProtocol, shortMargin, shortPosition } = row.original;
        const icon = PROTOCOL_ICONS[shortProtocol];
        return (
          <div className="flex w-[180px] min-w-[180px] items-center gap-2">
            {icon && <img src={icon} alt={shortProtocol} className="size-5" />}
            <div className="flex min-w-0 flex-col">
              <span className="text-sm font-normal text-[#FF6B6B]">
                {formatUSD(shortMargin)}
              </span>
              {shortPosition?.symbol && (
                <span className="truncate text-[11px] leading-tight text-[#7192A5]">
                  {shortPosition.symbol}
                </span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "fundingRate",
      header: () => (
        <p className="shrink-0 text-xs font-normal tracking-[-1%] text-[#7092A5]">
          Apy
        </p>
      ),
      cell: ({ row }) => {
        const { longProtocol, shortProtocol, marketData, intervalMap } = row.original;
        const longRate = getProtocolRate(marketData, longProtocol, intervalMap);
        const shortRate = getProtocolRate(marketData, shortProtocol, intervalMap);
        if (longRate === null || shortRate === null) {
          return (
            <div className="flex w-[120px] min-w-[120px] items-center">
              <span className="text-sm text-[#7192A5]">N/A</span>
            </div>
          );
        }
        const maxArb = Math.abs(shortRate - longRate);
        const apy = maxArb * 24 * 365;
        const bps1hr = maxArb * 10000;
        const bps8hr = bps1hr * 8;
        const bpsDaily = bps1hr * 24;

        return (
          <HoverCard openDelay={150} closeDelay={100}>
            <HoverCardTrigger asChild>
              <div className="flex w-[120px] min-w-[120px] cursor-pointer items-center">
                <span
                  className={cn(
                    "text-sm font-normal underline decoration-dotted underline-offset-4",
                    apy >= 0 ? "text-[#4ADE80]" : "text-[#FF6B6B]",
                  )}
                >
                  {apy.toFixed(2)}%
                </span>
              </div>
            </HoverCardTrigger>
            <HoverCardContent
              side="bottom"
              sideOffset={8}
              className="w-56 rounded-none border border-[#0F1F30] bg-[#041223] p-0 text-sm shadow-xl"
            >
              <div className="flex items-center justify-between border-b border-[#0F1F30] px-4 py-2.5">
                <span className="font-medium text-white">
                  {row.original.asset}
                </span>
                <span className="text-[#7192A5]">Spread</span>
              </div>
              <div className="space-y-1.5 px-4 py-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#7192A5]">1hr:</span>
                  <span className="text-white">{bps1hr.toFixed(2)} bps</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#7192A5]">8hr:</span>
                  <span className="text-white">{bps8hr.toFixed(2)} bps</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#7192A5]">Daily:</span>
                  <span className="text-white">{bpsDaily.toFixed(2)} bps</span>
                </div>
                <div className="my-1.5 border-t border-[#0F1F30]" />
                <div className="flex justify-between">
                  <span className="text-[#7192A5]">APY:</span>
                  <span className="text-[#4ADE80]">{apy.toFixed(2)}%</span>
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>
        );
      },
    },
    {
      id: "liquidation",
      header: () => (
        <p className="shrink-0 text-xs font-normal tracking-[-1%] text-[#7092A5]">
          Liquidation
        </p>
      ),
      cell: ({ row }) => {
        const { longPosition, shortPosition } = row.original;
        const liqPrice = (pos: Position | undefined) => {
          if (!pos || !pos.entryPrice || !pos.leverage) return null;
          return pos.direction === "long"
            ? pos.entryPrice * (1 - 1 / pos.leverage)
            : pos.entryPrice * (1 + 1 / pos.leverage);
        };
        const longLiq = liqPrice(longPosition);
        const shortLiq = liqPrice(shortPosition);

        return (
          <div className="flex w-[180px] min-w-[180px] gap-0.5">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-[#7192A5]">L:</span>
              <span className="text-[#4ADE80]">
                {longLiq !== null ? formatUSD(longLiq) : "—"}
              </span>
            </div>
            <span className="text-[#7192A5]">/</span>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-[#7192A5]">S:</span>
              <span className="text-[#FF6B6B]">
                {shortLiq !== null ? formatUSD(shortLiq) : "—"}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "actions",
      size: 72,
      maxSize: 72,
      minSize: 72,
      header: () => (
        <p className="w-[72px] shrink-0 pr-4 text-right text-xs font-normal tracking-[-1%] text-[#7092A5]">
          Action
        </p>
      ),
      cell: ({ row }) => <ActionsCell row={row} />,
    },
  ];
}
