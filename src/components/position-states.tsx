/* eslint-disable @next/next/no-img-element */
"use client";

import React from "react";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";

import { cn } from "@/lib/utils";

type PositionStatus = "opening" | "success" | "failed";

interface PositionToastProps {
  status: PositionStatus;
  amount: string;
  symbol: string;
  amountTokenName?: string; // Token name for the first amount
  amount2?: string; // Optional second token amount
  symbol2?: string; // Optional second token symbol
  amount2TokenName?: string; // Token name for the second amount
  pair: string;
  description: string;
  explorerUrl?: string;
  progress?: number;
  title?: string; // Optional custom title, defaults to status-based titles
  bundleIdCp?: string; // Jito bundle ID for create pool
  bundleIdAddLiq?: string; // Jito bundle ID for add liquidity
  portfolioUrl?: string; // Link to portfolio page
  isSwapToast?: boolean;
  // Swap-specific props
  swapSellAmount?: string;
  swapSellIcon?: string;
  swapBuyAmount?: string;
  swapBuyIcon?: string;
  // Retry functionality
  onRetry?: () => void; // Callback for retry button
  showRetry?: boolean; // Whether to show retry button
}

const STATUS_META: Record<
  PositionStatus,
  {
    gradient: string;
    icon: string;
  }
> = {
  opening: {
    gradient: "from-[#122437] via-[#0F2234] to-[#0A1729]",
    icon: "/pools/positions/confirming.svg",
  },
  success: {
    gradient: "from-[#0D212D] via-[#0A212E] to-[#091627]",
    icon: "/pools/positions/confirmed.svg",
  },
  failed: {
    gradient: "from-[#171524] via-[#141827] to-[#071325]",
    icon: "/pools/positions/failed.svg",
  },
};

