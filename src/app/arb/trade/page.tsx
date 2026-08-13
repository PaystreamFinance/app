"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useIdentityToken, usePrivy } from "@privy-io/react-auth";
import { ChevronDown, Pencil, X } from "lucide-react";
import { toast } from "sonner";

import CommonAppLayout from "@/app/_components/common-app-layout";
import { PositionToast } from "@/components/position-states";
import { TpSlDialog, type TpSlDialogProps } from "@/components/tp-sl-dialog";
import { ProtocolVenueBadge } from "@/components/protocol-venue-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import { cn, formatUSD } from "@/lib/utils";
import { isArbableRow, transformMarketsToRows } from "@/lib/arbitrage-utils";
import {
  getEffectiveMargin,
  getProtocolIntervalHours,
  getProtocolLabel,
} from "@/lib/protocol-registry";
import { useArbitrageMarkets } from "@/app/strategies/hooks/use-arbitrage-markets";
import { useArbitragePositions } from "@/app/strategies/hooks/use-arbitrage-positions";
import { ArbitrageTradeModal } from "@/app/strategies/_components/arbitrage-trade-modal";
import { TokenLogo } from "@/app/strategies/_components/arbitrage-columns";
import type { ArbitrageRowType } from "@/app/strategies/_components/arbitrage-columns";
import { closeArbPosition } from "@/lib/arbitrage-api";
import type { ArbitragePositionPair, Position, PositionsResponse } from "@/lib/arbitrage-api";
import { getPrivyAccessToken } from "@/lib/privy-auth";

const RWA_MARKET_SYMBOL_ALIASES: Record<string, string[]> = {
  GOLD: ["GOLD", "PAXG", "XAU"],
  SILVER: ["SILVER", "XAG"],
  "WTI CRUDE": ["WTI CRUDE", "WTI", "CL", "OIL"],
  "BRENT CRUDE": ["BRENT CRUDE", "BRENT", "BRENTOIL"],
};

type TradePositionRow = {
  id: string;
  symbol: string;
  label: string;
  totalMargin: number;
  long: { protocol: string; symbol: string; position?: Position };
  short: { protocol: string; symbol: string; position?: Position };
  pnl: number;
  pairId?: number;
  publicId?: string;
  createdAt?: string;
};

function pairKey(protocol: string, symbol: string, direction: string) {
  return `${protocol.toLowerCase()}|${symbol.toUpperCase()}|${direction}`;
}

function buildPositionRows(
  pairs: ArbitragePositionPair[],
  positions: Record<string, Position[] | undefined> | undefined,
): TradePositionRow[] {
  const rows: TradePositionRow[] = [];
  const pairedLegs = new Set<string>();

  for (const pair of pairs) {
    pairedLegs.add(pairKey(pair.long.protocol, pair.long.symbol, "long"));
    pairedLegs.add(pairKey(pair.short.protocol, pair.short.symbol, "short"));
    const longMargin = getEffectiveMargin(
      pair.long.protocol,
      pair.long.margin,
      pair.long.pnl,
    );
    const shortMargin = getEffectiveMargin(
      pair.short.protocol,
      pair.short.margin,
      pair.short.pnl,
    );
    rows.push({
      id: String(
        pair.pairId ??
          pair.publicId ??
          `${pair.long.protocol}-${pair.long.symbol}-${pair.short.protocol}-${pair.short.symbol}`,
      ),
      pairId: pair.pairId,
      publicId: pair.publicId,
      symbol: pair.symbol ?? pair.long.symbol,
      label:
        pair.long.symbol === pair.short.symbol
          ? pair.long.symbol
          : `${pair.long.symbol} / ${pair.short.symbol}`,
      totalMargin: longMargin + shortMargin,
      long: { protocol: pair.long.protocol, symbol: pair.long.symbol, position: pair.long },
      short: { protocol: pair.short.protocol, symbol: pair.short.symbol, position: pair.short },
      pnl: (pair.long.pnl ?? 0) + (pair.short.pnl ?? 0),
      createdAt: pair.createdAt,
    });
  }

  const bySymbol = new Map<
    string,
    {
      long?: { protocol: string; position: Position };
      short?: { protocol: string; position: Position };
    }
  >();

  for (const [protocol, list] of Object.entries(positions ?? {})) {
    for (const position of list ?? []) {
      if (pairedLegs.has(pairKey(protocol, position.symbol, position.direction))) {
        continue;
      }
      const entry = bySymbol.get(position.symbol) ?? {};
      if (position.direction === "long") {
        entry.long = { protocol, position };
      } else {
        entry.short = { protocol, position };
      }
      bySymbol.set(position.symbol, entry);
    }
  }

  for (const [symbol, entry] of bySymbol) {
    if (!entry.long || !entry.short) continue;
    const longMargin = getEffectiveMargin(
      entry.long.protocol,
      entry.long.position.margin,
      entry.long.position.pnl,
    );
    const shortMargin = getEffectiveMargin(
      entry.short.protocol,
      entry.short.position.margin,
      entry.short.position.pnl,
    );
    rows.push({
      id: `legacy-${symbol}-${entry.long.protocol}-${entry.short.protocol}`,
      symbol,
      label: symbol,
      totalMargin: longMargin + shortMargin,
      long: {
        protocol: entry.long.protocol,
        symbol: entry.long.position.symbol,
        position: entry.long.position,
      },
      short: {
        protocol: entry.short.protocol,
        symbol: entry.short.position.symbol,
        position: entry.short.position,
      },
      pnl: (entry.long.position.pnl ?? 0) + (entry.short.position.pnl ?? 0),
    });
  }

  return rows;
}

