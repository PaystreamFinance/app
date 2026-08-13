"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLogin, usePrivy } from "@privy-io/react-auth";
import { useWallets, useFundWallet } from "@privy-io/react-auth/solana";
import { ArrowDownLeft, Layers, Search, Wallet } from "lucide-react";
import React from "react";

import { useIsMobile } from "@/hooks/use-mobile";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { useProtocolBalances } from "@/hooks/use-protocol-balances";
import { cn, formatUSD } from "@/lib/utils";
import {
  ENABLED_PROTOCOLS,
  getProtocol,
  isProtocolEnabled,
  type ProtocolId,
} from "@/lib/protocol-registry";
import MaxWidthWrapper from "@/components/max-width-wrapper";
import FullLogo from "@/components/full-logo";

import WalletSheet from "./wallet-sheet";
import { NavbarNavigation } from "./navbar/navbar-navigation";
import { useSessionSigner } from "./navbar/hooks/use-session-signer";
import { NotificationBell } from "./notification-bell";
import PerpDepositWithdrawModal from "./perp-deposit-withdraw-modal";

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const NAVBAR_LOGO_PROTOCOL_IDS: readonly ProtocolId[] = [
  "pacifica",
  "hyperliquid",
  "aster",
];

const Navbar: React.FC = () => {
  const { user, logout } = usePrivy();
  const { login } = useLogin();
  const isMobile = useIsMobile();
  const pathname = usePathname();
  const { wallets } = useWallets();
  const { fundWallet } = useFundWallet();

  useSessionSigner();

  const embeddedWalletAddress =
    wallets[0]?.standardWallet?.accounts[0]?.address;
  const { usdValue: walletUsdcUsd } = useTokenBalance(
    embeddedWalletAddress ? USDC_MINT : undefined,
  );
  const { balances: perpBalances } = useProtocolBalances({
    enabled: Boolean(user && embeddedWalletAddress),
  });
  const perpTotalUsd = React.useMemo(
    () =>
      ENABLED_PROTOCOLS.reduce(
        (sum, id) => sum + (perpBalances[id]?.balanceNum ?? 0),
        0,
      ),
    [perpBalances],
  );
  const perpLogos = React.useMemo(
    () =>
      NAVBAR_LOGO_PROTOCOL_IDS.filter((id) => isProtocolEnabled(id))
        .map((id) => {
          const p = getProtocol(id);
          return p ? { id, label: p.label, logo: p.logo } : null;
        })
        .filter((x): x is { id: ProtocolId; label: string; logo: string } =>
          Boolean(x),
        )
        .slice(0, 3),
    [],
  );

  // Check if we're on the home page (root route)
  const isHomePage = pathname === "/";
  const isArbPage =
    pathname.startsWith("/arb") || pathname.startsWith("/strategies");

  const [perpModalOpen, setPerpModalOpen] = React.useState(false);

  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const [searchValue, setSearchValue] = React.useState("");

  // Dispatch search to page via custom event
  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    window.dispatchEvent(new CustomEvent("navbar-search", { detail: value }));
  };

  // Reset search when navigating away from arb pages
  React.useEffect(() => {
    if (!isArbPage) {
      setSearchValue("");
      window.dispatchEvent(new CustomEvent("navbar-search", { detail: "" }));
    }
  }, [isArbPage]);

  // "/" shortcut to focus search
  React.useEffect(() => {
    if (!isArbPage) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isArbPage]);

  return (
    <div
      className={cn(
        "sticky top-0 left-0 z-50 border-b border-white/10",
        isHomePage ? "bg-[#000C1D]/80 backdrop-blur-xl" : "bg-[#000C1D]",
      )}
    >
      <MaxWidthWrapper
        className={cn(
          "border-border-t3 flex w-[min(99vw,100%-2rem)] items-center justify-between p-5",
          !isHomePage && "bg-[#000C1D]",
          isHomePage && "bg-transparent",
        )}
      >
        <div className="flex items-center gap-4">
          <Link href="/" className="relative">
            <FullLogo className="h-[22px] cursor-pointer" />
            <span className="absolute -right-1 -bottom-3 text-[10px] font-medium tracking-wide text-[#7192A5]">
              beta
            </span>
          </Link>

          <div className="h-5 w-px rounded-full bg-[#0F1F30]" />

          {!isMobile && <NavbarNavigation />}
        </div>

        <div className="flex items-center gap-4">
          {user && embeddedWalletAddress && (
            <div className="flex items-center">
              <button
                onClick={() =>
                  fundWallet({
                    address: embeddedWalletAddress,
                    options: {
                      chain: "solana:mainnet",
                      asset: "USDC",
                    },
                  })
                }
                className="relative z-[1] -mr-px flex h-[35px] cursor-pointer items-center gap-[11px] border border-white/[0.12] bg-white/[0.06] bg-[radial-gradient(ellipse_at_top_right,rgba(156,224,255,0.12)_0%,transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(156,224,255,0.08)_0%,transparent_55%)] px-3 py-2 text-[14px] tracking-[-0.14px] text-[#BCEBFF] transition-colors hover:bg-white/[0.09] focus:z-[2]"
                aria-label="Deposit to wallet"
              >
                <Wallet className="size-[14px] text-[#BCEBFF]" />
                <span className="leading-none">
                  {formatUSD(walletUsdcUsd ?? 0)}
                </span>
                <ArrowDownLeft className="size-4 text-[#BCEBFF]" />
              </button>
              <button
                onClick={() => setPerpModalOpen(true)}
                className="relative flex h-[35px] cursor-pointer items-center gap-[11px] border border-white/[0.12] bg-white/[0.06] bg-[radial-gradient(ellipse_at_top_right,rgba(156,224,255,0.12)_0%,transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(156,224,255,0.08)_0%,transparent_55%)] px-3 py-2 text-[14px] tracking-[-0.14px] text-[#BCEBFF] transition-colors hover:bg-white/[0.09] focus:z-[2]"
                aria-label="Deposit to perp DEX"
              >
                <Layers className="size-[14px] text-[#BCEBFF]" />
                <span className="leading-none">{formatUSD(perpTotalUsd)}</span>
                {perpLogos.length > 0 && (
                  <div className="flex items-center pr-1.5">
                    {perpLogos.map((p, i) => (
                      <img
                        key={p.id}
                        src={p.logo}
                        alt={p.label}
                        width={16}
                        height={16}
                        className={cn(
                          "size-4 rounded-full border border-[#000C1D] bg-[#0B1A2A] object-cover",
                          i > 0 && "-ml-1.5",
                        )}
                      />
                    ))}
                  </div>
                )}
                <ArrowDownLeft className="size-4 text-[#BCEBFF]" />
              </button>
            </div>
          )}
          {!isMobile && isArbPage && (
            <div className="flex items-center gap-2 border border-[#0F1F30] bg-[#041223] px-3 py-1.5">
              <Search className="size-3.5 text-[#7092A5]" />
              <input
                ref={searchInputRef}
                value={searchValue}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search asset..."
                className="w-[160px] bg-transparent text-sm text-white outline-none placeholder:text-[#7092A5]"
              />
              <kbd className="text-[10px] text-[#7092A5]">/</kbd>
            </div>
          )}
          <NotificationBell />
          <WalletSheet
            isMobile={isMobile}
            user={user}
            login={login}
            logout={logout}
          />
        </div>
      </MaxWidthWrapper>

      <PerpDepositWithdrawModal
        open={perpModalOpen}
        onClose={() => setPerpModalOpen(false)}
        defaultMode="deposit"
      />
    </div>
  );
};

export default Navbar;
