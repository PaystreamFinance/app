"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { X } from "lucide-react";
import { cn, formatUSD } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TokenLogo } from "@/app/strategies/_components/arbitrage-columns";
import {
  getProtocolLabel,
  PROTOCOL_ICONS,
} from "@/lib/protocol-registry";
import type { StrategyPositionRowType } from "./strategy-positions-columns";
import type { SpotPerpPositionRowType } from "./spot-perp-positions-columns";
import type { TpSlDialogProps } from "@/components/tp-sl-dialog";

export type TotalPortfolioRowType =
  | {
      id: string;
      _type: "funding-perp";
      _data: StrategyPositionRowType;
      label: string;
      deposit: number;
      pnlValue: number;
    }
  | {
      id: string;
      _type: "spot-perp";
      _data: SpotPerpPositionRowType;
      label: string;
      deposit: number;
      pnlValue: number;
    };

const TYPE_BADGE: Record<
  TotalPortfolioRowType["_type"],
  { text: string; color: string; bg: string }
> = {
  "funding-perp": {
    text: "Funding Perp",
    color: "text-[#A78BFA]",
    bg: "bg-[#A78BFA]/10",
  },
  "spot-perp": {
    text: "Spot Perp",
    color: "text-[#60A5FA]",
    bg: "bg-[#60A5FA]/10",
  },
};

function getIconSymbol(row: TotalPortfolioRowType): string | undefined {
  if (row._type === "funding-perp")
    return row._data.longPosition?.symbol ?? row._data.asset;
  if (row._type === "spot-perp") return row._data.asset.replace("-PERP", "");
  return undefined;
}

function getFundingTickerLabel(row: StrategyPositionRowType): string | null {
  const longTicker = row.longPosition?.symbol;
  const shortTicker = row.shortPosition?.symbol;
  if (!longTicker && !shortTicker) return null;
  if (longTicker && shortTicker) {
    return longTicker === shortTicker ? longTicker : `${longTicker} ↔ ${shortTicker}`;
  }
  return longTicker ?? shortTicker ?? null;
}

function getProtocolIcon(row: TotalPortfolioRowType): string | undefined {
  if (row._type === "funding-perp")
    return PROTOCOL_ICONS[row._data.longProtocol];
  if (row._type === "spot-perp")
    return PROTOCOL_ICONS[row._data.perpProtocol];
  return undefined;
}

interface TotalPortfolioColumnsOptions {
  onCloseFundingPerp?: (row: StrategyPositionRowType) => void;
  onCloseSpotPerp?: (row: SpotPerpPositionRowType) => void;
  onSetTpSlPosition?: (position: TpSlDialogProps["position"]) => void;
}