function dashIfMissing(value: number | null | undefined, format: (n: number) => string) {
  return value === null || value === undefined || !Number.isFinite(value) ? "—" : format(value);
}

function signedUsd(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : "-"}${formatUSD(Math.abs(value), 2)}`;
}

function formatAssetSize(position: Position | undefined) {
  if (!position?.size?.asset || !Number.isFinite(position.size.asset)) return "—";
  const size = Math.abs(position.size.asset);
  const decimals = size >= 100 ? 2 : size >= 1 ? 4 : 6;
  return `${Number(size.toFixed(decimals)).toLocaleString()} ${position.symbol}`;
}

function formatAssetAmount(value: number) {
  const size = Math.abs(value);
  const decimals = size >= 100 ? 2 : size >= 1 ? 4 : 6;
  return Number(size.toFixed(decimals)).toLocaleString();
}

function formatRowAssetSize(row: TradePositionRow) {
  const longSize = row.long.position?.size?.asset;
  const shortSize = row.short.position?.size?.asset;
  const longSymbol = row.long.position?.symbol ?? row.long.symbol;
  const shortSymbol = row.short.position?.symbol ?? row.short.symbol;
  const hasLong = Number.isFinite(longSize);
  const hasShort = Number.isFinite(shortSize);

  if (hasLong && hasShort) {
    const longAbs = Math.abs(longSize!);
    const shortAbs = Math.abs(shortSize!);
    const sameSymbol = longSymbol.toUpperCase() === shortSymbol.toUpperCase();
    const closeSize =
      Math.max(longAbs, shortAbs) === 0 ||
      Math.abs(longAbs - shortAbs) / Math.max(longAbs, shortAbs) < 0.005;

    if (sameSymbol && closeSize) {
      return `${formatAssetAmount(Math.max(longAbs, shortAbs))} ${longSymbol}`;
    }

    if (sameSymbol) {
      return `${formatAssetAmount(longAbs)} / ${formatAssetAmount(shortAbs)} ${longSymbol}`;
    }

    return `${formatAssetAmount(longAbs)} ${longSymbol} / ${formatAssetAmount(shortAbs)} ${shortSymbol}`;
  }

  return formatAssetSize(row.long.position) !== "—"
    ? formatAssetSize(row.long.position)
    : formatAssetSize(row.short.position);
}

function formatPrice(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return "—";
  return formatUSD(value, value >= 100 ? 2 : 4);
}

function legLiqPrice(position: Position | undefined) {
  if (!position?.entryPrice || !position.leverage) return null;
  return position.direction === "long"
    ? position.entryPrice * (1 - 1 / position.leverage)
    : position.entryPrice * (1 + 1 / position.leverage);
}

function legLiqDistance(position: Position | undefined) {
  const liq = legLiqPrice(position);
  if (!position?.entryPrice || liq === null) return null;
  return (Math.abs(position.entryPrice - liq) / position.entryPrice) * 100;
}

function rowLeverage(row: TradePositionRow) {
  const values = [row.long.position?.leverage, row.short.position?.leverage].filter(
    (value): value is number => Number.isFinite(value),
  );
  if (values.length === 0) return null;
  return values.every((value) => value === values[0])
    ? values[0]!
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function rowFunding(row: TradePositionRow) {
  const values = [row.long.position?.fundingIncome, row.short.position?.fundingIncome].filter(
    (value): value is number => Number.isFinite(value),
  );
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0);
}

function rowLiqDistance(row: TradePositionRow) {
  const values = [legLiqDistance(row.long.position), legLiqDistance(row.short.position)].filter(
    (value): value is number => Number.isFinite(value),
  );
  if (values.length === 0) return null;
  return Math.min(...values);
}

function ageLabel(createdAt: string | undefined) {
  if (!createdAt) return "—";
  const createdMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdMs)) return "—";
  const minutes = Math.max(0, Math.floor((Date.now() - createdMs) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d`;
}

function nextFundingLabel(row: TradePositionRow) {
  const interval = Math.min(
    getProtocolIntervalHours(row.long.protocol),
    getProtocolIntervalHours(row.short.protocol),
  );
  if (!Number.isFinite(interval) || interval <= 0) return "—";
  const now = new Date();
  const intervalMs = interval * 60 * 60 * 1000;
  const nextMs = Math.ceil(now.getTime() / intervalMs) * intervalMs;
  const minutes = Math.max(1, Math.ceil((nextMs - now.getTime()) / 60000));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

function findMarketRow(row: TradePositionRow, arbRows: ArbitrageRowType[]) {
  const symbol = row.symbol.toUpperCase();
  return (
    arbRows.find((market) => market.symbol.toUpperCase() === symbol) ??
    arbRows.find((market) => market.marketData.symbol.toUpperCase() === symbol) ??
    arbRows.find((market) => market.constituentSymbols?.some((item) => item.toUpperCase() === symbol))
  );
}

function supportsTpSl(protocol: string): boolean {
  return (
    protocol === "pacifica" ||
    protocol === "hyperliquid" ||
    protocol === "aster" ||
    protocol === "lighter" ||
    protocol === "01" ||
    protocol === "phoenix" ||
    protocol.startsWith("hl:")
  );
}

function normalizeTpSlMarket(symbol: string | undefined, fallback: string): string {
  return (symbol || fallback).replace(/-PERP$/i, "");
}

function formatTrigger(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "_";
  }
  if (value >= 100_000) return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (value >= 1000) return `$${value.toFixed(1)}`;
  if (value >= 1) return `$${value.toFixed(4).replace(/\.?0+$/, "")}`;
  return `$${value.toPrecision(4)}`;
}

