/* eslint-disable @next/next/no-img-element */
"use client";

import React from "react";
import { cn } from "@/lib/utils";
import type { ArbitrageRowType } from "@/app/strategies/_components/arbitrage-columns";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";

import {
  ARB_COLUMN_PROTOCOLS,
  getProtocolLabel,
  getProtocolLogo,
  protocolToFundingRateField,
} from "@/lib/protocol-registry";
import { TokenLogo } from "@/app/strategies/_components/arbitrage-columns";
import { getUnderlyingLabel } from "@/lib/symbol-taxonomy";

const DEX_CONFIG = ARB_COLUMN_PROTOCOLS.map((id) => ({
  key: protocolToFundingRateField(id),
  aprKey: id,
  label: getProtocolLabel(id),
  icon: getProtocolLogo(id),
}));

function formatRate(rateStr: string | undefined, display: "bps" | "apy", aprStr?: string): string {
  if (!rateStr) return "—";
  const val = parseFloat(rateStr.replace("%", ""));
  if (isNaN(val)) return "—";
  if (display === "apy") {
    // Use pre-computed APR from /markets API when available
    if (aprStr) {
      const apr = parseFloat(aprStr.replace("%", ""));
      if (!isNaN(apr)) return `${apr >= 0 ? "+" : ""}${apr.toFixed(1)}%`;
    }
    // Fallback: annualize from raw rate (already per-hour for most protocols)
    const apy = val * 24 * 365;
    return `${apy >= 0 ? "+" : ""}${apy.toFixed(1)}%`;
  }
  // BPS = percentage × 100
  const bps = val * 100;
  return `${bps >= 0 ? "+" : ""}${bps.toFixed(2)} bps`;
}

function rateColor(rateStr: string | undefined): string {
  if (!rateStr) return "text-[#7192A5]";
  const val = parseFloat(rateStr.replace("%", ""));
  if (isNaN(val)) return "text-[#7192A5]";
  return val > 0 ? "text-[#4CE1B6]" : "text-[#FF6B6B]";
}

interface MobileArbitrageItemProps {
  data: ArbitrageRowType;
  onClick: () => void;
  isExpanded: boolean;
  onToggle: () => void;
  rateDisplay?: "bps" | "apy";
  className?: string;
}

export const MobileArbitrageItem: React.FC<MobileArbitrageItemProps> = ({
  data,
  onClick,
  isExpanded,
  onToggle,
  rateDisplay = "bps",
  className,
}) => {
  const maxArbDisplay = rateDisplay === "apy"
    ? `${data.maxArb.toFixed(1)}%`
    : `${(data.spreadBps1h ?? 0).toFixed(2)} bps`;

  return (
    <div
      onClick={onToggle}
      className={cn(
        "cursor-pointer px-4 py-3 select-none",
        isExpanded ? "bg-[#062035]" : "bg-[#041223]",
        className,
      )}
    >
      <div className="grid grid-cols-4 items-center">
        <div className="col-span-2 flex items-center gap-2">
          <TokenLogo symbol={data.symbol} className="h-8 w-8" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm text-white">
              {getUnderlyingLabel(data.symbol)}
            </span>
            <span className="text-[10px] tracking-tight text-[#7192A5]">
              {data.symbol}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-center">
          <span className="text-sm text-white">{data.oiRank}</span>
        </div>

        <div className="flex flex-col items-end gap-1">
          <span className="text-sm font-bold text-[#4CE1B6]">
            {maxArbDisplay}
          </span>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="expanded-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div
              className="mt-6 h-[1.5px] w-full opacity-10"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(to right, #f1f1f1 0, #f1f1f1 8px, transparent 8px, transparent 17px)",
              }}
            />
            <div className="mt-2 flex flex-col items-center justify-center border-t border-[#0F1F30] pt-2 pb-1">
              <div className="grid w-full grid-cols-2 gap-4">
                {DEX_CONFIG.map(({ key, aprKey, label, icon }) => {
                  const rate = (data as unknown as Record<string, string | undefined>)[key];
                  if (!rate) return null;
                  const aprStr = (data.marketData as unknown as Record<string, { fundingRateApr?: string } | undefined>)?.[aprKey]?.fundingRateApr;
                  return (
                    <div key={key} className="flex min-w-0 items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <img src={icon} alt={label} className="h-5 w-5 shrink-0 rounded-full" loading="lazy" decoding="async" />
                        <span className="truncate text-xs text-[#9fc4d9]">{label}</span>
                      </div>
                      <span className={cn("shrink-0 text-xs font-medium", rateColor(rate))}>
                        {formatRate(rate, rateDisplay, aprStr)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div
                className="mt-6 h-[1.5px] w-full opacity-10"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(to right, #f1f1f1 0, #f1f1f1 8px, transparent 8px, transparent 17px)",
                }}
              />
              <div className="flex h-20 w-full items-center justify-center p-4">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onClick();
                  }}
                  style={{
                    background:
                      "linear-gradient(90deg, rgba(137,179,224,0.15) 0%, rgba(36,45,55,0.6) 30%, rgba(36,45,55,0.6) 70%, rgba(137,179,224,0.15) 100%)",
                  }}
                  className="h-fit w-full border-2 border-[#9ce0ff33] p-2 px-4 text-[16px] text-[#9CE0FF]"
                >
                  Execute Arb
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
