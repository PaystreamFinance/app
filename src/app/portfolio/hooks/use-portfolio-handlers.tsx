import React from "react";
import { toast } from "sonner";
import { PositionToast } from "@/components/position-states";
import type { StrategyPositionRowType } from "../_components/strategy-positions-columns";
import type { SpotPerpPositionRowType } from "../_components/spot-perp-positions-columns";
import { closeArbPosition } from "@/lib/arbitrage-api";
import { closeSpotPerpPosition } from "@/lib/spotperp-api";

interface UsePortfolioHandlersProps {
  authenticated: boolean;
  getAccessToken: () => Promise<string | null>;
  confirm: (options: {
    title: string;
    description: string;
    confirmText: string;
    cancelText: string;
  }) => Promise<boolean>;
  refetchStrategyPositions?: () => Promise<unknown>;
  refetchSpotPerpPositions?: () => Promise<unknown>;
}

export function usePortfolioHandlers({
  authenticated,
  getAccessToken,
  confirm,
  refetchStrategyPositions,
  refetchSpotPerpPositions,
}: UsePortfolioHandlersProps) {
  const getStrategyCloseLabel = (position: StrategyPositionRowType) => {
    const longMarket = position.closeLegs?.find(
      (leg) => leg.direction === "long",
    )?.market;
    const shortMarket = position.closeLegs?.find(
      (leg) => leg.direction === "short",
    )?.market;
    if (longMarket && shortMarket && longMarket !== shortMarket) {
      return `${longMarket} / ${shortMarket}`;
    }
    return position.closeMarket ?? longMarket ?? shortMarket ?? position.asset;
  };

  const handleCloseStrategyPosition = async (
    position: StrategyPositionRowType,
  ) => {
    if (!authenticated) {
      toast.custom(() => (
        <PositionToast
          status="failed"
          amount="Wallet"
          symbol="/icons/sol.svg"
          pair="Not Connected"
          description="Please connect your wallet first"
        />
      ));
      return;
    }

    const closeLabel = getStrategyCloseLabel(position);
    const confirmClose = await confirm({
      title: "Close Strategy Position",
      description:
        position.longProtocol && position.shortProtocol
          ? `Are you sure you want to close all ${closeLabel} positions on ${position.longProtocol} (long) and ${position.shortProtocol} (short)? This action cannot be undone.`
          : `Are you sure you want to close the ${closeLabel} position on ${position.longProtocol || position.shortProtocol}? This action cannot be undone.`,
      confirmText: "Close Position",
      cancelText: "Cancel",
    });

    if (!confirmClose) return;

    const toastId = toast.custom(() => (
      <PositionToast
        status="opening"
        amount={closeLabel}
        symbol="/icons/sol.svg"
        pair={closeLabel}
        title="Closing strategy position..."
        description={`Closing ${closeLabel} on ${[position.longProtocol, position.shortProtocol].filter(Boolean).join(" and ")}`}
      />
    ), { duration: Infinity });

    try {
      const accessToken = await getAccessToken();
      if (accessToken) {
        sessionStorage.setItem("privy-access-token", accessToken);
      }

      const idToken =
        sessionStorage.getItem("privy-id-token") ||
        document.cookie
          .split(";")
          .find((c) => c.trim().startsWith("privy-id-token="))
          ?.split("=")[1] ||
        null;

      if (!idToken) {
        toast.custom(() => (
          <PositionToast
            status="failed"
            amount="Auth"
            symbol="/icons/sol.svg"
            pair="Error"
            title="Authentication token not found"
            description="Authentication token not found. Please reconnect your wallet."
          />
        ), { id: toastId, duration: 5000 });
        return;
      }

      const protocols = [position.longProtocol, position.shortProtocol].filter(
        Boolean,
      );
      const closeMarket =
        position.closeMarket ??
        position.longPosition?.symbol ??
        position.shortPosition?.symbol ??
        position.asset;

      // Backend resolves per-leg tickers from DB via publicId — single call
      // handles cross-ticker pairs (HIP-3 / RWA) correctly.
      const closeRequestPreview = {
        market: closeMarket,
        protocols,
        publicId: position.publicId,
        jitoFeeSol: 0.0001,
      };
      console.log("[closeArbPosition] request:", closeRequestPreview);

      const single = await closeArbPosition(
        closeRequestPreview,
        idToken,
        accessToken ?? undefined,
      );
      const closedProtocols = Object.keys(single.closed ?? {});
      const result = {
        status: single.status,
        message: single.message ?? "",
        totalPnl: single.totalPnl ?? 0,
        closedProtocols,
        requestedProtocols: protocols,
      };

      // Detect partial close: backend acknowledged some protocols but not
      // all that we asked for. This is the Fartcoin Pacifica/HL symptom —
      // status === "success" but `closed` only contains pacifica.
      const missingProtocols = result.requestedProtocols.filter(
        (p) => !result.closedProtocols.includes(p),
      );
      const partialClose =
        result.status === "success" && missingProtocols.length > 0;

      if (result.status === "success" && !partialClose) {
        const pnlText =
          result.totalPnl !== 0
            ? ` | PnL: $${result.totalPnl.toFixed(2)}`
            : "";

        toast.custom(() => (
          <PositionToast
            status="success"
            amount={closeLabel}
            symbol="/icons/sol.svg"
            pair={closeLabel}
            title="Strategy position closed"
            description={`${result.message || "Position closed successfully"}${pnlText}`}
          />
        ), { id: toastId, duration: 5000 });

        if (refetchStrategyPositions) {
          void refetchStrategyPositions();
        }
      } else if (partialClose) {
        toast.custom(() => (
          <PositionToast
            status="failed"
            amount={closeLabel}
            symbol="/icons/sol.svg"
            pair={closeLabel}
            title="Only some legs closed"
            description={`Closed: ${result.closedProtocols.join(", ") || "none"}. Still open: ${missingProtocols.join(", ")}. Retry to close the remaining leg.`}
          />
        ), { id: toastId, duration: 8000 });

        if (refetchStrategyPositions) {
          void refetchStrategyPositions();
        }
      } else {
        toast.custom(() => (
          <PositionToast
            status="failed"
            amount={closeLabel}
            symbol="/icons/sol.svg"
            pair={closeLabel}
            title="Failed to close position"
            description={result.message || "The position could not be closed. Please try again."}
          />
        ), { id: toastId, duration: 5000 });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      toast.custom(() => (
        <PositionToast
          status="failed"
          amount={closeLabel}
          symbol="/icons/sol.svg"
          pair={closeLabel}
          title="Failed to close position"
          description={msg}
        />
      ), { id: toastId, duration: 5000 });
    }
  };

  const handleCloseSpotPerpPosition = async (
    position: SpotPerpPositionRowType,
  ) => {
    if (!authenticated) {
      toast.custom(() => (
        <PositionToast
          status="failed"
          amount="Wallet"
          symbol="/icons/sol.svg"
          pair="Not Connected"
          description="Please connect your wallet first"
        />
      ));
      return;
    }

    const confirmClose = await confirm({
      title: "Close Spot-Perp Position",
      description: `Are you sure you want to close the ${position.asset} spot-perp position? This action cannot be undone.`,
      confirmText: "Close Position",
      cancelText: "Cancel",
    });

    if (!confirmClose) return;

    const toastId = toast.custom(() => (
      <PositionToast
        status="opening"
        amount={position.asset}
        symbol="/icons/sol.svg"
        pair={position.asset}
        title="Closing spot-perp position..."
        description={`Closing ${position.asset} on ${position.perpProtocol}`}
      />
    ), { duration: Infinity });

    try {
      const accessToken = await getAccessToken();
      if (accessToken) {
        sessionStorage.setItem("privy-access-token", accessToken);
      }

      const idToken =
        sessionStorage.getItem("privy-id-token") ||
        document.cookie
          .split(";")
          .find((c) => c.trim().startsWith("privy-id-token="))
          ?.split("=")[1] ||
        null;

      if (!idToken) {
        toast.custom(() => (
          <PositionToast
            status="failed"
            amount="Auth"
            symbol="/icons/sol.svg"
            pair="Error"
            title="Authentication token not found"
            description="Authentication token not found. Please reconnect your wallet."
          />
        ), { id: toastId, duration: 5000 });
        return;
      }

      const result = await closeSpotPerpPosition(
        position.tradeId,
        idToken,
        accessToken ?? undefined,
      );

      toast.custom(() => (
        <PositionToast
          status="success"
          amount={position.asset}
          symbol="/icons/sol.svg"
          pair={position.asset}
          title="Spot-perp position closed"
          description={result.message || "Position closed successfully"}
        />
      ), { id: toastId, duration: 5000 });

      if (refetchSpotPerpPositions) {
        void refetchSpotPerpPositions();
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      toast.custom(() => (
        <PositionToast
          status="failed"
          amount={position.asset}
          symbol="/icons/sol.svg"
          pair={position.asset}
          title="Failed to close position"
          description={msg}
        />
      ), { id: toastId, duration: 5000 });
    }
  };

  return {
    handleCloseStrategyPosition,
    handleCloseSpotPerpPosition,
  };
}