const PositionToast: React.FC<PositionToastProps> = ({
  status,
  amount,
  symbol,
  amountTokenName,
  amount2,
  symbol2,
  amount2TokenName,
  pair,
  description,
  explorerUrl,
  progress,
  title,
  bundleIdCp,
  bundleIdAddLiq,
  portfolioUrl,
  isSwapToast = false,
  swapSellAmount,
  swapSellIcon,
  swapBuyAmount,
  swapBuyIcon,
  onRetry,
  showRetry = false,
}) => {
  const meta = STATUS_META[status];

  const getDefaultTitle = () => {
    if (title) return title;
    if (status === "failed") return "Position failed to open";
    if (status === "success") return "Position opened successfully";
    if (status === "opening") return "Opening position...";
    return "Position update";
  };

  return (
    <div
      className={cn(
        "grid w-full max-w-[820px] grid-cols-12 rounded-md border border-[#132335] bg-linear-to-r from-[#071325] via-[#0C192B] to-[#071325] text-white sm:max-w-[820px] max-sm:max-w-[calc(100vw-2rem)]",
      )}
    >
      <div
        className={cn(
          "col-span-3 flex items-center border-r border-[#132335] bg-linear-to-r max-sm:col-span-2",
          meta.gradient,
        )}
      >
        <div className="mx-auto rounded-[18px]">
          <img
            src={meta.icon}
            alt={`${status}-icon`}
            className="h-[48px] w-[48px] max-sm:h-[32px] max-sm:w-[32px]"
          />
        </div>
      </div>

      <div className="col-span-9 flex flex-1 flex-col bg-linear-to-r px-4 py-3 pb-3 max-sm:col-span-10 max-sm:px-3 max-sm:py-2">
        <h3
          className={cn(
            "font-ibm-plex-serif border-b border-[#132335] pb-2 text-xl font-normal tracking-[0.4px] italic max-sm:pb-1 max-sm:text-base",
            {
              "animate-pulse": status === "opening",
            },
          )}
        >
          <span className="text-white">{getDefaultTitle()}</span>
        </h3>

        {!isSwapToast && (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-[#C6D4E2]">
            <span className="flex items-center gap-1 font-semibold text-white">
              {amount} {amountTokenName && <span>{amountTokenName}</span>}{" "}
              <img src={symbol} alt="symbol" className="size-4" />
            </span>
            {amount2 && symbol2 && (
              <>
                <span className="text-[#5B7495]">+</span>
                <span className="flex items-center gap-1 font-semibold text-white">
                  {amount2}{" "}
                  {amount2TokenName && <span>{amount2TokenName}</span>}{" "}
                  <img src={symbol2} alt="symbol2" className="size-4" />
                </span>
              </>
            )}
            <span className="text-[#5B7495]">in</span>
            <span className="flex items-center gap-2 text-white">{pair}</span>
          </div>
        )}

        {isSwapToast &&
          swapSellAmount &&
          swapSellIcon &&
          swapBuyAmount &&
          swapBuyIcon && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[#C6D4E2]">
              <span className="text-white">Swapping</span>
              <span className="flex items-center gap-1 font-semibold text-white">
                {swapSellAmount}{" "}
                <img src={swapSellIcon} alt="sell token" className="size-4" />
              </span>
              <span className="text-white">to</span>
              <span className="flex items-center gap-1 font-semibold text-white">
                {swapBuyAmount}{" "}
                <img src={swapBuyIcon} alt="buy token" className="size-4" />
              </span>
            </div>
          )}

        <p className="mt-1.5 border-b border-[#132335] pb-2 text-sm text-[#9CA1A9]">
          {description}
        </p>

        {/* Bundle IDs display for pool creation */}
        {(bundleIdCp || bundleIdAddLiq) && status === "success" && (
          <div className="mt-2 border-b border-[#132335] pb-2 text-xs text-[#7192A5]">
            <div className="space-y-1">
              {bundleIdCp && (
                <div>
                  <span className="font-semibold">Create Pool Bundle:</span>{" "}
                  <span className="font-mono">
                    {bundleIdCp.slice(0, 8)}...{bundleIdCp.slice(-4)}
                  </span>
                </div>
              )}
              {bundleIdAddLiq && (
                <div>
                  <span className="font-semibold">Add Liquidity Bundle:</span>{" "}
                  <span className="font-mono">
                    {bundleIdAddLiq.slice(0, 8)}...{bundleIdAddLiq.slice(-4)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* {(typeof progress === "number" || status === "opening") && (
          <div className="mt-3 h-[8px] w-full rounded-[1.5px] bg-[#000C1D]">
            <div
              className="h-full rounded-none rounded-l-[1.5px] bg-[#BBEBFF] transition-all duration-1000 ease-out"
              style={{ width: `${Math.min(Math.max(progress ?? 0, 0), 100)}%` }}
            />
          </div>
        )} */}

        <div className="mt-2 flex flex-col gap-2">
          {status === "failed" && showRetry && onRetry && (
            <button
              onClick={onRetry}
              className="font-ibm-plex-serif group flex w-full cursor-pointer items-center justify-between gap-2 rounded-md bg-[#0F1F30] px-3 py-2 text-sm font-normal text-[#BBEBFF] italic transition hover:bg-[#1A2F41] hover:text-white"
            >
              Retry
              <ArrowRight className="h-4 w-4 transition-all duration-300 group-hover:translate-x-0.5" />
            </button>
          )}

          {status !== "opening" && explorerUrl && (
            <Link
              href={explorerUrl as Route}
              target="_blank"
              rel="noreferrer"
              className="font-ibm-plex-serif group flex w-full items-center justify-between gap-2 text-sm font-normal text-[#7092A5] italic transition hover:text-[#D1EEFF]"
            >
              view on explorer
              <ArrowRight className="h-4 w-4 -rotate-45 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          )}

          {status === "success" && portfolioUrl && (
            <Link
              href={portfolioUrl as Route}
              className="font-ibm-plex-serif group flex w-full items-center justify-between gap-2 text-sm font-normal text-[#7092A5] italic transition hover:text-[#D1EEFF]"
            >
              view in portfolio
              <ArrowRight className="h-4 w-4 -rotate-45 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};

const PositionStates: React.FC = () => {
  return (
    <div className="space-y-4 bg-[#000915] p-8">
      <PositionToast
        status="opening"
        amount="0.15"
        symbol="/icons/sol.svg"
        pair="PAYS/USDC"
        description="We're confirming your position on-chain..."
        explorerUrl="#"
        progress={65}
      />
      <PositionToast
        status="success"
        amount="0.15"
        symbol="/icons/sol.svg"
        pair="PAYS/USDC"
        description="Your position is live and generating yield."
        explorerUrl="#"
      />
      <PositionToast
        status="failed"
        amount="0.15"
        symbol="/icons/sol.svg"
        pair="PAYS/USDC"
        description="Something went wrong while confirming your transaction."
        explorerUrl="#"
      />
    </div>
  );
};

export { PositionToast };
export type { PositionToastProps };
export default PositionStates;
