/* eslint-disable @next/next/no-img-element */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { X, ChevronRight, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/trpc/react";
import { cn } from "@/lib/utils";
import {
  getHip3Collateral,
  getProtocolLabel,
  getProtocolLogo,
  getWithdrawableProtocols,
  HIP3_PROTOCOL_IDS,
  isHip3ProtocolId,
  type Hip3ProtocolId,
  type ProtocolId,
} from "@/lib/protocol-registry";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { useProtocolBalances } from "@/hooks/use-protocol-balances";
import { getPrivyIdToken, getPrivyAccessToken } from "@/lib/privy-auth";
import { triggerBalanceRefresh } from "@/lib/balance-refresh";
import { PERP_HEDGE_API_URL as PERP_API } from "@/lib/perp-api-url";

import { SimpleToast } from "./simple-toast";

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const USDC_MARKET_INDEX = 0;

type Mode = "deposit" | "withdraw";
/**
 * View flow:
 *   list         — choose a venue (Pacifica / HL / Aster / Lighter / 01)
 *   single       — amount entry + confirm for the picked venue
 */
type View = "list" | "venue-picker" | "single";

function Spinner() {
  return (
    <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function assetIcon(asset: string): string {
  const a = asset.toUpperCase();
  if (a === "SOL") return "/icons/sol.svg";
  if (a === "USDT") return "/icons/usdt.svg";
  return "/icons/usdc.svg";
}

// Floor to 2 decimals — used for max-button rounding so the displayed value
// can never exceed actual balance. toFixed rounds half-to-even, which can
// over-shoot by a fraction of a cent and cause backend "insufficient balance"
// errors.
function floorCents(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0.00";
  return (Math.floor(value * 100) / 100).toFixed(2);
}

function floorBaseUnits(value: number, decimals: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  const factor = 10 ** decimals;
  return (Math.floor(value * factor) / factor).toFixed(decimals);
}

interface Protocol {
  id: ProtocolId;
  label: string;
  asset: string;
  logo: string;
  minDeposit: number;
}

// Top-level protocols shown in the main list. HIP-3 sub-dexes are first-class
// entries here, alongside Pacifica/Lighter/etc. The Hyperliquid venue-picker
// remains as a secondary path (click "Hyperliquid" → pick a sub-dex).
const PROTOCOLS: Protocol[] = getWithdrawableProtocols().map((p) => ({
  id: p.id as ProtocolId,
  label: p.label,
  asset: p.depositAsset,
  logo: p.logo,
  minDeposit: p.minDeposit,
}));

/** Venues shown inside the Hyperliquid venue-picker. */
interface HlVenue {
  id: "hyperliquid" | Hip3ProtocolId;
  label: string;
  /** Collateral token the venue settles in (USDC / USDH / USDE / USDT). */
  collateral: string;
  logo: string;
}

const HL_VENUES: HlVenue[] = [
  {
    id: "hyperliquid",
    label: "Main HL",
    collateral: "USDC",
    logo: getProtocolLogo("hyperliquid"),
  },
  ...HIP3_PROTOCOL_IDS.map((id) => ({
    id,
    label: getProtocolLabel(id),
    collateral: getHip3Collateral(id) ?? "USDC",
    logo: getProtocolLogo(id),
  })),
];

interface Props {
  open: boolean;
  onClose: () => void;
  defaultMode?: Mode;
}

export default function PerpDepositWithdrawModal({
  open,
  onClose,
  defaultMode = "deposit",
}: Props) {
  const [mode, setMode] = React.useState<Mode>(defaultMode);
  const [view, setView] = React.useState<View>("list");
  const [selected, setSelected] = React.useState<ProtocolId | null>(null);
  const [amount, setAmount] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setMode(defaultMode);
      setView("list");
      setSelected(null);
      setAmount("");
    }
  }, [open, defaultMode]);

  // The selected protocol might be a HIP-3 venue that's not in the top-level
  // PROTOCOLS list, so look it up through the full registry instead.
  const selectedProtocol = React.useMemo((): Protocol | null => {
    if (!selected) return null;
    // First check top-level (covers pacifica/aster/lighter/01/hyperliquid).
    const top = PROTOCOLS.find((p) => p.id === selected);
    if (top) return top;
    // Then HIP-3: synthesize a Protocol shape from registry metadata.
    const def = getWithdrawableProtocols().find((p) => p.id === selected);
    if (!def) return null;
    return {
      id: def.id as ProtocolId,
      label: def.label,
      asset: def.depositAsset,
      logo: def.logo,
      minDeposit: def.minDeposit,
    };
  }, [selected]);

  // ── Wallet balances for deposit max (per-asset) ──
  const walletUsdc = useTokenBalance(USDC_MINT);
  const walletSol = useTokenBalance(SOL_MINT);
  const walletUsdt = useTokenBalance(USDT_MINT);

  const walletBalanceForAsset = (asset: string) => {
    const a = asset.toUpperCase();
    if (a === "SOL") return walletSol.balance ?? 0;
    if (a === "USDT") return walletUsdt.balance ?? 0;
    return walletUsdc.balance ?? 0;
  };

  // ── Protocol balances for withdraw max ──
  const { balances: perpBalances, refetchAll } = useProtocolBalances({
    enabled: open,
  });

  // ── Deposit mutations (tRPC) ──
  const driftDeposit = api.drift.deposit.useMutation();
  const pacificaDeposit = api.pacifica.deposit.useMutation();
  const hyperliquidDeposit = api.hyperliquid.deposit.useMutation();

  // ── Withdraw mutations (tRPC) ──
  const driftWithdraw = api.drift.withdraw.useMutation();
  const pacificaWithdraw = api.pacifica.withdraw.useMutation();
  const hyperliquidWithdraw = api.hyperliquid.withdraw.useMutation();

  if (!open) return null;

  const maxForSelected = () => {
    if (!selectedProtocol) return 0;
    if (mode === "deposit") {
      return walletBalanceForAsset(selectedProtocol.asset);
    }
    const bal = perpBalances[selectedProtocol.id]?.balanceNum ?? 0;
    // lighter has a small buffer requirement
    return selectedProtocol.id === "lighter" ? Math.max(0, bal - 3.1) : bal;
  };

  // Deposits use the source wallet asset. Withdraws show the venue collateral
  // reported by the backend balance endpoint, which matters for HIP-3 venues
  // such as hl:hyna (USDE) or hl:cash (USDT).
  const balanceUnitFor = (p: Protocol): string => {
    if (mode === "deposit") return p.asset;
    return (
      perpBalances[p.id]?.quoteUnit ??
      (isHip3ProtocolId(p.id) ? getHip3Collateral(p.id) : null) ??
      "USD"
    );
  };

  const listBalanceLabel = (p: Protocol) => {
    if (mode === "deposit") {
      // Show wallet balance available to deposit for the protocol's asset
      const bal = walletBalanceForAsset(p.asset);
      return bal > 0 ? bal.toFixed(p.asset === "SOL" ? 4 : 2) : "—";
    }
    return perpBalances[p.id]?.balance ?? "—";
  };

  const handleClose = () => {
    if (loading) return;
    setView("list");
    setSelected(null);
    setAmount("");
    requestAnimationFrame(() => onClose());
  };

  const handleBack = () => {
    if (loading) return;
    setView("list");
    setSelected(null);
    setAmount("");
  };

  const handleSelect = (id: ProtocolId) => {
    setAmount("");
    setSelected(id);
    setView("single");
  };

  const handleSelectHlVenue = (venueId: HlVenue["id"]) => {
    setSelected(venueId as ProtocolId);
    setAmount("");
    setView("single");
  };

  const setPct = (pct: number) => {
    const max = maxForSelected();
    if (max <= 0) return;
    // Withdraws use quote/collateral units and stay cent-precision. For
    // deposits, SOL needs 4-decimal precision to avoid leaving dust below
    // the rounding step.
    const isWithdraw = mode === "withdraw";
    const decimals = !isWithdraw && selectedProtocol?.asset === "SOL" ? 4 : 2;
    const flooredStr = isWithdraw
      ? floorCents(max * pct)
      : floorBaseUnits(max * pct, decimals);
    setAmount(flooredStr);
  };

  const refreshBalances = () => {
    void walletUsdc.refetch();
    void walletSol.refetch();
    void walletUsdt.refetch();
    void refetchAll(mode === "deposit" ? "perp-deposit" : "perp-withdraw");
    triggerBalanceRefresh({ reason: `perp-${mode}` });
  };

  const submit = async () => {
    if (!selectedProtocol || loading) return;
    const amt = parseFloat(amount);
    if (!isFinite(amt) || amt <= 0) {
      toast.custom(() => (
        <SimpleToast
          type="error"
          title="Invalid amount"
          description="Enter an amount greater than zero."
        />
      ));
      return;
    }
    const max = maxForSelected();
    const unit = balanceUnitFor(selectedProtocol);
    if (amt > max) {
      const maxStr = mode === "withdraw"
        ? floorCents(max)
        : max.toFixed(selectedProtocol.asset === "SOL" ? 4 : 2);
      toast.custom(() => (
        <SimpleToast
          type="error"
          title="Amount exceeds balance"
          description={`Max available: ${maxStr} ${unit}`}
        />
      ));
      return;
    }
    if (mode === "deposit" && selectedProtocol.minDeposit > 0 && amt < selectedProtocol.minDeposit) {
      toast.custom(() => (
        <SimpleToast
          type="error"
          title="Below minimum"
          description={`Min deposit is ${selectedProtocol.minDeposit} ${selectedProtocol.asset}`}
        />
      ));
      return;
    }

    setLoading(true);
    try {
      if (mode === "deposit") {
        await executeDeposit(selectedProtocol, amt);
      } else {
        await executeWithdraw(selectedProtocol, amt);
      }
      toast.custom(() => (
        <SimpleToast
          type="success"
          title={`${mode === "deposit" ? "Deposit" : "Withdrawal"} submitted`}
          description={`${amt} ${balanceUnitFor(selectedProtocol)} → ${selectedProtocol.label}`}
        />
      ));
      setAmount("");
      setView("list");
      setSelected(null);
      refreshBalances();
    } catch (err) {
      const msg = err instanceof Error ? err.message : `${mode} failed`;
      toast.custom(() => (
        <SimpleToast
          type="error"
          title={`${mode === "deposit" ? "Deposit" : "Withdrawal"} failed`}
          description={msg}
        />
      ));
    } finally {
      setLoading(false);
    }
  };

  const executeDeposit = async (p: Protocol, amt: number) => {
    // HIP-3 venues (hl:xyz etc.) bridge + auto-swap via the same
    // hyperliquid.deposit mutation — just pass the `venue` field.
    if (isHip3ProtocolId(p.id)) {
      await hyperliquidDeposit.mutateAsync({
        asset: "usdc",
        amount: amt,
        venue: p.id as Hip3ProtocolId,
      });
      return;
    }
    switch (p.id) {
      case "drift":
        await driftDeposit.mutateAsync({
          amount: amt,
          marketIndex: USDC_MARKET_INDEX,
        });
        return;
      case "pacifica":
        await pacificaDeposit.mutateAsync({ amountUsdc: amt });
        return;
      case "hyperliquid":
        await hyperliquidDeposit.mutateAsync({
          asset: p.asset.toLowerCase() as "sol" | "usdt" | "usdc",
          amount: amt,
          venue: "main",
        });
        return;
      case "aster":
        await restCall("POST", `/arb/deposit/aster`, {
          amount: amt,
          asset: p.asset.toLowerCase(),
        });
        return;
      case "lighter":
        await restCall("POST", `/arb/deposit/lighter`, { amount: amt });
        return;
      case "01":
        await restCall("POST", `/arb/deposit/01`, { amount: amt });
        return;
      case "phoenix":
        if (amt < 1) throw new Error("Minimum deposit is 1 USDC");
        await restCall("POST", `/arb/deposit/phoenix`, {
          amount: amt,
          asset: "usdc",
        });
        return;
      default:
        throw new Error(`Deposit not supported for ${p.label}`);
    }
  };

  const executeWithdraw = async (p: Protocol, amt: number) => {
    if (isHip3ProtocolId(p.id)) {
      await hyperliquidWithdraw.mutateAsync({
        asset: "sol",
        amount: amt,
        venue: p.id as Hip3ProtocolId,
      });
      return;
    }
    switch (p.id) {
      case "drift":
        await driftWithdraw.mutateAsync({
          amount: amt,
          marketIndex: USDC_MARKET_INDEX,
        });
        return;
      case "pacifica":
        await pacificaWithdraw.mutateAsync({ amountUsdc: amt });
        return;
      case "hyperliquid":
        await hyperliquidWithdraw.mutateAsync({
          asset: "sol",
          amount: amt,
          venue: "main",
        });
        return;
      case "aster":
        await restCall("POST", `/arb/withdraw/aster`, { amount: amt });
        return;
      case "lighter":
        await restCall("POST", `/arb/withdraw/lighter`, { amount: amt });
        return;
      case "01":
        if (amt < 1) throw new Error("Minimum withdrawal is 1 USDC");
        await restCall("POST", `/arb/withdraw/01`, { amount: amt });
        return;
      case "phoenix":
        if (amt < 1) throw new Error("Minimum withdrawal is 1 USDC");
        await restCall("POST", `/arb/withdraw/phoenix`, {
          amount: amt,
          asset: "usdc",
        });
        return;
      default:
        throw new Error(`Withdraw not supported for ${p.label}`);
    }
  };

  const restCall = async (
    method: "POST" | "GET",
    path: string,
    body?: unknown,
  ) => {
    const idToken = getPrivyIdToken();
    const accessToken = getPrivyAccessToken();
    if (!idToken) throw new Error("Not authenticated");
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      "privy-id-token": idToken,
    };
    if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
    const res = await fetch(`${PERP_API}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (res.status === 409) {
      throw new Error("A withdrawal is already in progress. Please wait for it to finish.");
    }
    if (!res.ok || data.status === "error") {
      throw new Error(
        (data.message as string) || (data.error as string) || "Request failed",
      );
    }
    return data;
  };

  if (typeof document === "undefined") return null;

  const verb = mode === "deposit" ? "Deposit" : "Withdraw";
  const submitLabel = loading
    ? "Processing..."
    : !amount || parseFloat(amount) <= 0
      ? "Enter amount"
      : `${verb} ${mode === "deposit" ? "to" : "from"} ${selectedProtocol?.label ?? ""}`;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center sm:items-center"
      onClick={handleClose}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="relative z-10 flex max-h-[90vh] w-full max-w-[463px] flex-col overflow-hidden border border-[#0F1F30] bg-[#000D1E] max-sm:max-h-[85vh] max-sm:rounded-t-2xl sm:mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {view === "list" && (
          <>
            <div className="flex items-center justify-between border-b border-[#0F1F30] px-5 py-4 sm:px-8 sm:py-6">
              <h2 className="text-[21px] tracking-[-0.21px] text-white">
                {mode === "deposit" ? "Deposit to Perp" : "Withdraw from Perp"}
              </h2>
              <button
                onClick={handleClose}
                className="cursor-pointer text-[#7192A5] transition-colors hover:text-white"
                aria-label="Close"
              >
                <X className="size-6" />
              </button>
            </div>

            <div className="flex border-b border-[#0F1F30] px-5 pt-4 sm:px-8">
              {(["deposit", "withdraw"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn(
                    "flex-1 cursor-pointer border-b-2 py-3 text-[14px] tracking-[-0.14px] transition-colors",
                    mode === m
                      ? "border-[#BCEBFF] text-[#BCEBFF]"
                      : "border-transparent text-[#7192A5] hover:text-white",
                  )}
                >
                  {m === "deposit" ? "Deposit" : "Withdraw"}
                </button>
              ))}
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-5 sm:p-8">
              {PROTOCOLS.map((p) => {
                const balStr = listBalanceLabel(p);
                const hasBal = balStr !== "—" && parseFloat(balStr) > 0;
                return (
                  <button
                    key={p.id}
                    onClick={() => handleSelect(p.id)}
                    className="flex cursor-pointer items-center gap-4 transition-opacity hover:opacity-80"
                  >
                    <div className="size-[30px] shrink-0 overflow-hidden rounded-full border border-[#0F1F30] bg-[#041223]">
                      <img
                        src={p.logo}
                        alt={p.label}
                        className="size-full object-cover"
                      />
                    </div>
                    <div className="flex flex-1 items-center justify-between">
                      <span className="text-[16px] tracking-[-0.16px] text-[#BCEBFF]">
                        {p.label}
                      </span>
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-end gap-1">
                          <span
                            className={cn(
                              "text-[18px] tracking-[-0.18px]",
                              hasBal ? "text-white" : "text-[#7192A5]",
                            )}
                          >
                            {hasBal ? balStr : "—"}
                          </span>
                          <span className="text-[12px] tracking-[-0.12px] text-[#BCEBFF]/60">
                            {balanceUnitFor(p)}
                          </span>
                        </div>
                        <ChevronRight className="size-3 text-[#7192A5]" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {view === "venue-picker" && (
          <>
            <div className="flex items-center gap-2.5 border-b border-[#0F1F30] px-5 py-4 sm:px-8 sm:py-6">
              <button
                onClick={handleBack}
                className="cursor-pointer text-[#7192A5] transition-colors hover:text-white"
                aria-label="Back"
              >
                <ArrowLeft className="size-6" />
              </button>
              <div className="flex flex-1 items-center justify-between">
                <h2 className="text-[21px] tracking-[-0.21px] text-white">
                  Hyperliquid venue
                </h2>
                <button
                  onClick={handleClose}
                  className="cursor-pointer text-[#7192A5] transition-colors hover:text-white"
                  aria-label="Close"
                >
                  <X className="size-6" />
                </button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-5 sm:p-8">
              <p className="mb-3 text-[12px] tracking-[-0.12px] text-[#BCEBFF]/60">
                Main HL deposits to the vanilla USDC perp account. HIP-3 sub-dexes
                are isolated margin accounts — deposits auto-bridge and swap
                USDC into the target collateral.
              </p>
              {HL_VENUES.map((v) => {
                const isSubDex = v.id !== "hyperliquid";
                const needsSwap = isSubDex && v.collateral !== "USDC";
                return (
                  <button
                    key={v.id}
                    onClick={() => handleSelectHlVenue(v.id)}
                    className="flex cursor-pointer items-center gap-4 border-b border-[#0F1F30] py-4 last:border-b-0 transition-opacity hover:opacity-80"
                  >
                    <div className="size-[30px] shrink-0 overflow-hidden rounded-full border border-[#0F1F30] bg-[#041223]">
                      <img
                        src={v.logo}
                        alt={v.label}
                        className="size-full object-cover"
                      />
                    </div>
                    <div className="flex flex-1 items-center justify-between">
                      <div className="flex flex-col items-start gap-0.5">
                        <span className="text-[16px] tracking-[-0.16px] text-[#BCEBFF]">
                          {v.label}
                        </span>
                        <span className="text-[11px] tracking-tight text-[#7192A5]">
                          {isSubDex ? `HIP-3 · ${v.collateral}` : "Vanilla HL · USDC"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {needsSwap && (
                          <span className="rounded bg-[#F2C14E]/15 px-1.5 py-0.5 text-[10px] font-medium tracking-tight text-[#F2C14E]">
                            USDC → {v.collateral}
                          </span>
                        )}
                        <ChevronRight className="size-3 text-[#7192A5]" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {view === "single" && selectedProtocol && (
          <>
            <div className="flex items-center gap-2.5 border-b border-[#0F1F30] px-5 py-4 sm:px-8 sm:py-6">
              <button
                onClick={handleBack}
                className="cursor-pointer text-[#7192A5] transition-colors hover:text-white"
                aria-label="Back"
              >
                <ArrowLeft className="size-6" />
              </button>
              <div className="flex flex-1 items-center justify-between">
                <div className="flex items-center gap-1">
                  <span className="text-[21px] tracking-[-0.21px] text-white">
                    {verb} {mode === "deposit" ? "to" : "from"}
                  </span>
                  <img
                    src={selectedProtocol.logo}
                    alt={selectedProtocol.label}
                    className="ml-1 size-[22px] rounded-full"
                  />
                  <span className="text-[21px] tracking-[-0.21px] text-white">
                    {selectedProtocol.label}
                  </span>
                </div>
                <button
                  onClick={handleClose}
                  className="cursor-pointer text-[#7192A5] transition-colors hover:text-white"
                  aria-label="Close"
                >
                  <X className="size-6" />
                </button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-5 sm:p-8">
              <div className="flex items-start justify-between text-[16px] tracking-[-0.16px]">
                <span className="text-[#BCEBFF]/60">Amount</span>
                <span className="text-[#BCEBFF]/60">
                  {mode === "deposit" ? "Wallet" : "Bal"}:{" "}
                  <span className="text-[#BCEBFF]">
                    {mode === "withdraw"
                      ? floorCents(maxForSelected())
                      : maxForSelected().toFixed(
                          selectedProtocol.asset === "SOL" ? 4 : 2,
                        )}
                  </span>{" "}
                  {balanceUnitFor(selectedProtocol)}
                </span>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex h-[76px] items-center justify-between bg-[#142030] p-4">
                  <input
                    value={amount}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^\d*\.?\d*$/.test(v)) setAmount(v);
                    }}
                    onKeyDown={(e) => {
                      if (["e", "E", "+", "-"].includes(e.key)) {
                        e.preventDefault();
                      }
                    }}
                    placeholder="0.00"
                    type="text"
                    inputMode="decimal"
                    className="w-full bg-transparent text-[18px] tracking-[-0.18px] text-white outline-none placeholder:text-[#BCEBFF]/50"
                  />
                  <div className="flex shrink-0 items-center gap-2 bg-white/8 px-3 py-2">
                    <img
                      src={assetIcon(balanceUnitFor(selectedProtocol))}
                      alt={balanceUnitFor(selectedProtocol)}
                      className="size-5 rounded-full"
                    />
                    <span className="text-[14px] tracking-[-0.14px] text-[#BCEBFF]">
                      {balanceUnitFor(selectedProtocol)}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2">
                  {[0.25, 0.5, 0.75].map((pct) => (
                    <button
                      key={pct}
                      onClick={() => setPct(pct)}
                      className="flex h-[30px] flex-1 cursor-pointer items-center justify-center bg-white/8 text-[14px] tracking-[-0.14px] text-[#BCEBFF]/60 transition-colors hover:bg-white/12 hover:text-[#BCEBFF]"
                    >
                      {pct * 100}%
                    </button>
                  ))}
                  <button
                    onClick={() => setPct(1)}
                    className="flex h-[30px] flex-1 cursor-pointer items-center justify-center bg-[#2775CA]/10 text-[14px] tracking-[-0.14px] text-[#6EA8E7] transition-colors hover:bg-[#2775CA]/20"
                  >
                    MAX
                  </button>
                </div>
              </div>

              {(() => {
                // Collateral swap notice for HIP-3 venues whose collateral
                // token ≠ USDC. The backend bridges Solana USDC to HL spot,
                // swaps into the target collateral, and sendAsset's to the
                // HIP-3 perp. ~1% slippage buffer is applied on that swap.
                if (!selected || !isHip3ProtocolId(selected)) return null;
                const collateral = getHip3Collateral(selected);
                if (!collateral || collateral === "USDC") return null;
                const parsedAmt = parseFloat(amount || "0");
                const displayAmt = Number.isFinite(parsedAmt) && parsedAmt > 0
                  ? parsedAmt.toFixed(2)
                  : "0.00";
                const venueLabel = getProtocolLabel(selected);
                const isDeposit = mode === "deposit";
                return (
                  <div className="flex flex-col gap-1 border border-[#F2C14E]/25 bg-[#1C1608] px-3 py-2 text-[12px] leading-relaxed tracking-tight text-[#F2C14E]">
                    <p>
                      {isDeposit ? (
                        <>
                          <span className="font-medium">{displayAmt} USDC</span>
                          {" "}→ ~{displayAmt} {collateral}
                          {" "}→ <span className="font-medium">{venueLabel}</span>
                        </>
                      ) : (
                        <>
                          <span className="font-medium">{venueLabel}</span>
                          {" "}→ ~{displayAmt} {collateral}
                          {" "}→ <span className="font-medium">{displayAmt} USDC</span>
                        </>
                      )}
                    </p>
                    <p className="text-[11px] text-[#F2C14E]/70">
                      Includes ~1% slippage buffer on the {collateral} swap.
                    </p>
                  </div>
                );
              })()}

              <button
                onClick={submit}
                disabled={loading || !amount || parseFloat(amount) <= 0}
                className={cn(
                  "font-ibm-plex-serif flex h-10 w-full items-center justify-center gap-2 border border-[#BCEBFF]/8 text-[16px] tracking-[-0.16px] italic transition-all",
                  loading
                    ? "cursor-not-allowed bg-[#BCEBFF]/70 text-[#000D1E]"
                    : !amount || parseFloat(amount) <= 0
                      ? "cursor-not-allowed bg-[#BCEBFF] text-[#000D1E] opacity-50"
                      : "cursor-pointer bg-[#BCEBFF] text-[#000D1E] hover:bg-[#BCEBFF]/80",
                )}
              >
                {loading && <Spinner />}
                {submitLabel}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