function protocolTpSlLabel(protocol: string): string {
  if (protocol === "01") return "01";
  if (protocol.startsWith("hl:")) return protocol.toUpperCase();
  return protocol.charAt(0).toUpperCase() + protocol.slice(1);
}

function tpSlDialogPositionForLeg(
  leg: TradePositionRow["long"] | TradePositionRow["short"],
  fallbackMarket: string,
): TpSlDialogProps["position"] | null {
  const position = leg.position;
  if (!position || !supportsTpSl(leg.protocol)) return null;
  const entryPrice = Number(position.entryPrice);
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) return null;
  return {
    protocol: leg.protocol as TpSlDialogProps["position"]["protocol"],
    market: normalizeTpSlMarket(position.symbol, fallbackMarket),
    direction: position.direction,
    entryPrice,
    takeProfitPrice: position.triggerPrices?.tp ?? position.takeProfitPrice ?? null,
    stopLossPrice: position.triggerPrices?.sl ?? position.stopLossPrice ?? null,
    leverage: position.leverage ?? null,
    margin: position.margin ?? null,
    sizeAsset: position.size?.asset != null ? Math.abs(position.size.asset) : null,
  };
}

function tpSlDialogPositionForRow(
  row: TradePositionRow,
): TpSlDialogProps["position"] | null {
  const candidates = [
    {
      dialogPosition: tpSlDialogPositionForLeg(row.long, row.symbol),
      liqDistance: legLiqDistance(row.long.position),
    },
    {
      dialogPosition: tpSlDialogPositionForLeg(row.short, row.symbol),
      liqDistance: legLiqDistance(row.short.position),
    },
  ].filter(
    (
      candidate,
    ): candidate is {
      dialogPosition: TpSlDialogProps["position"];
      liqDistance: number | null;
    } => candidate.dialogPosition !== null,
  );

  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => {
    const aDistance = a.liqDistance ?? Number.POSITIVE_INFINITY;
    const bDistance = b.liqDistance ?? Number.POSITIVE_INFINITY;
    return aDistance - bDistance;
  })[0]!.dialogPosition;
}

function TpSlInlineValue({
  position,
  protocol,
  fallbackMarket,
  onSetTpSlPosition,
}: {
  position: Position | undefined;
  protocol: string;
  fallbackMarket: string;
  onSetTpSlPosition?: (position: TpSlDialogProps["position"]) => void;
}) {
  const takeProfitPrice = position?.triggerPrices?.tp ?? position?.takeProfitPrice;
  const stopLossPrice = position?.triggerPrices?.sl ?? position?.stopLossPrice;
  const hasTrigger = Boolean(takeProfitPrice || stopLossPrice);
  const protocolSupported = supportsTpSl(protocol);
  const entryPriceValid =
    Number.isFinite(Number(position?.entryPrice)) &&
    Number(position?.entryPrice) > 0;
  const canEdit = Boolean(position) && protocolSupported && entryPriceValid;
  const value = `${formatTrigger(takeProfitPrice)}/${formatTrigger(stopLossPrice)}`;
  const disabledReason = !position
    ? "Position data unavailable for this leg."
    : !protocolSupported
      ? `TP/SL not supported on ${protocolTpSlLabel(protocol)}.`
      : !entryPriceValid
        ? "Entry price unavailable for this leg - TP/SL needs an entry price to compute triggers."
        : "";

  return (
    <div className="min-w-0">
      <p className="text-[#7192A5]">TP/SL</p>
      {canEdit && position ? (
        <button
          type="button"
          className="mt-1 min-w-0 cursor-pointer text-left"
          aria-label={`Set TP/SL for ${position.direction} leg`}
          onClick={(event) => {
            event.stopPropagation();
            onSetTpSlPosition?.({
              protocol: protocol as TpSlDialogProps["position"]["protocol"],
              market: normalizeTpSlMarket(position.symbol, fallbackMarket),
              direction: position.direction,
              entryPrice: Number(position.entryPrice),
              takeProfitPrice: takeProfitPrice ?? null,
              stopLossPrice: stopLossPrice ?? null,
              leverage: position.leverage ?? null,
            });
          }}
        >
          <span
            className={cn(
              "inline-flex max-w-full items-center gap-1 truncate",
              hasTrigger
                ? "border-b border-dotted border-[#BCEBFF] pb-0.5 text-[#BCEBFF]"
                : "text-white",
            )}
          >
            <span className="truncate">{value}</span>
            <Pencil className="size-3 shrink-0 text-[#7192A5]" />
          </span>
        </button>
      ) : (
        <span
          className="mt-1 block cursor-not-allowed truncate text-[#5A7280] line-through decoration-[#5A7280]/40"
          title={disabledReason}
          aria-label={disabledReason}
        >
          {value}
        </span>
      )}
    </div>
  );
}

