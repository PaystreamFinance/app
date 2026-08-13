"use client";

import React from "react";
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
import { getProtocolLogo } from "@/lib/protocol-registry";
import { ChevronDown, ChevronRight } from "lucide-react";
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

// ─── DEX config ────────────────────────────────────────────────────────────

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

function getDexLabel(id: string) { return DEX_CONFIG[id]?.label ?? id; }
function getDexColor(id: string) { return DEX_CONFIG[id]?.color ?? "#7192A5"; }

// ─── Formatters ────────────────────────────────────────────────────────────

function fmt(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(2)}K`;
  return `$${v.toFixed(2)}`;
}

function weekLabel(s: string) {
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function weekEndLabel(e: string) {
  return new Date(e).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Shared tick ───────────────────────────────────────────────────────────

const MobileTick = (props: any) => {
  const { x, y, payload } = props as { x: number; y: number; payload: { value: string } };
  const [start, end] = (payload.value ?? "").split("|");
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={10} textAnchor="middle" fill="#7192A5" fontSize={9}>{start}</text>
      <text x={0} y={0} dy={20} textAnchor="middle" fill="#3D5A6E" fontSize={8}>{end}</text>
    </g>
  );
};

// ─── Stat card ─────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#060F1E] p-4">
      <p className="mb-1.5 text-xs text-[#7192A5]">{label}</p>
      <p className="text-xl font-semibold tracking-tight text-white">{value}</p>
      {sub && <p className="mt-1 text-[10px] text-[#3D5A6E]">{sub}</p>}
    </div>
  );
}

// ─── DEX row (overview breakdown) ──────────────────────────────────────────

function DexRow({ id, stats, totalNotional }: { id: string; stats: DexStats; totalNotional: number }) {
  const logo = getProtocolLogo(id);
  const pct = totalNotional > 0 ? ((stats.totalNotional / totalNotional) * 100).toFixed(1) : "0.0";
  return (
    <div className="flex items-center gap-3 border-b border-white/5 px-4 py-3 last:border-0">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt={getDexLabel(id)} className="h-7 w-7 flex-shrink-0 rounded-full" />
      ) : (
        <span
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
          style={{ backgroundColor: getDexColor(id) }}
        >
          {getDexLabel(id)[0]}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-white">{getDexLabel(id)}</p>
        <p className="text-xs text-[#7192A5]">
          L {fmt(stats.longNotional)} · S {fmt(stats.shortNotional)}
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm font-medium text-white">{fmt(stats.totalNotional)}</p>
        <p className="text-xs" style={{ color: getDexColor(id) }}>{pct}%</p>
      </div>
    </div>
  );
}

// ─── Cumulative chart ──────────────────────────────────────────────────────

function CumulativeChart({ data, metric }: { data: WeeklyResponse; metric: "notional" | "margin" }) {
  const isVolume = metric === "notional";
  const color = isVolume ? "#BCEBFF" : "#4ADE80";
  const gradId = isVolume ? "mCumVol" : "mCumMgn";
  const title = isVolume ? "Cumulative Volume" : "Cumulative Margin";
  const tooltipLabel = isVolume ? "Cumulative Volume" : "Cumulative Margin";

  const chartData = React.useMemo(() => {
    let running = 0;
    return Object.entries(data).map(([, week]) => {
      const total = Object.values(week.perDex).reduce(
        (s, d) => s + (isVolume ? d.totalNotional : d.totalMargin), 0,
      );
      running += total;
      return { week: `${weekLabel(week.start)}|${weekEndLabel(week.end)}`, cumulative: running };
    });
  }, [data, isVolume]);

  const TooltipContent = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const [start, end] = (label ?? "").split("|");
    return (
      <div className="rounded-lg border bg-[#0A1628] px-3 py-2 text-[11px] shadow-xl" style={{ borderColor: `${color}1F` }}>
        <p className="mb-1 font-semibold" style={{ color }}>{start} – {end}</p>
        <p className="text-[#e2e8f0]">{tooltipLabel}: <span className="font-medium text-white">{fmt(payload[0].value as number)}</span></p>
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-white/10 bg-[#060F1E] p-4">
      <p className="mb-3 text-xs font-medium text-[#7192A5]">{title}</p>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={chartData} margin={{ top: 8, right: 0, left: 0, bottom: 4 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.12} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="week" tick={<MobileTick />} axisLine={false} tickLine={false} height={36} />
          <YAxis tickFormatter={fmt} tick={{ fill: "#7192A5", fontSize: 9 }} axisLine={false} tickLine={false} width={56} />
          <Tooltip content={<TooltipContent />} cursor={{ stroke: `${color}26`, strokeWidth: 1 }} />
          <Area
            type="monotone"
            dataKey="cumulative"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gradId})`}
            dot={{ r: 2, fill: "#000C1D", stroke: color, strokeWidth: 1 }}
            activeDot={{ r: 4, fill: color, stroke: "#000C1D", strokeWidth: 1.5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Weekly bar chart ──────────────────────────────────────────────────────

type Metric = "notional" | "margin";

function WeeklyChart({ data, allDexes }: { data: WeeklyResponse; allDexes: string[] }) {
  const [metric, setMetric] = React.useState<Metric>("notional");
  const [hidden, setHidden] = React.useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setHidden((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const chartData = React.useMemo(() => {
    return Object.entries(data).map(([, week]) => {
      const row: Record<string, number | string> = { week: `${weekLabel(week.start)}|${weekEndLabel(week.end)}` };
      for (const dex of allDexes) {
        if (hidden.has(dex)) continue;
        const d = week.perDex[dex];
        if (!d) continue;
        row[dex] = metric === "notional" ? d.totalNotional : d.totalMargin;
      }
      return row;
    });
  }, [data, allDexes, metric, hidden]);

  const visibleDexes = allDexes.filter((d) => !hidden.has(d));

  return (
    <div className="rounded-xl border border-white/10 bg-[#060F1E] p-4">
      {/* Metric toggle */}
      <div className="mb-3 flex rounded-lg border border-white/10 bg-[#0A1628] p-0.5">
        {(["notional", "margin"] as Metric[]).map((m) => (
          <button
            key={m}
            onClick={() => setMetric(m)}
            className={`flex-1 rounded-md py-1.5 text-xs font-medium capitalize transition-all ${
              metric === m ? "bg-[#1A2D45] text-[#BCEBFF]" : "text-[#7192A5]"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* DEX toggles — scrollable row */}
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {allDexes.map((id) => {
          const logo = getProtocolLogo(id);
          return (
            <button
              key={id}
              onClick={() => toggle(id)}
              className={`flex flex-shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all ${
                hidden.has(id)
                  ? "border-white/5 bg-transparent text-[#7192A5] opacity-40"
                  : "border-white/15 bg-white/5 text-white"
              }`}
            >
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt={getDexLabel(id)} className="h-3 w-3 rounded-full" />
              ) : (
                <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: getDexColor(id) }} />
              )}
              {getDexLabel(id)}
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: getDexColor(id) }} />
            </button>
          );
        })}
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 4 }} barCategoryGap="30%">
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="week" tick={<MobileTick />} axisLine={false} tickLine={false} height={36} />
          <YAxis tickFormatter={fmt} tick={{ fill: "#7192A5", fontSize: 9 }} axisLine={false} tickLine={false} width={52} />
          <Tooltip
            formatter={(v: number, name: string): [string, string] => [fmt(v), getDexLabel(name)]}
            contentStyle={{ backgroundColor: "#0A1628", border: "1px solid rgba(188,235,255,0.12)", borderRadius: 8, color: "#fff", fontSize: 11, padding: "8px 12px" }}
            labelFormatter={(v: string) => v.replace("|", " – ")}
            labelStyle={{ color: "#BCEBFF", marginBottom: 4, fontWeight: 600 }}
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
          />
          {visibleDexes.map((id, i) => (
            <Bar key={id} dataKey={id} stackId="stack" fill={getDexColor(id)} maxBarSize={32}>
              {i === visibleDexes.length - 1 &&
                chartData.map((_, ci) => <Cell key={ci} radius={[3, 3, 0, 0] as unknown as number} />)}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Weekly expandable table ───────────────────────────────────────────────

interface WeeklyRow {
  key: string;
  label: string;
  daysLeft?: number;
  totals: DexStats;
  dexEntries: [string, DexStats][];
}

function WeeklyTable({ weekly }: { weekly: WeeklyResponse }) {
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  const rows = React.useMemo<WeeklyRow[]>(() => {
    return Object.entries(weekly).reverse().map(([key, week], i) => {
      const label = `${weekLabel(week.start)} – ${weekEndLabel(week.end)}`;
      const dexEntries = Object.entries(week.perDex).sort(([, a], [, b]) => b.totalMargin - a.totalMargin);
      const totals = dexEntries.reduce(
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
      const daysLeft = i === 0
        ? Math.max(0, Math.ceil((new Date(week.end).getTime() - Date.now()) / 86_400_000))
        : undefined;
      return { key, label, daysLeft, totals, dexEntries };
    });
  }, [weekly]);

  const toggleExpand = (key: string) =>
    setExpanded((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  return (
    <div className="overflow-hidden rounded-xl border border-white/10">
      {rows.map((row) => {
        const isOpen = expanded.has(row.key);
        return (
          <React.Fragment key={row.key}>
            <button
              onClick={() => toggleExpand(row.key)}
              className="flex w-full items-center justify-between border-b border-white/5 px-4 py-3 last:border-0 hover:bg-white/5"
            >
              <div className="flex flex-col items-start gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">{row.label}</span>
                  {row.daysLeft !== undefined && (
                    <span className="text-[10px] text-[#7192A5]">({row.daysLeft}d left)</span>
                  )}
                </div>
                <span className="text-xs text-[#7192A5]">{fmt(row.totals.totalNotional)} notional</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-medium text-white">{fmt(row.totals.totalMargin)}</p>
                  <p className="text-[10px] text-[#7192A5]">margin</p>
                </div>
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 text-[#7192A5]" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-[#7192A5]" />
                )}
              </div>
            </button>

            {isOpen && row.dexEntries.map(([dexId, stats]) => {
              const logo = getProtocolLogo(dexId);
              return (
                <div key={dexId} className="flex items-center gap-3 border-b border-white/5 bg-white/[0.02] px-4 py-2.5 pl-8 last:border-0">
                  {logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logo} alt={getDexLabel(dexId)} className="h-5 w-5 flex-shrink-0 rounded-full" />
                  ) : (
                    <span className="inline-block h-5 w-5 flex-shrink-0 rounded-full" style={{ backgroundColor: getDexColor(dexId) }} />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-[#BCEBFF]">{getDexLabel(dexId)}</p>
                    <p className="text-[10px] text-[#7192A5]">{fmt(stats.totalNotional)} notional</p>
                  </div>
                  <p className="text-xs font-medium text-white">{fmt(stats.totalMargin)}</p>
                </div>
              );
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

type Tab = "overview" | "cumulative" | "weekly";

export default function MobileStatsPage() {
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
      .sort(([, a], [, b]) => b.totalNotional - a.totalNotional)
      .map(([id]) => id);
  }, [stats]);

  const allWeeklyDexes = React.useMemo(() => {
    if (!weekly) return [];
    const set = new Set<string>();
    for (const week of Object.values(weekly))
      for (const id of Object.keys(week.perDex)) set.add(id);
    return [...set].sort((a, b) => {
      const aT = Object.values(weekly).reduce((s, w) => s + (w.perDex[a]?.totalMargin ?? 0), 0);
      const bT = Object.values(weekly).reduce((s, w) => s + (w.perDex[b]?.totalMargin ?? 0), 0);
      return bT - aT;
    });
  }, [weekly]);

  const depositStr = stats
    ? Object.entries(stats.totalDeposits)
        .filter(([asset]) => asset === "USDC")
        .map(([, amt]) => fmt(amt))
        .join("") || "—"
    : "—";

  const TABS: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "cumulative", label: "Cumulative" },
    { key: "weekly", label: "Weekly" },
  ];

  return (
    <div className="min-h-screen bg-[#000C1D] px-4 pb-8 pt-6 text-white">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-white">Stats</h1>
        <p className="mt-0.5 text-xs text-[#7192A5]">Platform-wide metrics</p>
      </div>

      {/* Tab bar */}
      <div className="mb-5 flex rounded-xl border border-white/10 bg-[#060F1E] p-1">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-all ${
              tab === key ? "bg-[#1A2D45] text-[#BCEBFF]" : "text-[#7192A5]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center text-[#7192A5] text-sm">Loading…</div>
      ) : !stats || !weekly ? (
        <div className="flex h-48 items-center justify-center text-[#FF6B6B] text-sm">Failed to load data</div>
      ) : tab === "overview" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Total Margin" value={fmt(stats.totalMargin)} sub="capital deployed" />
            <StatCard label="Total Notional" value={fmt(stats.totalNotionalVolume)} sub="gross size" />
            <StatCard label="Total Positions" value={String(stats.totalPositions)} sub="all time" />
            <StatCard label="Total Deposits" value={depositStr} sub="USDC" />
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[#7192A5]">Per-protocol</p>
            <div className="overflow-hidden rounded-xl border border-white/10 bg-[#060F1E]">
              {sortedDexes.map((id) => (
                <DexRow key={id} id={id} stats={stats.perDex[id]!} totalNotional={stats.totalNotionalVolume} />
              ))}
            </div>
          </div>
        </div>
      ) : tab === "cumulative" ? (
        <div className="space-y-4">
          <CumulativeChart data={weekly} metric="notional" />
          <CumulativeChart data={weekly} metric="margin" />
          <WeeklyChart data={weekly} allDexes={allWeeklyDexes} />
        </div>
      ) : (
        <WeeklyTable weekly={weekly} />
      )}
    </div>
  );
}
