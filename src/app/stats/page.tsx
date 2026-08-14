"use client";

import React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Area,
  AreaChart,
} from "recharts";
import { DiscoverAndPoolTable } from "@/components/discover/discover-and-pool-table";
import { getProtocolLogo } from "@/lib/protocol-registry";
import { PERP_HEDGE_API_URL } from "@/lib/perp-api-url";

// ─── API ───────────────────────────────────────────────────────────────────

const STATS_API = `${PERP_HEDGE_API_URL}/stats`;
const WEEKLY_API = `${PERP_HEDGE_API_URL}/stats/weekly`;

interface DexStats {
  longMargin: number;
  shortMargin: number;
  totalMargin: number;
  longNotional: number;
  shortNotional: number;
  totalNotional: number;
  deposits?: Record<string, number>;
  positions: number;
}

interface StatsResponse {
  totalMargin: number;
  totalNotionalVolume: number;
  totalDeposits: Record<string, number>;
  totalPositions: number;
  perDex: Record<string, DexStats>;
}

interface WeekData {
  start: string;
  end: string;
  perDex: Record<string, DexStats>;
}

type WeeklyResponse = Record<string, WeekData>;

// ─── DEX display config ────────────────────────────────────────────────────

const DEX_CONFIG: Record<string, { label: string; color: string }> = {
  hyperliquid: { label: "Hyperliquid", color: "#5B8DEF" },
  aster:       { label: "Aster",       color: "#FF6B6B" },
  lighter:     { label: "Lighter",     color: "#4ADE80" },
  pacifica:    { label: "Pacifica",    color: "#F59E0B" },
  drift:       { label: "Drift",       color: "#A78BFA" },
  "hl:flx":   { label: "Usefelix",    color: "#22D3EE" },
  "hl:cash":  { label: "Dreamcash",   color: "#FB923C" },
  "hl:hyna":  { label: "HyENA",       color: "#F472B6" },
  "hl:xyz":   { label: "XYZ",         color: "#84CC16" },
  "01":        { label: "01",          color: "#E879F9" },
  spot:        { label: "Spot",        color: "#94A3B8" },
};

function getDexLabel(id: string): string {
  return DEX_CONFIG[id]?.label ?? id;
}

function getDexColor(id: string): string {
  return DEX_CONFIG[id]?.color ?? "#7192A5";
}

// ─── Formatters ───────────────────────────────────────────────────────────

function fmt(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

function fmtCount(value: number): string {
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function weekLabel(start: string): string {
  return new Date(start).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function weekEndLabel(end: string): string {
  return new Date(end).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const CustomXTick = (props: any) => {
  const { x, y, payload } = props as { x: number; y: number; payload: { value: string } };
  const [start, end] = (payload.value ?? "").split("|");
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={12} textAnchor="middle" fill="#7192A5" fontSize={11}>{start}</text>
      <text x={0} y={0} dy={24} textAnchor="middle" fill="#3D5A6E" fontSize={10}>{end}</text>
    </g>
  );
};

// ─── Sub-components ───────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#060F1E] p-6 transition-all hover:border-white/20 hover:bg-[#07111F]">
      <p className="mb-3 text-sm text-[#7192A5]">{label}</p>
      <p className="text-3xl font-semibold tracking-tight text-white">{value}</p>
      {sub && <p className="mt-2 text-xs text-[#3D5A6E]">{sub}</p>}
    </div>
  );
}

interface DexRow {
  id: string;
  stats: DexStats;
  totalMargin: number;
}

function buildDexColumns(): ColumnDef<DexRow>[] {
  return [
    {
      id: "dex",
      header: () => (
        <p className="shrink-0 pl-4 text-xs font-normal tracking-[-1%] text-[#7092A5]">Protocol</p>
      ),
      cell: ({ row }) => {
        const { id } = row.original;
        const logo = getProtocolLogo(id);
        return (
          <div className="flex min-w-[160px] items-center gap-3 pl-4">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt={getDexLabel(id)} className="h-6 w-6 rounded-full" />
            ) : (
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{ backgroundColor: getDexColor(id) }}
              >
                {getDexLabel(id)[0]}
              </span>
            )}
            <span className="text-sm font-medium text-white">{getDexLabel(id)}</span>
          </div>
        );
      },
    },
    {
      id: "share",
      header: () => (
        <p className="shrink-0 text-xs font-normal tracking-[-1%] text-[#7092A5]">Share</p>
      ),
      cell: ({ row }) => {
        const { stats, totalMargin } = row.original;
        const pct = totalMargin > 0 ? ((stats.totalMargin / totalMargin) * 100).toFixed(1) : "0.0";
        return (
          <div className="flex min-w-[80px] items-center">
            <span className="text-sm font-medium" style={{ color: getDexColor(row.original.id) }}>{pct}%</span>
          </div>
        );
      },
    },
    {
      id: "margin",
      header: () => (
        <p className="shrink-0 text-xs font-normal tracking-[-1%] text-[#7092A5]">Margin</p>
      ),
      cell: ({ row }) => {
        const { stats } = row.original;
        return (
          <div className="flex min-w-[140px] flex-col">
            <span className="text-sm font-medium text-white">{fmt(stats.totalMargin)}</span>
            <span className="text-xs text-[#7192A5]">L {fmt(stats.longMargin)} · S {fmt(stats.shortMargin)}</span>
          </div>
        );
      },
    },
    {
      id: "notional",
      header: () => (
        <p className="shrink-0 text-xs font-normal tracking-[-1%] text-[#7092A5]">Notional</p>
      ),
      cell: ({ row }) => {
        const { stats } = row.original;
        return (
          <div className="flex min-w-[140px] flex-col">
            <span className="text-sm font-medium text-white">{fmt(stats.totalNotional)}</span>
            <span className="text-xs text-[#7192A5]">L {fmt(stats.longNotional)} · S {fmt(stats.shortNotional)}</span>
          </div>
        );
      },
    },
    {
      id: "positions",
      header: () => (
        <p className="shrink-0 text-xs font-normal tracking-[-1%] text-[#7092A5]">Positions</p>
      ),
      cell: ({ row }) => (
        <div className="flex min-w-[80px] items-center">
          <span className="text-sm font-medium text-white">{row.original.stats.positions}</span>
        </div>
      ),
    },
  ];
}

