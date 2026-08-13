/* eslint-disable @next/next/no-img-element */
"use client";

import React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ShieldOff } from "lucide-react";
import { cn } from "@/lib/utils";

// Shared logo component: taxonomy assets > /api/token proxy > letter avatar.
import { TokenLogo } from "@/app/strategies/_components/arbitrage-columns";

import { PROTOCOL_ICONS as _REGISTRY_ICONS, PROTOCOL_LABELS as _REGISTRY_LABELS } from "@/lib/protocol-registry";

const PROTOCOL_LABELS: Record<string, string> = {
  ..._REGISTRY_LABELS,
  privy: "Privy",
  jupiter: "Jupiter",
};

const TOKEN_ICONS: Record<string, string> = {
  SOL: "/icons/sol.svg",
  USDC: "/icons/usdc.svg",
  USDT: "/icons/usdt.svg",
  ETH: "/icons/eth.svg",
  BTC: "/icons/btc.svg",
};

export type UnifiedActivityType =
  | "open_arb"
  | "close_arb"
  | "auto_close"
  | "liquidation"
  | "deposit"
  | "withdrawal"
  | "funding_settled"
  | "swap"
  | "error";

const TYPE_CONFIG: Record<UnifiedActivityType, { label: string; bg: string; text: string }> = {
  open_arb: { label: "Open Arb", bg: "bg-[#102113]", text: "text-[#67E66A]" },
  close_arb: { label: "Close ARB", bg: "bg-[#242424]", text: "text-[#AFAFAF]" },
  auto_close: { label: "Auto-close", bg: "bg-[#191021]", text: "text-[#BC7EFF]" },
  liquidation: { label: "Liquidation", bg: "bg-[#211B10]", text: "text-[#FF9690]" },
  deposit: { label: "Deposit", bg: "bg-[#1F2110]", text: "text-[#D1FF90]" },
  withdrawal: { label: "Withdraw", bg: "bg-[#211B10]", text: "text-[#FF9690]" },
  funding_settled: { label: "Funding Settled", bg: "bg-[#191021]", text: "text-[#BC7EFF]" },
  swap: { label: "Swap", bg: "bg-[#1F2110]", text: "text-[#D1FF90]" },
  error: { label: "Failed to Open", bg: "bg-[#211210]", text: "text-[#FF6B6B]" },
};

export interface UnifiedActivityRow {
  id: string;
  token: string;
  tokenIcon: string;
  tokenTo?: string;
  tokenToIcon?: string;
  value: string;
  valueNum: number;
  valueSuffix?: string;
  isNegative: boolean;
  isPending: boolean;
  protocolFrom: string;
  protocolTo?: string;
  protocolNote?: string;
  type: UnifiedActivityType;
  timestamp: string;
  txHash?: string | null;
  transferStatus?: "pending" | "confirmed" | "failed";
  /** Raw token amount (e.g. 0.5 SOL, 100 USDC) */
  tokenAmount?: number | null;
  /** True when this position was opened with the Autoclose toggle OFF
   *  (`disableAclp: true` sent on the trade). Renders a ShieldOff icon
   *  next to the type badge so the trader can see at a glance which
   *  positions are running without ACLP protection. */
  autoCloseDisabled?: boolean;
}

const ALL_PROTOCOL_ICONS: Record<string, string> = {
  ..._REGISTRY_ICONS,
  privy: "/icons/privy.svg",
  jupiter: "/icons/jup.svg",
};

