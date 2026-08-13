"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  TrendingUp,
  Briefcase,
  Copy,
  Gift,
  BarChart3,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { Route } from "next";

const BOTTOM_NAV_ITEMS = [
  { label: "Discover", href: "/m", icon: Home },
  // { label: "Pool", href: "/m/pool", icon: TrendingUp },
  { label: "Portfolio", href: "/m/portfolio", icon: Briefcase },
  // { label: "Copytrade", href: "/m/copytrade", icon: Copy },
  // { label: "Referrals", href: "/m/referrals", icon: Gift },
  { label: "Strategies", href: "/m/strategies", icon: BarChart3 },
] as const;

export default function MobileBottomNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/m") {
      return pathname === "/m" || pathname === "/m/";
    }
    return pathname.startsWith(href);
  };

  return (
    <div className="fixed right-0 bottom-0 left-0 z-50 border-t border-[#0F1F30] bg-[#000C1D]">
      <div className="grid grid-cols-3 gap-1 px-2 py-2">
        {BOTTOM_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href as Route}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg px-2 py-2 transition-colors",
                active
                  ? "bg-[#0F1F30] text-[#BCEAFF]"
                  : "text-[#7192A5] active:bg-[#0F1F30]",
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
