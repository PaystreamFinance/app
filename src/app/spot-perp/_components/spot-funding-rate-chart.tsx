"use client";

import React from "react";
import { Area, ComposedChart, Line, CartesianGrid } from "recharts";

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";

type Timeframe = "1W" | "1M" | "3M";
type ChartTab = "pnl" | "price";

interface ChartDataPoint {
  timestamp: number;
  dateLabel: string;
  value: number;
}

const chartConfig = {
  value: { label: "Funding Rate" },
} satisfies ChartConfig;

const POSITIVE_STROKE = "#9CE0FF";
const NEGATIVE_STROKE = "#FF6B6B";

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

/**
 * Generate deterministic mock funding rate data based on symbol.
 * Uses a seeded random walk so the same symbol always produces the same chart.
 */
function generateMockData(symbol: string, days: number): ChartDataPoint[] {
  // Simple hash from symbol for deterministic seed
  let seed = 0;
  for (let i = 0; i < symbol.length; i++) {
    seed = (seed * 31 + symbol.charCodeAt(i)) | 0;
  }
  const seededRandom = () => {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed & 0x7fffffff) / 2147483647;
  };

  const points: ChartDataPoint[] = [];
  const now = Date.now();
  const msPerDay = 24 * 60 * 60 * 1000;
  // Generate hourly data points
  const totalPoints = days * 24;
  let value = (seededRandom() - 0.5) * 0.1; // Start around ±0.05%

  for (let i = 0; i < totalPoints; i++) {
    const timestamp = now - (totalPoints - i) * (msPerDay / 24);
    // Random walk with mean reversion
    const drift = -value * 0.02; // Mean reversion
    const noise = (seededRandom() - 0.5) * 0.015;
    value = value + drift + noise;

    const date = new Date(timestamp);
    const dateLabel = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:00`;

    points.push({
      timestamp,
      dateLabel,
      value,
    });
  }

  return points;
}

interface FundingRateChartProps {
  symbol: string;
}

const FundingRateChart: React.FC<FundingRateChartProps> = ({ symbol }) => {
  const [timeframe, setTimeframe] = React.useState<Timeframe>("1M");
  const [activeTab, setActiveTab] = React.useState<ChartTab>("pnl");

  const allData = React.useMemo(() => generateMockData(symbol, 90), [symbol]);

  const chartData = React.useMemo(() => {
    const now = Date.now();
    const msPerDay = 24 * 60 * 60 * 1000;
    const windowMs =
      timeframe === "1W"
        ? 7 * msPerDay
        : timeframe === "1M"
          ? 30 * msPerDay
          : 90 * msPerDay;
    const from = now - windowMs;
    return allData.filter((p) => p.timestamp >= from);
  }, [allData, timeframe]);

  const zeroOffset = React.useMemo(() => {
    if (!chartData.length) return 0.5;
    const maxVal = Math.max(...chartData.map((d) => d.value));
    const minVal = Math.min(...chartData.map((d) => d.value));
    if (maxVal <= minVal) return 0.5;
    return Math.max(0, Math.min(1, maxVal / (maxVal - minVal)));
  }, [chartData]);

  return (
    <div className="flex h-full w-full flex-col bg-[#041223]">
      {/* Tabs + timeframe buttons */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setActiveTab("pnl")}
            className={cn(
              "text-sm transition-colors",
              activeTab === "pnl"
                ? "text-[#BCEAFF] underline underline-offset-4"
                : "text-[#7192A5] hover:text-[#BCEAFF]",
            )}
          >
            PnL Simulation
          </button>
          {/* <button
            type="button"
            onClick={() => setActiveTab("price")}
            className={cn(
              "text-sm transition-colors",
              activeTab === "price"
                ? "text-[#BCEAFF] underline underline-offset-4"
                : "text-[#7192A5] hover:text-[#BCEAFF]",
            )}
          >
            Price Chart
          </button> */}
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          {(["1W", "1M", "3M"] as Timeframe[]).map((tf) => (
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

      {/* Est PnL overlay */}
      {/* <div className="mx-4 mt-2 mb-1 w-fit border border-[#0F1F30] bg-[#041223] px-3 py-1.5">
        <p className="text-[11px] text-[#7192A5]">
          Est. PnL:{" "}
          <span className="text-[#4ADE80]">
            {(chartData[chartData.length - 1]?.value ?? 0) >= 0 ? "+" : ""}
            {((chartData[chartData.length - 1]?.value ?? 0) * 100).toFixed(2)}%
          </span>
        </p>
      </div> */}

      <div className="relative min-h-0 flex-1">
        <ChartContainer
          config={chartConfig}
          className="relative -ml-3 h-full w-[103.3%]"
        >
          <ComposedChart
            accessibilityLayer
            data={chartData}
            margin={{ left: 12, right: 12 }}
          >
            <CartesianGrid vertical={true} />

            <defs>
              <linearGradient
                id="spot-funding-split-fill"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor={POSITIVE_STROKE}
                  stopOpacity={0.4}
                />
                <stop
                  offset={`${zeroOffset * 100}%`}
                  stopColor={POSITIVE_STROKE}
                  stopOpacity={0.05}
                />
                <stop
                  offset={`${zeroOffset * 100}%`}
                  stopColor={NEGATIVE_STROKE}
                  stopOpacity={0.05}
                />
                <stop
                  offset="100%"
                  stopColor={NEGATIVE_STROKE}
                  stopOpacity={0.3}
                />
              </linearGradient>
              <linearGradient
                id="spot-funding-split-stroke"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset={`${zeroOffset * 100}%`}
                  stopColor={POSITIVE_STROKE}
                />
                <stop
                  offset={`${zeroOffset * 100}%`}
                  stopColor={NEGATIVE_STROKE}
                />
              </linearGradient>
            </defs>
            <Area
              dataKey="value"
              type="linear"
              baseValue={0}
              stroke="url(#spot-funding-split-stroke)"
              fill="url(#spot-funding-split-fill)"
              strokeWidth={1.5}
              isAnimationActive={false}
              connectNulls
              activeDot={false}
            />
            <Line
              dataKey="value"
              type="linear"
              stroke="transparent"
              dot={false}
              activeDot={<CustomActiveDot />}
              isAnimationActive={false}
              connectNulls
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  hideIndicator
                  className="-mt-[60px] -translate-x-1/2 -translate-y-full rounded-none border border-[#0F1F30] bg-[#041223] py-3 text-[#7092A5]"
                  formatter={(value, _name, item) => {
                    const point = (item as any)?.payload as
                      | ChartDataPoint
                      | undefined;
                    const dateText = point?.timestamp
                      ? new Date(point.timestamp).toLocaleString()
                      : "";
                    const rate = Number(point?.value ?? value ?? 0);
                    const isNeg = rate < 0;
                    const bps = (rate * 100).toFixed(1);

                    return (
                      <div className="flex flex-col gap-1">
                        {dateText && (
                          <span className="text-[11px] text-[#7192A5]">
                            {dateText}
                          </span>
                        )}
                        <span
                          className={cn(
                            "text-sm font-medium",
                            isNeg ? "text-[#FF6B6B]" : "text-[#BCEAFF]",
                          )}
                        >
                          {isNeg ? "" : "+"}
                          {bps} bps
                        </span>
                      </div>
                    );
                  }}
                />
              }
            />
          </ComposedChart>
        </ChartContainer>
      </div>
    </div>
  );
};

export default FundingRateChart;
