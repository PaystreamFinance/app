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

export const description = "Portfolio total PnL over time";

export type PortfolioChartPoint = {
  timestamp: number;
  dateLabel: string;
  totalPnl: number;
};

type Timeframe = "1D" | "7D" | "30D" | "ALL";

const chartConfig = {
  totalPnl: { label: "Total PnL" },
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

interface PortfolioChartProps {
  data: PortfolioChartPoint[];
  className?: string;
}

const PortfolioChart: React.FC<PortfolioChartProps> = ({ data, className }) => {
  const [timeframe, setTimeframe] = React.useState<Timeframe>("7D");
  const filteredData = React.useMemo(() => {
    if (!data || data.length === 0) return [];
    if (timeframe === "ALL") return data;

    const now = Date.now();
    const windowMs =
      timeframe === "1D"
        ? 24 * 60 * 60 * 1000
        : timeframe === "7D"
          ? 7 * 24 * 60 * 60 * 1000
          : 30 * 24 * 60 * 60 * 1000;
    const from = now - windowMs;

    return data.filter((point) => point.timestamp >= from);
  }, [data, timeframe]);

  const chartData = filteredData.length ? filteredData : data;

  const zeroOffset = React.useMemo(() => {
    if (!chartData.length) return 0.5;
    const maxVal = Math.max(...chartData.map((d) => d.totalPnl));
    const minVal = Math.min(...chartData.map((d) => d.totalPnl));
    if (maxVal <= minVal) return 0.5;
    return Math.max(0, Math.min(1, maxVal / (maxVal - minVal)));
  }, [chartData]);

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <p className="text-sm tracking-[-1%] text-[#7192A5]">Portfolio PnL</p>
        <div className="flex items-center gap-1.5 text-xs">
          {(["1D", "7D", "30D", "ALL"] as Timeframe[]).map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => setTimeframe(tf)}
              className={cn(
                "h-6 rounded-full border px-2.5 text-[11px] transition-colors",
                timeframe === tf
                  ? "border-[#0F1F30] bg-[#0F1F30] text-[#BCEAFF]"
                  : "border-transparent bg-transparent text-[#7192A5] hover:bg-[#041223]",
              )}
            >
              {tf === "ALL" ? "All" : tf}
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <ChartContainer
          config={chartConfig}
          className={cn(
            "relative -ml-3 h-[180px] w-[103.3%] sm:h-[220px]",
            className,
          )}
        >
          <ComposedChart
            accessibilityLayer
            data={chartData}
            margin={{
              left: 12,
              right: 12,
            }}
          >
            <CartesianGrid vertical={true} />

            <defs>
              <linearGradient
                id="portfolio-pnl-split-fill"
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
                id="portfolio-pnl-split-stroke"
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
              dataKey="totalPnl"
              type="linear"
              baseValue={0}
              stroke="url(#portfolio-pnl-split-stroke)"
              fill="url(#portfolio-pnl-split-fill)"
              strokeWidth={1.5}
              isAnimationActive={false}
              connectNulls
              activeDot={false}
            />
            <Line
              dataKey="totalPnl"
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
                      | PortfolioChartPoint
                      | undefined;
                    const dateText = point?.timestamp
                      ? new Date(point.timestamp).toLocaleString()
                      : "";
                    const pnl = Number(point?.totalPnl ?? value ?? 0);
                    const isNegative = pnl < 0;
                    const displayValue = isNegative
                      ? `-$${Math.abs(pnl).toFixed(2)}`
                      : `$${pnl.toFixed(2)}`;

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
                            isNegative ? "text-[#FF6B6B]" : "text-[#BCEAFF]",
                          )}
                        >
                          {displayValue}
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

export default PortfolioChart;
