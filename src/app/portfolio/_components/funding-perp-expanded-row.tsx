"use client";

import { cn, formatUSD } from "@/lib/utils";
import { PROTOCOL_ICONS } from "@/lib/protocol-registry";
import type { StrategyPositionRowType } from "./strategy-positions-columns";
import type { TpSlDialogProps } from "@/components/tp-sl-dialog";
import type { ArbitrageMarket, Position } from "@/lib/arbitrage-api";
import { useFundingPaymentsHistory } from "../hooks/use-funding-payments-history";
import { Pencil } from "lucide-react";

function getLivePrice(marketData: ArbitrageMarket | undefined, protocol: string): number | null {
  if (!marketData) return null;
  const venue = (marketData as unknown as Record<string, { oraclePrice?: number; markPrice?: number } | null | undefined>)[protocol];
  if (!venue) return null;
  return venue.markPrice ?? venue.oraclePrice ?? null;
}

function formatSignedUsd(value: number, decimals = 2): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatUSD(Math.abs(value), decimals)}`;
}

function formatSignedBasisUsd(value: number): string {
  const absValue = Math.abs(value);
  const decimals = absValue > 0 && absValue < 0.01 ? 4 : 2;
  return formatSignedUsd(value, decimals);
}

interface FundingPerpExpandedRowProps {
  row: StrategyPositionRowType;
  onSetTpSlPosition?: (position: TpSlDialogProps["position"]) => void;
}

/** Net funding from the positions v2 response (fundingIncome field).
 *  Positive = net earned, negative = net paid. Only shown when the value
 *  is available (i.e. the backend returned fundingIncome for this leg). */
function NetFundingRow({ value }: { value: number | undefined }) {
  if (value === undefined) return null;
  const isPositive = value >= 0;
  return (
    <div className="flex justify-between">
      <span className="text-[#7192A5]">Net Funding</span>
      <span className={cn("font-medium", isPositive ? "text-[#4ADE80]" : "text-[#FF6B6B]")}>
        {isPositive ? "+" : "-"}${Math.abs(value).toFixed(2)}
      </span>
    </div>
  );
}

/** Render the "Funding Earned" + "Funding Paid" rows for a single leg
 *  sourced from the funding history API (timestamp-filtered). */
function FundingTotalsRows({
  earned,
  paid,
}: {
  earned: number;
  paid: number;
}) {
  const paidAbs = Math.abs(paid);
  return (
    <>
      <div className="flex justify-between">
        <span className="text-[#7192A5]">Funding Earned</span>
        <span className="font-medium text-[#4ADE80]">
          +${earned.toFixed(2)}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-[#7192A5]">Funding Paid</span>
        <span className="font-medium text-[#FF6B6B]">
          -${paidAbs.toFixed(2)}
        </span>
      </div>
    </>
  );
}

const FundingPerpExpandedRow: React.FC<FundingPerpExpandedRowProps> = ({
  row,
  onSetTpSlPosition,
}) => {
  const longPos = row.longPosition;
  const shortPos = row.shortPosition;
  // Per-leg funding totals from /arb/activity/funding/history. Cached
  // 60s and shared across every consumer of the hook, so opening the
  // expanded row doesn't trigger a fresh fetch.
  const { getLegTotals } = useFundingPaymentsHistory();
  // Only count funding that accrued after this position was opened.
  // `createdAt` is an ISO string from the backend; absent on fallback rows.
  const sinceMs = row.createdAt ? new Date(row.createdAt).getTime() : undefined;
  const longFunding = longPos
    ? getLegTotals(row.longProtocol, longPos.symbol, sinceMs)
    : { earned: 0, paid: 0 };
  const shortFunding = shortPos
    ? getLegTotals(row.shortProtocol, shortPos.symbol, sinceMs)
    : { earned: 0, paid: 0 };
  const hasEntryBasis =
    typeof row.entryBasisPerUnit === "number" &&
    Number.isFinite(row.entryBasisPerUnit) &&
    typeof row.entryBasisUsd === "number" &&
    Number.isFinite(row.entryBasisUsd);

  return (
    <div className="bg-[#0D1E31]">
      <div
        className="mx-8 h-px opacity-20"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to right, #7192A5 0, #7192A5 6px, transparent 6px, transparent 14px)",
        }}
      />
      <div className="bg-[#0D1E31] px-8 py-5">
        {hasEntryBasis && (
          <div className="mb-6 flex justify-center">
            <div className="flex min-w-[220px] items-center justify-center gap-3 border border-[#14304A] bg-[#0A1A2B] px-5 py-2.5">
              <span className="text-xs font-medium uppercase tracking-[0.08em] text-[#7192A5]">
                Entry Basis
              </span>
              <span
                className={cn(
                  "text-base font-semibold tabular-nums",
                  row.entryBasisUsd! >= 0 ? "text-[#4ADE80]" : "text-[#FF6B6B]",
                )}
              >
                {formatSignedBasisUsd(row.entryBasisUsd!)}
              </span>
            </div>
          </div>
        )}
        {/* dashed line */}
        <div className="grid grid-cols-2 gap-12">
          {/* LONG side */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-block size-2 rounded-full bg-[#4ADE80]" />
                <span className="text-sm font-medium text-[#4ADE80]">LONG</span>
              </div>
              {longPos && (
                <div className="flex items-center gap-1.5">
                  {PROTOCOL_ICONS[row.longProtocol] && (
                    <img
                      src={PROTOCOL_ICONS[row.longProtocol]}
                      alt={row.longProtocol}
                      className="size-4"
                    />
                  )}
                  <span className="text-sm text-[#7192A5] capitalize">
                    {row.longProtocol}
                  </span>
                </div>
              )}
            </div>
            {longPos ? (
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#7192A5]">Ticker</span>
                  <span className="text-white">{longPos.symbol}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#7192A5]">Entry price</span>
                  <span className="text-white">
                    ${longPos.entryPrice}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#7192A5]">Current price</span>
                  <span className="text-white">
                    {(() => {
                      const livePrice = getLivePrice(row.marketData, row.longProtocol);
                      return livePrice != null ? `$${livePrice.toFixed(4)}` : "—";
                    })()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#7192A5]">Position Size</span>
                  <span className="text-white">
                    {longPos.size?.asset
                      ? `${longPos.size.asset.toFixed(3)} ${longPos.symbol}`
                      : "N/A"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#7192A5]">Leverage</span>
                  <span className="text-white">
                    {longPos.leverage
                      ? `${Number(longPos.leverage.toFixed(1))}x`
                      : "N/A"}
                  </span>
                </div>
                <NetFundingRow value={longPos.fundingIncome} />
                {row.longProtocol !== "lighter" && (
                  <FundingTotalsRows
                    earned={longFunding.earned}
                    paid={longFunding.paid}
                  />
                )}
                <TpSlInlineRow
                  position={longPos}
                  protocol={row.longProtocol}
                  fallbackMarket={row.asset}
                  onSetTpSlPosition={onSetTpSlPosition}
                />
              </div>
            ) : (
              <p className="text-sm text-[#7192A5]">No long position</p>
            )}
          </div>

          {/* SHORT side */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-block size-2 rounded-full bg-[#FF6B6B]" />
                <span className="text-sm font-medium text-[#FF6B6B]">
                  SHORT
                </span>
              </div>
              {shortPos && (
                <div className="flex items-center gap-1.5">
                  {PROTOCOL_ICONS[row.shortProtocol] && (
                    <img
                      src={PROTOCOL_ICONS[row.shortProtocol]}
                      alt={row.shortProtocol}
                      className="size-4"
                    />
                  )}
                  <span className="text-sm text-[#7192A5] capitalize">
                    {row.shortProtocol}
                  </span>
                </div>
              )}
            </div>
            {shortPos ? (
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#7192A5]">Ticker</span>
                  <span className="text-white">{shortPos.symbol}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#7192A5]">Entry price</span>
                  <span className="text-white">
                    ${shortPos.entryPrice}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#7192A5]">Current price</span>
                  <span className="text-white">
                    {(() => {
                      const livePrice = getLivePrice(row.marketData, row.shortProtocol);
                      return livePrice != null ? `$${livePrice.toFixed(4)}` : "—";
                    })()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#7192A5]">Position Size</span>
                  <span className="text-white">
                    {shortPos.size?.asset
                      ? `${shortPos.size.asset.toFixed(3)} ${shortPos.symbol}`
                      : "N/A"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#7192A5]">Leverage</span>
                  <span className="text-white">
                    {shortPos.leverage
                      ? `${Number(shortPos.leverage.toFixed(1))}x`
                      : "N/A"}
                  </span>
                </div>
                <NetFundingRow value={shortPos.fundingIncome} />
                {row.shortProtocol !== "lighter" && (
                  <FundingTotalsRows
                    earned={shortFunding.earned}
                    paid={shortFunding.paid}
                  />
                )}
                <TpSlInlineRow
                  position={shortPos}
                  protocol={row.shortProtocol}
                  fallbackMarket={row.asset}
                  onSetTpSlPosition={onSetTpSlPosition}
                />
              </div>
            ) : (
              <p className="text-sm text-[#7192A5]">No short position</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

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

function normalizeMarket(symbol: string | undefined, fallback: string): string {
  return (symbol || fallback).replace(/-PERP$/i, "");
}

function formatTrigger(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "_";
  }
  if (value >= 1000) return `$${value.toFixed(1)}`;
  if (value >= 1) return `$${value.toFixed(4).replace(/\.?0+$/, "")}`;
  return `$${value.toPrecision(4)}`;
}

/** Human-readable label per protocol id for the disabled-tooltip copy. */
function protocolLabel(protocol: string): string {
  if (protocol === "01") return "01";
  if (protocol.startsWith("hl:")) return protocol.toUpperCase();
  return protocol.charAt(0).toUpperCase() + protocol.slice(1);
}

function TpSlInlineRow({
  position,
  protocol,
  fallbackMarket,
  onSetTpSlPosition,
}: {
  position: Position;
  protocol: string;
  fallbackMarket: string;
  onSetTpSlPosition?: (position: TpSlDialogProps["position"]) => void;
}) {
  const takeProfitPrice = position.triggerPrices?.tp ?? position.takeProfitPrice;
  const stopLossPrice = position.triggerPrices?.sl ?? position.stopLossPrice;
  const hasTrigger = Boolean(takeProfitPrice || stopLossPrice);
  const protocolSupported = supportsTpSl(protocol);
  const entryPriceValid =
    Number.isFinite(Number(position.entryPrice)) &&
    Number(position.entryPrice) > 0;
  const canEdit = protocolSupported && entryPriceValid;
  const value = `${formatTrigger(takeProfitPrice)}/${formatTrigger(stopLossPrice)}`;

  // Why is this leg locked out of TP/SL? Surfaced via title attribute
  // on the disabled state so users with a missing entryPrice see "_/_"
  // but understand it's by design, not a broken click handler.
  const disabledReason = !protocolSupported
    ? `TP/SL not supported on ${protocolLabel(protocol)}.`
    : !entryPriceValid
      ? "Entry price unavailable for this leg — TP/SL needs an entry price to compute triggers."
      : "";

  return (
    <div className="flex justify-between">
      <span className="text-[#7192A5]">TP/SL</span>
      {canEdit ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            // Compute original margin from stable fundamentals rather than
            // using the live API margin (which varies with unrealized PnL and
            // auto-deleveraging). Formula: (entryPrice × |sizeAsset|) / leverage
            const ep = Number(position.entryPrice);
            const sz = position.size?.asset != null ? Math.abs(position.size.asset) : null;
            const lv = position.leverage ?? null;
            const computedMargin =
              ep > 0 && sz != null && sz > 0 && lv != null && lv > 0
                ? (ep * sz) / lv
                : position.margin ?? null;
            onSetTpSlPosition?.({
              protocol: protocol as TpSlDialogProps["position"]["protocol"],
              market: normalizeMarket(position.symbol, fallbackMarket),
              direction: position.direction,
              entryPrice: ep,
              takeProfitPrice: takeProfitPrice ?? null,
              stopLossPrice: stopLossPrice ?? null,
              leverage: lv,
              margin: computedMargin,
              sizeAsset: sz,
            });
          }}
          className="cursor-pointer text-right"
          aria-label={`Set TP/SL for ${position.direction} leg`}
        >
          <span
            className={
              hasTrigger
                ? "inline-flex items-center gap-1 border-b border-dotted border-[#BCEBFF] pb-0.5 text-[#BCEBFF]"
                : "inline-flex items-center gap-1 text-white"
            }
          >
            {value}
            <Pencil className="size-3 text-[#7192A5]" />
          </span>
        </button>
      ) : (
        <span
          className="cursor-not-allowed text-right text-[#5A7280] line-through decoration-[#5A7280]/40"
          title={disabledReason}
          aria-label={disabledReason}
        >
          {value}
        </span>
      )}
    </div>
  );
}

export default FundingPerpExpandedRow;
