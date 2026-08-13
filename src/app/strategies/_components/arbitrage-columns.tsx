/* eslint-disable @next/next/no-img-element */
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/hover-card";
import type { ArbitrageMarket, FundingStats } from "@/lib/arbitrage-api";
import { ArrowUpRightIcon, ChevronDown, ChevronRight, ExternalLinkIcon } from "lucide-react";
import { getAssetLogo, getUnderlyingLabel } from "@/lib/symbol-taxonomy";
import { ProtocolVenueBadge } from "@/components/protocol-venue-badge";
import InfoTooltip from "@/components/info-tooltip";
import {
  type ProtocolId,
  PROTOCOL_LABELS as _PROTOCOL_LABELS,
  PROTOCOL_LOGOS as _PROTOCOL_LOGOS,
  ARB_COLUMN_PROTOCOLS,
  getProtocolLabel,
  getProtocolLogo,
  getProtocolIntervalHours,
  protocolToFundingRateField,
} from "@/lib/protocol-registry";

/**
 * Trade button component for executing arbitrage trades
 */
let tradeRouteShellPrefetched = false;

const TradeButton: React.FC<{
  row: ArbitrageRowType;
}> = ({ row }) => {
  const router = useRouter();
  const marketData = row.marketData;
  const longLeg = React.useMemo(
    () =>
      row.longLeg ?? {
        symbol: row.symbol,
        protocol: row.longProtocol,
        ratePct: 0,
        rateDisplay: "",
      },
    [row.longLeg, row.longProtocol, row.symbol],
  );
  const shortLeg = React.useMemo(
    () =>
      row.shortLeg ?? {
        symbol: row.symbol,
        protocol: row.shortProtocol,
        ratePct: 0,
        rateDisplay: "",
      },
    [row.shortLeg, row.shortProtocol, row.symbol],
  );

  const tradeHref = React.useMemo(() => {
    const params = new URLSearchParams({ symbol: marketData.symbol });
    if (longLeg?.protocol) params.set("long", longLeg.protocol);
    if (longLeg?.symbol) params.set("longSymbol", longLeg.symbol);
    if (shortLeg?.protocol) params.set("short", shortLeg.protocol);
    if (shortLeg?.symbol) params.set("shortSymbol", shortLeg.symbol);
    return `/arb/trade?${params.toString()}`;
  }, [marketData.symbol, longLeg, shortLeg]);

  const cacheTradeRow = React.useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem("arb-trade:selected-row", JSON.stringify(row));
    } catch {
      /* sessionStorage may be unavailable in private browsing modes */
    }
  }, [row]);

  const prefetchTradePage = React.useCallback(() => {
    cacheTradeRow();
    router.prefetch(tradeHref as never);
  }, [cacheTradeRow, router, tradeHref]);

  React.useEffect(() => {
    if (tradeRouteShellPrefetched) return;
    tradeRouteShellPrefetched = true;

    const prefetch = () => {
      router.prefetch("/arb/trade" as never);
    };

    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(prefetch, { timeout: 1500 });
      return () => window.cancelIdleCallback(id);
    }

    const id = setTimeout(prefetch, 0);
    return () => clearTimeout(id);
  }, [router]);

  const handleOpen = React.useCallback(() => {
    cacheTradeRow();
    router.push(tradeHref as never);
  }, [cacheTradeRow, router, tradeHref]);

  return (
    <div className="flex w-[100px] min-w-[100px] shrink-0 items-center justify-end">
      <Button
        variant="primary"
        onClick={handleOpen}
        onMouseEnter={prefetchTradePage}
        onFocus={prefetchTradePage}
        className="font-['Helvetica_Neue'] h-11 w-full cursor-pointer rounded-none border border-white/[0.12] bg-white/[0.06] bg-[radial-gradient(ellipse_at_top_right,rgba(156,224,255,0.12)_0%,transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(156,224,255,0.08)_0%,transparent_55%)] py-4 text-base font-normal text-[#9CE0FF] transition-colors hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span className="text-[#9CE0FF]">Trade</span>
      </Button>
    </div>
  );
};

/**
 * Funding rate cell with hover card showing detailed rate breakdown
 */
export type ProtocolKey = ProtocolId;

const protocolLabels = _PROTOCOL_LABELS;
export const PROTOCOL_LOGOS = _PROTOCOL_LOGOS;

