/* eslint-disable @next/next/no-img-element */
import React from "react";
import { formatUSD } from "@/lib/utils";

import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { shortAddress } from "@/lib/utils";

import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { usePrivy } from "@privy-io/react-auth";
import {
  useExportWallet,
  useFundWallet,
  useWallets,
} from "@privy-io/react-auth/solana";
import { useAllTokenBalances } from "@/hooks/use-all-token-balances";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { useBalanceSubscription } from "@/hooks/use-balance-subscription";
import { useProtocolBalances } from "@/hooks/use-protocol-balances";
import {
  getHip3Collateral,
  getWithdrawableProtocols,
  isHip3ProtocolId,
  type Hip3ProtocolId,
  type ProtocolId,
} from "@/lib/protocol-registry";
import CopyIcon from "./copy";
import { api } from "@/trpc/react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SimpleToast } from "@/components/simple-toast";
import { getPrivyIdToken, getPrivyAccessToken } from "@/lib/privy-auth";
import WithdrawPerpModal from "./withdraw-perp-modal";
import { DepositButton } from "./deposit-button";
import { WithdrawButton } from "./withdraw-button";
import { showWithdrawToast, showBatchWithdrawToast } from "./withdraw-toast";
import { fetchPositions, type PositionsResponse } from "@/lib/arbitrage-api";
import { PERP_HEDGE_API_URL } from "@/lib/perp-api-url";

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOL_MINT = "So11111111111111111111111111111111111111112";

// `WithdrawProtocol` includes every withdrawable venue the registry knows
// about — base perp DEXes plus the 6 HIP-3 sub-DEXes. HIP-3 venues route
// through the same hyperliquid mutation with a `venue: "hl:<dex>"` param;
// the registry's display metadata (label, logo, asset) feeds straight into
// the modal so navbar + sheet share one canonical list.
type WithdrawProtocol = ProtocolId;

interface WithdrawProtocolEntry {
  key: WithdrawProtocol;
  label: string;
  asset: string;
  icon: string;
}

const WITHDRAW_PROTOCOLS: WithdrawProtocolEntry[] =
  getWithdrawableProtocols().map((p) => ({
    key: p.id as WithdrawProtocol,
    label: p.label,
    // HIP-3 venues settle in their own collateral token (USDE / USDH / USDT
    // / USDC). Show that, not the deposit asset, since the user is pulling
    // out the venue's actual on-chain balance before the unit-bridge swap.
    asset: isHip3ProtocolId(p.id)
      ? (getHip3Collateral(p.id) ?? p.depositAsset)
      : p.depositAsset,
    icon: p.logo,
  }));

const getProtocolInfo = (key: WithdrawProtocol) => {
  const match = WITHDRAW_PROTOCOLS.find((p) => p.key === key);
  return {
    label: match?.label ?? key,
    icon: match?.icon ?? "",
  };
};

interface WalletSheetProps {
  isMobile: boolean;
  user: any;
  login: () => void;
  logout: () => void;
}

