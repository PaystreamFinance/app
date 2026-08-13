/* eslint-disable @next/next/no-img-element */
"use client";

import React from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ArrowUpRightIcon } from "lucide-react";

interface StrategyCardProps {
  icon: string;
  strategyName: string;
  expectedApy?: string;
  description: string;
  risks: string[];
  isSelected?: boolean;
  onClick: () => void;
}

export const StrategyCard: React.FC<StrategyCardProps> = ({
  icon,
  strategyName,
  expectedApy,
  description,
  risks,
  isSelected = false,
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      className={cn(
        "cursor-pointer border border-[#0E1F31] bg-[#000D1E] p-5 transition-all hover:bg-[#021835]",
        isSelected
          ? "border-[#23C0FF] shadow-[0_0_20px_rgba(35,192,255,0.2)]"
          : "border-[#0F1F30]",
      )}
    >
      {/* Header Section */}
      <div className="relative mb-4 flex flex-col items-start justify-between">
        <div className="absolute top-0 right-0">
          {/* //top right arrow icon */}

          <ArrowUpRightIcon className="size-6 cursor-pointer text-[#7192A5]" />
        </div>
        <div className="flex items-center gap-3">
          {/* Icon */}
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#0D1E30]">
            <img src={icon} alt={strategyName} className="size-7" />
          </div>

          {/* Strategy Name */}
          <div className="flex flex-col">
            <span className="text-xs font-normal text-[#7192A5]">
              Strategy name
            </span>
            <span className="text-lg font-medium text-white">
              {strategyName}
            </span>
          </div>
        </div>

        {/* Expected APY */}
        {/* {expectedApy && (
          <div className="mt-4 flex flex-col items-start">
            <span className="text-xs font-light text-[#7192A5]">
              Expected APY
            </span>
            <span className="text-4xl font-medium text-[#4ADE80]">
              {expectedApy}
            </span>
          </div>
        )} */}
      </div>

      {/* Separator */}
      {/* <div className="mb-4 border-b border-dashed border-[#35465D]" /> */}

      {/* Description Section */}
      <div className="mb-4">
        <span className="mb-2 block text-xs font-normal text-[#7192A5]">
          Description:
        </span>
        <p className="text-sm leading-relaxed font-normal text-[#BCEBFF]">
          {description}
        </p>
      </div>

      {/* Separator */}
      {/* <div className="mb-4 border-b border-dashed border-[#35465D]" /> */}

      {/* Risks Section */}
      <div className="mt-auto border-t border-dashed border-[#35465D] pt-5">
        <span className="mb-2 block text-xs font-normal text-[#7192A5]">
          Risks:
        </span>
        <div className="flex flex-wrap gap-2">
          {risks.map((risk, index) => (
            <span
              key={index}
              className="rounded-sm bg-[#211810] px-3 py-1 text-xs font-normal text-[#E58061]"
            >
              {risk}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
