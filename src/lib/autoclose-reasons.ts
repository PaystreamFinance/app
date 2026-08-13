/**
 * Autoclose Reasons Registry — Single source of truth for close reason types.
 *
 * To ADD a new reason: Add an entry to AUTOCLOSE_REASONS.
 * Used by: activity tab (mapType), notification bell (TYPE_CONFIG).
 */

import type { UnifiedActivityType } from "@/app/portfolio/_components/unified-activity-columns";

export interface AutocloseReasonConfig {
  label: string;
  activityType: UnifiedActivityType;
}

export const AUTOCLOSE_REASONS: Record<string, AutocloseReasonConfig> = {
  manual: { label: "Manual Close", activityType: "close_arb" },
  funding_flip: { label: "Funding Flip", activityType: "auto_close" },
  pnl_threshold: { label: "PnL Threshold", activityType: "auto_close" },
  liquidation_proximity: { label: "Liquidation Risk", activityType: "auto_close" },
  max_hold_time: { label: "Max Hold Time", activityType: "auto_close" },
  delta_drift: { label: "Delta Drift", activityType: "auto_close" },
  size_drift: { label: "Size Drift", activityType: "auto_close" },
};

export type AutocloseReason = keyof typeof AUTOCLOSE_REASONS;

export function isAutoClose(reason: string | null | undefined): boolean {
  if (!reason) return false;
  const config = AUTOCLOSE_REASONS[reason];
  return config?.activityType === "auto_close";
}

export function getCloseReasonLabel(reason: string | null | undefined): string {
  if (!reason) return "Closed";
  return AUTOCLOSE_REASONS[reason]?.label ?? reason.replace(/_/g, " ");
}

export function getCloseActivityType(reason: string | null | undefined): UnifiedActivityType {
  if (!reason) return "close_arb";
  return AUTOCLOSE_REASONS[reason]?.activityType ?? "close_arb";
}