/**
 * Token logo with a three-step resolution chain:
 *   1. Taxonomy-declared local asset (RWAs, equities, indices, forex —
 *      anything registered with a `logo` in symbol-taxonomy.ts).
 *   2. `/api/token/{symbol}` — CoinGecko proxy for crypto tokens.
 *   3. Letter-avatar fallback.
 *
 * To add a new asset logo:
 *   • drop the file in public/images/asset-logos/
 *   • on the matching UnderlyingDefinition set `logo` (and `logoBg` if the
 *     asset is a transparent vector that needs a tile colour).
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
          // Fallback chip mirrors the premium ring used on the image branch
          // so the visual language is consistent whether the logo resolves
          // or we're showing the letter avatar.
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

  // Premium treatment: wrap the image so we can layer a subtle 1px
  // inner ring (white @ 6%) over the asset regardless of its own bg.
  // That replaces the previous flat `border-[#0F1F30]` which read as
  // dev-y. Taxonomy-backed tiles (metals, oil, gas, …) additionally get
  // ~14% inner padding so the vector sits centered inside the circle
  // instead of bleeding to the edge.
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
        loading="lazy"
        decoding="async"
        className={cn(
          "block size-full",
          taxonomy?.bg ? "object-contain p-[14%]" : "object-cover",
        )}
        onError={() => setFailed(true)}
      />
    </span>
  );
};

interface FundingRateCellProps {
  value: string | undefined;
  protocol: ProtocolKey;
  marketData: ArbitrageMarket;
  nextFundingTime?: number;
}

type FundingRateBreakdown = {
  "1hr": number;
  "8hr": number;
  "24hr": number;
  yearly: number;
};

function getVenueFundingStats(
  marketData: ArbitrageMarket,
  protocol: string,
): FundingStats | undefined {
  return (marketData as unknown as Record<string, { fundingStats?: FundingStats } | null | undefined>)[protocol]
    ?.fundingStats;
}

function normalizedRatesFromStats(
  fundingStats: FundingStats | undefined,
): FundingRateBreakdown | null {
  const normalized = fundingStats?.normalized;
  if (
    typeof normalized?.hr1_bps !== "number" ||
    typeof normalized.hr8_bps !== "number" ||
    typeof normalized.daily_bps !== "number" ||
    typeof normalized.yearly_apr_pct !== "number"
  ) {
    return null;
  }
  return {
    "1hr": normalized.hr1_bps,
    "8hr": normalized.hr8_bps,
    "24hr": normalized.daily_bps,
    yearly: normalized.yearly_apr_pct,
  };
}

function parseIntervalHours(interval: string | undefined): number | null {
  if (!interval) return null;
  const match = interval.trim().match(/^(\d+(?:\.\d+)?)\s*h(?:r)?$/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getFundingIntervalHours(
  protocol: string,
  fundingStats: FundingStats | undefined,
): number {
  if (protocol === "lighter") return 8;
  return parseIntervalHours(fundingStats?.interval) ?? getProtocolIntervalHours(protocol);
}

function parsePercentDisplay(value: string | undefined): number | null {
  if (!value || value === "-") return null;
  const parsed = parseFloat(value.replace("%", "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function liveRatesFromDisplay(
  value: string | undefined,
  hoursPerInterval: number,
): FundingRateBreakdown | null {
  const numValue = parsePercentDisplay(value);
  if (numValue === null) return null;
  const safeHours = hoursPerInterval > 0 ? hoursPerInterval : 1;
  const liveRateBps = numValue * 100;
  const hourlyBps = liveRateBps / safeHours;
  return {
    "1hr": hourlyBps,
    "8hr": hourlyBps * 8,
    "24hr": hourlyBps * 24,
    yearly: (numValue / safeHours) * 24 * 365,
  };
}

function spreadBreakdownForRow(row: ArbitrageRowType): FundingRateBreakdown {
  const longStats = getVenueFundingStats(row.marketData, row.longProtocol);
  const shortStats = getVenueFundingStats(row.marketData, row.shortProtocol);
  const longRates = normalizedRatesFromStats(longStats);
  const shortRates = normalizedRatesFromStats(shortStats);

  if (longRates && shortRates) {
    return {
      "1hr": shortRates["1hr"] - longRates["1hr"],
      "8hr": shortRates["8hr"] - longRates["8hr"],
      "24hr": shortRates["24hr"] - longRates["24hr"],
      yearly: shortRates.yearly - longRates.yearly,
    };
  }

  const spreadBps1h = row.spreadBps1h ?? (row.maxArb / 8760) * 100;
  return {
    "1hr": spreadBps1h,
    "8hr": spreadBps1h * 8,
    "24hr": spreadBps1h * 24,
    yearly: row.maxArb,
  };
}

function spreadLabelForRow(row: ArbitrageRowType): string {
  const longLabel = getVenueFundingStats(row.marketData, row.longProtocol)
    ?.normalized?.label;
  const shortLabel = getVenueFundingStats(row.marketData, row.shortProtocol)
    ?.normalized?.label;
  if (longLabel && shortLabel && longLabel === shortLabel) return longLabel;
  if (longLabel || shortLabel) return "Normalized";
  return "Normalized(live)";
}

/**
 * Format an epoch-ms timestamp as a short colon-style countdown.
 *
 *   ≥ 1h    →  "H:MM"    (e.g. "1:05")
 *   < 1h    →  "M:SS"    (e.g. "5:24")
 *
 * The tick interval adapts: 1-second cadence when the countdown is inside
 * the final two minutes, 60-second cadence otherwise. Returns null when
 * the timestamp is missing, invalid, or already past.
 */