function PositionLegDetail({
  side,
  leg,
  fallbackMarket,
  onSetTpSlPosition,
}: {
  side: "long" | "short";
  leg: TradePositionRow["long"] | TradePositionRow["short"];
  fallbackMarket: string;
  onSetTpSlPosition?: (position: TpSlDialogProps["position"]) => void;
}) {
  const position = leg.position;
  const funding = position?.fundingIncome;
  return (
    <div className="min-w-0 border border-[#0F1F30] bg-[#03182B] p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              side === "long" ? "bg-[#20E7B5]" : "bg-[#FF6B6B]",
            )}
          />
          <span
            className={cn(
              "text-xs font-medium uppercase",
              side === "long" ? "text-[#20E7B5]" : "text-[#FF6B6B]",
            )}
          >
            {side}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-[#BCEBFF]">
          <ProtocolVenueBadge protocol={leg.protocol} className="size-4 shrink-0" />
          <span className="truncate">{getProtocolLabel(leg.protocol)}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3 xl:grid-cols-4">
        <DetailValue label="Ticker" value={position?.symbol ?? leg.symbol} />
        <DetailValue label="Entry" value={formatPrice(position?.entryPrice)} />
        <DetailValue label="Liq est." value={formatPrice(legLiqPrice(position) ?? undefined)} />
        <DetailValue label="Size" value={formatAssetSize(position)} />
        <DetailValue label="Notional" value={dashIfMissing(position?.size?.usd, (n) => formatUSD(n, 2))} />
        <DetailValue label="Margin" value={dashIfMissing(position?.margin, (n) => formatUSD(n, 2))} />
        <DetailValue label="Leverage" value={dashIfMissing(position?.leverage, (n) => `${Number(n.toFixed(2))}x`)} />
        <TpSlInlineValue
          position={position}
          protocol={leg.protocol}
          fallbackMarket={fallbackMarket}
          onSetTpSlPosition={onSetTpSlPosition}
        />
        <DetailValue
          label="Net funding"
          value={signedUsd(funding)}
          tone={funding === undefined ? "muted" : funding >= 0 ? "positive" : "negative"}
        />
      </div>
    </div>
  );
}

