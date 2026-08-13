"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { X } from "lucide-react";

import { cn, formatUSD } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TokenLogo } from "@/app/strategies/_components/arbitrage-columns";
import type { TpSlDialogProps } from "@/components/tp-sl-dialog";

export interface SpotPerpPositionRowType {
  id: string;
  tradeId: number;
  asset: string;
  totalUsd: number;
  spotUsd: number;
  perpProtocol: string;
  perpMarginUsd: number;
  perpNotionalUsd: number;
  perpLeverage: number;
  perpPnl: number;
  spotAmount: string;
  spotDecimals: number;
  spotTokenMint: string;
  createdAt: string;
  perpEntryPrice: number;
  perpSizeUsd: number;
}

interface SpotPerpPositionsColumnsOptions {
  onClosePosition?: (row: SpotPerpPositionRowType) => void;
  onSetTpSlPosition?: (position: TpSlDialogProps["position"]) => void;
}

export function getSpotPerpPositionsColumns(
  options?: SpotPerpPositionsColumnsOptions,
): ColumnDef<SpotPerpPositionRowType>[] {
  const ActionsCell = ({ row }: { row: any }) => {
    const position: SpotPerpPositionRowType = row.original;

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
          Spot Perp
        </p>
      ),
      cell: ({ row }) => (
        <div className="flex w-[160px] min-w-[160px] items-center gap-3 pl-7">
          <TokenLogo
            symbol={row.original.asset.replace("-PERP", "")}
            className="size-5"
          />
          <span className="text-sm font-normal text-white">
            {row.original.asset}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "totalUsd",
      header: () => (
        <p className="shrink-0 text-xs font-normal tracking-[-1%] text-[#7092A5]">
          Deposit
        </p>
      ),
      cell: ({ row }) => (
        <div className="flex w-[120px] min-w-[120px] items-center">
          <span className="text-sm font-normal text-white">
            {formatUSD(row.original.totalUsd)}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "spotAmount",
      header: () => (
        <p className="shrink-0 text-xs font-normal tracking-[-1%] text-[#7092A5]">
          Holdings
        </p>
      ),
      cell: ({ row }) => {
        const raw = parseFloat(row.original.spotAmount || "0");
        const amount = raw / Math.pow(10, row.original.spotDecimals);
        const symbol = row.original.asset.replace("-PERP", "");
        return (
          <div className="flex w-[160px] min-w-[160px] items-center gap-2">
            <TokenLogo symbol={symbol} className="size-5" />
            <span className="text-sm font-normal text-white">
              {amount < 0.01 ? amount.toPrecision(3) : amount.toFixed(2)}{" "}
              {symbol}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "perpMarginUsd",
      header: () => (
        <p className="shrink-0 text-xs font-normal tracking-[-1%] text-[#7092A5]">
          Perp Margin
        </p>
      ),
      cell: ({ row }) => (
        <div className="flex w-[120px] min-w-[120px] items-center">
          <span className="text-sm font-normal text-white">
            {formatUSD(row.original.perpMarginUsd)}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "perpPnl",
      header: () => (
        <p className="shrink-0 text-xs font-normal tracking-[-1%] text-[#7092A5]">
          Unrealized PnL
        </p>
      ),
      cell: ({ row }) => {
        const pnl = row.original.perpPnl;
        const isPositive = pnl >= 0;
        return (
          <div className="flex w-[120px] min-w-[120px] items-center">
            <span
              className={cn(
                "text-sm font-normal",
                isPositive ? "text-[#4ADE80]" : "text-[#FF6B6B]",
              )}
            >
              {formatUSD(pnl)}
            </span>
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