export function getTotalPortfolioColumns(
  options?: TotalPortfolioColumnsOptions,
): ColumnDef<TotalPortfolioRowType>[] {
  const ActionsCell = ({ row }: { row: any }) => {
    const r = row.original as TotalPortfolioRowType;
    const handleClose = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (r._type === "funding-perp") options?.onCloseFundingPerp?.(r._data);
      else if (r._type === "spot-perp") options?.onCloseSpotPerp?.(r._data);
    };

    return (
      <div className="flex w-[132px] items-center justify-end pr-4">
        <Button
          className="h-8 cursor-pointer rounded-lg border border-[#0D1E30] bg-[#041122] px-3 text-xs text-[#D86A47] transition-colors hover:bg-[#041122] hover:opacity-90"
          onClick={handleClose}
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
      accessorKey: "label",
      header: () => (
        <p className="shrink-0 pl-8 text-xs font-normal tracking-[-1%] text-[#7092A5]">
          Position
        </p>
      ),
      cell: ({ row }) => {
        const r = row.original;
        const badge = TYPE_BADGE[r._type];
        const iconSymbol = getIconSymbol(r);
        return (
          <div className="flex w-[240px] min-w-[240px] items-center gap-3 pl-7">
            <div className="relative flex shrink-0 items-center">
              {iconSymbol && (
                <TokenLogo symbol={iconSymbol} className="size-5" />
              )}
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-normal text-white">
                {r.label}
              </span>
              {r._type === "funding-perp" && getFundingTickerLabel(r._data) && (
                <span className="truncate text-[11px] leading-tight text-[#7192A5]">
                  {getFundingTickerLabel(r._data)}
                </span>
              )}
            </div>
            <span
              className={cn(
                "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium leading-tight",
                badge.bg,
                badge.color,
              )}
            >
              {badge.text}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "_type",
      header: () => (
        <p className="shrink-0 text-xs font-normal tracking-[-1%] text-[#7092A5]">
          Protocol
        </p>
      ),
      cell: ({ row }) => {
        const r = row.original;
        if (r._type === "funding-perp") {
          const longIcon = PROTOCOL_ICONS[r._data.longProtocol];
          const shortIcon = PROTOCOL_ICONS[r._data.shortProtocol];
          return (
            <div className="flex w-[180px] min-w-[180px] items-center gap-1">
              <div className="flex items-center gap-1.5">
                {longIcon && (
                  <img src={longIcon} alt="" className="size-4 rounded-full" />
                )}
                <span className="text-sm text-white">
                  {getProtocolLabel(r._data.longProtocol)}
                </span>
              </div>
              <span className="text-sm text-[#7192A5]">/</span>
              <div className="flex items-center gap-1.5">
                {shortIcon && (
                  <img src={shortIcon} alt="" className="size-4 rounded-full" />
                )}
                <span className="text-sm text-white">
                  {getProtocolLabel(r._data.shortProtocol)}
                </span>
              </div>
            </div>
          );
        }
        const protocolIcon = getProtocolIcon(r);
        const protocolName = getProtocolLabel(r._data.perpProtocol);
        return (
          <div className="flex w-[140px] min-w-[140px] items-center gap-2">
            {protocolIcon && (
              <img
                src={protocolIcon}
                alt=""
                className="size-4 rounded-full"
              />
            )}
            <span className="text-sm text-white">
              {protocolName}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "deposit",
      header: () => (
        <p className="shrink-0 text-xs font-normal tracking-[-1%] text-[#7092A5]">
          Value
        </p>
      ),
      cell: ({ row }) => (
        <div className="flex w-[120px] min-w-[120px] items-center">
          <span className="text-sm font-normal text-white">
            {formatUSD(row.original.deposit)}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "pnlValue",
      header: () => (
        <p className="shrink-0 text-xs font-normal tracking-[-1%] text-[#7092A5]">
          PnL
        </p>
      ),
      cell: ({ row }) => {
        const r = row.original;
        if (r._type === "funding-perp") {
          const longPnl = r._data.longPosition?.pnl ?? null;
          const shortPnl = r._data.shortPosition?.pnl ?? null;
          if (longPnl === null && shortPnl === null) {
            return (
              <div className="flex w-[160px] min-w-[160px] items-center">
                <span className="text-sm text-[#7192A5]">-</span>
              </div>
            );
          }
          const fmt = (v: number | null) =>
            v === null ? "-" : `${v >= 0 ? "+" : ""}${formatUSD(v)}`;
          return (
            <div className="flex w-[160px] min-w-[160px] items-center gap-1 text-sm font-normal">
              <span className={cn(longPnl !== null && longPnl >= 0 ? "text-[#4ADE80]" : "text-[#FF6B6B]")}>
                {fmt(longPnl)}
              </span>
              <span className="text-[#7192A5]">/</span>
              <span className={cn(shortPnl !== null && shortPnl >= 0 ? "text-[#4ADE80]" : "text-[#FF6B6B]")}>
                {fmt(shortPnl)}
              </span>
            </div>
          );
        }
        const pnl = r.pnlValue;
        return (
          <div className="flex w-[120px] min-w-[120px] items-center">
            <span
              className={cn(
                "text-sm font-normal",
                pnl >= 0 ? "text-[#4ADE80]" : "text-[#FF6B6B]",
              )}
            >
              {pnl >= 0 ? "+" : ""}
              {formatUSD(pnl)}
            </span>
          </div>
        );
      },
    },
    {
      id: "actions",
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
