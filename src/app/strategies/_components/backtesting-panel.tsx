"use client";

import * as React from "react";
import {
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { getProtocolLabel } from "@/lib/protocol-registry";
import { ChartLoading } from "@/components/chart-loading";
import {
  isUnavailable,
  mergeLegRecords,
  useBacktestingLeg,
} from "../hooks/use-backtesting-data";

type Period = "1W" | "1M";

const PERIOD_DAYS: Record<Period, number> = {
  "1W": 7,
  "1M": 30,
};

const MS_PER_DAY = 86_400_000;

interface Props {
  /** Venue-specific ticker for the long leg (e.g. "PAXG" on Hyperliquid). */
  longSymbol: string;
  /** Venue-specific ticker for the short leg (e.g. "XAU" on Pacifica). */
  shortSymbol: string;
  longProtocol: string;
  shortProtocol: string;
  /** Tab-style buttons rendered on the left of the header row. The trade
   *  modal passes the Max Funding arb ↔ Back Testing pair here so the
   *  row reads identically to FundingRateChart's own tab row. */
  headerTabs?: React.ReactNode;
}

/** Single tab-style button that matches the "Max Funding arb" look.
 *  Rendered beside the existing chart tab so they read as one tab row.
 *  The `active` state uses the same underline as the existing tab. */
export function ChartTabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "cursor-pointer text-xs transition-colors",
        active
          ? "text-[#BCEAFF] underline underline-offset-4"
          : "text-[#7192A5] hover:text-[#BCEAFF]",
      )}
    >
      {label}
    </button>
  );
}

function formatVenueLabel(protocol: string): string {
  return getProtocolLabel(protocol);
}

function UnavailableMessage({
  protocol,
  reason,
}: {
  protocol: string;
  reason:
    | { kind: "snapshot-only"; dex: string }
    | { kind: "no-symbol"; dex: string; symbol: string }
    | { kind: "sparse-data"; dex: string; symbol: string; count: number }
    | { kind: "fetch-failed"; dex: string };
}) {
  const venue = formatVenueLabel(protocol);
  switch (reason.kind) {
    case "snapshot-only":
      return (
        <span>
          <span className="text-[#BCEBFF]">{venue}</span> has no deep funding
          rate history — it accumulates going forward only.
        </span>
      );
    case "no-symbol":
      return (
        <span>
          No historical data for{" "}
          <span className="text-[#BCEBFF]">{reason.symbol}</span> on{" "}
          <span className="text-[#BCEBFF]">{venue}</span>.
        </span>
      );
    case "sparse-data":
      return (
        <span>
          Only {reason.count}{" "}
          {reason.count === 1 ? "data point" : "data points"} available for{" "}
          <span className="text-[#BCEBFF]">{reason.symbol}</span> on{" "}
          <span className="text-[#BCEBFF]">{venue}</span> — not enough for
          a meaningful backtest.
        </span>
      );
    case "fetch-failed":
      return (
        <span>
          Couldn&apos;t load the backtesting feed for{" "}
          <span className="text-[#BCEBFF]">{venue}</span>. Try again in a
          moment.
        </span>
      );
  }
}

/** Single centered, faint "Paystream" watermark laid behind the chart. */
function ChartWatermark() {
  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center select-none"
      aria-hidden="true"
    >
      <span
        className="text-[48px] font-normal tracking-[0.06em] text-white/[0.04] md:text-[64px]"
        style={{ fontFamily: '"Helvetica Neue", Helvetica, sans-serif' }}
      >
        Paystream
      </span>
    </div>
  );
}

