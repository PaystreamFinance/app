"use client";

import Link from "next/link";
import { usePrivy, useLogin } from "@privy-io/react-auth";
import {
  Menu,
  X,
  Search,
  Book,
  XIcon,
  TwitterIcon,
  Twitter,
} from "lucide-react";
import { useState } from "react";
import { usePathname } from "next/navigation";

import FullLogo from "@/components/full-logo";
import WalletSheet from "@/components/wallet-sheet";
import { NotificationBell } from "@/components/notification-bell";
import { cn } from "@/lib/utils";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { useBetaMode } from "@/hooks/use-beta-mode";

const MOBILE_NAV_ITEMS = [
  { label: "Perp-Perp Arb", href: "/m/arb", betaOnly: false },
  { label: "Spot-Perp Neutral", href: "/m/spot-perp", betaOnly: true },
  { label: "Portfolio", href: "/m/portfolio", betaOnly: false },
  { label: "RWA Rollbacks", href: "/m/rwa-rollbacks", betaOnly: false },
] as const;

export default function MobileNavbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const { user, logout } = usePrivy();
  const { login } = useLogin();
  const pathname = usePathname();
  const isArbPage = pathname === "/m/arb" || pathname === "/m/strategies";
  const { betaMode } = useBetaMode();

  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    window.dispatchEvent(new CustomEvent("navbar-search", { detail: value }));
  };

  return (
    <>
      <div className="sticky top-0 z-50 border-b border-[#0F1F30] bg-[#000C1D]">
        <div className="flex items-center justify-between px-4 py-3">
          {/* Left: Hamburger Menu and Logo */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="-ml-1 p-2 text-[#BCEAFF]"
              aria-label="Toggle menu"
            >
              {isMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>
            <div className="h-5 w-px bg-[#0F1F30]" />
            <Link href="/m" className="flex items-center">
              <FullLogo className="h-5 cursor-pointer" />
            </Link>
          </div>

          {/* Right: Search + Bell and Connect */}
          <div className="flex items-center gap-2">
            {isArbPage && (
              <button
                onClick={() => setSearchOpen(!searchOpen)}
                className="p-2 text-[#7092A5]"
                aria-label="Search"
              >
                <Search className="h-4 w-4" />
              </button>
            )}
            <NotificationBell isMobile />
            <div className="-mr-1">
              <WalletSheet
                isMobile={true}
                user={user}
                login={login}
                logout={logout}
              />
            </div>
          </div>
        </div>
        {isArbPage && searchOpen && (
          <div className="flex items-center gap-2 border-t border-[#0F1F30] bg-[#041223] px-4 py-2">
            <Search className="size-3.5 shrink-0 text-[#7092A5]" />
            <input
              autoFocus
              value={searchValue}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search asset..."
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-[#7092A5]"
            />
            {searchValue && (
              <button onClick={() => handleSearchChange("")} className="text-[#7092A5]">
                <X className="size-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Mobile Menu Overlay */}
      {isMenuOpen && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/50" onClick={() => setIsMenuOpen(false)} />
          <div className="fixed inset-y-0 left-0 z-[61] flex w-[75%] max-w-[300px] flex-col justify-between bg-[#000C1D]">
          <div className="flex items-center gap-3 border-b border-[#0F1F30] px-4 py-3">
            <button
              onClick={() => setIsMenuOpen(false)}
              className="p-2 text-[#BCEAFF]"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="h-5 w-px bg-[#0F1F30]" />
            <Link href="/m" className="flex items-center" onClick={() => setIsMenuOpen(false)}>
              <FullLogo className="h-5 cursor-pointer" />
            </Link>
          </div>
          <div className="flex flex-1 flex-col">
            {MOBILE_NAV_ITEMS.filter((item) => !item.betaOnly || betaMode).map((item) => {
              const isActive =
                item.href === "/m/arb"
                  ? pathname === "/m/arb" || pathname === "/m/arb/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href as Route}
                  onClick={() => setIsMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-4 border-b border-[#0F1F30] px-6 py-4 text-lg",
                    isActive
                      ? "font-ibm-plex-serif bg-[#0F1F30] text-[#BCEAFF] italic"
                      : "text-[#7192A5]",
                  )}
                >
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
          <div className="flex gap-4 px-6 py-4">
            <Link href="https://docs.paystream.finance" target="_blank">
              <Button variant="ghost" className="cursor-pointer rounded-none!">
                <Book className="h-3 w-3" />
                <span className="text-sm font-light">Docs</span>
              </Button>
            </Link>
            <Link href="https://x.com/Paystreamlabs" target="_blank">
              <Button variant="ghost" className="cursor-pointer rounded-none!">
                <svg width="14" height="14" viewBox="0 0 1200 1227" fill="currentColor">
                  <path d="M714.163 519.284L1160.89 0H1055.03L667.137 450.887L357.328 0H0L468.492 681.821L0 1226.37H105.866L515.491 750.218L842.672 1226.37H1200L714.137 519.284H714.163ZM569.165 687.828L521.697 619.934L144.011 79.6944H306.615L611.412 515.685L658.88 583.579L1055.08 1150.3H892.476L569.165 687.854V687.828Z" />
                </svg>
              </Button>
            </Link>
          </div>
        </div>
        </>
      )}
    </>
  );
}
