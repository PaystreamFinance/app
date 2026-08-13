"use client";

import React from "react";
import {
  Area,
  ComposedChart,
  Customized,
  Line,

  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import {
  useFundingRateHistoryAll,
  getIntervalHours,
} from "@/app/portfolio/hooks/use-funding-rate-history";
import { getProtocolLabel } from "@/lib/protocol-registry";
import { ChartLoading } from "@/components/chart-loading";

type Timeframe = "3D" | "1M" | "3M";
type ChartView = "long" | "short" | "merged";
// Widened to any ArbExecProtocol (base 5 + "01" + 6 HIP-3) so the chart
// accepts HIP-3 legs without type gymnastics at call sites. ArbExecProtocol
// is the canonical union and already includes "01".
type ProtocolName = import("@/lib/arbitrage-api").ArbExecProtocol;

interface ChartDataPoint {
  timestamp: number;
  dateLabel: string;
  value: number;
}

interface MergedDataPoint {
  timestamp: number;
  dateLabel: string;
  longValue: number;
  shortValue: number;
  netValue: number;
  cumulativeNet: number;
}

const chartConfig = {
  value: { label: "Funding Rate" },
  longValue: { label: "Long" },
  shortValue: { label: "Short" },
  netValue: { label: "Short − Long" },
} satisfies ChartConfig;

const POSITIVE_STROKE = "#9CE0FF";
const NEGATIVE_STROKE = "#FF6B6B";
const LONG_LINE_COLOR = "#4ADE80";
const SHORT_LINE_COLOR = "#FF6B6B";
const SETTLEMENT_HOURS_UTC = [0, 8, 16];

// ─── Y-axis: symmetric, dynamic domain derived from data ───

function computeYConfig(values: number[]): {
  domain: [number, number];
  ticks: number[];
} {
  if (!values.length) {
    return {
      domain: [-0.3 / 10000, 0.3 / 10000],
      ticks: [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3].map((v) => v / 10000),
    };
  }

  const maxAbsBps = Math.max(...values.map((v) => Math.abs(v))) * 10000;
  const padded = maxAbsBps * 1.1;

  let rangeBps: number;
  if (padded <= 0.3) rangeBps = 0.3;
  else if (padded <= 0.5) rangeBps = 0.5;
  else if (padded <= 0.75) rangeBps = 0.75;
  else if (padded <= 1) rangeBps = 1;
  else if (padded <= 1.25) rangeBps = 1.25;
  else if (padded <= 1.5) rangeBps = 1.5;
  else if (padded <= 1.75) rangeBps = 1.75;
  else if (padded <= 2) rangeBps = 2;
  else if (padded <= 2.25) rangeBps = 2.25;
  else if (padded <= 2.5) rangeBps = 2.5;
  else if (padded <= 3) rangeBps = 3;
  else if (padded <= 5) rangeBps = 5;
  else if (padded <= 10) rangeBps = 10;
  else if (padded <= 30) rangeBps = 30;
  else rangeBps = 75;

  let intervalBps: number;
  if (rangeBps <= 0.5) intervalBps = 0.1;
  else if (rangeBps <= 1) intervalBps = 0.25;
  else if (rangeBps <= 3) intervalBps = 0.5;
  else if (rangeBps <= 5) intervalBps = 1;
  else if (rangeBps <= 10) intervalBps = 2;
  else if (rangeBps <= 30) intervalBps = 5;
  else intervalBps = 25;

  const bound = rangeBps / 10000;
  const ticks: number[] = [];
  const steps = Math.round(rangeBps / intervalBps);
  for (let i = -steps; i <= steps; i++) {
    ticks.push((i * intervalBps) / 10000);
  }

  return { domain: [-bound, bound], ticks };
}

function formatBpsTick(value: number): string {
  const bps = value * 10000;
  if (Math.abs(bps) < 0.005) return "0";
  if (Number.isInteger(bps)) return bps.toFixed(0);
  const s = bps.toFixed(2);
  return s.replace(/0+$/, "").replace(/\.$/, "");
}

// ─── X-axis: ticks derived from actual data points ───

function computeXTicks(timestamps: number[], tf: Timeframe): number[] {
  if (!timestamps.length) return [];

  if (tf === "1M") {
    let prevDate = -1;
    return timestamps.filter((ts) => {
      const date = new Date(ts).getUTCDate();
      if (date !== prevDate) {
        prevDate = date;
        return true;
      }
      return false;
    });
  }

  if (tf === "3D") {
    return timestamps.filter((ts) =>
      SETTLEMENT_HOURS_UTC.includes(new Date(ts).getUTCHours()),
    );
  }

  // 3M: Monday midnight only
  return timestamps.filter((ts) => {
    const dt = new Date(ts);
    return dt.getUTCDay() === 1 && dt.getUTCHours() === 0;
  });
}

function formatXTickLabel(ts: number, tf: Timeframe): string {
  const d = new Date(ts);
  const h = d.getUTCHours();

  if (tf === "3D") {
    if (h === 0) {
      return `${d.toLocaleString("en", { month: "short", timeZone: "UTC" })} ${d.getUTCDate()}`;
    }
    if (SETTLEMENT_HOURS_UTC.includes(h)) {
      return `${h.toString().padStart(2, "0")}:00`;
    }
    return "";
  }

  if (tf === "1M") {
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  }

  return `${d.toLocaleString("en", { month: "short", timeZone: "UTC" })} ${d.getUTCDate()}`;
}

function XTickRenderer(tf: Timeframe) {
  const Component = ({ x, y, payload }: any) => {
    if (!payload?.value) return null;
    const ts = payload.value as number;
    const h = new Date(ts).getUTCHours();
    const isMidnight = h === 0;
    const isSettlement = SETTLEMENT_HOURS_UTC.includes(h);
    const tickLen = isSettlement ? 8 : 4;
    const tickStroke = isMidnight ? "#7192A5" : "#1A3347";
    const label = formatXTickLabel(ts, tf);

    return (
      <g transform={`translate(${x},${y})`}>
        <line y1={0} y2={tickLen} stroke={tickStroke} strokeWidth={1} />
        {label && (
          <text
            x={0}
            y={tickLen + 12}
            textAnchor="middle"
            fill="#7192A5"
            fontSize={11}
            fontFamily="inherit"
          >
            {label}
          </text>
        )}
      </g>
    );
  };
  Component.displayName = "XTick";
  return Component;
}

const CustomActiveDot = (props: any) => {
  const { cx, cy } = props;
  if (cx == null || cy == null) return null;

  return (
    <g>
      <line
        x1="0"
        y1={cy}
        x2="100%"
        y2={cy}
        stroke="#7092A5"
        strokeWidth={1}
        strokeDasharray="5 5"
      />
      <line
        x1={cx}
        y1="0"
        x2={cx}
        y2="100%"
        stroke="#7092A5"
        strokeWidth={1}
        strokeDasharray="5 5"
      />
      <circle
        cx={cx}
        cy={cy}
        r={4}
        fill="#041223"
        stroke="#BCEAFF"
        strokeWidth={2}
      />
    </g>
  );
};

// ─── Data helpers ───

function toChartPoints(
  entries: { timestamp: number; fundingRate: number }[],
): ChartDataPoint[] {
  return entries.map((e) => {
    const d = new Date(e.timestamp);
    return {
      timestamp: e.timestamp,
      dateLabel: `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${d.getUTCHours()}:00`,
      value: e.fundingRate,
    };
  });
}

const HOUR_MS = 3_600_000;
const snapToHour = (ts: number) => Math.round(ts / HOUR_MS) * HOUR_MS;

/**
 * Normalize entries to per-hour rates and expand sparse entries to fill hourly gaps.
 *
 * Two cases:
 * 1. Entries already at 1h cadence (e.g. Lighter — stored every 1h but each value is an 8h rate):
 *    Just divide each rate by hoursPerInterval. No expansion needed — gaps don't exist.
 * 2. Entries at hoursPerInterval cadence (e.g. Aster with genuine 8h gaps):
 *    Divide by hoursPerInterval AND expand each entry backwards to fill the gap with
 *    synthetic hourly points so the chart renders as a continuous line.
 */
function expandToHourly(
  entries: { timestamp: number; fundingRate: number }[],
  hoursPerInterval: number,
): { timestamp: number; fundingRate: number }[] {
  if (hoursPerInterval <= 1) return entries;

  // Detect actual recording cadence from median timestamp gap
  const actualGapHours = (() => {
    if (entries.length < 2) return hoursPerInterval;
    const gaps: number[] = [];
    for (let i = 1; i < entries.length; i++) {
      gaps.push(Math.abs(entries[i]!.timestamp - entries[i - 1]!.timestamp));
    }
    gaps.sort((a, b) => a - b);
    return gaps[Math.floor(gaps.length / 2)]! / HOUR_MS;
  })();

  // If entries are already 1h-spaced, just normalize rates — no expansion
  if (actualGapHours <= 1) {
    return entries.map((e) => ({
      timestamp: e.timestamp,
      fundingRate: e.fundingRate / hoursPerInterval,
    }));
  }

  // Genuine sparse entries (e.g. Aster 8h gaps): expand backwards to fill hourly gaps
  const expanded: { timestamp: number; fundingRate: number }[] = [];
  for (const entry of entries) {
    const hourlyRate = entry.fundingRate / hoursPerInterval;
    for (let h = 0; h < hoursPerInterval; h++) {
      expanded.push({
        timestamp: entry.timestamp - h * HOUR_MS,
        fundingRate: hourlyRate,
      });
    }
  }

  expanded.sort((a, b) => a.timestamp - b.timestamp);
  const seen = new Set<number>();
  return expanded.filter((e) => {
    const snapped = snapToHour(e.timestamp);
    if (seen.has(snapped)) return false;
    seen.add(snapped);
    return true;
  });
}

function computeMerged(
  longEntries: { timestamp: number; fundingRate: number }[],
  shortEntries: { timestamp: number; fundingRate: number }[],
): MergedDataPoint[] {
  const shortMap = new Map(
    shortEntries.map((e) => [snapToHour(e.timestamp), e.fundingRate]),
  );
  const points: MergedDataPoint[] = [];
  const seen = new Set<number>();
  let cumulative = 0;

  for (const le of longEntries) {
    const snapped = snapToHour(le.timestamp);
    if (seen.has(snapped)) continue;
    seen.add(snapped);
    const sr = shortMap.get(snapped);
    if (sr === undefined) continue;
    const net = sr - le.fundingRate;
    cumulative += net;
    const d = new Date(snapped);
    points.push({
      timestamp: snapped,
      dateLabel: `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${d.getUTCHours()}:00`,
      longValue: le.fundingRate,
      shortValue: sr,
      netValue: net,
      cumulativeNet: cumulative,
    });
  }

  return points;
}

const GradientDefs = (props: any) => {
  const { offset, height } = props;
  if (!offset || !height) return null;

  const plotTop = offset.top as number;
  const plotBottom = (height as number) - (offset.bottom as number);

  return (
    <defs>
      <linearGradient
        id="funding-stroke-gradient"
        gradientUnits="userSpaceOnUse"
        x1="0"
        y1={plotTop}
        x2="0"
        y2={plotBottom}
      >
        <stop offset="0%" stopColor={POSITIVE_STROKE} />
        <stop offset="49.99%" stopColor={POSITIVE_STROKE} />
        <stop offset="50.01%" stopColor={NEGATIVE_STROKE} />
        <stop offset="100%" stopColor={NEGATIVE_STROKE} />
      </linearGradient>
      <linearGradient
        id="funding-fill-gradient"
        gradientUnits="userSpaceOnUse"
        x1="0"
        y1={plotTop}
        x2="0"
        y2={plotBottom}
      >
        <stop offset="0%" stopColor={POSITIVE_STROKE} stopOpacity={0.5} />
        <stop offset="50%" stopColor={POSITIVE_STROKE} stopOpacity={0} />
        <stop offset="50%" stopColor={NEGATIVE_STROKE} stopOpacity={0} />
        <stop offset="100%" stopColor={NEGATIVE_STROKE} stopOpacity={0.4} />
      </linearGradient>
      <linearGradient
        id="net-blue-fill"
        gradientUnits="userSpaceOnUse"
        x1="0"
        y1={plotTop}
        x2="0"
        y2={plotBottom}
      >
        <stop offset="0%" stopColor={POSITIVE_STROKE} stopOpacity={0.35} />
        <stop offset="100%" stopColor={POSITIVE_STROKE} stopOpacity={0} />
      </linearGradient>
      <linearGradient
        id="merged-net-fill"
        gradientUnits="userSpaceOnUse"
        x1="0"
        y1={plotTop}
        x2="0"
        y2={plotBottom}
      >
        <stop offset="0%" stopColor={POSITIVE_STROKE} stopOpacity={0.25} />
        <stop offset="50%" stopColor={POSITIVE_STROKE} stopOpacity={0} />
        <stop offset="50%" stopColor={NEGATIVE_STROKE} stopOpacity={0} />
        <stop offset="100%" stopColor={NEGATIVE_STROKE} stopOpacity={0.2} />
      </linearGradient>
    </defs>
  );
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function protocolLabel(protocol: string): string {
  return getProtocolLabel(protocol) || capitalize(protocol);
}

function normalizeHistorySymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/-PERP$/i, "");
}

