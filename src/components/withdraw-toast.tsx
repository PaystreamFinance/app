/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";

interface ProtocolInfo {
  label: string;
  icon: string;
}

interface WithdrawConfirmModalProps {
  open: boolean;
  onClose: () => void;
  type: "single" | "batch";
  protocol?: ProtocolInfo;
  protocols?: ProtocolInfo[];
  amount: string;
}

function WithdrawConfirmModal({
  open,
  onClose,
  type,
  protocol,
  protocols,
  amount,
}: WithdrawConfirmModalProps) {
  if (!open || typeof document === "undefined") return null;

  const content = (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="relative z-10 flex w-full max-w-[440px] flex-col border border-[#0F1F30] bg-[#000D1E] text-white sm:mx-4 max-sm:rounded-t-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Illustration */}
        <div className="flex items-center justify-center border-b border-[#0F1F30] bg-[#041223] py-8">
          <img
            src="/pools/positions/confirming.svg"
            alt=""
            className="size-[100px] opacity-70"
          />
        </div>

        {/* Content */}
        <div className="flex flex-col items-center gap-4 border-b border-[#0F1F30] px-5 py-4 sm:px-8 sm:py-6">
          <h3 className="font-ibm-plex-serif text-[20px] tracking-[-0.2px] text-[#BCEBFF] italic">
            Withdrawal submitted!
          </h3>

          {/* Source → Destination */}
          <div className="flex items-center gap-3 text-[15px] text-[#BCEBFF]/80">
            {type === "single" && protocol ? (
              <div className="flex items-center gap-1.5">
                <img
                  src={protocol.icon}
                  alt={protocol.label}
                  className="size-5 rounded-full"
                />
                <span>{protocol.label}</span>
              </div>
            ) : protocols ? (
              <div className="flex items-center">
                <div className="flex items-center -space-x-1.5">
                  {protocols.slice(0, 3).map((p, i) => (
                    <img
                      key={p.label}
                      src={p.icon}
                      alt={p.label}
                      className="size-5 rounded-full border border-[#000D1E]"
                      style={{ zIndex: protocols.length - i }}
                    />
                  ))}
                </div>
                <span className="ml-2">{protocols.length} protocols</span>
              </div>
            ) : null}
            <span className="text-[#7192A5]">→</span>
            <div className="flex items-center gap-1.5">
              <div className="flex size-5 items-center justify-center rounded-full bg-[#142030]">
                <span className="text-[10px] text-[#BCEBFF]">P</span>
              </div>
              <span>Privy</span>
            </div>
          </div>

          {/* Amount */}
          <p className="text-[40px] font-bold tracking-[-1px] text-white">
            ${amount}
          </p>
        </div>

        {/* Warning */}
        <div className="flex items-start gap-3 bg-[#3D2A00] px-6 py-4">
          <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-[#D4940A] text-[11px] text-[#D4940A]">
            !
          </div>
          <p className="text-[13px] leading-[1.4] text-[#D4C49A]">
            Usually takes 4–10 mins because of dexes filling orders. You&apos;ll see it in{" "}
            <a href="/portfolio?tab=activity" className="underline hover:text-white">Activity</a> as pending.
          </p>
        </div>

        {/* Done button */}
        <div className="p-6">
          <button
            onClick={onClose}
            className="font-ibm-plex-serif flex h-10 w-full cursor-pointer items-center justify-center bg-[#BCEBFF] text-[16px] tracking-[-0.16px] text-[#000D1E] italic transition-colors hover:bg-[#BCEBFF]/80"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

// Global state for the withdraw confirmation popup
let _setModal: React.Dispatch<
  React.SetStateAction<WithdrawConfirmModalProps | null>
> | null = null;

export function WithdrawConfirmProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [modal, setModal] = useState<WithdrawConfirmModalProps | null>(null);

  useEffect(() => {
    _setModal = setModal;
    return () => {
      _setModal = null;
    };
  }, []);

  const handleClose = useCallback(() => setModal(null), []);

  return (
    <>
      {children}
      {modal && (
        <WithdrawConfirmModal
          open={true}
          onClose={handleClose}
          type={modal.type}
          protocol={modal.protocol}
          protocols={modal.protocols}
          amount={modal.amount}
        />
      )}
    </>
  );
}

export function showWithdrawToast(protocol: ProtocolInfo, amount: string) {
  if (!_setModal) {
    console.warn("[WithdrawToast] Provider not mounted — toast will not show");
    return;
  }
  _setModal({
    open: true,
    onClose: () => _setModal?.(null),
    type: "single",
    protocol,
    amount,
  });
}

export function showBatchWithdrawToast(
  protocols: ProtocolInfo[],
  totalAmount: string,
) {
  if (!_setModal) {
    console.warn("[WithdrawToast] Provider not mounted — toast will not show");
    return;
  }
  _setModal({
    open: true,
    onClose: () => _setModal?.(null),
    type: "batch",
    protocols,
    amount: totalAmount,
  });
}