const WalletSheet: React.FC<WalletSheetProps> = ({
  isMobile,
  user,
  login,
  logout,
}) => {
  const { exportWallet: exportSolanaWallet } = useExportWallet();
  const { exportWallet: exportEthereumWallet } = usePrivy();
  const { wallets } = useWallets();
  const { fundWallet } = useFundWallet();
  const {
    tokens,
    totalUsdValue,
    isLoading,
    refetch: refetchAllTokenBalances,
  } = useAllTokenBalances();
  const walletUsdc = useTokenBalance(USDC_MINT);
  const walletSol = useTokenBalance(SOL_MINT);
  useBalanceSubscription();

  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [showWithdraw, setShowWithdraw] = React.useState(false);

  const userWalletAddress = user?.wallet?.address;
  const embeddedWalletAddress = wallets[0]?.standardWallet.accounts[0]?.address;

  // Single source of truth for every DEX balance — same hook the navbar
  // uses, so the React Query cache dedupes across consumers. When this
  // sheet and the navbar are both mounted, each balance endpoint is hit
  // exactly once per refetch interval (was twice pre-refactor).
  const {
    balances: protocolBalanceMap,
    refetchAll: refetchAllProtocolBalances,
  } = useProtocolBalances({ enabled: !!user });

  // ── Fetch active positions to compute deployed capital ──
  const [positionsData, setPositionsData] = React.useState<PositionsResponse | null>(null);

  React.useEffect(() => {
    if (!user) {
      setPositionsData(null);
      return;
    }
    const load = () => {
      const idToken = getPrivyIdToken();
      const accessToken = getPrivyAccessToken();
      if (!idToken) return;
      fetchPositions(idToken, accessToken ?? undefined)
        .then(setPositionsData)
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [user]);

  const deployedCapital = React.useMemo(() => {
    if (!positionsData?.positions) return 0;
    return Object.values(positionsData.positions)
      .flat()
      .reduce((sum, pos) => sum + (Number(pos.margin) || 0), 0);
  }, [positionsData]);

  // Withdraw modal expects a flat Record<WithdrawProtocol, string> of just
  // the human-readable balance. Re-shape from useProtocolBalances'
  // {balance, balanceNum, freeCollateralUSD, quoteUnit} entries. This is
  // the same data the navbar reads — no risk of divergent values.
  // Covers every entry in WITHDRAW_PROTOCOLS (base venues + HIP-3 sub-DEXes).
  const protocolBalances = React.useMemo(() => {
    const out = {} as Record<WithdrawProtocol, string>;
    for (const p of WITHDRAW_PROTOCOLS) {
      out[p.key] = protocolBalanceMap[p.key]?.balance ?? "—";
    }
    return out;
  }, [protocolBalanceMap]);

  const refreshWalletAndProtocolBalances = React.useCallback(
    async (reason: string) => {
      // Hook's refetchAll already triggers triggerBalanceRefresh; we just
      // need to also flush the in-wallet SPL balances (separate hook).
      await Promise.allSettled([
        refetchAllProtocolBalances(reason),
        walletUsdc.refetch(),
        walletSol.refetch(),
      ]);
      refetchAllTokenBalances();
    },
    [
      refetchAllProtocolBalances,
      refetchAllTokenBalances,
      walletSol,
      walletUsdc,
    ],
  );

  const driftWithdraw = api.drift.withdraw.useMutation();
  const pacificaWithdraw = api.pacifica.withdraw.useMutation();
  const hyperliquidWithdraw = api.hyperliquid.withdraw.useMutation();

  /** Core withdraw logic — throws on failure, no state management */
  const executeWithdraw = async (
    protocol: WithdrawProtocol,
    amount: number,
  ) => {
    // HIP-3 sub-DEXes share the hyperliquid withdraw mutation, distinguished
    // by the venue param. Backend unwinds the venue's collateral (USDE on
    // hl:hyna, USDH on hl:km, etc.), bridges to spot, swaps to USOL, and
    // routes via Unit so the user gets native SOL on Solana.
    if (isHip3ProtocolId(protocol)) {
      await hyperliquidWithdraw.mutateAsync({
        asset: "sol",
        amount,
        venue: protocol as Hip3ProtocolId,
      });
      return;
    }
    if (protocol === "aster") {
      if (amount < 1) throw new Error("Minimum withdrawal is 1 USDT");
      const idToken = getPrivyIdToken();
      const accessToken = getPrivyAccessToken();
      if (!idToken) throw new Error("User not authenticated");
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        "privy-id-token": idToken,
      };
      if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
      const res = await fetch(
        `${PERP_HEDGE_API_URL}/arb/withdraw/aster`,
        { method: "POST", headers, body: JSON.stringify({ amount }) },
      );
      const data = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (!res.ok || data.status === "error") {
        throw new Error(
          (data.message as string) ||
            (data.error as string) ||
            "Aster withdrawal failed",
        );
      }
    } else if (protocol === "lighter") {
      if (amount < 4) throw new Error("Minimum withdrawal is 4 USDC");
      const idToken = getPrivyIdToken();
      const accessToken = getPrivyAccessToken();
      if (!idToken) throw new Error("User not authenticated");
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        "privy-id-token": idToken,
      };
      if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
      const res = await fetch(
        `${PERP_HEDGE_API_URL}/arb/withdraw/lighter`,
        { method: "POST", headers, body: JSON.stringify({ amount }) },
      );
      const data = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (!res.ok || data.status === "error") {
        throw new Error(
          (data.message as string) ||
            (data.error as string) ||
            "Lighter withdrawal failed",
        );
      }
    } else if (protocol === "01") {
      if (amount < 1) throw new Error("Minimum withdrawal is 1 USDC");
      const idToken = getPrivyIdToken();
      const accessToken = getPrivyAccessToken();
      if (!idToken) throw new Error("User not authenticated");
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        "privy-id-token": idToken,
      };
      if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
      const res = await fetch(
        `${PERP_HEDGE_API_URL}/arb/withdraw/01`,
        { method: "POST", headers, body: JSON.stringify({ amount }) },
      );
      if (res.status === 409) {
        throw new Error("A withdrawal is already in progress. Please wait for it to finish.");
      }
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok || data.status === "error") {
        throw new Error(
          (data.message as string) ||
            (data.error as string) ||
            "01 withdrawal failed",
        );
      }
    } else if (protocol === "phoenix") {
      if (amount < 1) throw new Error("Minimum withdrawal is 1 USDC");
      const idToken = getPrivyIdToken();
      const accessToken = getPrivyAccessToken();
      if (!idToken) throw new Error("User not authenticated");
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        "privy-id-token": idToken,
      };
      if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
      const res = await fetch(
        `${PERP_HEDGE_API_URL}/arb/withdraw/phoenix`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ amount, asset: "usdc" }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok || data.status === "error") {
        throw new Error(
          (data.message as string) ||
            (data.error as string) ||
            "Phoenix withdrawal failed",
        );
      }
    } else if (protocol === "drift") {
      await driftWithdraw.mutateAsync({ amount, marketIndex: 0 });
    } else if (protocol === "pacifica") {
      await pacificaWithdraw.mutateAsync({ amountUsdc: amount });
    } else {
      // Main hyperliquid perp account. Explicit venue: "main" mirrors the
      // backend default and matches the HIP-3 branch above.
      await hyperliquidWithdraw.mutateAsync({
        asset: "sol",
        amount,
        venue: "main",
      });
    }
  };

  /** Single protocol withdraw — manages its own loading state and toast */
  const handleWithdrawFromModal = async (
    protocol: WithdrawProtocol,
    amount: number,
  ) => {
    const protocolLabel =
      WITHDRAW_PROTOCOLS.find((p) => p.key === protocol)?.label ?? protocol;

    try {
      await executeWithdraw(protocol, amount);
      showWithdrawToast(getProtocolInfo(protocol), amount.toFixed(2));
      void refreshWalletAndProtocolBalances("perp-withdraw");
    } catch (err: any) {
      toast.custom(() => (
        <SimpleToast
          type="error"
          title={protocolLabel}
          description={err.message || "Withdrawal failed"}
        />
      ));
      throw err;
    }
  };

  /** Batch withdraw — single loading state, skips failed protocols, one batch toast at the end */
  const handleWithdrawAll = async () => {
    const protocolsToWithdraw = WITHDRAW_PROTOCOLS.filter((p) => {
      const bal = parseFloat(protocolBalances[p.key]);
      return !isNaN(bal) && bal > 0;
    });

    let totalWithdrawn = 0;
    const successfulProtocols: typeof protocolsToWithdraw = [];

    for (const p of protocolsToWithdraw) {
      let bal = parseFloat(protocolBalances[p.key]);
      if (p.key === "lighter") bal = Math.max(0, Math.floor((bal - 3.1) * 100) / 100);
      if (isNaN(bal) || bal <= 0) continue;
      try {
        await executeWithdraw(p.key, bal);
        totalWithdrawn += bal;
        successfulProtocols.push(p);
      } catch (err: any) {
        const label = p.label;
        toast.custom(() => (
          <SimpleToast
            type="error"
            title={label}
            description={err.message || "Withdrawal failed"}
          />
        ));
      }
    }

    if (successfulProtocols.length > 0) {
      showBatchWithdrawToast(
        successfulProtocols.map((p) => getProtocolInfo(p.key)),
        totalWithdrawn.toFixed(2),
      );
      void refreshWalletAndProtocolBalances("perp-withdraw");
    }
  };

  return (
    <>
      {user && embeddedWalletAddress ? (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button
              variant="primary"
              className={cn(
                "font-ibm-plex-serif flex cursor-pointer items-center justify-center gap-2 rounded-none font-medium tracking-[-1%] whitespace-nowrap italic transition-all",
                isMobile ? "h-8 px-2.5 text-xs" : "text-sm",
              )}
            >
              {shortAddress(userWalletAddress)}
            </Button>
          </SheetTrigger>
          <SheetContent
            side={isMobile ? "bottom" : "right"}
            className={cn(
              "flex flex-col border-[#0F1F30] bg-[#041223] [&>button]:rounded-none!",
              isMobile
                ? "h-[85dvh] overflow-y-auto rounded-t-2xl border-t"
                : "h-full border-l",
            )}
          >
            <SheetHeader>
              <SheetTitle className="flex w-full flex-col items-start gap-2.5 pr-8">
                <div className="flex w-full items-center gap-3">
                  <img
                    className="size-[44px]"
                    src="/avatar.svg"
                    alt="avatar.svg"
                  />
                  <div className="flex flex-1 flex-col gap-0.5">
                    <CopyIcon text={userWalletAddress} isShortAddress />
                    {embeddedWalletAddress && (
                      <div className="flex items-center gap-2 text-xs font-normal text-[#7192A5]">
                        Embedded:
                        <CopyIcon
                          text={embeddedWalletAddress}
                          isShortAddress
                          className="text-[#7192A5]"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </SheetTitle>

              {(() => {
                const idleCapital = Object.values(protocolBalances).reduce(
                  (sum, bal) => {
                    const n = parseFloat(bal);
                    return sum + (isNaN(n) ? 0 : n);
                  },
                  0,
                );
                const protocolTotal = idleCapital + deployedCapital;
                const grandTotal = (totalUsdValue ?? 0) + protocolTotal;
                return (
                  <div className="mt-4 flex w-full flex-col gap-3">
                    <p className="text-3xl font-semibold text-white">
                      {isLoading ? "..." : formatUSD(grandTotal, 2)}
                    </p>
                    <div className="flex w-full items-start">
                      <div className="flex flex-1 flex-col gap-2">
                        <span className="text-sm text-[#7192A5]">
                          In wallet
                        </span>
                        <p className="text-2xl font-bold text-white">
                          {isLoading ? "..." : formatUSD(totalUsdValue, 2)}
                        </p>
                      </div>
                      <div
                        className="mx-5 self-stretch"
                        style={{
                          width: "1px",
                          backgroundImage:
                            "repeating-linear-gradient(to bottom, #7192A5 0px, #7192A5 4px, transparent 4px, transparent 8px)",
                        }}
                      />
                      <div className="flex flex-1 flex-col gap-2">
                        <span className="text-sm text-[#7192A5]">
                          In protocols
                        </span>
                        <p className="text-2xl font-bold text-white">
                          {formatUSD(protocolTotal, 2)}
                        </p>
                        <div className="flex items-center gap-3 text-xs text-[#7192A5]">
                          <span>
                            Idle{" "}
                            <span className="text-white">
                              {formatUSD(idleCapital, 2)}
                            </span>
                          </span>
                          <span className="text-[#0F1F30]">|</span>
                          <span>
                            Positions{" "}
                            <span className="text-white">
                              {formatUSD(deployedCapital, 2)}
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div
                className={cn("mt-4 w-full space-y-2 overflow-y-auto", isMobile ? "max-h-[30vh]" : "max-h-[220px]")}
                style={{ scrollbarWidth: "thin", scrollbarColor: "#0F1F30 transparent" }}
              >
                {isLoading ? (
                  <div className="text-sm text-[#7192A5]">
                    Loading tokens...
                  </div>
                ) : tokens.length === 0 ? (
                  <div className="text-sm text-[#7192A5]">No tokens found</div>
                ) : (
                  tokens.map((token) => (
                    <div
                      key={token.mint}
                      className="flex items-center justify-between rounded-none bg-[#0A1A2A] p-3 transition-colors hover:bg-[#0F1F30]"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        {token.icon ? (
                          <img
                            src={token.icon}
                            alt={token.symbol || "Token"}
                            className="size-8 shrink-0 rounded-full"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-none bg-[#1A2A3A]">
                            <span className="text-xs text-[#7192A5]">
                              {token.symbol?.charAt(0) || "?"}
                            </span>
                          </div>
                        )}
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-medium text-white">
                            {token.symbol || shortAddress(token.mint)}
                          </span>
                          {token.name && token.name !== token.symbol && (
                            <span className="truncate text-xs text-[#7192A5]">
                              {token.name}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="ml-4 flex flex-col items-end">
                        <span className="text-sm font-medium text-white">
                          {formatUSD(token.usdValue ?? 0, 2)}
                        </span>
                        <span className="text-xs text-[#7192A5]">
                          {token.balance.toFixed(4)} {token.symbol || ""}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-4 w-full">
                <DepositButton
                  onClick={() => {
                    if (embeddedWalletAddress) {
                      fundWallet({
                        address: embeddedWalletAddress,
                        options: {
                          chain: "solana:mainnet",
                          asset: "USDC",
                        },
                      });
                    }
                  }}
                  className="h-[58px] rounded-sm"
                />

                <WithdrawButton
                  onClick={() => { setSheetOpen(false); setTimeout(() => setShowWithdraw(true), 200); }}
                  className="mt-4 h-[58px] rounded-sm"
                />
              </div>
            </SheetHeader>
            <SheetFooter className="mt-auto w-full shrink-0 flex-col gap-2 pb-4">
              <Button
                onClick={() => logout()}
                className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-none border border-[#0F1F30] bg-[#0A1A2A] text-sm font-medium text-white hover:bg-[#0A1A2A]"
              >
                <img src="/icons/logout.svg" alt="" className="size-4" aria-hidden />
                Disconnect
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="flex h-10! w-full cursor-pointer items-center justify-center gap-2 rounded-none border border-[#0F1F30] bg-[#0D1929] text-sm font-medium tracking-[-1%] whitespace-nowrap text-[#7192A5] hover:bg-[#0D1929] hover:text-[#7192A5]"
                  >
                    Export key
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="center"
                  side="top"
                  className="w-[var(--radix-dropdown-menu-trigger-width)] rounded-none border-[#0F1F30] bg-[#02142B]"
                >
                  <DropdownMenuItem
                    onClick={() => exportSolanaWallet()}
                    className="flex cursor-pointer items-center gap-2 rounded-none text-sm text-white focus:bg-white/10 focus:text-white"
                  >
                    <img src="/icons/sol.svg" alt="" className="size-4" />
                    Solana
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => exportEthereumWallet()}
                    className="flex cursor-pointer items-center gap-2 rounded-none text-sm text-white focus:bg-white/10 focus:text-white"
                  >
                    <img src="/icons/eth.svg" alt="" className="size-4" />
                    Ethereum
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      ) : !user ? (
        <Button
          variant="primary"
          className={cn(
            "font-ibm-plex-serif cursor-pointer rounded-none font-medium tracking-[-1%] whitespace-nowrap italic transition-all",
            isMobile ? "h-8 px-3 text-xs" : "text-sm",
          )}
          onClick={() => login()}
        >
          Connect
        </Button>
      ) : null}

      <WithdrawPerpModal
        open={showWithdraw}
        onClose={() => setShowWithdraw(false)}
        protocolBalances={protocolBalances}
        onWithdraw={handleWithdrawFromModal}
        onWithdrawAll={handleWithdrawAll}
        embeddedWalletAddress={embeddedWalletAddress}
      />
    </>
  );
};

export default WalletSheet;
