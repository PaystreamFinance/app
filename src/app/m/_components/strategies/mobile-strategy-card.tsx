"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface MobileStrategyCardProps {
  icon: string;
  strategyName: string;
  expectedApy: string;
  description: string;
  risks: string[];
  onClick: () => void;
  className?: string;
}

export const MobileStrategyCard: React.FC<MobileStrategyCardProps> = ({
  icon,
  strategyName,
  expectedApy,
  description,
  risks,
  onClick,
  className,
}) => {
  return (
    <div
      onClick={onClick}
      className={cn(
        "relative cursor-pointer overflow-hidden border border-[#0F1F30] bg-[#041223] p-5 transition-all active:scale-[0.98]",
        className,
      )}
    >
      <div className="mb-4 flex items-center justify-between">
        {/* Icon */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center border border-[#0F1F30] bg-[#000C1D]">
            <img src={icon} alt={strategyName} className="h-6 w-6" />
          </div>
        </div>

        {/* Arrow (visual cue for navigation) */}
        <div className="text-[#7192A5]">
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M1 11L11 1M11 1H3.5M11 1V8.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      {/* Header */}
      <h3 className="mb-1 text-base font-medium text-white">{strategyName}</h3>

      {/* APY */}
      <div className="mb-4">
        <span className="mb-0.5 block text-[10px] text-[#7192A5]">
          Expected APY
        </span>
        <span className="text-xl font-bold text-[#4CE1B6]">{expectedApy}</span>
      </div>

      {/* Description */}
      <p className="mb-6 line-clamp-3 text-xs leading-relaxed text-[#7192A5]">
        {description}
      </p>

      {/* Risks */}
      <div className="flex flex-wrap gap-2">
        <span className="mr-1 text-[10px] text-[#7192A5]">Risks:</span>
        {risks.slice(0, 3).map((risk, index) => (
          <span
            key={index}
            className="rounded bg-[#0F1F30] px-1.5 py-0.5 text-[9px] font-medium text-[#B87D3B]"
          >
            {risk}
          </span>
        ))}
      </div>
    </div>
  );
};
