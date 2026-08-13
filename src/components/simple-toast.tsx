"use client";

import React from "react";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "info";

interface SimpleToastProps {
  type: ToastType;
  title: string;
  description: string;
}

const TOAST_META: Record<
  ToastType,
  {
    gradient: string;
    icon: string;
  }
> = {
  success: {
    gradient: "from-[#0D212D] via-[#0A212E] to-[#091627]",
    icon: "/pools/positions/confirmed.svg",
  },
  error: {
    gradient: "from-[#171524] via-[#141827] to-[#071325]",
    icon: "/pools/positions/failed.svg",
  },
  info: {
    gradient: "from-[#122437] via-[#0F2234] to-[#0A1729]",
    icon: "/pools/positions/confirming.svg",
  },
};

export const SimpleToast: React.FC<SimpleToastProps> = ({
  type,
  title,
  description,
}) => {
  const meta = TOAST_META[type];

  return (
    <div
      className={cn(
        "grid w-full max-w-[820px] grid-cols-12 rounded-md border border-[#132335] bg-linear-to-r from-[#071325] via-[#0C192B] to-[#071325] text-white",
      )}
    >
      <div
        className={cn(
          "col-span-3 flex items-center border-r border-[#132335] bg-linear-to-r",
          meta.gradient,
        )}
      >
        <div className="mx-auto rounded-[18px]">
          <img
            src={meta.icon}
            alt={`${type}-icon`}
            className="h-[48px] w-[48px]"
          />
        </div>
      </div>

      <div className="col-span-9 flex flex-1 flex-col bg-linear-to-r px-4 py-3 pb-3">
        <h3
          className={cn(
            "font-ibm-plex-serif border-b border-[#132335] pb-2 text-xl font-normal tracking-[0.4px] italic",
          )}
        >
          <span className="text-white">{title}</span>
        </h3>

        <p className="mt-1.5 text-sm text-[#9CA1A9]">{description}</p>
      </div>
    </div>
  );
};

export type { SimpleToastProps, ToastType };
