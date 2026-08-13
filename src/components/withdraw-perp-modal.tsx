/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronRight, ArrowLeft, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  getHip3Collateral,
  getWithdrawableProtocols,
  isHip3ProtocolId,
  type ProtocolId,
} from "@/lib/protocol-registry";
import { SimpleToast } from "./simple-toast";

// Floor-to-cents — used for percentage buttons so the displayed amount can
// never exceed actual withdrawable balance (toFixed rounds half-to-even,
// which can push the value over by a fraction of a cent and trip an
// "insufficient balance" rejection on the backend).
function floorCents(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0.00";
  return (Math.floor(value * 100) / 100).toFixed(2);
}

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

/** Every protocol id the registry treats as withdrawable — base perp DEXes
 *  AND HIP-3 sub-DEXes. HIP-3 venues route through the same hyperliquid
 *  withdraw mutation with a `venue: "hl:<dex>"` param; that flow is handled
 *  by the parent's `onWithdraw` callback. */
export type WithdrawProtocol = ProtocolId;

interface ProtocolConfig {
  key: WithdrawProtocol;
  label: string;
  /** Display asset — base venues use their deposit asset (USDC/USDT/SOL),
   *  HIP-3 venues use the actual on-chain collateral the venue settles in
   *  (USDE on hl:hyna, USDH on hl:km, etc.), since that's what the user
   *  is technically pulling out before the unit-bridge swap. */
  asset: string;
  icon: string;
}

const PROTOCOLS: ProtocolConfig[] = getWithdrawableProtocols().map((p) => ({
  key: p.id as WithdrawProtocol,
  label: p.label,
  asset: isHip3ProtocolId(p.id)
    ? (getHip3Collateral(p.id) ?? p.depositAsset)
    : p.depositAsset,
  icon: p.logo,
}));

type ModalView = "list" | "single" | "confirm-all";

interface WithdrawPerpModalProps {
  open: boolean;
  onClose: () => void;
  protocolBalances: Record<WithdrawProtocol, string>;
  onWithdraw: (protocol: WithdrawProtocol, amount: number) => Promise<void>;
  onWithdrawAll: () => Promise<void>;
  embeddedWalletAddress?: string;
}

