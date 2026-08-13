"use client";

import { toast } from "sonner";
import {
  PositionToast,
  type PositionToastProps,
} from "@/components/position-states";
import { useCallback, useRef } from "react";

type PositionStatus = "opening" | "success" | "failed";

interface StoredToastProps extends PositionToastProps {
  status: PositionStatus;
  progress?: number;
}

type SuccessOptions = {
  description?: string;
  title?: string;
  amount?: string;
  symbol?: string;
  amountTokenName?: string;
  amount2?: string;
  symbol2?: string;
  amount2TokenName?: string;
  pair?: string;
  isSwapToast?: boolean;
  swapSellAmount?: string;
  swapSellIcon?: string;
  swapBuyAmount?: string;
  swapBuyIcon?: string;
};

interface UsePositionToastReturn {
  /**
   * Opens a new position toast with initial progress (0%)
   * Returns a toast ID that can be used to update progress
   */
  open: (props: Omit<PositionToastProps, "progress" | "status">) => string;

  /**
   * Updates the progress of an existing toast (0-100)
   */
  updateProgress: (
    toastId: string,
    progress: number,
    description?: string,
  ) => void;

  /**
   * Updates the toast to show it's reached Jupiter swap integration (50%)
   */
  reachSwapIntegration: (toastId: string, description?: string) => void;

  /**
   * Updates the toast to show success (100%) with transaction hash
   */
  success: (
    toastId: string,
    explorerUrl: string,
    descriptionOrOptions?: string | SuccessOptions,
  ) => void;

  /**
   * Updates the toast to show failure
   */
  failed: (toastId: string, description: string) => void;

  /**
   * Dismisses the toast
   */
  dismiss: (toastId: string) => void;
}

