"use client";

import Image from "next/image";

import { cn } from "@/lib/utils";

interface ChartLoadingProps {
  text?: string;
  className?: string;
}

export function ChartLoading({ text = "Loading chart...", className }: ChartLoadingProps) {
  return (
    <div className={cn("flex h-full min-h-[200px] flex-col items-center justify-center gap-2", className)}>
      <Image src="/loading.gif" alt="Loading" width={72} height={72} priority={false} />
      <p className="text-xs font-normal text-[#7192A5]">{text}</p>
    </div>
  );
}
