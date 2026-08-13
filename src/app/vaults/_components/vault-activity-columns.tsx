"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import type { VaultActivityRow } from "./vault-activity-data";
import { TokenLogo } from "@/app/strategies/_components/arbitrage-columns";

import { PROTOCOL_LOGOS } from "@/lib/protocol-registry";

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatTimestamp(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getExplorerUrl(protocol: string, hash: string): string {
  switch (protocol.toLowerCase()) {
    case "hyperliquid":
      return `https://app.hyperliquid.xyz/explorer/tx/${hash}`;
    case "aster":
      return `https://www.asterdex.com/en/explorer/${hash}`;
    default:
      // drift, pacifica, lighter, flash → Solscan (Solana)
      return `https://solscan.io/tx/${hash}`;
  }
}

function getActionColor(action: string): { bg: string; text: string } {
  switch (action.toLowerCase()) {
    case "trade":
    case "deposit":
      return { bg: "bg-[#4ADE80]/20", text: "text-[#4ADE80]" };
    case "close":
    case "withdraw":
      return { bg: "bg-[#FF6B6B]/20", text: "text-[#FF6B6B]" };
    case "strategalert":
    case "warning":
      return { bg: "bg-[#FBBF24]/20", text: "text-[#FBBF24]" };
    default:
      return { bg: "bg-[#7092A5]/20", text: "text-[#7092A5]" };
  }
}

export function getVaultActivityColumns(): ColumnDef<VaultActivityRow>[] {
  return [
    {
      accessorKey: "created_at",
      header: () => (
        <p className="shrink-0 pl-4 text-xs font-normal uppercase tracking-wider text-[#7092A5]">
          Time
        </p>
      ),
      cell: ({ row }) => (
        <div className="flex w-[180px] min-w-[180px] flex-col gap-0.5 pl-4">
          <span className="text-sm font-normal text-white">
            {formatTimeAgo(row.original.created_at)}
          </span>
          <span className="text-xs text-[#7092A5]">
            {formatTimestamp(row.original.created_at)}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "action",
      header: () => (
        <p className="shrink-0 text-xs font-normal uppercase tracking-wider text-[#7092A5]">
          Action
        </p>
      ),
      cell: ({ row }) => {
        const action = row.original.action;
        const colors = getActionColor(action);
        return (
          <div className="flex w-[100px] min-w-[100px] items-center">
            <span
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium uppercase",
                colors.bg,
                colors.text,
              )}
            >
              {action}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "dex",
      header: () => (
        <p className="shrink-0 text-xs font-normal uppercase tracking-wider text-[#7092A5]">
          Dex
        </p>
      ),
      cell: ({ row }) => {
        const dex = row.original.dex ?? "";
        const protocols = dex ? dex.split("/") : [];
        if (!protocols.length) {
          return (
            <div className="flex w-[80px] min-w-[80px] items-center">
              <span className="text-sm text-[#7092A5]">—</span>
            </div>
          );
        }
        return (
          <div className="flex w-[80px] min-w-[80px] items-center gap-1.5">
            {protocols.map((proto) => (
              PROTOCOL_LOGOS[proto.toLowerCase()] && (
                <img
                  key={proto}
                  src={PROTOCOL_LOGOS[proto.toLowerCase()]}
                  alt={proto}
                  className="h-5 w-5 shrink-0 rounded-full"
                  title={proto}
                />
              )
            ))}
          </div>
        );
      },
    },
    {
      accessorKey: "symbol",
      header: () => (
        <p className="shrink-0 text-xs font-normal uppercase tracking-wider text-[#7092A5]">
          Symbol
        </p>
      ),
      cell: ({ row }) => {
        const symbol = row.original.symbol;
        if (!symbol) {
          return (
            <div className="flex w-[100px] min-w-[100px] items-center">
              <span className="text-sm text-[#7092A5]">—</span>
            </div>
          );
        }
        return (
          <div className="flex w-[100px] min-w-[100px] items-center gap-1.5">
            <TokenLogo symbol={symbol} className="h-5 w-5 shrink-0" />
            <span className="text-sm font-medium text-white">{symbol}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "amount",
      header: () => (
        <p className="shrink-0 text-xs font-normal uppercase tracking-wider text-[#7092A5]">
          Amount
        </p>
      ),
      cell: ({ row }) => (
        <div className="flex w-[100px] min-w-[100px] items-center">
          <span className="text-sm font-normal text-white">
            {row.original.amount != null ? `$${row.original.amount}` : "–"}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: () => (
        <p className="shrink-0 text-xs font-normal uppercase tracking-wider text-[#7092A5]">
          Status
        </p>
      ),
      cell: ({ row }) => {
        const status = row.original.status;
        const color =
          status === "success"
            ? "text-[#4ADE80]"
            : status === "error"
              ? "text-[#FF6B6B]"
              : "text-[#FBBF24]";
        return (
          <div className="flex w-[100px] min-w-[100px] items-center">
            <span className={cn("text-sm font-normal uppercase", color)}>
              {status}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "details",
      size: 140,
      maxSize: 140,
      minSize: 140,
      header: () => (
        <p className="w-[140px] shrink-0 pr-4 text-right text-xs font-normal uppercase tracking-wider text-[#7092A5]">
          Tx
        </p>
      ),
      cell: ({ row }) => {
        const details = row.original.details as Record<string, unknown>;
        const txLinks = details?.txLinks as
          | { hash: string }[]
          | undefined;
        const dex = row.original.dex ?? "";
        const [longProto = "", shortProto] = dex.split("/");
        const longHash = txLinks?.[0]?.hash ?? null;
        const shortHash = txLinks?.[1]?.hash ?? null;
        const isTwoLeg = !!shortProto;

        const TxLink = ({ hash, proto }: { hash: string | null; proto: string }) =>
          hash ? (
            <a
              href={getExplorerUrl(proto, hash)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[#BCEAFF] hover:underline"
              data-prevent-row-click
            >
              {hash.slice(0, 4)}...
            </a>
          ) : (
            <span className="text-sm text-[#7092A5]">NA</span>
          );

        return (
          <div className="flex w-[140px] items-center justify-end gap-1 pr-4">
            {!isTwoLeg && !longHash ? (
              <span className="text-sm font-normal text-[#7092A5]">—</span>
            ) : (
              <>
                <TxLink hash={longHash} proto={longProto} />
                {isTwoLeg && (
                  <>
                    <span className="text-sm text-[#7092A5]">/</span>
                    <TxLink hash={shortHash} proto={shortProto} />
                  </>
                )}
              </>
            )}
          </div>
        );
      },
    },
  ];
}