export function usePositionToast(): UsePositionToastReturn {
  // Store toast props by toast ID so we can update them
  const toastPropsRef = useRef<Map<string, StoredToastProps>>(new Map());
  // Store animation intervals to clear them if needed
  const animationIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const updateToast = useCallback(
    (
      toastId: string,
      updates: Partial<StoredToastProps>,
      animateProgress = false,
    ) => {
      const currentProps = toastPropsRef.current.get(toastId);
      if (!currentProps) return;

      // If animating progress and we have a target progress value
      if (animateProgress && updates.progress !== undefined) {
        const currentProgress = currentProps.progress ?? 0;
        const targetProgress = updates.progress;

        // Clear any existing animation for this toast
        const existingInterval = animationIntervalsRef.current.get(toastId);
        if (existingInterval) {
          clearInterval(existingInterval);
        }

        // Animate from current to target progress
        const startProgress = currentProgress;
        const progressDiff = targetProgress - startProgress;
        const duration = 1500; // 1.5 seconds for smooth animation
        const steps = 30; // 30 steps for smooth animation
        const stepDuration = duration / steps;
        const progressIncrement = progressDiff / steps;

        let currentStep = 0;

        const interval = setInterval(() => {
          currentStep++;
          const animatedProgress =
            startProgress + progressIncrement * currentStep;

          const animatedProps: StoredToastProps = {
            ...currentProps,
            ...updates,
            progress: Math.min(Math.max(animatedProgress, 0), 100),
          };

          toastPropsRef.current.set(toastId, animatedProps);

          toast.custom(() => <PositionToast {...animatedProps} />, {
            id: toastId,
            duration: Infinity,
          });

          if (currentStep >= steps) {
            clearInterval(interval);
            animationIntervalsRef.current.delete(toastId);

            // Ensure final value is set
            const finalProps: StoredToastProps = {
              ...currentProps,
              ...updates,
              progress: targetProgress,
            };
            toastPropsRef.current.set(toastId, finalProps);

            toast.custom(() => <PositionToast {...finalProps} />, {
              id: toastId,
              duration: Infinity,
            });
          }
        }, stepDuration);

        animationIntervalsRef.current.set(toastId, interval);
        return;
      }

      // Non-animated update
      const updatedProps: StoredToastProps = {
        ...currentProps,
        ...updates,
      };

      toastPropsRef.current.set(toastId, updatedProps);

      // Update the toast with new props
      toast.custom(() => <PositionToast {...updatedProps} />, {
        id: toastId,
        duration: Infinity,
      });
    },
    [],
  );

  const open = useCallback(
    (props: Omit<PositionToastProps, "progress" | "status">) => {
      const initialProps: StoredToastProps = {
        ...props,
        status: "opening",
        progress: 0,
      };

      // Generate a unique ID upfront to prevent key collisions
      const toastIdString = `position-toast-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      console.log(
        "🎯 ZAPENTRY: [usePositionToast] open() creating toast with ID:",
        toastIdString,
      );

      toast.custom(() => <PositionToast {...initialProps} />, {
        id: toastIdString,
        duration: Infinity, // Don't auto-dismiss
      });

      toastPropsRef.current.set(toastIdString, initialProps);
      console.log(
        "🎯 ZAPENTRY: [usePositionToast] Toast stored in ref, total toasts:",
        toastPropsRef.current.size,
      );
      return toastIdString;
    },
    [],
  );

  const updateProgress = useCallback(
    (toastId: string, progress: number, description?: string) => {
      console.log(
        "🎯 ZAPENTRY: [usePositionToast] updateProgress() called with ID:",
        toastId,
        "Progress:",
        progress,
      );
      const updates: Partial<StoredToastProps> = {
        progress: Math.min(Math.max(progress, 0), 100),
        status: "opening",
      };

      if (description) {
        updates.description = description;
      }

      updateToast(toastId, updates, true); // Animate progress
    },
    [updateToast],
  );

  const reachSwapIntegration = useCallback(
    (toastId: string, description?: string) => {
      updateToast(
        toastId,
        {
          progress: 50,
          status: "opening",
          description: description || "Processing swap through Jupiter...",
        },
        true,
      ); // Animate progress
    },
    [updateToast],
  );

  const success = useCallback(
    (
      toastId: string,
      explorerUrl: string,
      descriptionOrOptions?: string | SuccessOptions,
    ) => {
      const currentProps = toastPropsRef.current.get(toastId);
      let description: string | undefined;
      let title: string | undefined;
      let amount: string | undefined;
      let symbol: string | undefined;
      let amountTokenName: string | undefined;
      let amount2: string | undefined;
      let symbol2: string | undefined;
      let amount2TokenName: string | undefined;
      let pair: string | undefined;
      let isSwapToast: boolean | undefined;
      let swapSellAmount: string | undefined;
      let swapSellIcon: string | undefined;
      let swapBuyAmount: string | undefined;
      let swapBuyIcon: string | undefined;

      if (typeof descriptionOrOptions === "string") {
        description = descriptionOrOptions;
      } else if (descriptionOrOptions) {
        description = descriptionOrOptions.description;
        title = descriptionOrOptions.title;
        amount = descriptionOrOptions.amount;
        symbol = descriptionOrOptions.symbol;
        amountTokenName = descriptionOrOptions.amountTokenName;
        amount2 = descriptionOrOptions.amount2;
        symbol2 = descriptionOrOptions.symbol2;
        amount2TokenName = descriptionOrOptions.amount2TokenName;
        pair = descriptionOrOptions.pair;
        isSwapToast = descriptionOrOptions.isSwapToast;
        swapSellAmount = descriptionOrOptions.swapSellAmount;
        swapSellIcon = descriptionOrOptions.swapSellIcon;
        swapBuyAmount = descriptionOrOptions.swapBuyAmount;
        swapBuyIcon = descriptionOrOptions.swapBuyIcon;
      }

      updateToast(
        toastId,
        {
          status: "success",
          progress: 100,
          explorerUrl,
          description:
            description ||
            currentProps?.description ||
            "Transaction completed successfully!",
          title: title || currentProps?.title,
          // Use provided values or fall back to current props
          amount: amount ?? currentProps?.amount ?? "0",
          symbol: symbol ?? currentProps?.symbol ?? "/icons/sol.svg",
          amountTokenName: amountTokenName ?? currentProps?.amountTokenName,
          amount2: amount2 ?? currentProps?.amount2,
          symbol2: symbol2 ?? currentProps?.symbol2,
          amount2TokenName: amount2TokenName ?? currentProps?.amount2TokenName,
          pair: pair ?? currentProps?.pair ?? "Pool",
          isSwapToast: isSwapToast ?? currentProps?.isSwapToast ?? false,
          swapSellAmount: swapSellAmount ?? currentProps?.swapSellAmount,
          swapSellIcon: swapSellIcon ?? currentProps?.swapSellIcon,
          swapBuyAmount: swapBuyAmount ?? currentProps?.swapBuyAmount,
          swapBuyIcon: swapBuyIcon ?? currentProps?.swapBuyIcon,
        },
        true,
      ); // Animate progress

      // Dismiss toast after 5 seconds
      setTimeout(() => {
        toast.dismiss(toastId);
        toastPropsRef.current.delete(toastId);
        // Clear any running animations
        const existingInterval = animationIntervalsRef.current.get(toastId);
        if (existingInterval) {
          clearInterval(existingInterval);
          animationIntervalsRef.current.delete(toastId);
        }
      }, 5000);
    },
    [updateToast],
  );

  const failed = useCallback(
    (toastId: string, description: string) => {
      console.log(
        "🎯 ZAPENTRY: [usePositionToast] failed() called with ID:",
        toastId,
      );
      console.log("🎯 ZAPENTRY: [usePositionToast] Description:", description);
      console.log(
        "🎯 ZAPENTRY: [usePositionToast] All stored toast IDs:",
        Array.from(toastPropsRef.current.keys()),
      );

      const currentProps = toastPropsRef.current.get(toastId);
      console.log(
        "🎯 ZAPENTRY: [usePositionToast] Found props:",
        currentProps ? "YES" : "NO",
      );

      if (!currentProps) {
        console.log(
          "🎯 ZAPENTRY: [usePositionToast] ❌ Toast not found in ref, cannot update!",
        );
        return;
      }

      console.log(
        "🎯 ZAPENTRY: [usePositionToast] Calling updateToast with failed status",
      );
      updateToast(toastId, {
        status: "failed",
        description,
        // Preserve swap-related props from original props
        isSwapToast: currentProps?.isSwapToast ?? false,
        swapSellAmount: currentProps?.swapSellAmount,
        swapSellIcon: currentProps?.swapSellIcon,
        swapBuyAmount: currentProps?.swapBuyAmount,
        swapBuyIcon: currentProps?.swapBuyIcon,
      });
      console.log(
        "🎯 ZAPENTRY: [usePositionToast] updateToast called, toast should now be red",
      );

      // Dismiss toast after 10 seconds (increased from 5)
      setTimeout(() => {
        console.log(
          "🎯 ZAPENTRY: [usePositionToast] Auto-dismissing toast after 10s",
        );
        toast.dismiss(toastId);
        toastPropsRef.current.delete(toastId);
        // Clear any running animations
        const existingInterval = animationIntervalsRef.current.get(toastId);
        if (existingInterval) {
          clearInterval(existingInterval);
          animationIntervalsRef.current.delete(toastId);
        }
      }, 5000);
    },
    [updateToast],
  );

  const dismiss = useCallback((toastId: string) => {
    // Clear any running animations
    const existingInterval = animationIntervalsRef.current.get(toastId);
    if (existingInterval) {
      clearInterval(existingInterval);
      animationIntervalsRef.current.delete(toastId);
    }

    toast.dismiss(toastId);
    toastPropsRef.current.delete(toastId);
  }, []);

  return {
    open,
    updateProgress,
    reachSwapIntegration,
    success,
    failed,
    dismiss,
  };
}