const DEX_COLUMNS = buildDexColumns();

type Metric = "notional" | "margin" | "positions";

function WeeklyChart({ data, allDexes }: { data: WeeklyResponse; allDexes: string[] }) {
  const [metric, setMetric] = React.useState<Metric>("notional");
  const [hidden, setHidden] = React.useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const chartData = React.useMemo(() => {
    return Object.entries(data).map(([, week]) => {
      const row: Record<string, number | string> = { week: `${weekLabel(week.start)}|${weekEndLabel(week.end)}` };
      for (const dex of allDexes) {
        if (hidden.has(dex)) continue;
        const d = week.perDex[dex];
        if (!d) continue;
        if (metric === "notional") row[dex] = d.totalNotional;
        else if (metric === "margin") row[dex] = d.totalMargin;
        else row[dex] = d.positions;
      }
      return row;
    });
  }, [data, allDexes, metric, hidden]);

  const visibleDexes = allDexes.filter((d) => !hidden.has(d));

  const METRICS: { key: Metric; label: string }[] = [
    { key: "notional", label: "Notional" },
    { key: "margin", label: "Margin" },
  ];

  const formatYAxis = (v: number) => (metric === "positions" ? fmtCount(v) : fmt(v));
  const formatTooltip = (v: number, name: string): [string, string] => [
    metric === "positions" ? fmtCount(v) : fmt(v),
    getDexLabel(name),
  ];

  return (
    <div className="rounded-2xl border border-white/10 bg-[#060F1E] p-6">
      {/* Header row: metric pills + DEX toggles */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        {/* Metric selector */}
        <div className="flex rounded-lg border border-white/10 bg-[#0A1628] p-0.5">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-all ${
                metric === m.key
                  ? "bg-[#1A2D45] text-[#BCEBFF] shadow"
                  : "text-[#7192A5] hover:text-[#BCEBFF]"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* DEX toggles */}
        <div className="flex flex-wrap gap-1.5">
          {allDexes.map((id) => {
            const logo = getProtocolLogo(id);
            return (
              <button
                key={id}
                onClick={() => toggle(id)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                  hidden.has(id)
                    ? "border-white/5 bg-transparent text-[#7192A5] opacity-40"
                    : "border-white/15 bg-white/5 text-white hover:bg-white/10"
                }`}
              >
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo} alt={getDexLabel(id)} className="h-3.5 w-3.5 flex-shrink-0 rounded-full" />
                ) : (
                  <span
                    className="inline-block h-3.5 w-3.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: getDexColor(id) }}
                  />
                )}
                {getDexLabel(id)}
                <span
                  className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: getDexColor(id) }}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={380}>
        <BarChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 4 }} barCategoryGap="30%">
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis
            dataKey="week"
            tick={<CustomXTick />}
            axisLine={false}
            tickLine={false}
            height={44}
          />
          <YAxis
            tickFormatter={formatYAxis}
            tick={{ fill: "#7192A5", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={68}
          />
          <Tooltip
            formatter={formatTooltip}
            contentStyle={{
              backgroundColor: "#0A1628",
              border: "1px solid rgba(188,235,255,0.12)",
              borderRadius: "10px",
              color: "#fff",
              fontSize: 12,
              padding: "10px 14px",
            }}
            labelFormatter={(v: string) => v.replaceAll("|", " – ")}
            labelStyle={{ color: "#BCEBFF", marginBottom: 6, fontWeight: 600 }}
            itemStyle={{ color: "#e2e8f0" }}
            cursor={{ fill: "rgba(255,255,255,0.03)", rx: 4 }}
          />
          {visibleDexes.map((id, i) => (
            <Bar key={id} dataKey={id} stackId="stack" fill={getDexColor(id)} maxBarSize={48}>
              {i === visibleDexes.length - 1 &&
                chartData.map((_, ci) => (
                  <Cell key={ci} radius={[4, 4, 0, 0] as unknown as number} />
                ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Cumulative Volume Chart ───────────────────────────────────────────────

const CumulativeTick = (props: any) => {
  const { x, y, payload } = props as { x: number; y: number; payload: { value: string } };
  const [start, end] = (payload.value ?? "").split("|");
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={12} textAnchor="middle" fill="#7192A5" fontSize={11}>{start}</text>
      <text x={0} y={0} dy={24} textAnchor="middle" fill="#3D5A6E" fontSize={10}>{end}</text>
    </g>
  );
};

function CumulativeChart({
  data,
  metric,
}: {
  data: WeeklyResponse;
  metric: "notional" | "margin";
}) {
  const isVolume = metric === "notional";
  const gradId = isVolume ? "cumGradVol" : "cumGradMgn";
  const color = isVolume ? "#BCEBFF" : "#4ADE80";
  const title = isVolume ? "Cumulative Combined Volume (Weekly)" : "Cumulative Combined Margin (Weekly)";
  const tooltipLabel = isVolume ? "Cumulative Volume" : "Cumulative Margin";

  const chartData = React.useMemo(() => {
    let running = 0;
    return Object.entries(data).map(([, week]) => {
      const weekTotal = Object.values(week.perDex).reduce(
        (s, d) => s + (isVolume ? d.totalNotional : d.totalMargin),
        0,
      );
      running += weekTotal;
      return {
        week: `${weekLabel(week.start)}|${weekEndLabel(week.end)}`,
        cumulative: running,
      };
    });
  }, [data, isVolume]);

  const CustomTooltipContent = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const [start, end] = (label ?? "").split("|");
    return (
      <div className="rounded-xl border bg-[#0A1628] px-4 py-3 text-xs shadow-xl" style={{ borderColor: `${color}1F` }}>
        <p className="mb-1.5 font-semibold" style={{ color }}>{start} – {end}</p>
        <p className="text-[#e2e8f0]">{tooltipLabel} : <span className="font-medium text-white">{fmt(payload[0].value as number)}</span></p>
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-[#060F1E] p-6">
      <p className="mb-1 text-sm font-medium text-[#7192A5]">{title}</p>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={chartData} margin={{ top: 16, right: 0, left: 0, bottom: 4 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.12} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis
            dataKey="week"
            tick={<CumulativeTick />}
            axisLine={false}
            tickLine={false}
            height={44}
          />
          <YAxis
            tickFormatter={fmt}
            tick={{ fill: "#7192A5", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={72}
          />
          <Tooltip content={<CustomTooltipContent />} cursor={{ stroke: `${color}26`, strokeWidth: 1 }} />
          <Area
            type="monotone"
            dataKey="cumulative"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradId})`}
            dot={{ r: 3, fill: "#000C1D", stroke: color, strokeWidth: 1.5 }}
            activeDot={{ r: 5, fill: color, stroke: "#000C1D", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Weekly table ─────────────────────────────────────────────────────────

interface WeeklyRow {
  id: string;
  label: string;       // week range or dex name
  dexId?: string;      // only on sub-rows
  daysLeft?: number;   // only on the most recent week row
  stats: DexStats;
  subPools?: WeeklyRow[];
}

function buildWeeklyTableColumns(): ColumnDef<WeeklyRow>[] {
  return [
    {
      id: "label",
      header: () => (
        <p className="shrink-0 pl-4 text-xs font-normal tracking-[-1%] text-[#7092A5]">Week / Protocol</p>
      ),
      cell: ({ row }) => {
        const { dexId, label } = row.original;
        const depth = row.depth;
        if (depth > 0 && dexId) {
          const logo = getProtocolLogo(dexId);
          return (
            <div className="flex min-w-[200px] items-center gap-2 pl-10">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt={label} className="h-5 w-5 rounded-full" />
              ) : (
                <span className="inline-block h-5 w-5 flex-shrink-0 rounded-full" style={{ backgroundColor: getDexColor(dexId) }} />
              )}
              <span className="text-sm text-[#BCEBFF]">{label}</span>
            </div>
          );
        }
        const { daysLeft } = row.original;
        return (
          <div className="flex min-w-[200px] items-center gap-2 pl-4">
            <span className="text-sm font-semibold text-white">{label}</span>
            {daysLeft !== undefined && (
              <span className="text-xs text-[#7192A5]">({daysLeft}d left)</span>
            )}
          </div>
        );
      },
    },
    {
      id: "margin",
      header: () => (
        <p className="shrink-0 text-xs font-normal tracking-[-1%] text-[#7092A5]">Margin</p>
      ),
      cell: ({ row }) => {
        const { stats } = row.original;
        return (
          <div className="flex min-w-[140px] flex-col">
            <span className="text-sm font-medium text-white">{fmt(stats.totalMargin)}</span>
            <span className="text-xs text-[#7192A5]">L {fmt(stats.longMargin)} · S {fmt(stats.shortMargin)}</span>
          </div>
        );
      },
    },
    {
      id: "notional",
      header: () => (
        <p className="shrink-0 text-xs font-normal tracking-[-1%] text-[#7092A5]">Notional</p>
      ),
      cell: ({ row }) => {
        const { stats } = row.original;
        return (
          <div className="flex min-w-[140px] flex-col">
            <span className="text-sm font-medium text-white">{fmt(stats.totalNotional)}</span>
            <span className="text-xs text-[#7192A5]">L {fmt(stats.longNotional)} · S {fmt(stats.shortNotional)}</span>
          </div>
        );
      },
    },
    {
      id: "positions",
      header: () => (
        <p className="shrink-0 text-xs font-normal tracking-[-1%] text-[#7092A5]">Positions</p>
      ),
      cell: ({ row }) => (
        <div className="flex min-w-[80px] items-center">
          <span className="text-sm font-medium text-white">{row.original.stats.positions}</span>
        </div>
      ),
    },
  ];
}

const WEEKLY_TABLE_COLUMNS = buildWeeklyTableColumns();

// ─── Page ─────────────────────────────────────────────────────────────────

type Tab = "overview" | "weekly" | "table";

export default function StatsPage() {
  const [tab, setTab] = React.useState<Tab>("overview");
  const [stats, setStats] = React.useState<StatsResponse | null>(null);
  const [weekly, setWeekly] = React.useState<WeeklyResponse | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    Promise.all([
      fetch(STATS_API).then((r) => r.json()) as Promise<StatsResponse>,
      fetch(WEEKLY_API).then((r) => r.json()) as Promise<WeeklyResponse>,
    ])
      .then(([s, w]) => { setStats(s); setWeekly(w); })
      .finally(() => setLoading(false));
  }, []);

  const sortedDexes = React.useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.perDex)
      .sort(([, a], [, b]) => b.totalMargin - a.totalMargin)
      .map(([id]) => id);
  }, [stats]);

  const allWeeklyDexes = React.useMemo(() => {
    if (!weekly) return [];
    const set = new Set<string>();
    for (const week of Object.values(weekly)) {
      for (const id of Object.keys(week.perDex)) set.add(id);
    }
    return [...set].sort((a, b) => {
      const aTotal = Object.values(weekly).reduce((s, w) => s + (w.perDex[a]?.totalMargin ?? 0), 0);
      const bTotal = Object.values(weekly).reduce((s, w) => s + (w.perDex[b]?.totalMargin ?? 0), 0);
      return bTotal - aTotal;
    });
  }, [weekly]);

  const weeklyTableRows = React.useMemo<WeeklyRow[]>(() => {
    if (!weekly) return [];
    const entries = Object.entries(weekly).reverse();
    return entries.map(([key, week], i) => {
      const label = `${weekLabel(week.start)} – ${weekEndLabel(week.end)}`;
      const daysLeft = i === 0
        ? Math.max(0, Math.ceil((new Date(week.end).getTime() - Date.now()) / 86_400_000))
        : undefined;
      const dexEntries = Object.entries(week.perDex).sort(([, a], [, b]) => b.totalMargin - a.totalMargin);
      const totals: DexStats = dexEntries.reduce(
        (acc, [, s]) => ({
          totalMargin: acc.totalMargin + s.totalMargin,
          longMargin: acc.longMargin + s.longMargin,
          shortMargin: acc.shortMargin + s.shortMargin,
          totalNotional: acc.totalNotional + s.totalNotional,
          longNotional: acc.longNotional + s.longNotional,
          shortNotional: acc.shortNotional + s.shortNotional,
          positions: acc.positions + s.positions,
        }),
        { totalMargin: 0, longMargin: 0, shortMargin: 0, totalNotional: 0, longNotional: 0, shortNotional: 0, positions: 0 },
      );
      return {
        id: key,
        label,
        daysLeft,
        stats: totals,
        subPools: dexEntries.map(([dexId, stats]) => ({
          id: `${key}-${dexId}`,
          label: getDexLabel(dexId),
          dexId,
          stats,
        })),
      };
    });
  }, [weekly]);

  const depositStr = stats
    ? Object.entries(stats.totalDeposits)
        .filter(([asset]) => asset === "USDC")
        .map(([, amt]) => fmt(amt))
        .join("") || "—"
    : "—";

  return (
    <div className="min-h-screen bg-[#000C1D] px-6 py-8 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Stats</h1>
            <p className="mt-0.5 text-sm text-[#7192A5]">Platform-wide metrics</p>
          </div>
          <div className="flex rounded-xl border border-white/10 bg-[#060F1E] p-1">
            {(["overview", "weekly", "table"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-lg px-5 py-1.5 text-sm font-medium capitalize transition-all ${
                  tab === t ? "bg-[#1A2D45] text-[#BCEBFF]" : "text-[#7192A5] hover:text-white"
                }`}
              >
                {t === "weekly" ? "Cumulative" : t === "table" ? "Weekly" : "Overview"}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center text-[#7192A5]">Loading…</div>
        ) : !stats || !weekly ? (
          <div className="flex h-64 items-center justify-center text-[#FF6B6B]">Failed to load data</div>
        ) : tab === "overview" ? (
          <>
            <div className="mb-8 grid grid-cols-2 gap-4">
              <StatCard label="Total Margin" value={fmt(stats.totalMargin)} sub="capital deployed" />
              <StatCard label="Total Notional" value={fmt(stats.totalNotionalVolume)} sub="gross position size" />
              <StatCard label="Total Positions" value={String(stats.totalPositions)} sub="all time" />
              <StatCard label="Total Deposits" value={depositStr} sub="by asset" />
            </div>

            <div className="mb-3 flex items-baseline gap-2">
              <h2 className="text-base font-semibold text-white">Per-protocol</h2>
              <span className="text-sm italic text-[#7192A5]">breakdown</span>
              <span className="ml-auto text-xs uppercase tracking-widest text-[#7192A5]">Sorted by margin</span>
            </div>

            <div className="overflow-hidden rounded-xl border border-white/10">
              <DiscoverAndPoolTable<DexRow, unknown>
                columns={DEX_COLUMNS}
                data={sortedDexes.map((id) => ({
                  id,
                  stats: stats.perDex[id]!,
                  totalMargin: stats.totalMargin,
                }))}
                disableExpansion
                noBorders
                rowDividers
                getRowId={(r) => r.id}
              />
            </div>
          </>
        ) : tab === "weekly" ? (
          <>
            <div className="mb-4 flex items-baseline gap-2">
              <h2 className="text-base font-semibold text-white">Weekly breakdown</h2>
            </div>
            <CumulativeChart data={weekly} metric="notional" />
            <div className="mt-4">
              <CumulativeChart data={weekly} metric="margin" />
            </div>
            <div className="mt-4">
              <WeeklyChart data={weekly} allDexes={allWeeklyDexes} />
            </div>
          </>
        ) : (
          <>
            <div className="mb-3 flex items-baseline gap-2">
              <h2 className="text-base font-semibold text-white">Weekly breakdown</h2>
              <span className="text-sm italic text-[#7192A5]">table</span>
            </div>
            <div className="overflow-hidden rounded-xl border border-white/10">
              <DiscoverAndPoolTable<WeeklyRow, unknown>
                columns={WEEKLY_TABLE_COLUMNS}
                data={weeklyTableRows}
                noBorders
                rowDividers
                getRowId={(r) => r.id}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
