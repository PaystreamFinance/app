"use client";

import React from "react";
import { cn } from "@/lib/utils";
import type { SpotPerpRowType } from "@/app/spot-perp/_components/spot-columns";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { TokenLogo } from "@/app/spot-perp/_components/spot-columns";

interface MobileSpotPerpItemProps {
  data: SpotPerpRowType;
  onClick: () => void;
  isExpanded: boolean;
  onToggle: () => void;
  className?: string;
}

function formatPrice(value: number): string {
  if (value <= 0) return "$0.00";
  return value >= 1
    ? `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${value.toFixed(6)}`;
}

export const MobileSpotPerpItem: React.FC<MobileSpotPerpItemProps> = ({
  data,
  onClick,
  isExpanded,
  onToggle,
  className,
}) => {
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
          <span className="text-sm text-white">{data.symbol}</span>
        </div>

        <div className="flex items-center justify-center">
          <span className="text-sm text-white">
            {formatPrice(data.tokenPrice)}
          </span>
        </div>

        <div className="flex flex-col items-end gap-1">
          <span className="text-sm text-white">{data.oiRank}</span>
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
              <div className="grid w-full grid-cols-2 grid-rows-2 items-center gap-6">
                {data.fundingRateDrift && (
                  <div className="flex min-w-0 items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-2">
                      <img
                        src="/images/markets-logo/drift.webp"
                        alt="Drift"
                        className="h-6 w-6 shrink-0 rounded-full"
                      />
                      <span className="truncate text-sm text-[#9fc4d9]">
                        Drift
                      </span>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-sm font-medium",
                        parseFloat(
                          data.fundingRateDrift.replace("%", "") || "0",
                        ) > 0
                          ? "text-[#4CE1B6]"
                          : "text-[#FF6B6B]",
                      )}
                    >
                      {data.fundingRateDrift}
                    </span>
                  </div>
                )}
                {data.fundingRatePacifica && (
                  <div className="flex min-w-0 items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-2">
                      <img
                        src="/images/markets-logo/pacifica.webp"
                        alt="Pacifica"
                        className="h-6 w-6 shrink-0 rounded-full"
                      />
                      <span className="truncate text-sm text-[#9fc4d9]">
                        Pacifica
                      </span>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-sm font-medium",
                        parseFloat(
                          data.fundingRatePacifica.replace("%", "") || "0",
                        ) > 0
                          ? "text-[#4CE1B6]"
                          : "text-[#FF6B6B]",
                      )}
                    >
                      {data.fundingRatePacifica}
                    </span>
                  </div>
                )}
                {data.fundingRateHyperliquid && (
                  <div className="flex min-w-0 items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-2">
                      <img
                        src="/images/markets-logo/hype.webp"
                        alt="Hyperliquid"
                        className="h-6 w-6 shrink-0 rounded-full"
                      />
                      <span className="truncate text-sm text-[#9fc4d9]">
                        Hyperliquid
                      </span>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-sm font-medium",
                        parseFloat(
                          data.fundingRateHyperliquid.replace("%", "") || "0",
                        ) > 0
                          ? "text-[#4CE1B6]"
                          : "text-[#FF6B6B]",
                      )}
                    >
                      {data.fundingRateHyperliquid}
                    </span>
                  </div>
                )}
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
                  Execute Trade
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