function findProtocolHistory(
  allHistory: Record<string, Record<string, { timestamp: number; fundingRate: number }[] | null>> | undefined,
  symbol: string,
  protocol: string,
): { entries: { timestamp: number; fundingRate: number }[]; symbolKey: string } {
  if (!allHistory || !symbol) return { entries: [], symbolKey: symbol };
  const normalized = normalizeHistorySymbol(symbol);
  const quoteStripped = normalized.replace(/(?:USDT|USD)$/i, "");
  const candidates = Array.from(new Set([
    symbol,
    symbol.toUpperCase(),
    normalized,
    quoteStripped,
  ].filter(Boolean)));

  for (const key of candidates) {
    const entries = allHistory[key]?.[protocol];
    if (entries?.length) return { entries, symbolKey: key };
  }

  return { entries: [], symbolKey: normalized || symbol };
}

// ─── Component ───

interface FundingRateChartProps {
  symbol: string;
  longSymbol?: string;
  shortSymbol?: string;
  longProtocol: ProtocolName;
  shortProtocol: ProtocolName;
  singleProtocol?: ProtocolName;
  /** Extra content rendered in the header's top-right (before the
   *  timeframe pill). Used by the trade modal to inline the
   *  Price Graph / Back Testing tab switcher beside "Max Funding arb". */
  rightHeaderExtra?: React.ReactNode;
  /** Extra tab-style content rendered immediately after the existing
   *  chart tabs on the LEFT. Used by the trade modal to add a
   *  "Back Testing" pseudo-tab beside "Max Funding arb". */
  leftHeaderBefore?: React.ReactNode;
  leftHeaderExtra?: React.ReactNode;
  mergedLabel?: string;
}

