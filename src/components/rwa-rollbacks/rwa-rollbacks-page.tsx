"use client";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  RotateCcw,
} from "lucide-react";
import React from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  getRwaRollCalendarForMonth,
  type RwaAssetId,
  type RwaRollEvent,
} from "@/lib/rwa-roll-calendar";
import { cn } from "@/lib/utils";

const ASSETS: { id: RwaAssetId; label: string }[] = [
  { id: "CL", label: "WTI Crude Oil (CL)" },
  { id: "BRENT", label: "Brent Crude Oil" },
  { id: "NATGAS", label: "Natural Gas" },
];

const VENUE_COLORS: Record<string, string> = {
  "Trade[XYZ]": "#23D3E8",
  Binance: "#FACC15",
  OKX: "#60A5FA",
  Lighter: "#A78BFA",
  Bybit: "#FB7185",
  Dreamcash: "#8B5CF6",
  Extended: "#84CC16",
  Felix: "#F59E0B",
};

interface RwaRollbacksPageProps {
  mobile?: boolean;
}

export function RwaRollbacksPage({ mobile }: RwaRollbacksPageProps) {
  const [assetId, setAssetId] = React.useState<RwaAssetId>("CL");
  const [monthDate, setMonthDate] = React.useState(() => new Date());
  const [hiddenVenues, setHiddenVenues] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [activeVenue, setActiveVenue] = React.useState<string | null>(null);

  const allEvents = React.useMemo(
    () => getRwaRollCalendarForMonth(monthDate),
    [monthDate],
  );
  const events = React.useMemo(
    () => allEvents.filter((event) => event.assetId === assetId),
    [allEvents, assetId],
  );
  const chartData = React.useMemo(
    () => buildChartData(events, monthDate),
    [events, monthDate],
  );
  const calendarWeeks = React.useMemo(
    () => buildCalendarWeeks(monthDate),
    [monthDate],
  );
  const expirations = React.useMemo(
    () => uniqueExpirations(events, monthDate),
    [events, monthDate],
  );

  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(monthDate);

  const venues = Array.from(new Set(events.map((event) => event.venue)));
  const visibleVenues = venues.filter((venue) => !hiddenVenues.has(venue));
  const venueLineType = React.useMemo(() => {
    const map: Record<string, "linear" | "stepAfter"> = {};
    for (const event of events) {
      map[event.venue] = event.lineType === "linear" ? "linear" : "stepAfter";
    }
    return map;
  }, [events]);

  React.useEffect(() => {
    setHiddenVenues(new Set());
    setActiveVenue(null);
  }, [assetId, monthDate]);


  const shiftMonth = (delta: number) => {
    setMonthDate(
      (date) => new Date(date.getFullYear(), date.getMonth() + delta, 1),
    );
  };

  const toggleVenue = (venue: string) => {
    setHiddenVenues((current) => {
      const next = new Set(current);
      if (next.has(venue)) {
        next.delete(venue);
      } else {
        next.add(venue);
      }
      return next;
    });
  };

  const selectAll = () => setHiddenVenues(new Set());
  const deselectAll = () => setHiddenVenues(new Set(venues));

  const copySummary = async () => {
    const summary = events
      .map(
        (event) =>
          `${event.assetLabel}: ${event.venue} ${event.fromContract} to ${event.toContract}, ${formatRollDate(event.start)} to ${formatRollDate(event.end)} ET`,
      )
      .join("\n");
    await navigator.clipboard.writeText(summary);
  };

  return (
    <main
      className={cn(
        "min-h-screen bg-[#05090D] text-white",
        mobile ? "px-3 py-4" : "px-6 py-6",
      )}
    >
      <div className="mx-auto flex w-full max-w-[1540px] flex-col gap-4">
        <section className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-5 text-[#BCEAFF]" />
              <h1 className="text-2xl font-semibold tracking-normal text-[#F3FBFF] md:text-3xl">
                RWA Perps Roll Calendar
              </h1>
            </div>
            <p className="mt-1 max-w-4xl text-sm leading-5 text-[#8BA6B8]">
              Track when each venue blends front and next month commodity
              futures for WTI, Brent, and Natural Gas perps.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[10px] font-semibold uppercase text-[#7192A5]">
              Asset
            </label>
            <select
              value={assetId}
              onChange={(event) => setAssetId(event.target.value as RwaAssetId)}
              className="h-9 border border-[#1A3146] bg-[#101820] px-3 text-sm text-[#EAF8FF] outline-none"
            >
              {ASSETS.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="flex size-9 items-center justify-center border border-[#1A3146] bg-[#101820] text-[#BCEAFF] hover:bg-[#142235]"
              aria-label="Previous month"
            >
              <ChevronLeft className="size-4" />
            </button>
            <div className="flex h-9 min-w-[142px] items-center justify-center border border-[#1A3146] bg-[#101820] px-3 text-sm font-medium text-[#EAF8FF]">
              {monthLabel}
            </div>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="flex size-9 items-center justify-center border border-[#1A3146] bg-[#101820] text-[#BCEAFF] hover:bg-[#142235]"
              aria-label="Next month"
            >
              <ChevronRight className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setMonthDate(new Date())}
              className="flex h-9 items-center gap-2 border border-[#1A3146] bg-[#101820] px-3 text-sm text-[#BCEAFF] hover:bg-[#142235]"
            >
              <RotateCcw className="size-3.5" />
              Today
            </button>
            <button
              type="button"
              onClick={copySummary}
              className="flex h-9 items-center gap-2 border border-[#1A3146] bg-[#101820] px-3 text-sm text-[#BCEAFF] hover:bg-[#142235]"
            >
              <Copy className="size-3.5" />
              Copy
            </button>
          </div>
        </section>

        <section className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {Array.from(new Map(events.map((e) => [e.venue, e])).values()).map((event) => (
            <button
              type="button"
              key={event.id}
              onClick={() => toggleVenue(event.venue)}
              onMouseEnter={() => setActiveVenue(event.venue)}
              onMouseLeave={() => setActiveVenue(null)}
              className={cn(
                "border bg-[#151A1F] p-3 text-left transition-colors hover:bg-[#1D242B]",
                hiddenVenues.has(event.venue) && "opacity-45",
              )}
              style={{
                borderColor: VENUE_COLORS[event.venue] ?? "#1A3146",
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-[#F3FBFF]">
                  {event.venue}
                </span>
                <span className="text-[11px] text-[#8BA6B8]">
                  {event.openInterest} OI
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs leading-4 text-[#8BA6B8]">
                {event.methodology}
              </p>
              <p className="mt-2 text-xs text-[#EAF8FF]">
                {event.fromContract} to {event.toContract}
              </p>
            </button>
          ))}
        </section>

        <section className="border border-[#151F29] bg-[#171B20]">
          <div className="flex flex-col gap-3 border-b border-[#39424C] px-4 py-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#F3FBFF]">
                % Rolled - {monthLabel}
              </h2>
              <p className="text-xs text-[#A5B5C0]">
                0% is front-month untouched, 100% is fully rolled. Red markers
                show contract expirations. Drag the lower range selector to zoom.
              </p>
            </div>
          </div>
          <div className={cn("w-full", mobile ? "h-[320px]" : "h-[430px]")}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 24, right: 28, left: 2, bottom: 12 }}
              >
                <CartesianGrid stroke="#2B3036" vertical strokeOpacity={0.75} />
                <XAxis
                  dataKey="day"
                  tick={{ fill: "#8BA6B8", fontSize: 11 }}
                  axisLine={{ stroke: "#39424C" }}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  tickFormatter={(value) => `${value}%`}
                  tick={{ fill: "#8BA6B8", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={42}
                />
                <Tooltip
                  contentStyle={{
                    background: "#07111B",
                    border: "1px solid #1A3146",
                    borderRadius: 0,
                    color: "#EAF8FF",
                  }}
                  formatter={(value, name) => [`${value}%`, name]}
                  labelFormatter={(label) => `${monthLabel} ${label}`}
                />
                {expirations.map((expiry) => (
                  <ReferenceLine
                    key={expiry.getTime()}
                    x={expiry.getDate()}
                    stroke="#FF2B3A"
                    strokeWidth={1.5}
                    label={{
                      value: `${formatShortDate(expiry)} exp`,
                      fill: "#FF5A66",
                      fontSize: 10,
                      position: "top",
                    }}
                  />
                ))}
                {visibleVenues.map((venue) => (
                  <Line
                    key={venue}
                    type={venueLineType[venue] ?? "stepAfter"}
                    dataKey={venue}
                    stroke={VENUE_COLORS[venue] ?? "#BCEAFF"}
                    strokeWidth={activeVenue === venue ? 3 : 2}
                    strokeOpacity={
                      activeVenue && activeVenue !== venue ? 0.35 : 1
                    }
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          {/* Month navigator */}
          <div className="border-t border-[#151F29] bg-[#101820] px-4 py-2">
            <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-none">
              {Array.from({ length: 13 }, (_, i) => {
                const m = new Date(monthDate.getFullYear(), monthDate.getMonth() - 6 + i, 1);
                const isCurrent = m.getFullYear() === monthDate.getFullYear() && m.getMonth() === monthDate.getMonth();
                return (
                  <button
                    key={m.getTime()}
                    type="button"
                    onClick={() => setMonthDate(m)}
                    className={cn(
                      "flex-1 min-w-[52px] py-1.5 text-center text-[11px] font-medium transition-colors",
                      isCurrent
                        ? "bg-[#1A3146] text-[#BCEAFF]"
                        : "text-[#5A7A8E] hover:bg-[#151F29] hover:text-[#8BA6B8]",
                    )}
                  >
                    {new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" }).format(m)}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#151F29] px-4 py-3">
            <div className="flex flex-wrap gap-3">
            {venues.map((venue) => (
              <button
                type="button"
                key={venue}
                onClick={() => toggleVenue(venue)}
                onMouseEnter={() => setActiveVenue(venue)}
                onMouseLeave={() => setActiveVenue(null)}
                className={cn(
                  "flex items-center gap-1.5 text-xs",
                  hiddenVenues.has(venue) && "opacity-45",
                )}
              >
                <span
                  className="size-2.5 border"
                  style={{
                    borderColor: VENUE_COLORS[venue] ?? "#BCEAFF",
                    backgroundColor: `${VENUE_COLORS[venue] ?? "#BCEAFF"}33`,
                  }}
                />
                <span className="text-[#A5B5C0]">{venue}</span>
              </button>
            ))}
            </div>
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={selectAll}
                className="text-[#BCEAFF] hover:text-white"
              >
                Select All
              </button>
              <span className="text-[#39424C]">/</span>
              <button
                type="button"
                onClick={deselectAll}
                className="text-[#BCEAFF] hover:text-white"
              >
                Deselect All
              </button>
            </div>
          </div>
        </section>

        <section className="border border-[#151F29] bg-[#171B20]">
          <div className="border-b border-[#39424C] px-4 py-3">
            <h2 className="text-lg font-semibold text-[#F3FBFF]">
              Month View
            </h2>
            <p className="text-xs text-[#A5B5C0]">
              Each bar is a roll window for one venue, stacked when windows
              overlap.
            </p>
          </div>
          <div className="grid grid-cols-7 border-t border-l border-[#2B3036]">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div
                key={day}
                className="border-r border-b border-[#2B3036] px-2 py-1 text-[10px] font-semibold uppercase text-[#7192A5]"
              >
                {day}
              </div>
            ))}
            {calendarWeeks.flat().map((day) => (
              <CalendarCell
                key={day.key}
                day={day.date}
                currentMonth={day.currentMonth}
                events={events.filter((event) => !hiddenVenues.has(event.venue))}
                expirations={expirations}
                compact={mobile}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-3 border-t border-[#151F29] px-4 py-3">
            {venues.map((venue) => (
              <button
                type="button"
                key={venue}
                onClick={() => toggleVenue(venue)}
                className={cn(
                  "flex items-center gap-1.5 text-xs",
                  hiddenVenues.has(venue) && "opacity-45",
                )}
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: VENUE_COLORS[venue] ?? "#BCEAFF" }}
                />
                <span className="text-[#A5B5C0]">{venue}</span>
              </button>
            ))}
          </div>
          <p className="px-4 pb-4 text-xs leading-5 text-[#7E94A5]">
            Bars show the published or estimated roll window for the selected
            asset. Hover chart lines for exact percentage and use venue toggles
            to compare fewer schedules.
          </p>
        </section>

        <section className="border border-[#151F29] bg-[#171B20]">
          <div className="flex flex-col gap-1 border-b border-[#39424C] px-4 py-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#F3FBFF]">
                Methodology & sources
              </h2>
              <p className="text-xs text-[#A5B5C0]">
                One canonical documentation link per venue.
              </p>
            </div>
            <p className="text-xs text-[#7192A5]">
              Click venue cards or legend items to include/exclude rows.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[#2B3036] text-xs uppercase text-[#7192A5]">
                  <th className="w-[180px] px-4 py-2 font-semibold">Venue</th>
                  <th className="w-[90px] px-4 py-2 font-semibold">OI %</th>
                  <th className="px-4 py-2 font-semibold">Roll methodology</th>
                  <th className="w-[160px] px-4 py-2 font-semibold">
                    Documentation
                  </th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr
                    key={event.id}
                    onMouseEnter={() => setActiveVenue(event.venue)}
                    onMouseLeave={() => setActiveVenue(null)}
                    className={cn(
                      "border-b border-[#2B3036] transition-colors",
                      activeVenue === event.venue && "bg-[#202933]",
                      hiddenVenues.has(event.venue) && "opacity-45",
                    )}
                  >
                    <td className="px-4 py-3 font-medium text-[#F3FBFF]">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-full"
                          style={{
                            backgroundColor:
                              VENUE_COLORS[event.venue] ?? "#BCEAFF",
                          }}
                        />
                        {event.venue}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#A5B5C0]">
                      {event.openInterest}
                    </td>
                    <td className="px-4 py-3 text-[#C9D6DF]">
                      {event.methodology} Current window: {event.fromContract}{" "}
                      to {event.toContract}, {formatRollDate(event.start)} to{" "}
                      {formatRollDate(event.end)} ET.
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={event.docsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#22C98B] hover:text-[#7EF0BE]"
                      >
                        {event.venue} Docs
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-3 text-xs leading-5 text-[#7E94A5]">
            Roll dates are generated from the rollover specification: NYMEX/ICE
            contract expiration rules, business-day windows, and venue-specific
            ET cutoffs.
          </p>
        </section>
      </div>
    </main>
  );
}

function CalendarCell({
  day,
  currentMonth,
  events,
  expirations,
  compact,
}: {
  day: Date;
  currentMonth: boolean;
  events: RwaRollEvent[];
  expirations: Date[];
  compact?: boolean;
}) {
  const dayEvents = events.filter((event) =>
    isWithinDayRange(day, event.start, event.end),
  );
  const isExpiry = expirations.some(
    (expiry) => stripTime(expiry).getTime() === stripTime(day).getTime(),
  );

  return (
    <div
      className={cn(
        "min-h-[104px] border-r border-b border-[#2B3036] bg-[#171B20] p-1.5",
        compact && "min-h-[92px]",
        isExpiry && "bg-[#3A1B20]",
        !currentMonth && "bg-[#11161B] text-[#526677]",
      )}
    >
      <div className="flex items-center justify-between text-[11px] text-[#8BA6B8]">
        <span>{day.getDate()}</span>
        {isExpiry && <span className="text-[9px] text-[#FF6B78]">EXP</span>}
      </div>
      <div className="mt-2 space-y-1 overflow-hidden">
        {dayEvents.slice(0, compact ? 3 : 5).map((event) => (
          <div
            key={event.id}
            className="truncate px-1.5 py-0.5 text-[10px] font-medium text-[#061018]"
            style={{
              backgroundColor: VENUE_COLORS[event.venue] ?? "#BCEAFF",
            }}
            title={`${event.venue} ${event.fromContract} to ${event.toContract}`}
          >
            {event.venue} {event.fromContract}
          </div>
        ))}
        {dayEvents.length > (compact ? 3 : 5) && (
          <div className="text-[10px] text-[#8BA6B8]">
            +{dayEvents.length - (compact ? 3 : 5)} more
          </div>
        )}
      </div>
    </div>
  );
}

function formatRollDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function buildChartData(events: RwaRollEvent[], monthDate: Date) {
  const daysInMonth = new Date(
    monthDate.getFullYear(),
    monthDate.getMonth() + 1,
    0,
  ).getDate();

  const venueGroups = new Map<string, RwaRollEvent[]>();
  for (const event of events) {
    const venueEvents = venueGroups.get(event.venue) ?? [];
    venueEvents.push(event);
    venueGroups.set(event.venue, venueEvents);
  }

  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
    const row: Record<string, number | null> & { day: number } = { day };

    for (const [venue, venueEvents] of venueGroups) {
      row[venue] = rolledPercentForVenue(date, venueEvents);
    }

    return row;
  });
}

function rolledPercentForVenue(day: Date, events: RwaRollEvent[]): number | null {
  const orderedEvents = [...events].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );
  const dayTime = stripTime(day).getTime();
  const activeEvent = orderedEvents.find((event) => {
    return (
      dayTime >= stripTime(event.start).getTime() &&
      dayTime <= stripTime(event.expiry).getTime()
    );
  });
  if (activeEvent) return rolledPercent(day, activeEvent);

  return 0;
}

function countWeekdays(from: Date, to: Date): number {
  let count = 0;
  let d = stripTime(from);
  const end = stripTime(to).getTime();
  while (d.getTime() <= end) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  }
  return count;
}

function rolledPercent(day: Date, event: RwaRollEvent): number {
  const current = stripTime(day).getTime();
  const start = stripTime(event.start).getTime();
  const end = stripTime(event.end).getTime();
  const expiry = stripTime(event.expiry).getTime();
  if (current < start) return 0;
  if (current > expiry) return 0;
  if (current > end) return 100;
  if (start === end) return 100;
  if (event.lineType === "step") {
    const totalSteps = countWeekdays(event.start, event.end);
    const currentStep = countWeekdays(event.start, day);
    return Math.round((currentStep / totalSteps) * 100);
  }
  return Math.round(((current - start) / (end - start)) * 100);
}

function buildCalendarWeeks(monthDate: Date) {
  const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const first = new Date(start);
  first.setDate(start.getDate() - start.getDay());

  return Array.from({ length: 6 }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => {
      const date = new Date(first);
      date.setDate(first.getDate() + week * 7 + day);
      return {
        key: date.toISOString(),
        date,
        currentMonth: date.getMonth() === monthDate.getMonth(),
      };
    }),
  );
}

function isWithinDayRange(day: Date, start: Date, end: Date): boolean {
  const value = stripTime(day).getTime();
  return value >= stripTime(start).getTime() && value <= stripTime(end).getTime();
}

function uniqueExpirations(events: RwaRollEvent[], monthDate: Date): Date[] {
  const byTime = new Map<number, Date>();
  for (const event of events) {
    const expiry = stripTime(event.expiry);
    if (
      expiry.getFullYear() === monthDate.getFullYear() &&
      expiry.getMonth() === monthDate.getMonth()
    ) {
      byTime.set(expiry.getTime(), event.expiry);
    }
  }
  return Array.from(byTime.values()).sort((a, b) => a.getTime() - b.getTime());
}

function stripTime(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatShortDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}
