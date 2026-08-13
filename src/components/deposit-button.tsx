/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";

interface DepositButtonProps {
  onClick: () => void;
  className?: string;
}

/**
 * Animated deposit button with coin elements that shift on hover.
 * Component A (default) → Component B (hover): coins shift positions, gradient moves, bg darkens.
 */
export function DepositButton({ onClick, className }: DepositButtonProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onTouchStart={() => setHovered(true)}
      onTouchEnd={() => setHovered(false)}
      className={cn(
        "relative flex w-full cursor-pointer items-center overflow-hidden px-4 py-3",
        className,
      )}
    >
      {/* Background — transitions between two colors */}
      <div
        className="absolute inset-0 transition-colors duration-500"
        style={{ backgroundColor: hovered ? "#132032" : "#1a2f4a" }}
      />

      {/* Noise texture overlay */}
      <div
        className="absolute inset-0 bg-[length:512px_512px] bg-left-top mix-blend-overlay transition-opacity duration-500"
        style={{
          backgroundImage: `url('/deposit-btn/${hovered ? "noise-b" : "noise-a"}.png')`,
        }}
      />

      {/* Coin 1 — right, rotated -22.49deg */}
      <div
        className="absolute right-16 flex size-14 items-center justify-center transition-all duration-500 ease-out"
        style={{ top: hovered ? "45px" : "5px" }}
      >
        <img
          src="/deposit-btn/coin.svg"
          alt=""
          className="size-10 -rotate-[22deg]"
          aria-hidden
        />
      </div>

      {/* Coin 2 — far right, rotated 173deg */}
      <div
        className="absolute flex size-11 items-center justify-center transition-all duration-500 ease-out"
        style={{
          right: hovered ? "-9px" : "-29px",
          top: hovered ? "-53px" : "-33px",
        }}
      >
        <img
          src="/deposit-btn/coin.svg"
          alt=""
          className="size-10 rotate-[173deg]"
          aria-hidden
        />
      </div>

      {/* Coin 3 — right side, flipped */}
      <div
        className="absolute right-4 flex size-14 items-center justify-center transition-all duration-500 ease-out"
        style={{
          top: hovered ? "30px" : "50px",
        }}
      >
        <img
          src="/deposit-btn/coin.svg"
          alt=""
          className="size-10 -scale-y-100 -rotate-[158deg]"
          aria-hidden
        />
      </div>

      {/* Gradient blob — shifts down on hover */}
      <div
        className="absolute right-0 flex h-[117px] w-[209px] items-center justify-center transition-all duration-500 ease-out"
        style={{ top: hovered ? "15px" : "-15px" }}
      >
        <img
          src="/deposit-btn/gradient-a.svg"
          alt=""
          className="h-full w-full rotate-[155deg] -scale-y-100 skew-x-[12deg] object-contain"
          aria-hidden
        />
      </div>

      {/* Label */}
      <div className="relative z-10 flex items-center gap-2">
        <img
          src="/deposit-btn/arrow-circle.svg"
          alt=""
          className="size-7"
          aria-hidden
        />
        <span className="font-ibm-plex-serif text-xl tracking-[-0.2px] text-white italic">
          Deposit
        </span>
      </div>
    </button>
  );
}