function DetailValue({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "muted" | "positive" | "negative";
}) {
  return (
    <div className="min-w-0">
      <p className="text-[#7192A5]">{label}</p>
      <p
        className={cn(
          "mt-1 truncate",
          tone === "positive" && "text-[#4ADE80]",
          tone === "negative" && "text-[#FF6B6B]",
          tone === "muted" && "text-[#7192A5]",
          tone === "default" && "text-white",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function ExpandedPositionDetails({
  position,
  onSetTpSlPosition,
}: {
  position: TradePositionRow;
  onSetTpSlPosition?: (position: TpSlDialogProps["position"]) => void;
}) {
  const liqDistance = rowLiqDistance(position);
  const funding = rowFunding(position);
  return (
    <div className="space-y-3 bg-[#02101F] p-3">
      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        <PositionLegDetail
          side="long"
          leg={position.long}
          fallbackMarket={position.symbol}
          onSetTpSlPosition={onSetTpSlPosition}
        />
        <PositionLegDetail
          side="short"
          leg={position.short}
          fallbackMarket={position.symbol}
          onSetTpSlPosition={onSetTpSlPosition}
        />
      </div>
      <div className="flex flex-col gap-2 border border-[#0F1F30] bg-[#03182B] px-3 py-2 text-xs text-[#7192A5] sm:flex-row sm:items-center sm:justify-between">
        <span>
          Estimated liquidation distance uses entry price and leverage when live liquidation price is not returned.
        </span>
        <span
          className={cn(
            "shrink-0",
            funding === null ? "text-[#7192A5]" : funding >= 0 ? "text-[#4ADE80]" : "text-[#FF6B6B]",
          )}
        >
          Funding: {signedUsd(funding)}
        </span>
        {liqDistance !== null && liqDistance < 10 ? (
          <span className="shrink-0 text-[#FACC15]">Close to liq: {liqDistance.toFixed(1)}%</span>
        ) : null}
      </div>
    </div>
  );
}

function readCachedTradeRow(): ArbitrageRowType | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem("arb-trade:selected-row");
    if (!raw) return null;
    return JSON.parse(raw) as ArbitrageRowType;
  } catch {
    return null;
  }
}

export default function ArbTradePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { authenticated } = usePrivy();
  const { identityToken } = useIdentityToken();
  const { confirm, DialogComponent } = useConfirmDialog();
  const [closingPositionId, setClosingPositionId] = React.useState<string | null>(null);
  const [tpSlPosition, setTpSlPosition] =
    React.useState<TpSlDialogProps["position"] | null>(null);
  const selectedSymbol = searchParams.get("symbol")?.toUpperCase() ?? "";
  const selectedLong = searchParams.get("long") ?? undefined;
  const selectedShort = searchParams.get("short") ?? undefined;
  const selectedLongSymbol = searchParams.get("longSymbol") ?? selectedSymbol;
  const selectedShortSymbol = searchParams.get("shortSymbol") ?? selectedSymbol;
  const [cachedTradeRow, setCachedTradeRow] = React.useState<ArbitrageRowType | null>(
    readCachedTradeRow,
  );

  const { data: marketsData, isLoading, error } = useArbitrageMarkets();
  const {
    data: positionsData,
    isBlocking: isPositionsBlocking,
    refetch: refetchPositions,
  } = useArbitragePositions(authenticated);

  const arbRows = React.useMemo(
    () => transformMarketsToRows(marketsData).filter(isArbableRow),
    [marketsData],
  );

  const selectedRow = React.useMemo(() => {
    const rowFromMarkets =
      arbRows.find((row) => row.symbol.toUpperCase() === selectedSymbol) ??
      arbRows.find((row) => row.marketData.symbol.toUpperCase() === selectedSymbol);
    if (rowFromMarkets) return rowFromMarkets;

    const cachedSymbol = cachedTradeRow?.marketData?.symbol?.toUpperCase();
    if (cachedSymbol && cachedSymbol === selectedSymbol) {
      return cachedTradeRow;
    }

    return arbRows[0];
  }, [arbRows, cachedTradeRow, selectedSymbol]);

  React.useEffect(() => {
    const freshRow =
      arbRows.find((row) => row.symbol.toUpperCase() === selectedSymbol) ??
      arbRows.find((row) => row.marketData.symbol.toUpperCase() === selectedSymbol);
    if (!freshRow) return;
    setCachedTradeRow(freshRow);
    try {
      window.sessionStorage.setItem("arb-trade:selected-row", JSON.stringify(freshRow));
    } catch {
      /* sessionStorage may be unavailable in private browsing modes */
    }
  }, [arbRows, selectedSymbol]);

  const positionRows = React.useMemo(
    () => buildPositionRows(positionsData?.pairs ?? [], positionsData?.positions),
    [positionsData?.pairs, positionsData?.positions],
  );
  const [expandedPositionIds, setExpandedPositionIds] = React.useState<Set<string>>(
    () => new Set(),
  );

  const togglePositionExpanded = React.useCallback((id: string) => {
    setExpandedPositionIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelectPosition = React.useCallback(
    (position: TradePositionRow) => {
      const params = new URLSearchParams({
        symbol: position.symbol,
        long: position.long.protocol,
        longSymbol: position.long.symbol,
        short: position.short.protocol,
        shortSymbol: position.short.symbol,
      });
      router.push(`/arb/trade?${params.toString()}`);
    },
    [router],
  );

  const handleClosePosition = React.useCallback(
    async (position: TradePositionRow) => {
      if (!authenticated) {
        toast.custom(() => (
          <PositionToast
            status="failed"
            amount="Wallet"
            symbol="/icons/sol.svg"
            pair="Not Connected"
            description="Please connect your wallet first"
          />
        ));
        return;
      }

      const confirmed = await confirm({
        title: "Close Strategy Position",
        description: `Are you sure you want to close all ${position.label} positions on ${getProtocolLabel(position.long.protocol)} (long) and ${getProtocolLabel(position.short.protocol)} (short)? This action cannot be undone.`,
        confirmText: "Close Position",
        cancelText: "Cancel",
      });
      if (!confirmed) return;

      const closeLabel = position.label;
      const toastId = toast.custom(() => (
        <PositionToast
          status="opening"
          amount={closeLabel}
          symbol="/icons/sol.svg"
          pair={closeLabel}
          title="Closing strategy position..."
          description={`Closing ${closeLabel} on ${getProtocolLabel(position.long.protocol)} and ${getProtocolLabel(position.short.protocol)}`}
        />
      ), { duration: Infinity });

      setClosingPositionId(position.id);
      try {
        const accessToken = getPrivyAccessToken();
        const idToken =
          identityToken ??
          sessionStorage.getItem("privy-id-token") ??
          document.cookie
            .split(";")
            .find((cookie) => cookie.trim().startsWith("privy-id-token="))
            ?.split("=")[1] ??
          null;

        if (!idToken) {
          throw new Error("Authentication token not found. Please reconnect your wallet.");
        }

        const protocols = [position.long.protocol, position.short.protocol].filter(Boolean);
        const result = await closeArbPosition(
          {
            market: position.symbol,
            protocols,
            publicId: position.publicId,
            pairId: position.pairId,
            jitoFeeSol: 0.0001,
          },
          idToken,
          accessToken ?? undefined,
        );

        const closedProtocols = Object.keys(result.closed ?? {});
        const missingProtocols = protocols.filter(
          (protocol) => !closedProtocols.includes(protocol),
        );
        const partialClose = result.status === "success" && missingProtocols.length > 0;

        if (result.status === "success" && !partialClose) {
          const pnlText = result.totalPnl ? ` | PnL: $${result.totalPnl.toFixed(2)}` : "";
          toast.custom(() => (
            <PositionToast
              status="success"
              amount={closeLabel}
              symbol="/icons/sol.svg"
              pair={closeLabel}
              title="Strategy position closed"
              description={`${result.message || "Position closed successfully"}${pnlText}`}
            />
          ), { id: toastId, duration: 5000 });
        } else if (partialClose) {
          toast.custom(() => (
            <PositionToast
              status="failed"
              amount={closeLabel}
              symbol="/icons/sol.svg"
              pair={closeLabel}
              title="Only some legs closed"
              description={`Closed: ${closedProtocols.join(", ") || "none"}. Still open: ${missingProtocols.join(", ")}. Retry to close the remaining leg.`}
            />
          ), { id: toastId, duration: 8000 });
        } else {
          toast.custom(() => (
            <PositionToast
              status="failed"
              amount={closeLabel}
              symbol="/icons/sol.svg"
              pair={closeLabel}
              title="Failed to close position"
              description={result.message || result.error || "The position could not be closed. Please try again."}
            />
          ), { id: toastId, duration: 5000 });
        }

        await refetchPositions();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        toast.custom(() => (
          <PositionToast
            status="failed"
            amount={closeLabel}
            symbol="/icons/sol.svg"
            pair={closeLabel}
            title="Failed to close position"
            description={message}
          />
        ), { id: toastId, duration: 5000 });
      } finally {
        setClosingPositionId(null);
      }
    },
    [authenticated, confirm, identityToken, refetchPositions],
  );

  const handleTpSlSuccess = React.useCallback(
    (applied: { takeProfitPrice?: number; stopLossPrice?: number }) => {
      const target = tpSlPosition;
      if (!target) {
        void refetchPositions();
        return;
      }

      const targetAliases = (() => {
        const set = new Set<string>([target.market.toUpperCase()]);
        for (const [marketSymbol, aliases] of Object.entries(RWA_MARKET_SYMBOL_ALIASES)) {
          if (aliases.some((alias) => set.has(alias))) {
            set.add(marketSymbol);
            aliases.forEach((alias) => set.add(alias));
          }
        }
        return set;
      })();

      const sameLeg = (position: Position, protocol?: string) => {
        if (target.protocol !== protocol) return false;
        if (position.direction !== target.direction) return false;
        const symbol = position.symbol.replace(/-PERP$/i, "").toUpperCase();
        return targetAliases.has(symbol);
      };

      const patch = <T extends Position>(position: T): T =>
        ({
          ...position,
          triggerPrices: {
            ...(position.triggerPrices ?? {}),
            ...(applied.takeProfitPrice !== undefined
              ? { tp: applied.takeProfitPrice }
              : {}),
            ...(applied.stopLossPrice !== undefined
              ? { sl: applied.stopLossPrice }
              : {}),
          },
          ...(applied.takeProfitPrice !== undefined
            ? { takeProfitPrice: applied.takeProfitPrice }
            : {}),
          ...(applied.stopLossPrice !== undefined
            ? { stopLossPrice: applied.stopLossPrice }
            : {}),
        }) as T;

      queryClient.setQueriesData<PositionsResponse>(
        { queryKey: ["arbitrage-positions"] },
        (previous) => {
          if (!previous) return previous;
          const nextPositions = { ...previous.positions } as typeof previous.positions;
          (Object.keys(nextPositions) as Array<keyof typeof nextPositions>).forEach((protocol) => {
            const list = nextPositions[protocol];
            if (!Array.isArray(list)) return;
            nextPositions[protocol] = list.map((position) =>
              sameLeg(position, protocol as string) ? patch(position) : position,
            ) as typeof list;
          });
          const nextPairs: ArbitragePositionPair[] | undefined = previous.pairs?.map(
            (pair) => ({
              ...pair,
              long: sameLeg(pair.long, pair.long.protocol) ? patch(pair.long) : pair.long,
              short: sameLeg(pair.short, pair.short.protocol)
                ? patch(pair.short)
                : pair.short,
            }),
          );
          return { ...previous, positions: nextPositions, pairs: nextPairs };
        },
      );

      void refetchPositions();
    },
    [queryClient, refetchPositions, tpSlPosition],
  );

  return (
    <CommonAppLayout>
      {tpSlPosition && (
        <TpSlDialog
          open
          onClose={() => setTpSlPosition(null)}
          position={tpSlPosition}
          onSuccess={handleTpSlSuccess}
        />
      )}
      <div className="w-full px-2 pb-24 sm:px-3 lg:px-4">
        <div className="mt-2 flex min-h-[calc(100dvh-96px)] min-w-0 flex-col gap-2">
          {isLoading && !selectedRow ? (
            <Skeleton className="h-[520px] w-full sm:h-[600px] lg:h-[640px]" />
          ) : error && !selectedRow ? (
            <div className="flex min-h-[320px] items-center justify-center border border-[#0F1F30] bg-[#041223] px-4 text-center text-sm text-[#7192A5] sm:min-h-[420px]">
              Error loading markets: {error instanceof Error ? error.message : "Unknown error"}
            </div>
          ) : selectedRow ? (
            <ArbitrageTradeModal
              key={`${selectedRow.marketData.symbol}-${selectedLong ?? selectedRow.longProtocol}-${selectedShort ?? selectedRow.shortProtocol}-${selectedLongSymbol}-${selectedShortSymbol}`}
              open
              onOpenChange={() => undefined}
              presentation="page"
              marketData={selectedRow.marketData}
              initialLongLeg={{
                symbol: selectedLongSymbol || selectedRow.longLeg?.symbol || selectedRow.symbol,
                protocol: selectedLong ?? selectedRow.longProtocol,
              }}
              initialShortLeg={{
                symbol: selectedShortSymbol || selectedRow.shortLeg?.symbol || selectedRow.symbol,
                protocol: selectedShort ?? selectedRow.shortProtocol,
              }}
              sourceSymbolByVenue={selectedRow.sourceSymbolByVenue}
              sourceSymbolsByVenue={selectedRow.sourceSymbolsByVenue}
            />
          ) : (
            <div className="flex min-h-[320px] items-center justify-center border border-[#0F1F30] bg-[#041223] px-4 text-center text-sm text-[#7192A5] sm:min-h-[420px]">
              No arbitrage opportunities found.
            </div>
          )}

          <section className="min-w-0 border border-[#0F1F30] bg-[#000D1E]">
            <div className="flex flex-col gap-2 border-b border-[#0F1F30] px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
              <div className="min-w-0">
                <h2 className="text-lg font-normal text-[#BCEBFF]">
                  Positions
                </h2>
                <p className="max-w-2xl text-xs text-[#7192A5]">
                  Select a position to load its pair into the chart and trade panel.
                </p>
              </div>
              <span className="shrink-0 text-sm text-[#7192A5]">
                {positionRows.length} active
              </span>
            </div>
            {isPositionsBlocking ? (
              <div className="grid gap-2 p-3 sm:p-4 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-28 w-full" />
                ))}
              </div>
            ) : positionRows.length > 0 ? (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
                    <thead className="border-b border-[#0F1F30] bg-[#03182B] text-xs font-normal text-[#7192A5]">
                      <tr>
                        <th className="px-4 py-3 font-normal">Asset</th>
                        <th className="px-4 py-3 font-normal">Pair</th>
                        <th className="px-4 py-3 text-right font-normal">Size</th>
                        <th className="px-4 py-3 text-right font-normal">Lev</th>
                        <th className="px-4 py-3 text-right font-normal">Spread</th>
                        <th className="px-4 py-3 text-right font-normal">APR</th>
                        <th className="px-4 py-3 text-right font-normal">Funding</th>
                        <th className="px-4 py-3 text-right font-normal">Liq Dist.</th>
                        <th className="px-4 py-3 text-right font-normal">Next Fund</th>
                        <th className="px-4 py-3 text-right font-normal">Net PnL</th>
                        <th className="px-4 py-3 text-right font-normal">Age</th>
                        <th className="px-4 py-3 text-right font-normal">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {positionRows.map((position) => {
                        const active =
                          position.symbol.toUpperCase() === selectedSymbol &&
                          position.long.protocol === selectedLong &&
                          position.short.protocol === selectedShort;
                        const expanded = expandedPositionIds.has(position.id);
                        const marketRow = findMarketRow(position, arbRows);
                        const leverage = rowLeverage(position);
                        const liqDistance = rowLiqDistance(position);
                        const funding = rowFunding(position);
                        const rowTpSlPosition = tpSlDialogPositionForRow(position);
                        return (
                          <React.Fragment key={position.id}>
                            <tr
                              className={cn(
                                "cursor-pointer border-b border-[#0F1F30] bg-[#041223] transition-colors hover:bg-[#06213A]",
                                active && "bg-[#08263F]",
                              )}
                              onClick={() => handleSelectPosition(position)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  handleSelectPosition(position);
                                }
                              }}
                              role="button"
                              tabIndex={0}
                              title="Load this position"
                            >
                              <td className="px-4 py-3">
                                <div className="flex min-w-0 items-center gap-2">
                                  <button
                                    type="button"
                                    className="grid size-6 shrink-0 place-items-center border border-[#0F1F30] text-[#7192A5] transition hover:border-[#9CE0FF]/50 hover:text-[#BCEBFF]"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      togglePositionExpanded(position.id);
                                    }}
                                    aria-label={expanded ? "Collapse position" : "Expand position"}
                                    aria-expanded={expanded}
                                  >
                                    <ChevronDown
                                      className={cn(
                                        "size-3 transition-transform",
                                        expanded && "rotate-180",
                                      )}
                                    />
                                  </button>
                                  <TokenLogo symbol={position.symbol} className="size-6 shrink-0" />
                                  <span className="truncate text-white">{position.label}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-[#BCEBFF]">
                                <div className="flex min-w-[180px] items-center gap-2">
                                  <ProtocolVenueBadge protocol={position.long.protocol} className="size-4" />
                                  <span className="truncate">{position.long.symbol}</span>
                                  <span className="text-[#7192A5]">/</span>
                                  <ProtocolVenueBadge protocol={position.short.protocol} className="size-4" />
                                  <span className="truncate">{position.short.symbol}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex min-w-[190px] items-center justify-end gap-3">
                                  <span className="text-white">{formatUSD(position.totalMargin, 2)}</span>
                                  <span className="max-w-[105px] truncate text-[11px] text-[#7192A5]">
                                    {formatRowAssetSize(position)}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right text-white">
                                {dashIfMissing(leverage, (n) => `${Number(n.toFixed(2))}x`)}
                              </td>
                              <td className="px-4 py-3 text-right text-[#BCEBFF]">
                                {dashIfMissing(marketRow?.spreadBps1h, (n) => `${n.toFixed(2)} bps`)}
                              </td>
                              <td className="px-4 py-3 text-right text-[#4ADE80]">
                                {dashIfMissing(marketRow?.maxArb, (n) => `+${n.toFixed(2)}%`)}
                              </td>
                              <td
                                className={cn(
                                  "px-4 py-3 text-right",
                                  funding === null ? "text-[#7192A5]" : funding >= 0 ? "text-[#4ADE80]" : "text-[#FF6B6B]",
                                )}
                              >
                                {signedUsd(funding)}
                              </td>
                              <td
                                className={cn(
                                  "px-4 py-3 text-right",
                                  liqDistance === null
                                    ? "text-[#7192A5]"
                                    : liqDistance < 10
                                      ? "text-[#FACC15]"
                                      : "text-[#20E7B5]",
                                )}
                              >
                                {dashIfMissing(liqDistance, (n) => `${n.toFixed(1)}%`)}
                              </td>
                              <td className="px-4 py-3 text-right text-[#BCEBFF]">
                                {nextFundingLabel(position)}
                              </td>
                              <td
                                className={cn(
                                  "px-4 py-3 text-right",
                                  position.pnl >= 0 ? "text-[#4ADE80]" : "text-[#FF6B6B]",
                                )}
                              >
                                {signedUsd(position.pnl)}
                              </td>
                              <td className="px-4 py-3 text-right text-[#7192A5]">
                                {ageLabel(position.createdAt)}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    type="button"
                                    disabled={!rowTpSlPosition}
                                    className="h-8 rounded-none border border-[#123047] bg-[#06192A] px-3 text-xs text-[#BCEBFF] hover:bg-[#0A2238] disabled:cursor-not-allowed disabled:opacity-40"
                                    title={
                                      rowTpSlPosition
                                        ? "Edit TP/SL for this position"
                                        : "TP/SL unavailable for this position"
                                    }
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      if (rowTpSlPosition) {
                                        setTpSlPosition(rowTpSlPosition);
                                      }
                                    }}
                                  >
                                    TP/SL
                                    <Pencil className="size-3" />
                                  </Button>
                                  <Button
                                    type="button"
                                    disabled={closingPositionId === position.id}
                                    className="h-8 rounded-none border border-[#3B1825] bg-[#1B0F1C] px-3 text-xs text-[#FF8290] hover:bg-[#2A1421] disabled:cursor-not-allowed disabled:opacity-60"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void handleClosePosition(position);
                                    }}
                                  >
                                    {closingPositionId === position.id ? "Closing" : "Close"}
                                    <X className="size-3" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                            {expanded ? (
                              <tr className="border-b border-[#0F1F30]">
                                <td colSpan={12} className="p-0">
                                  <ExpandedPositionDetails
                                    position={position}
                                    onSetTpSlPosition={setTpSlPosition}
                                  />
                                </td>
                              </tr>
                            ) : null}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="grid min-w-0 gap-2 p-3 md:hidden">
                  {positionRows.map((position) => {
                    const active =
                      position.symbol.toUpperCase() === selectedSymbol &&
                      position.long.protocol === selectedLong &&
                      position.short.protocol === selectedShort;
                    const expanded = expandedPositionIds.has(position.id);
                    const marketRow = findMarketRow(position, arbRows);
                    const funding = rowFunding(position);
                    return (
                      <div
                        key={position.id}
                        className={cn(
                          "flex min-h-28 min-w-0 cursor-pointer flex-col gap-3 border bg-[#041223] p-3 text-left transition-colors hover:border-[#9CE0FF]/50",
                          active ? "border-[#9CE0FF]/70" : "border-[#0F1F30]",
                        )}
                        onClick={() => handleSelectPosition(position)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            handleSelectPosition(position);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        title="Load this position"
                      >
                        <div className="flex min-w-0 items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <button
                              type="button"
                              className="grid size-7 shrink-0 place-items-center border border-[#0F1F30] text-[#7192A5]"
                              onClick={(event) => {
                                event.stopPropagation();
                                togglePositionExpanded(position.id);
                              }}
                              aria-label={expanded ? "Collapse position" : "Expand position"}
                              aria-expanded={expanded}
                            >
                              <ChevronDown
                                className={cn("size-3 transition-transform", expanded && "rotate-180")}
                              />
                            </button>
                            <TokenLogo symbol={position.symbol} className="size-8 shrink-0" />
                            <div className="min-w-0">
                              <p className="truncate text-base text-white">
                                {position.label}
                              </p>
                              <p className="flex min-w-0 items-center gap-1.5 truncate text-xs text-[#7192A5]">
                                <ProtocolVenueBadge protocol={position.long.protocol} className="size-3" />
                                <span className="truncate">{getProtocolLabel(position.long.protocol)} long</span>
                                <span>/</span>
                                <ProtocolVenueBadge protocol={position.short.protocol} className="size-3" />
                                <span className="truncate">{getProtocolLabel(position.short.protocol)} short</span>
                              </p>
                            </div>
                          </div>
                          <span
                            className={cn(
                              "shrink-0 text-sm",
                              position.pnl >= 0 ? "text-[#4ADE80]" : "text-[#FF6B6B]",
                            )}
                          >
                            {position.pnl >= 0 ? "+" : ""}
                            {formatUSD(position.pnl, 2)}
                          </span>
                        </div>
                        <div className="grid min-w-0 grid-cols-2 gap-2 border-t border-[#0F1F30] pt-3 text-xs">
                          <div className="min-w-0">
                            <p className="text-[#7192A5]">Margin</p>
                            <p className="mt-1 truncate text-white">{formatUSD(position.totalMargin, 2)}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[#7192A5]">Size</p>
                            <p className="mt-1 truncate text-white">{formatRowAssetSize(position)}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[#7192A5]">APR</p>
                            <p className="mt-1 truncate text-[#4ADE80]">
                              {dashIfMissing(marketRow?.maxArb, (n) => `+${n.toFixed(2)}%`)}
                            </p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[#7192A5]">Funding</p>
                            <p
                              className={cn(
                                "mt-1 truncate",
                                funding === null ? "text-[#7192A5]" : funding >= 0 ? "text-[#4ADE80]" : "text-[#FF6B6B]",
                              )}
                            >
                              {signedUsd(funding)}
                            </p>
                          </div>
                        </div>
                        {expanded ? (
                          <div
                            className="-mx-3 -mb-3 mt-1"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <ExpandedPositionDetails
                              position={position}
                              onSetTpSlPosition={setTpSlPosition}
                            />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="flex min-h-28 items-center justify-center px-4 py-8 text-sm text-[#7192A5]">
                No active positions yet.
              </div>
            )}
          </section>
        </div>
      </div>
      {DialogComponent}
    </CommonAppLayout>
  );
}
