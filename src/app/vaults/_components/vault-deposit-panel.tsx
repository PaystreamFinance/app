"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth/solana";
import { api } from "@/trpc/react";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { useVaultActions } from "@/hooks/use-vault-actions";
import { usePositionToast } from "@/hooks/use-position-toast";

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function formatEligibleIn(eligibleAt: string): string {
  const msLeft = new Date(eligibleAt).getTime() - Date.now();
  if (msLeft <= 0) return "now";
  const totalMins = Math.ceil(msLeft / 60_000);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

export default function VaultDepositPanel() {
  const { authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const userAddress = wallets[0]?.address;

  const { balance: usdcBalance } = useTokenBalance(
    authenticated ? USDC_MINT : undefined,
  );
  const { data: position, refetch: refetchPosition } =
    api.vaults.getUserPosition.useQuery(
      { userAddress: userAddress! },
      { enabled: !!userAddress, refetchInterval: 30_000 },
    );
  const { depositToVault, requestWithdraw, claimWithdraw } = useVaultActions();
  const positionToast = usePositionToast();

  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const parsedAmount = parseFloat(amount);
  const lpValueUsdc = position?.lpValueUsdc ?? 0;
  const pendingWithdrawal = position?.pendingWithdrawal ?? null;

  const canDeposit =
    !isSubmitting &&
    parsedAmount > 0 &&
    parsedAmount <= (usdcBalance ?? 0);

  const canRequestWithdraw =
    !isSubmitting &&
    parsedAmount > 0 &&
    parsedAmount <= lpValueUsdc &&
    !pendingWithdrawal;

  async function handleAction() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    const isDeposit = mode === "deposit";
    const toastId = positionToast.open({
      amount: `$${parsedAmount.toFixed(2)}`,
      symbol: "/icons/usdc.svg",
      pair: "USDC Vault",
      description: isDeposit
        ? "Confirming your deposit on-chain…"
        : "Requesting withdrawal on-chain…",
      title: isDeposit ? "Depositing to vault…" : "Requesting withdraw…",
    });
    try {
      let sig: string;
      if (isDeposit) {
        sig = await depositToVault(parsedAmount);
      } else {
        sig = await requestWithdraw(parsedAmount, false);
      }
      positionToast.success(toastId, `https://solscan.io/tx/${sig}`, {
        title: isDeposit ? "Deposit confirmed" : "Withdraw requested",
        description: isDeposit
          ? `$${parsedAmount.toFixed(2)} USDC deposited successfully`
          : `Withdrawal of $${parsedAmount.toFixed(2)} USDC is pending`,
      });
      setAmount("");
      await refetchPosition();
    } catch (err) {
      positionToast.failed(
        toastId,
        err instanceof Error ? err.message : "Transaction failed",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleClaim() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    const toastId = positionToast.open({
      amount: "",
      symbol: "/icons/usdc.svg",
      pair: "USDC Vault",
      description: "Claiming your withdrawal on-chain…",
      title: "Claiming withdrawal…",
    });
    try {
      const sig = await claimWithdraw();
      positionToast.success(toastId, `https://solscan.io/tx/${sig}`, {
        title: "Withdrawal claimed",
        description: "Your USDC has been returned to your wallet",
      });
      await refetchPosition();
    } catch (err) {
      positionToast.failed(
        toastId,
        err instanceof Error ? err.message : "Claim failed",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!authenticated) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 bg-[#000D1E] p-6">
        <p className="text-sm text-[#7092A5]">
          Connect your wallet to deposit or withdraw
        </p>
        <button
          onClick={login}
          className="w-full rounded-lg bg-[#0D1929] py-3.5 text-sm font-medium text-[#BCEAFF] transition-colors hover:bg-[#1A3A52]"
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  const actionLabel =
    mode === "deposit"
      ? isSubmitting
        ? "Depositing…"
        : "Deposit"
      : isSubmitting
        ? "Requesting…"
        : "Request Withdraw";

  const canSubmit = mode === "deposit" ? canDeposit : canRequestWithdraw;

  return (
    <div className="flex flex-col gap-5 bg-[#000D1E] p-6">
      {/* My Position */}
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-[#7092A5]">
          My Position
        </span>
        <span className="text-sm font-medium text-white">
          {position
            ? `$${lpValueUsdc.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : "—"}
        </span>
      </div>

      {/* Toggle */}
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-1 rounded-full border border-[#1A3A52] p-1">
          <button
            onClick={() => setMode("deposit")}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm transition-colors",
              mode === "deposit"
                ? "bg-[#0D1929] text-[#BCEAFF]"
                : "text-[#7092A5] hover:text-[#BCEAFF]",
            )}
          >
            Deposit
          </button>
          <button
            onClick={() => setMode("withdraw")}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm transition-colors",
              mode === "withdraw"
                ? "bg-[#0D1929] text-[#BCEAFF]"
                : "text-[#7092A5] hover:text-[#BCEAFF]",
            )}
          >
            Withdraw
          </button>
        </div>
      </div>

      {/* Label + Balance */}
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-[#7092A5]">
          {mode === "deposit" ? "Supply USDC" : "Withdraw USDC"}
        </p>
        {mode === "deposit" ? (
          <div className="flex items-center gap-2 text-xs text-[#7092A5]">
            <span>
              Balance:{" "}
              {usdcBalance != null ? usdcBalance.toFixed(2) : "—"}
            </span>
            <button
              onClick={() =>
                setAmount(((usdcBalance ?? 0) * 0.5).toFixed(2))
              }
              className="text-[#BCEAFF] hover:underline"
            >
              50%
            </button>
            <button
              onClick={() => setAmount((usdcBalance ?? 0).toFixed(2))}
              className="text-[#BCEAFF] hover:underline"
            >
              MAX
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-[#7092A5]">
            <span>Position: ${lpValueUsdc.toFixed(2)}</span>
            <button
              onClick={() => setAmount((lpValueUsdc * 0.5).toFixed(2))}
              className="text-[#BCEAFF] hover:underline"
            >
              50%
            </button>
            <button
              onClick={() => setAmount(lpValueUsdc.toFixed(2))}
              className="text-[#BCEAFF] hover:underline"
            >
              MAX
            </button>
          </div>
        )}
      </div>

      {/* Token input */}
      <div className="flex items-center gap-3 border border-[#1A3A52] bg-[#041223] px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2775CA]">
            <span className="text-xs font-bold text-white">$</span>
          </div>
          <span className="text-lg font-medium text-white">USDC</span>
        </div>
        <input
          type="text"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.0"
          className="w-full bg-transparent text-right text-2xl text-white outline-none placeholder:text-[#7092A5]"
        />
      </div>

      {/* Action button */}
      <button
        onClick={handleAction}
        disabled={!canSubmit}
        className={cn(
          "w-full rounded-lg py-3.5 text-center text-sm font-medium transition-colors",
          canSubmit
            ? "bg-[#0D1929] text-[#BCEAFF] hover:bg-[#1A3A52]"
            : "cursor-not-allowed bg-[#0D1929] text-[#7092A5]",
        )}
      >
        {actionLabel}
      </button>

      {/* Pending withdrawal banner — only in withdraw mode */}
      {mode === "withdraw" && pendingWithdrawal && (
        <div
          className={cn(
            "rounded-lg border p-4",
            pendingWithdrawal.isReady
              ? "border-[#4ADE80]/30 bg-[#4ADE80]/10"
              : "border-[#1A3A52] bg-[#041223]",
          )}
        >
          {pendingWithdrawal.isReady ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-[#4ADE80]">
                  Withdrawal ready to claim
                </p>
                <p className="text-xs text-[#7092A5]">
                  {pendingWithdrawal.lpAmount.toFixed(6)} LP escrowed
                </p>
              </div>
              <button
                onClick={handleClaim}
                disabled={isSubmitting}
                className={cn(
                  "shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                  isSubmitting
                    ? "cursor-not-allowed bg-[#0D1929] text-[#7092A5]"
                    : "bg-[#4ADE80]/20 text-[#4ADE80] hover:bg-[#4ADE80]/30",
                )}
              >
                {isSubmitting ? "Claiming…" : "Claim Withdraw"}
              </button>
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium text-[#7092A5]">
                Withdrawal pending
              </p>
              <p className="text-xs text-[#7092A5]">
                Eligible in {formatEligibleIn(pendingWithdrawal.eligibleAt)}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