function ProtocolIcon({ protocol, size = 18 }: { protocol: string; size?: number }) {
  const icon = ALL_PROTOCOL_ICONS[protocol];
  const label = PROTOCOL_LABELS[protocol] ?? protocol;

  if (!icon) {
    return (
      <div className="flex items-center justify-center rounded-full bg-[#041223] text-[8px] text-[#BCEBFF]" style={{ width: size, height: size }}>
        {label.charAt(0)}
      </div>
    );
  }

  return <img src={icon} alt={label} loading="lazy" decoding="async" className="rounded-full" style={{ width: size, height: size }} />;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${time} | ${date}`;
}

export function getUnifiedActivityColumns(): ColumnDef<UnifiedActivityRow>[] {
  return [
    {
      accessorKey: "token",
      header: () => <span className="pl-4 text-lg font-light tracking-[-1%] text-[#7192A5]">Token</span>,
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="flex min-w-[140px] items-center gap-2 pl-4">
            <TokenLogo symbol={r.token} />
            <span className="text-sm text-white">{r.token}</span>
            {r.tokenTo && (
              <>
                <span className="text-xs text-[#7092A5]">→</span>
                <TokenLogo symbol={r.tokenTo} />
                <span className="text-sm text-white">{r.tokenTo}</span>
              </>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "value",
      header: () => <span className="text-lg font-light tracking-[-1%] text-[#7192A5]">Value</span>,
      cell: ({ row }) => {
        const r = row.original;
        if (r.isPending) {
          return (
            <div className="flex min-w-[120px] flex-col">
              <div className="flex items-center gap-1.5">
                <div className="flex size-4 items-center justify-center rounded-full border border-[#D4940A] text-[9px] text-[#D4940A]">!</div>
                <span className="text-sm text-[#D4940A]">Pending</span>
              </div>
              {r.tokenAmount != null && r.tokenAmount > 0 && (
                <span className="text-[11px] text-[#7192A5]">
                  {r.tokenAmount < 0.001 ? r.tokenAmount.toFixed(6) : r.tokenAmount < 1 ? r.tokenAmount.toFixed(4) : r.tokenAmount.toFixed(2)} {r.token}
                </span>
              )}
            </div>
          );
        }
        return (
          <div className="flex min-w-[120px] flex-col">
            <div className="flex items-center">
              <span className={cn("text-sm font-medium", r.isNegative ? "text-[#FF6B6B]" : r.valueSuffix ? "text-[#4ADE80]" : "text-white")}>
                {r.value}
                {r.valueSuffix && <span className="ml-1 text-xs text-[#4ADE80]">({r.valueSuffix})</span>}
              </span>
              {r.transferStatus && (
                <span className={cn(
                  "ml-1.5 inline-block px-1.5 py-0.5 text-[10px] font-medium",
                  r.transferStatus === "confirmed" ? "bg-[#102113] text-[#4ADE80]" :
                  r.transferStatus === "failed" ? "bg-[#211210] text-[#FF6B6B]" :
                  "bg-[#211B10] text-[#D4940A]"
                )}>
                  {r.transferStatus === "confirmed" ? "Success" : r.transferStatus === "failed" ? "Failed" : "Pending"}
                </span>
              )}
            </div>
            {r.tokenAmount != null && r.tokenAmount > 0 && (
              <span className="text-[11px] text-[#7192A5]">
                {r.tokenAmount < 0.001 ? r.tokenAmount.toFixed(6) : r.tokenAmount < 1 ? r.tokenAmount.toFixed(4) : r.tokenAmount.toFixed(2)} {r.token}
              </span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "protocolFrom",
      header: () => <span className="text-lg font-light tracking-[-1%] text-[#7192A5]">Protocol</span>,
      cell: ({ row }) => {
        const r = row.original;
        const fromLabel = PROTOCOL_LABELS[r.protocolFrom] ?? r.protocolFrom;
        const toLabel = r.protocolTo ? (PROTOCOL_LABELS[r.protocolTo] ?? r.protocolTo) : null;
        return (
          <div className="flex min-w-[180px] items-center gap-1.5">
            <ProtocolIcon protocol={r.protocolFrom} />
            <span className="text-sm text-white">{fromLabel}</span>
            {r.protocolNote && <span className="text-xs text-[#7092A5]">{r.protocolNote}</span>}
            {toLabel && (
              <>
                <span className="mx-1 text-xs text-[#7092A5]">&rarr;</span>
                <ProtocolIcon protocol={r.protocolTo!} />
                <span className="text-sm text-white">{toLabel}</span>
              </>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "type",
      header: () => <span className="text-lg font-light tracking-[-1%] text-[#7192A5]">Type</span>,
      cell: ({ row }) => {
        const config = TYPE_CONFIG[row.original.type];
        const showShield = row.original.autoCloseDisabled === true;
        return (
          <div className="flex min-w-[110px] items-center gap-1.5">
            <span className={cn("inline-block px-2.5 py-1 text-xs font-medium", config.bg, config.text)}>{config.label}</span>
            {showShield && (
              <span
                className="inline-flex items-center justify-center text-[#FFB45A]"
                title="Autoclose was OFF — ACLP triggers (liquidation proximity, OI cascade, equity drawdown) were suppressed for this position."
                aria-label="Autoclose disabled"
              >
                <ShieldOff className="size-3.5" />
              </span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "timestamp",
      header: () => <span className="text-lg font-light tracking-[-1%] text-[#7192A5]">Time</span>,
      cell: ({ row }) => (
        <div className="min-w-[170px]">
          <span className="text-sm text-[#7092A5]">{formatTime(row.original.timestamp)}</span>
        </div>
      ),
    },
  ];
}