export function BacktestingPanel({ longSymbol, shortSymbol, longProtocol, shortProtocol, headerTabs }: Props) {
  // Each leg uses its own venue-specific ticker so cross-ticker pairs
  // (e.g. PAXG on Hyperliquid vs XAU on Pacifica for gold) resolve correctly.
  // lighter and 01 are surfaced as snapshot-only by the hook.
  const longQuery = useBacktestingLeg(longProtocol, longSymbol);
  const shortQuery = useBacktestingLeg(shortProtocol, shortSymbol);

  const [period, setPeriod] = React.useState<Period>("1W");
  const [deposit, setDeposit] = React.useState<string>("10000");
  const [leverage, setLeverage] = React.useState<number>(3);

  const longData = longQuery.data && !isUnavailable(longQuery.data) ? longQuery.data : null;
  const shortData = shortQuery.data && !isUnavailable(shortQuery.data) ? shortQuery.data : null;

  const longUnavailable = longQuery.data && isUnavailable(longQuery.data)
    ? longQuery.data
    : null;
  const shortUnavailable = shortQuery.data && isUnavailable(shortQuery.data)
    ? shortQuery.data
    : null;

  const longIsSnapshotOnly = longUnavailable?.kind === "snapshot-only";
  const shortIsSnapshotOnly = shortUnavailable?.kind === "snapshot-only";
  const bothSnapshotOnly = longIsSnapshotOnly && shortIsSnapshotOnly;

  // Real errors are non-snapshot-only unavailables on either leg.
  const longRealError = longUnavailable && !longIsSnapshotOnly ? longUnavailable : null;
  const shortRealError = shortUnavailable && !shortIsSnapshotOnly ? shortUnavailable : null;
  const hasRealError = Boolean(longRealError || shortRealError);

  const isLoading =
    (!bothSnapshotOnly && longQuery.isLoading) ||
    (!bothSnapshotOnly && shortQuery.isLoading);

  // ─── Chart series ───────────────────────────────────────────────────────
  const chartData = React.useMemo(() => {
    const cutoff = Date.now() - PERIOD_DAYS[period] * MS_PER_DAY;

    // Single-leg: one protocol is snapshot-only, show the other leg only.
    if (longIsSnapshotOnly && shortData) {
      return shortData.records
        .filter((r) => r.t >= cutoff)
        .map((r) => ({ t: r.t, long: null, short: r.r * 100, spread: null }));
    }
    if (shortIsSnapshotOnly && longData) {
      return longData.records
        .filter((r) => r.t >= cutoff)
        .map((r) => ({ t: r.t, long: r.r * 100, short: null, spread: null }));
    }

    if (!longData || !shortData) return [];
    const merged = mergeLegRecords(longData.records, shortData.records);
    return merged.filter((p) => p.t >= cutoff);
  }, [longData, shortData, longIsSnapshotOnly, shortIsSnapshotOnly, period]);

  // ─── Backtest stats ─────────────────────────────────────────────────────
  const stats = React.useMemo(() => {
    // Stats require both legs — no spread available in single-leg mode.
    if (!longData || !shortData || chartData.length === 0) return null;
    const spreadSamples = chartData
      .map((p) => p.spread)
      .filter((s): s is number => s !== null);
    if (spreadSamples.length === 0) return null;

    // Records are already normalised to per-hour at fetch time (fundingRate /
    // granularityHours), so we just average them over the selected period.
    // No secondary interval division needed — Aster 8h and HL 1h are already
    // on the same scale.
    const cutoff = chartData[0]!.t;
    const longFiltered = longData.records.filter((r) => r.t >= cutoff);
    const shortFiltered = shortData.records.filter((r) => r.t >= cutoff);
    const longHourlyPct =
      (longFiltered.reduce((a, r) => a + r.r, 0) /
        Math.max(1, longFiltered.length)) *
      100;
    const shortHourlyPct =
      (shortFiltered.reduce((a, r) => a + r.r, 0) /
        Math.max(1, shortFiltered.length)) *
      100;
    const spreadHourlyPct = shortHourlyPct - longHourlyPct;
    // APY = spread_per_hour * 8760
    const apyPct = spreadHourlyPct * 24 * 365;

    const depositNum = parseFloat(deposit);
    const leverageNum = Number.isFinite(leverage) ? leverage : 1;
    const notionalPerSide = Number.isFinite(depositNum) && depositNum > 0
      ? depositNum * leverageNum
      : 0;
    // Profit in 24h = notional × spread_per_hour × 24 (as USD, since rate ≈ %)
    const profit24h = notionalPerSide * (spreadHourlyPct / 100) * 24;

    return {
      apyPct,
      notionalPerSide,
      profit24h,
      longHourlyPct,
      shortHourlyPct,
    };
  }, [longData, shortData, chartData, deposit, leverage]);

  return (
    <div className="flex h-full flex-col">
      {/* ── Header: matches FundingRateChart layout exactly so the tab
             row reads as a single continuous row across both views. ── */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <div className="flex items-center gap-3">{headerTabs}</div>
      </div>
      <div className="flex items-center gap-4 px-4 pb-1 text-[11px] text-[#7192A5]">
        <LegendDot color="#9CE0FF" label={formatVenueLabel(longProtocol)} />
        <LegendDot color="#F2994A" label={formatVenueLabel(shortProtocol)} />
        <LegendDot color="#4ADE80" label="Spread" />
      </div>

      {/* ── Chart ── */}
      <div className="relative min-h-[240px] flex-1 overflow-hidden p-4 pt-2">
        <ChartWatermark />

        {isLoading && (
          <div className="flex h-[200px] items-center justify-center">
            <ChartLoading text="Loading backtesting chart..." />
          </div>
        )}

        {/* Both legs are snapshot-only → no data at all */}
        {!isLoading && bothSnapshotOnly && (
          <div className="flex h-[200px] items-center justify-center text-sm text-[#7192A5]">
            No data available — neither protocol has deep funding rate history.
          </div>
        )}

        {/* Real fetch / symbol errors */}
        {!isLoading && !bothSnapshotOnly && hasRealError && (
          <div className="flex h-[200px] flex-col items-center justify-center gap-2 px-4 text-center text-sm text-[#7192A5]">
            {longRealError && (
              <UnavailableMessage
                protocol={longProtocol}
                reason={longRealError}
              />
            )}
            {shortRealError && (
              <UnavailableMessage
                protocol={shortProtocol}
                reason={shortRealError}
              />
            )}
          </div>
        )}

        {/* Single-leg note: one protocol is snapshot-only */}
        {!isLoading && !bothSnapshotOnly && !hasRealError && (longIsSnapshotOnly || shortIsSnapshotOnly) && (
          <div className="px-4 pb-1 text-xs text-[#7192A5]">
            {longIsSnapshotOnly && (
              <UnavailableMessage protocol={longProtocol} reason={longUnavailable!} />
            )}
            {shortIsSnapshotOnly && (
              <UnavailableMessage protocol={shortProtocol} reason={shortUnavailable!} />
            )}
          </div>
        )}

        {!isLoading && !bothSnapshotOnly && !hasRealError && chartData.length === 0 && (
          <div className="flex h-[200px] items-center justify-center text-sm text-[#7192A5]">
            No overlapping data points in this period.
          </div>
        )}

        {!isLoading && !bothSnapshotOnly && !hasRealError && chartData.length > 0 && (
          <ResponsiveContainer width="100%" height="90%">
            <LineChart
              data={chartData}
              margin={{ top: 8, right: 12, bottom: 8, left: 12 }}
            >
              <CartesianGrid strokeDasharray="2 4" stroke="#0F1F30" />
              <XAxis
                dataKey="t"
                stroke="#7192A5"
                tickFormatter={(v: number) =>
                  new Date(v).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })
                }
                tick={{ fontSize: 10 }}
                minTickGap={24}
              />
              <YAxis
                stroke="#7192A5"
                tickFormatter={(v: number) => `${v.toFixed(3)}%`}
                tick={{ fontSize: 10 }}
                width={56}
                domain={["auto", "auto"]}
              />
              <Tooltip
                contentStyle={{
                  background: "#000D1E",
                  border: "1px solid #0F1F30",
                  borderRadius: 0,
                  fontSize: 11,
                }}
                labelStyle={{ color: "#BCEBFF" }}
                labelFormatter={(v) =>
                  new Date(v as number).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                }
                formatter={(value, name) => [
                  typeof value === "number"
                    ? `${value.toFixed(4)}%`
                    : "—",
                  String(name),
                ]}
              />
              <Line
                type="monotone"
                dataKey="long"
                name={formatVenueLabel(longProtocol)}
                stroke="#9CE0FF"
                dot={false}
                strokeWidth={1.5}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="short"
                name={formatVenueLabel(shortProtocol)}
                stroke="#F2994A"
                dot={false}
                strokeWidth={1.5}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="spread"
                name="Spread"
                stroke="#4ADE80"
                dot={false}
                strokeWidth={1.5}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Profit Calculator ── */}
      <div className="border-t border-[#0F1F30] p-4">
        <p className="mb-3 text-xs tracking-tight text-[#BCEBFF]/80">
          Profit Calculator
        </p>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <div className="flex flex-col gap-1.5 border border-[#0F1F30] bg-[#041223] px-3 py-2.5">
            <label className="text-[11px] tracking-tight text-[#7192A5]">
              Deposit
            </label>
            <div className="flex items-baseline gap-0.5">
              <span className="text-sm text-white">$</span>
              <Input
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
                placeholder="0"
                type="number"
                step="1"
                min="0"
                className="h-5! border-0 bg-transparent p-0 text-sm font-medium text-white shadow-none outline-none ring-0 placeholder:text-[#7192A5]"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5 border border-[#0F1F30] bg-[#041223] px-3 py-2.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] tracking-tight text-[#7192A5]">
                Leverage
              </label>
              <span className="text-sm font-medium text-white">{leverage}x</span>
            </div>
            <Slider
              value={[leverage]}
              onValueChange={(v) => setLeverage(v[0] ?? 1)}
              min={1}
              max={10}
              step={1}
            />
          </div>

          <div className="flex flex-col gap-1.5 border border-[#0F1F30] bg-[#041223] px-3 py-2.5">
            <label className="text-[11px] tracking-tight text-[#7192A5]">
              Period
            </label>
            <div className="flex gap-1">
              {(Object.keys(PERIOD_DAYS) as Period[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={cn(
                    "flex-1 cursor-pointer border py-1 text-[11px] tracking-tight transition-colors",
                    period === p
                      ? "border-[#9CE0FF]/50 bg-[#9CE0FF]/10 text-[#BCEBFF]"
                      : "border-[#0F1F30] text-[#7192A5] hover:border-[#0F1F30]/60 hover:text-[#BCEBFF]",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Stats ── */}
        {stats && (
          <div className="mt-3 flex flex-col gap-1 text-xs">
            <StatRow
              label="Notional (per side)"
              value={`$${stats.notionalPerSide.toLocaleString(undefined, {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}`}
              valueClass="text-white"
            />
            <StatRow
              label="Avg APY (spread)"
              value={`${stats.apyPct >= 0 ? "+" : ""}${stats.apyPct.toFixed(2)}%`}
              valueClass={stats.apyPct >= 0 ? "text-[#4ADE80]" : "text-[#FF6B6B]"}
            />
            <StatRow
              label="Profit (24h)"
              value={`${stats.profit24h >= 0 ? "+" : ""}$${Math.abs(
                stats.profit24h,
              ).toFixed(2)}`}
              valueClass={stats.profit24h >= 0 ? "text-[#4ADE80]" : "text-[#FF6B6B]"}
            />
          </div>
        )}
        {!stats && !isLoading && !bothSnapshotOnly && !hasRealError && chartData.length > 0 && (
          <p className="mt-3 text-xs text-[#7192A5]">
            Computing projections…
          </p>
        )}
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="block size-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span>{label}</span>
    </span>
  );
}

function StatRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[#7192A5]">{label}</span>
      <span className={cn("font-medium", valueClass ?? "text-white")}>
        {value}
      </span>
    </div>
  );
}

export { ChartWatermark };