const FundingRateChart: React.FC<FundingRateChartProps> = ({
  symbol,
  longSymbol,
  shortSymbol,
  longProtocol,
  shortProtocol,
  singleProtocol: singleProtocolProp,
  rightHeaderExtra,
  leftHeaderBefore,
  leftHeaderExtra,
  mergedLabel = "Max Funding arb",
}) => {
  const { data: allHistory, isLoading } = useFundingRateHistoryAll();
  const resolvedLongSymbol = longSymbol ?? symbol;
  const resolvedShortSymbol = shortSymbol ?? symbol;
  const longLookup = React.useMemo(
    () => findProtocolHistory(allHistory, resolvedLongSymbol, longProtocol),
    [allHistory, resolvedLongSymbol, longProtocol],
  );
  const shortLookup = React.useMemo(
    () => findProtocolHistory(allHistory, resolvedShortSymbol, shortProtocol),
    [allHistory, resolvedShortSymbol, shortProtocol],
  );

  // Auto-detect single mode: if one protocol has no history, show only the other
  const autoSingleSide = React.useMemo<"long" | "short" | undefined>(() => {
    const longHasData = longLookup.entries.length > 0;
    const shortHasData = shortLookup.entries.length > 0;
    if (singleProtocolProp) {
      if (singleProtocolProp === shortProtocol && shortHasData && !longHasData) return "short";
      return "long";
    }
    if (longHasData && !shortHasData) return "long";
    if (!longHasData && shortHasData) return "short";
    return undefined;
  }, [singleProtocolProp, longLookup.entries.length, shortLookup.entries.length, shortProtocol]);

  const isSingleMode = !!autoSingleSide;
  const [timeframe, setTimeframe] = React.useState<Timeframe>("3D");
  const [activeView, setActiveView] = React.useState<ChartView>(
    isSingleMode ? "long" : "merged",
  );

  // Reset activeView when single mode changes
  React.useEffect(() => {
    setActiveView(isSingleMode ? "long" : "merged");
  }, [isSingleMode]);

  const effectiveLongProtocol = isSingleMode && autoSingleSide === "short"
    ? shortProtocol
    : longProtocol;
  const effectiveLongSymbol = isSingleMode && autoSingleSide === "short"
    ? resolvedShortSymbol
    : resolvedLongSymbol;
  const effectiveLongLookup = isSingleMode && autoSingleSide === "short"
    ? shortLookup
    : longLookup;
  const resolvedShortProtocol = shortProtocol;

  const longRaw = React.useMemo(() => {
    const raw = effectiveLongLookup.entries;
    const hours = getIntervalHours(effectiveLongProtocol, raw);
    return expandToHourly(raw, hours);
  }, [effectiveLongLookup.entries, effectiveLongProtocol]);

  const shortRaw = React.useMemo(() => {
    if (isSingleMode) return [];
    const raw = shortLookup.entries;
    const hours = getIntervalHours(resolvedShortProtocol, raw);
    return expandToHourly(raw, hours);
  }, [shortLookup.entries, resolvedShortProtocol, isSingleMode]);

  const allLong = React.useMemo(() => toChartPoints(longRaw), [longRaw]);
  const allShort = React.useMemo(() => toChartPoints(shortRaw), [shortRaw]);
  const allMerged = React.useMemo(
    () => computeMerged(longRaw, shortRaw),
    [longRaw, shortRaw],
  );

  const filterByTimeframe = React.useCallback(
    <T extends { timestamp: number }>(points: T[]) => {
      if (!points.length) return points;
      const now = Date.now();
      const msPerDay = 86400000;
      const windowMs =
        timeframe === "3D"
          ? 3 * msPerDay
          : timeframe === "1M"
            ? 30 * msPerDay
            : 90 * msPerDay;
      const from = now - windowMs;
      return points.filter((p) => p.timestamp >= from);
    },
    [timeframe],
  );

  const chartData = React.useMemo(() => {
    if (activeView === "merged") return [] as ChartDataPoint[];
    const source = activeView === "long" ? allLong : allShort;
    return filterByTimeframe(source);
  }, [activeView, allLong, allShort, filterByTimeframe]);

  const mergedData = React.useMemo(() => {
    if (activeView !== "merged") return [] as MergedDataPoint[];
    const filtered = filterByTimeframe(allMerged);
    return filtered.map((d) => ({
      ...d,
      cumulativeNet: d.shortValue - d.longValue,
    }));
  }, [activeView, allMerged, filterByTimeframe]);

  const isMerged = activeView === "merged";
  const activeData = isMerged ? mergedData : chartData;

  const yConfig = React.useMemo(() => {
    if (isMerged) {
      return computeYConfig(mergedData.map((d) => d.cumulativeNet));
    }
    return computeYConfig(chartData.map((d) => d.value));
  }, [isMerged, chartData, mergedData]);

  const xTicks = React.useMemo(() => {
    const timestamps = activeData.map((d) => d.timestamp);
    return computeXTicks(timestamps, timeframe);
  }, [activeData, timeframe]);

  const XTickComponent = React.useMemo(
    () => XTickRenderer(timeframe),
    [timeframe],
  );

  const tabs: { key: ChartView; label: string }[] = isSingleMode
    ? [
        {
          key: "long",
          label: `${effectiveLongSymbol} ${protocolLabel(effectiveLongProtocol)} Rate`,
        },
      ]
    : [{ key: "merged", label: mergedLabel }];

  const renderTooltip = React.useCallback(
    ({ active, payload }: any) => {
      if (!active || !payload?.length) return null;
      const point = payload[0]?.payload;
      if (!point) return null;

      const ts = point.timestamp as number;
      const dateText = ts
        ? new Date(ts).toLocaleDateString("en", {
            month: "short",
            day: "numeric",
          })
        : "";

      if (isMerged) {
        const longBps = ((point.longValue as number) * 10000).toFixed(3);
        const shortBps = ((point.shortValue as number) * 10000).toFixed(3);
        const cumNet = point.cumulativeNet as number;
        const cumBps = (cumNet * 10000).toFixed(3);
        const isCumNeg = cumNet < 0;

        return (
          <div className="border border-white/20 bg-[#000D1E] px-3 py-2.5">
            {dateText && (
              <span className="text-xs font-medium text-[#7192A5]">
                {dateText}
              </span>
            )}
            <div className="mt-1.5 flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#9CE0FF]" />
                <span className="text-xs text-[#7192A5]">Cumulative:</span>
                <span
                  className={cn(
                    "text-xs font-medium",
                    isCumNeg ? "text-red-400" : "text-[#4ADE80]",
                  )}
                >
                  {isCumNeg ? "" : "+"}
                  {cumBps} bps
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#4ADE80]" />
                <span className="text-xs text-[#7192A5]">
                  {resolvedLongSymbol} {protocolLabel(longProtocol)}:
                </span>
                <span className="text-xs font-medium text-[#BCEAFF]">
                  {longBps} bps
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#F87171]" />
                <span className="text-xs text-[#7192A5]">
                  {resolvedShortSymbol} {protocolLabel(shortProtocol)}:
                </span>
                <span className="text-xs font-medium text-[#BCEAFF]">
                  {shortBps} bps
                </span>
              </div>
            </div>
          </div>
        );
      }

      const rate = Number(point.value ?? 0);
      const isNeg = rate < 0;
      const bps = (rate * 10000).toFixed(3);

      return (
        <div className="border border-white/20 bg-[#000D1E] px-3 py-2.5">
          {dateText && (
            <span className="text-xs font-medium text-white">{dateText}</span>
          )}
          <div className="mt-1.5 flex items-center gap-2">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                isNeg ? "bg-[#FF6B6B]" : "bg-[#9CE0FF]",
              )}
            />
            <span className="text-xs text-[#7192A5]">Rate:</span>
            <span
              className={cn(
                "text-xs font-medium",
                isNeg ? "text-[#FF6B6B]" : "text-[#BCEAFF]",
              )}
            >
              {isNeg ? "" : "+"}
              {bps} bps
            </span>
          </div>
        </div>
      );
    },
    [isMerged, longProtocol, shortProtocol],
  );

  const hasData = isMerged ? mergedData.length > 0 : chartData.length > 0;

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex flex-col gap-2 px-4 pt-3 pb-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          {leftHeaderBefore}
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveView(tab.key)}
              className={cn(
                "text-xs transition-colors",
                activeView === tab.key
                  ? "text-[#BCEAFF] underline underline-offset-4"
                  : "text-[#7192A5] hover:text-[#BCEAFF]",
              )}
            >
              {tab.label}
            </button>
          ))}
          {leftHeaderExtra}
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          {rightHeaderExtra}
          {(["3D"] as Timeframe[]).map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => setTimeframe(tf)}
              className={cn(
                "h-6 border px-2.5 text-[11px] transition-colors",
                timeframe === tf
                  ? "border-[#0F1F30] bg-[#0F1F30] text-[#BCEAFF]"
                  : "border-transparent bg-transparent text-[#7192A5] hover:bg-[#041223]",
              )}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {isMerged && !isSingleMode && (
        <div className="flex items-center gap-6 px-4 pb-1">
          <div className="flex items-center gap-2">
            <div className="h-0.5 w-6 bg-[#9CE0FF]" />
            <span className="text-xs text-[#7192A5]">
              Cumulative rate (bps)
            </span>
          </div>
          {/* <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <div className="h-0.5 w-1.5 bg-[#44ABFF]" />
              <div className="h-0.5 w-1.5 bg-[#44ABFF]" />
              <div className="h-0.5 w-1.5 bg-[#44ABFF]" />
            </div>
            <span className="text-xs text-[#7192A5]">Auto Close Threshold</span>
          </div> */}
        </div>
      )}

      {isSingleMode && (
        <div className="flex items-center gap-6 px-4 pb-1">
          <div className="flex items-center gap-2">
            <div className="h-0.5 w-6 bg-[#9CE0FF]" />
            <span className="text-xs text-[#7192A5]">Funding Rate</span>
          </div>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <ChartLoading text="Loading funding chart..." />
          </div>
        ) : !hasData ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-sm text-[#7192A5]">No data available</span>
          </div>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="relative h-full min-h-[360px] w-full aspect-auto bg-transparent [&_.recharts-cartesian-axis-tick_text]:fill-[#7192A5]! lg:min-h-[500px]"
          >
            <ComposedChart
              key={activeView}
              accessibilityLayer
              data={activeData}
              margin={{ left: 4, right: 16, top: 12, bottom: 4 }}
            >
              <CartesianGrid
                stroke="#0F1F30"
                strokeDasharray="3 3"
                vertical={false}
                horizontal={true}
              />

              <XAxis
                dataKey="timestamp"
                type="number"
                domain={["dataMin", "dataMax"]}
                scale="time"
                ticks={xTicks}
                tick={XTickComponent as any}
                axisLine={{ stroke: "#0F1F30" }}
                tickLine={false}
                interval={0}
                height={30}
              />

              <YAxis
                tickFormatter={formatBpsTick}
                ticks={yConfig.ticks}
                domain={yConfig.domain}
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={36}
                dx={-4}
              />

              <Customized component={GradientDefs} />


              {isMerged && (
                <Area
                  dataKey="cumulativeNet"
                  type="linear"
                  baseValue="dataMin"
                  stroke={POSITIVE_STROKE}
                  fill="url(#net-blue-fill)"
                  strokeWidth={1.5}
                  isAnimationActive={false}
                  connectNulls
                  activeDot={false}
                />
              )}
              {/* {isMerged && (
                <Line
                  dataKey="longValue"
                  name="longValue"
                  type="linear"
                  stroke={LONG_LINE_COLOR}
                  dot={false}
                  strokeWidth={1.5}
                  isAnimationActive={false}
                  connectNulls
                  activeDot={false}
                />
              )}
              {isMerged && (
                <Line
                  dataKey="shortValue"
                  name="shortValue"
                  type="linear"
                  stroke={SHORT_LINE_COLOR}
                  dot={false}
                  strokeWidth={1.5}
                  isAnimationActive={false}
                  connectNulls
                  activeDot={false}
                />
              )} */}
              {isMerged && (
                <Line
                  dataKey="cumulativeNet"
                  name="cumulativeNet"
                  type="linear"
                  stroke="transparent"
                  dot={false}
                  activeDot={<CustomActiveDot />}
                  isAnimationActive={false}
                  connectNulls
                />
              )}

              {!isMerged && (
                <Area
                  dataKey="value"
                  type="linear"
                  baseValue={0}
                  stroke="url(#funding-stroke-gradient)"
                  fill="url(#funding-fill-gradient)"
                  strokeWidth={1.5}
                  isAnimationActive={false}
                  connectNulls
                  activeDot={false}
                />
              )}
              {!isMerged && (
                <Line
                  dataKey="value"
                  type="linear"
                  stroke="transparent"
                  dot={false}
                  activeDot={<CustomActiveDot />}
                  isAnimationActive={false}
                  connectNulls
                />
              )}

              <ChartTooltip cursor={false} content={renderTooltip} />
            </ComposedChart>
          </ChartContainer>
        )}
      </div>

    </div>
  );
};

export default FundingRateChart;