function useFundingCountdown(epochMs: number | undefined): string | null {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (epochMs === undefined || !Number.isFinite(epochMs)) return;
    // Tick every second always so the countdown looks live — the displayed
    // seconds digit updates continuously and ≥1h cells (which show H:MM)
    // also stay current. setInterval keeps firing past the boundary so
    // consumers see `null` immediately after delta ≤ 0 instead of holding
    // a stale value until the next API refresh.
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [epochMs]);
  if (epochMs === undefined || !Number.isFinite(epochMs)) return null;
  const deltaMs = epochMs - now;
  if (deltaMs <= 0) return null;
  const totalSec = Math.floor(deltaMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const remAfterH = totalSec % 3600;
  const m = Math.floor(remAfterH / 60);
  const s = remAfterH % 60;
  // HH:MM:SS always — keeps width stable across cells (no jitter as the
  // value crosses an hour boundary) and lines up nicely under the rate.
  const hh = h.toString().padStart(2, "0");
  const mm = m.toString().padStart(2, "0");
  const ss = s.toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

const FundingRateCell: React.FC<FundingRateCellProps> = ({
  value,
  protocol,
  marketData,
  nextFundingTime,
}) => {
  const countdown = useFundingCountdown(nextFundingTime);
  const fundingStats = getVenueFundingStats(marketData, protocol);
  const hoursPerInterval = getFundingIntervalHours(protocol, fundingStats);
  const intervalLabel = fundingStats?.interval ?? `${hoursPerInterval}hr`;
  const effectiveRates =
    normalizedRatesFromStats(fundingStats) ??
    liveRatesFromDisplay(value, hoursPerInterval);
  const numValue = parsePercentDisplay(value);

  if (numValue === null) {
    return (
      <div className="flex w-[120px] min-w-[120px] items-center">
        <span className="text-sm text-[#7192A5]">-</span>
      </div>
    );
  }

  // Main cell: show the live fundingRate from the API, normalized to 1hr.
  // For 1hr protocols this is just numValue as-is.
  // For Aster/Lighter (variable interval), divide by interval hours so all
  // columns are comparable on a per-hour basis.
  // intervalHours comes from fundingStats.interval (accurate per-market API value).
  const displayPct = numValue / hoursPerInterval;
  const isPositive = displayPct >= 0;

  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div className="flex w-[120px] min-w-[120px] cursor-pointer flex-col items-start gap-0.5 rounded-none">
          <span
            className={cn(
              "text-sm font-normal",
              isPositive ? "text-[#FF6B6B]" : "text-[#4ADE80]",
            )}
          >
            {displayPct.toFixed(4)}%
          </span>
          {countdown && (
            <span
              className="inline-flex items-center gap-1 pl-2 text-[10px] leading-none tracking-tight tabular-nums text-[#7192A5]"
              title={`Next funding in ${countdown}`}
            >
              <img
                src="/icons/Union.png"
                alt=""
                className="size-2 shrink-0"
                loading="lazy"
                decoding="async"
              />
              {countdown}
            </span>
          )}
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
              alt={protocolLabels[protocol]}
              className="h-4 w-4 shrink-0 rounded-full"
            />
            <span className="font-medium text-white">
              {protocolLabels[protocol]}
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
            <span className="text-[#7192A5]">Raw ({intervalLabel}):</span>
            <span className="text-white">
              {(fundingStats?.raw_bps ?? numValue * 100).toFixed(4)} bps
            </span>
          </div>
          <div className="my-1.5 border-t border-[#0F1F30]" />
          <span className="text-xs text-[#7192A5]/80 italic">
            {fundingStats?.normalized?.label ?? "Normalized(live)"}
          </span>
          <div className="flex justify-between">
            <span className="text-[#7192A5]">1hr:</span>
            <span className="text-white">{(effectiveRates?.["1hr"] ?? 0).toFixed(4)} bps</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#7192A5]">8hr:</span>
            <span className="text-white">{(effectiveRates?.["8hr"] ?? 0).toFixed(4)} bps</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#7192A5]">Daily:</span>
            <span className="text-white">{(effectiveRates?.["24hr"] ?? 0).toFixed(4)} bps</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#7192A5]">Yearly:</span>
            <span className="text-white">{(effectiveRates?.yearly ?? 0).toFixed(4)}% APR</span>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};

const ApyCell: React.FC<{ row: ArbitrageRowType }> = ({ row }) => {
  const maxArb = row.maxArb;
  const spreadRates = spreadBreakdownForRow(row);
  const spreadLabel = spreadLabelForRow(row);
  const normalizedApy = spreadRates.yearly;
  const rawApy = maxArb;

  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div className="flex w-[100px] min-w-[100px] cursor-pointer items-center">
          <span className="text-sm font-normal text-[#4ADE80]">
            {rawApy.toFixed(4)}%
          </span>
        </div>
      </HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        sideOffset={8}
        className="w-52 rounded-none border border-[#0F1F30] bg-[#041223] p-0 text-sm shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-[#0F1F30] px-4 py-2.5">
          <span className="font-medium text-white">Spread Breakdown</span>
          <span className="text-[#7192A5]">{row.symbol}</span>
        </div>
        <div className="space-y-1.5 px-4 py-3 text-xs">
          <div className="flex justify-between">
            <span className="text-[#7192A5]">RawAPR:</span>
            <span className="text-[#4ADE80]">{rawApy.toFixed(4)}%</span>
          </div>
          <div className="my-1.5 border-t border-[#0F1F30]" />
          <div className="flex justify-between">
            <span className="text-xs text-[#7192A5]/80 italic">
              {spreadLabel}
            </span>
            <InfoTooltip iconClassName="text-[#7192A5]">
              Normalized data of last 72 hours
            </InfoTooltip>
          </div>
          <div className="flex justify-between">
            <span className="text-[#7192A5]">1hr:</span>
            <span className="text-[#4ADE80]">
              {spreadRates["1hr"].toFixed(2)} bps
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#7192A5]">8hr:</span>
            <span className="text-[#4ADE80]">
              {spreadRates["8hr"].toFixed(2)} bps
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#7192A5]">Daily:</span>
            <span className="text-[#4ADE80]">
              {spreadRates["24hr"].toFixed(2)} bps
            </span>
          </div>
          <div className="my-1.5 border-t border-[#0F1F30]" />
          <div className="flex justify-between">
            <span className="text-[#7192A5]">APR:</span>
            <span className="text-[#4ADE80]">{normalizedApy.toFixed(4)}%</span>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};

export interface PairLeg {
  /** Upstream symbol actually quoted on the venue (e.g. "CL" or "WTI"). */
  symbol: string;
  /** Venue/protocol. */
  protocol: ProtocolKey;
  /** Per-hour funding rate in percent units (e.g. 0.0015 for 0.0015%). */
  ratePct: number;
  /** Raw display string from the API (e.g. "0.0015%"). */
  rateDisplay: string;
  /** Funding interval in hours for this leg. */
  intervalHours?: number;
  /** Next settlement epoch ms (staging API; undefined on prod). */
  nextFundingTime?: number;
}

export interface ArbitrageRowType {
  id: string;
  symbol: string;
  oiRank: number; // Index/rank based on funding rate
  maxArb: number; // Annualized spread APR shown in the screener
  spreadBps1h?: number; // Hourly spread in basis points for BPS views
  longProtocol: ProtocolKey;
  shortProtocol: ProtocolKey;
  fundingRateDrift?: string;
  fundingRateFlash?: string;
  fundingRatePacifica?: string;
  fundingRateHyperliquid?: string;
  fundingRateAster?: string;
  fundingRateLighter?: string;
  fundingRate01?: string;
  fundingRatePhoenix?: string;
  fundingRateHlXyz?: string;
  fundingRateHlFlx?: string;
  fundingRateHlHyna?: string;
  fundingRateHlKm?: string;
  fundingRateHlCash?: string;
  fundingRateHlPara?: string;
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
  marketData: ArbitrageMarket; // Store full market data for trade execution
  /** Loose UI category (oil-gas, metals, equities, …). */
  category: string;
  /** Canonical underlying key. Same across aliased symbols. */
  underlying: string;
  /** Upstream symbols that rolled into this row (e.g. ["WTI","CL"]). */
  constituentSymbols: string[];
  /** Exact source ticker to use for a venue after alias merging. */
  sourceSymbolByVenue?: Partial<Record<ProtocolKey, string>>;
  /** All source tickers available for each venue inside an alias-merged row. */
  sourceSymbolsByVenue?: Partial<Record<ProtocolKey, string[]>>;
  /** "single" = one row per underlying, "group" = underlying summary with
   * child pairs, "pair" = one executable (long,short) combo under a group. */
  pairKind: "single" | "group" | "pair";
  /** Populated when pairKind === "pair": the exact long leg this row represents. */
  longLeg?: PairLeg;
  /** Populated when pairKind === "pair": the exact short leg this row represents. */
  shortLeg?: PairLeg;
  /** Child pair rows for expandable underlying summaries. */
  subPools?: ArbitrageRowType[];
  /** Number of executable pairs grouped under this row. */
  pairCount?: number;
  /** Lowercase concatenation of label/category/constituents for search. */
  searchableText: string;
  /** Earliest next-funding-time across both legs (pair rows) or across
   *  all populated venue quotes (single rows). Epoch ms. */
  nextFundingTime?: number;
  /** Per-venue next-funding-time (epoch ms) for inline countdown on rate cells. */
  nextFundingTimeByVenue?: Partial<Record<ProtocolKey, number>>;
}

interface ArbitrageColumnOptions {
  showPncRwaPairs?: boolean;
}

export const getArbitrageColumns = ({
  showPncRwaPairs = true,
}: ArbitrageColumnOptions = {}): ColumnDef<ArbitrageRowType>[] => [
  {
    accessorKey: "symbol",
    header: () => (
      <p className="shrink-0 pl-8 text-xs font-light tracking-[-1%] text-[#7192A5]">
        Assets
      </p>
    ),
    cell: ({ row }) => {
      const data = row.original;
      const symbol = data.symbol;
      const longLeg = row.original.longLeg;
      const shortLeg = row.original.shortLeg;
      const isGroupRow = data.pairKind === "group";
      const isPairRow = data.pairKind === "pair";
      const canExpand =
        showPncRwaPairs && row.getCanExpand() && Boolean(data.subPools?.length);
      const showPairCount =
        showPncRwaPairs &&
        isGroupRow &&
        typeof data.pairCount === "number" &&
        data.pairCount > 1;
      // Only show the subtitle for cross-alias pair rows (two legs with
      // different tickers). Same-ticker pairs — e.g. SPX ↔ SPX across two
      // venues — don't need it; the venues are implied by the rate cells.
      const showAliasRow =
        isPairRow &&
        longLeg &&
        shortLeg &&
        longLeg.symbol.toUpperCase() !== shortLeg.symbol.toUpperCase();
      const underlyingLabel = getUnderlyingLabel(symbol).toUpperCase();
      const bestPairLabel = longLeg && shortLeg
        ? `${longLeg.symbol}/${getProtocolLabel(longLeg.protocol as ProtocolId)} ↔ ${shortLeg.symbol}/${getProtocolLabel(shortLeg.protocol as ProtocolId)}`
        : null;
      return (
        <div
          className={cn(
            "flex w-[250px] min-w-[250px] items-center gap-2.5",
            isPairRow ? "pl-12" : "pl-7",
          )}
        >
          {canExpand ? (
            row.getIsExpanded() ? (
              <ChevronDown className="size-4 shrink-0 text-[#7192A5]" />
            ) : (
              <ChevronRight className="size-4 shrink-0 text-[#7192A5]" />
            )
          ) : (
            <span className="w-4 shrink-0" />
          )}
          <TokenLogo symbol={symbol} className="h-8 w-8 bg-white/10" />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="shrink-0 truncate text-[15px] font-medium tracking-[-0.02em] text-white">
              {underlyingLabel}
            </span>
            {isGroupRow && bestPairLabel && (
              <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] leading-none tracking-tight text-[#7192A5]">
                {showPairCount && (
                  <span className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-1 text-[10px] uppercase tracking-[0.08em] text-[#9CE0FF]">
                    {data.pairCount} pairs
                  </span>
                )}
                <span className="truncate">{bestPairLabel}</span>
              </div>
            )}
            {showAliasRow && (
              <div
                className="flex items-center gap-1.5 text-[11px] leading-none tracking-tight text-[#7192A5]"
                title={`Long ${longLeg.symbol}/${getProtocolLabel(longLeg.protocol as ProtocolId)} · Short ${shortLeg.symbol}/${getProtocolLabel(shortLeg.protocol as ProtocolId)}`}
              >
                <span className="font-medium">{longLeg.symbol}</span>
                <ProtocolVenueBadge protocol={longLeg.protocol} />
                <span className="text-[#4A6073]">↔</span>
                <span className="font-medium">{shortLeg.symbol}</span>
                <ProtocolVenueBadge protocol={shortLeg.protocol} />
              </div>
            )}
            {isPairRow && !showAliasRow && bestPairLabel && (
              <div className="flex items-center gap-1.5 text-[11px] leading-none tracking-tight text-[#7192A5]">
                <span className="truncate">{bestPairLabel}</span>
              </div>
            )}
          </div>
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
        className="ml-5 flex shrink-0 cursor-pointer items-center gap-1 text-xs font-light tracking-[-1%] text-[#7192A5] hover:text-[#BBEBFF]"
        onClick={() => column.toggleSorting()}
      >
        OI Rank
        <span className="text-[10px]">
          {column.getIsSorted() === "asc"
            ? "▲"
            : column.getIsSorted() === "desc"
              ? "▼"
              : "⇅"}
        </span>
      </button>
    ),
    cell: ({ row }) => {
      if (row.original.pairKind === "pair") {
        return (
          <div className="ml-5 flex w-[120px] min-w-[120px] items-center justify-start">
            <span className="ml-5 text-sm font-normal text-[#4A6073]">—</span>
          </div>
        );
      }
      return (
        <div className="ml-5 flex w-[120px] min-w-[120px] items-center justify-start">
          <span className="ml-5 text-sm font-normal text-white">
            {row.original.oiRank}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "maxArb",
    enableSorting: true,
    header: ({ column }) => (
      <button
        type="button"
        className="flex shrink-0 cursor-pointer items-center gap-1 text-xs font-light tracking-[-1%] text-[#7192A5] hover:text-[#BBEBFF]"
        onClick={() => column.toggleSorting()}
      >
        APR
        <span className="text-[10px]">
          {column.getIsSorted() === "asc"
            ? "▲"
            : column.getIsSorted() === "desc"
              ? "▼"
              : "⇅"}
        </span>
        <InfoTooltip iconClassName="text-[#7192A5]">
          <p className="text-sm text-[#7192A5]">
            Estimated annualized funding rate.
          </p>
        </InfoTooltip>
      </button>
    ),
    cell: ({ row }) => <ApyCell row={row.original} />,
  },
  // Protocol funding rate columns — generated dynamically from registry
  ...ARB_COLUMN_PROTOCOLS.map((protocolId) => {
    const fieldKey = protocolToFundingRateField(protocolId);
    return {
      accessorKey: fieldKey,
      header: () => (
        <div className="flex shrink-0 items-center gap-1.5">
          <img
            src={getProtocolLogo(protocolId)}
            alt={getProtocolLabel(protocolId)}
            className="h-4 w-4 rounded-full"
            loading="lazy"
            decoding="async"
          />
          <span className="text-xs font-light tracking-[-1%] text-[#7192A5]">
            {getProtocolLabel(protocolId)}
          </span>
        </div>
      ),
      cell: ({ row }: { row: { original: ArbitrageRowType } }) => (
        <FundingRateCell
          value={(row.original as unknown as Record<string, string | undefined>)[fieldKey]}
          protocol={protocolId as ProtocolKey}
          marketData={row.original.marketData}
          nextFundingTime={row.original.nextFundingTimeByVenue?.[protocolId as ProtocolKey]}
        />
      ),
    };
  }),
  {
    id: "action",
    header: () => (
      <p className="w-full shrink-0 text-center text-xs font-light tracking-[-1%] text-[#7192A5]">
        Action
      </p>
    ),
    cell: ({ row }) => {
      return (
        <div className="flex w-full items-center justify-center">
          <TradeButton
            row={row.original}
          />
        </div>
      );
    },
  },
];