export default function WithdrawPerpModal({
  open,
  onClose,
  protocolBalances,
  onWithdraw,
  onWithdrawAll,
  embeddedWalletAddress,
}: WithdrawPerpModalProps) {
  const [view, setView] = useState<ModalView>("list");
  const [selectedProtocol, setSelectedProtocol] =
    useState<WithdrawProtocol | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const totalBalance = PROTOCOLS.reduce((sum, p) => {
    const bal = parseFloat(protocolBalances[p.key]);
    return sum + (isNaN(bal) ? 0 : bal);
  }, 0);

  const handleClose = (e?: React.MouseEvent | React.TouchEvent) => {
    if (loading) return;
    e?.preventDefault();
    e?.stopPropagation();
    setView("list");
    setSelectedProtocol(null);
    setWithdrawAmount("");
    // Delay DOM removal by a frame so the event doesn't leak to elements behind
    requestAnimationFrame(() => onClose());
  };

  const handleBack = (e?: React.MouseEvent | React.TouchEvent) => {
    if (loading) return;
    e?.preventDefault();
    e?.stopPropagation();
    setView("list");
    setSelectedProtocol(null);
    setWithdrawAmount("");
  };

  const handleSelectProtocol = (key: WithdrawProtocol) => {
    setSelectedProtocol(key);
    setWithdrawAmount("");
    setView("single");
  };

  const handleProtocolWithdraw = async () => {
    if (!selectedProtocol || loading) return;
    const amt = parseFloat(withdrawAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.custom(() => (
        <SimpleToast
          type="error"
          title="Invalid amount"
          description="Enter an amount greater than zero."
        />
      ));
      return;
    }
    const bal = parseFloat(protocolBalances[selectedProtocol] ?? "0");
    const maxAllowed = selectedProtocol === "lighter" ? Math.max(0, bal - 3.1) : bal;
    if (amt > maxAllowed) {
      toast.custom(() => (
        <SimpleToast
          type="error"
          title="Amount exceeds balance"
          description={`Max available: $${floorCents(maxAllowed)}`}
        />
      ));
      return;
    }
    setLoading(true);
    try {
      await onWithdraw(selectedProtocol, amt);
      setWithdrawAmount("");
      setSelectedProtocol(null);
      setView("list");
      onClose();
    } catch {
      // Keep modal open so user can retry; onWithdraw surfaces its own toast.
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmWithdrawAll = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await onWithdrawAll();
      handleClose();
    } catch {
      // Keep modal open so user can see which protocols failed
    } finally {
      setLoading(false);
    }
  };

  const handleCopyAddress = async () => {
    if (!embeddedWalletAddress) return;
    try {
      await navigator.clipboard.writeText(embeddedWalletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — silently fail
    }
  };

  const setPercentage = (pct: number) => {
    if (!selectedProtocol) return;
    const bal = parseFloat(protocolBalances[selectedProtocol] ?? "0");
    if (!Number.isFinite(bal) || bal <= 0) return;
    const maxAmount = selectedProtocol === "lighter" ? Math.max(0, bal - 3.1) : bal;
    setWithdrawAmount(floorCents(maxAmount * pct));
  };

  const selectedConfig = PROTOCOLS.find((p) => p.key === selectedProtocol);
  const selectedBal = selectedProtocol
    ? protocolBalances[selectedProtocol]
    : "—";
  // Withdraw amount is **USD-denominated** for every venue (backend converts
  // to the appropriate on-chain asset before sending). Display the unit as
  // USD so the user isn't misled by the protocol's `depositAsset` (e.g.
  // Hyperliquid's depositAsset is SOL, but withdraw amount is USD).
  const selectedMaxAllowed = selectedProtocol
    ? (() => {
        const bal = parseFloat(protocolBalances[selectedProtocol] ?? "0");
        if (!Number.isFinite(bal) || bal <= 0) return 0;
        return selectedProtocol === "lighter" ? Math.max(0, bal - 3.1) : bal;
      })()
    : 0;
  const enteredAmount = parseFloat(withdrawAmount);
  const exceedsBalance =
    Number.isFinite(enteredAmount) && enteredAmount > selectedMaxAllowed;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center"
      onClick={(e) => handleClose(e)}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="relative z-10 flex w-full max-w-[463px] flex-col border border-[#0F1F30] bg-[#000D1E] sm:mx-4 max-sm:rounded-t-2xl max-sm:max-h-[85vh] max-sm:overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        {/* ==================== LIST VIEW ==================== */}
        {view === "list" && (
          <>
            <div className="flex items-center justify-between border-b border-[#0F1F30] px-5 py-4 sm:px-8 sm:py-6">
              <h2 className="text-[21px] tracking-[-0.21px] text-white">
                Withdraw
              </h2>
              <button
                onClick={(e) => handleClose(e)}
                className="cursor-pointer text-[#7192A5] transition-colors hover:text-white"
              >
                <X className="size-6" />
              </button>
            </div>

            <button
              onClick={() => setView("confirm-all")}
              disabled={loading || totalBalance <= 0}
              className="flex cursor-pointer items-center justify-between border-b border-[#142030] px-5 py-4 sm:px-8 sm:py-6 transition-colors hover:bg-[#041223] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="flex items-center gap-6">
                <div className="flex size-10 items-center justify-center border border-[#0F1F30] bg-[#041223]">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M8 14V2M4 6l4-4 4 4"
                      stroke="#BCEBFF"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div className="flex flex-col items-start gap-1">
                  <span className="text-[16px] tracking-[-0.16px] text-[#BCEBFF]">
                    Withdraw all
                  </span>
                  <span className="text-[14px] tracking-[-0.14px] text-[#BCEBFF]/60">
                    {PROTOCOLS.length} protocols
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[18px] tracking-[-0.18px] text-[#23FFAA]">
                  ${totalBalance.toFixed(0)}
                </span>
                <ChevronRight className="size-3 text-[#7192A5]" />
              </div>
            </button>

            <div className="flex flex-col gap-6 overflow-y-auto p-5 sm:p-8">
              {PROTOCOLS.map((protocol) => {
                const bal = protocolBalances[protocol.key];
                const numBal = parseFloat(bal);
                const hasBal = !isNaN(numBal) && numBal > 0;

                return (
                  <button
                    key={protocol.key}
                    onClick={() => handleSelectProtocol(protocol.key)}
                    className="flex cursor-pointer items-center gap-4 transition-opacity hover:opacity-80"
                  >
                    <div className="size-[30px] shrink-0 overflow-hidden rounded-full border border-[#0F1F30] bg-[#041223]">
                      <img
                        src={protocol.icon}
                        alt={protocol.label}
                        className="size-full object-cover"
                      />
                    </div>
                    <div className="flex flex-1 items-center justify-between">
                      <span className="text-[16px] tracking-[-0.16px] text-[#BCEBFF]">
                        {protocol.label}
                      </span>
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            "text-[18px] tracking-[-0.18px]",
                            hasBal ? "text-white" : "text-[#7192A5]",
                          )}
                        >
                          {hasBal ? `$${bal}` : "—"}
                        </span>
                        <ChevronRight className="size-3 text-[#7192A5]" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* ==================== SINGLE DEX VIEW ==================== */}
        {view === "single" && selectedConfig && (
          <>
            <div className="flex items-center gap-2.5 border-b border-[#0F1F30] px-5 py-4 sm:px-8 sm:py-6">
              <button
                onClick={(e) => handleBack(e)}
                className="cursor-pointer text-[#7192A5] transition-colors hover:text-white"
              >
                <ArrowLeft className="size-6" />
              </button>
              <div className="flex flex-1 items-center justify-between">
                <div className="flex items-center gap-1">
                  <span className="text-[21px] tracking-[-0.21px] text-white">
                    Withdraw from
                  </span>
                  <img
                    src={selectedConfig.icon}
                    alt={selectedConfig.label}
                    className="ml-1 size-[22px] rounded-full"
                  />
                  <span className="text-[21px] tracking-[-0.21px] text-white">
                    {selectedConfig.label}
                  </span>
                </div>
                <button
                  onClick={(e) => handleClose(e)}
                  className="cursor-pointer text-[#7192A5] transition-colors hover:text-white"
                >
                  <X className="size-6" />
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-6 p-5 sm:p-8">
              <div className="flex items-start justify-between text-[16px] tracking-[-0.16px]">
                <span className="text-[#BCEBFF]/60">Amount</span>
                <span className="text-[#BCEBFF]/60">
                  Bal: <span className="text-[#BCEBFF]">${selectedBal}</span>{" "}
                  USD
                </span>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex h-[76px] items-center justify-between bg-[#142030] p-4">
                  <input
                    value={withdrawAmount}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "" || /^\d*\.?\d*$/.test(val)) {
                        setWithdrawAmount(val);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (["e", "E", "+", "-"].includes(e.key))
                        e.preventDefault();
                    }}
                    placeholder="0.00"
                    type="text"
                    inputMode="decimal"
                    className="w-full bg-transparent text-[18px] tracking-[-0.18px] text-white outline-none placeholder:text-[#BCEBFF]/50"
                  />
                  <div className="flex shrink-0 items-center gap-2 bg-white/8 px-3 py-2">
                    <img
                      src="/icons/usdc.svg"
                      alt="USD"
                      className="size-5 rounded-full"
                    />
                    <span className="text-[14px] tracking-[-0.14px] text-[#BCEBFF]">
                      USD
                    </span>
                  </div>
                </div>
                {exceedsBalance && (
                  <span className="text-[12px] tracking-tight text-[#FF6B6B]">
                    Exceeds available balance (${floorCents(selectedMaxAllowed)})
                  </span>
                )}

                <div className="flex gap-2">
                  {[0.25, 0.5, 0.75].map((pct) => (
                    <button
                      key={pct}
                      onClick={() => setPercentage(pct)}
                      className="flex h-[30px] flex-1 cursor-pointer items-center justify-center bg-white/8 text-[14px] tracking-[-0.14px] text-[#BCEBFF]/60 transition-colors hover:bg-white/12 hover:text-[#BCEBFF]"
                    >
                      {pct * 100}%
                    </button>
                  ))}
                  <button
                    onClick={() => setPercentage(1)}
                    className="flex h-[30px] flex-1 cursor-pointer items-center justify-center bg-[#2775CA]/10 text-[14px] tracking-[-0.14px] text-[#6EA8E7] transition-colors hover:bg-[#2775CA]/20"
                  >
                    MAX
                  </button>
                </div>
              </div>

              <button
                onClick={handleProtocolWithdraw}
                disabled={
                  loading ||
                  !withdrawAmount ||
                  parseFloat(withdrawAmount) <= 0 ||
                  exceedsBalance
                }
                className={cn(
                  "font-ibm-plex-serif flex h-10 w-full items-center justify-center gap-2 border border-[#BCEBFF]/8 text-[16px] tracking-[-0.16px] italic transition-all",
                  loading
                    ? "cursor-not-allowed bg-[#BCEBFF]/70 text-[#000D1E]"
                    : !withdrawAmount || parseFloat(withdrawAmount) <= 0 || exceedsBalance
                      ? "cursor-not-allowed bg-[#BCEBFF] text-[#000D1E] opacity-50"
                      : "cursor-pointer bg-[#BCEBFF] text-[#000D1E] hover:bg-[#BCEBFF]/80",
                )}
              >
                {loading && <Spinner />}
                {loading
                  ? "Processing..."
                  : !withdrawAmount || parseFloat(withdrawAmount) <= 0
                    ? "Enter Amount"
                    : exceedsBalance
                      ? "Exceeds balance"
                      : `Withdraw from ${selectedConfig.label}`}
              </button>
            </div>
          </>
        )}

        {/* ==================== CONFIRM BATCH WITHDRAW VIEW ==================== */}
        {view === "confirm-all" && (
          <>
            <div className="flex items-center gap-2.5 border-b border-[#0F1F30] px-5 py-4 sm:px-8 sm:py-6">
              <button
                onClick={(e) => handleBack(e)}
                className="cursor-pointer text-[#7192A5] transition-colors hover:text-white"
              >
                <ArrowLeft className="size-6" />
              </button>
              <div className="flex flex-1 items-center justify-between">
                <h2 className="text-[21px] tracking-[-0.21px] text-white">
                  Confirm batch withdraw
                </h2>
                <button
                  onClick={(e) => handleClose(e)}
                  className="cursor-pointer text-[#7192A5] transition-colors hover:text-white"
                >
                  <X className="size-6" />
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-6 border-b border-[#0F1F30] p-5 sm:p-8">
              {PROTOCOLS.map((protocol) => {
                const bal = protocolBalances[protocol.key];
                const numBal = parseFloat(bal);
                const hasBal = !isNaN(numBal) && numBal > 0;

                return (
                  <div key={protocol.key} className="flex items-center gap-4">
                    <div className="size-[30px] shrink-0 overflow-hidden rounded-full border border-[#0F1F30] bg-[#041223]">
                      <img
                        src={protocol.icon}
                        alt={protocol.label}
                        className="size-full object-cover"
                      />
                    </div>
                    <div className="flex flex-1 items-center justify-between">
                      <span className="text-[16px] tracking-[-0.16px] text-[#BCEBFF]">
                        {protocol.label}
                      </span>
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            "text-[18px] tracking-[-0.18px]",
                            hasBal ? "text-white" : "text-[#7192A5]",
                          )}
                        >
                          {hasBal ? `$${bal}` : "—"}
                        </span>
                        <ChevronRight className="size-3 text-[#7192A5]" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col gap-4 border-b border-[#0F1F30] p-5 sm:p-8">
              <div className="flex items-center justify-between text-[16px] tracking-[-0.16px]">
                <span className="text-[#BCEBFF]/60">Total withdraw</span>
                <span className="text-white">${totalBalance.toFixed(0)}</span>
              </div>
              <div className="flex items-center justify-between text-[16px] tracking-[-0.16px]">
                <span className="text-[#BCEBFF]/60">Destination address</span>
                <div className="flex items-center gap-1">
                  <span className="text-white">Privy wallet</span>
                  <button
                    onClick={handleCopyAddress}
                    className="cursor-pointer text-[#7192A5] transition-colors hover:text-white"
                  >
                    {copied ? (
                      <Check className="size-3.5" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="p-8">
              <button
                onClick={handleConfirmWithdrawAll}
                disabled={loading || totalBalance <= 0}
                className={cn(
                  "font-ibm-plex-serif flex h-10 w-full items-center justify-center gap-2 border border-[#BCEBFF]/8 text-[16px] tracking-[-0.16px] italic transition-all",
                  loading
                    ? "cursor-not-allowed bg-[#BCEBFF]/70 text-[#000D1E]"
                    : totalBalance <= 0
                      ? "cursor-not-allowed bg-[#BCEBFF] text-[#000D1E] opacity-50"
                      : "cursor-pointer bg-[#BCEBFF] text-[#000D1E] hover:bg-[#BCEBFF]/80",
                )}
              >
                {loading && <Spinner />}
                {loading
                  ? "Processing..."
                  : `Withdraw all $${totalBalance.toFixed(0)}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
