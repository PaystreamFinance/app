"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";

import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  {
    label: "Discover",
    href: "/arb",
    pathMatch: (pathname: string) =>
      pathname.includes("/arb") || pathname.includes("/strategies"),
  },
  {
    label: "Portfolio",
    href: "/portfolio",
    pathMatch: (pathname: string) => pathname.includes("/portfolio"),
  },
  {
    label: "RWA Rollbacks",
    href: "/rwa-rollbacks",
    pathMatch: (pathname: string) => pathname.includes("/rwa-rollbacks"),
  },
] as const;

interface NavbarNavigationProps {
  isMobile?: boolean;
  onItemClick?: () => void;
}

export function NavbarNavigation({
  isMobile,
  onItemClick,
}: NavbarNavigationProps) {
  const pathname = usePathname();

  if (isMobile) {
    return (
      <div className="flex flex-col items-start space-y-6">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href as Route}
            className="text-2xl font-light text-[#EAEAEA] transition-all hover:text-[#BCEBFF]"
            onClick={onItemClick}
          >
            {item.label}
          </Link>
        ))}
      </div>
    );
  }

  return (
    <>
      {NAV_ITEMS.map((item) => {
        const isActive = item.pathMatch(pathname);
        return (
          <Link
            key={item.href}
            href={item.href as Route}
            className={cn(
              "hover:text-accent-t3 text-base font-normal text-[#7192A5] transition-all hover:text-[#BCEAFF]",
              {
                "font-ibm-plex-serif font-medium tracking-[-1%] text-[#BCEAFF] italic":
                  isActive,
              },
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
