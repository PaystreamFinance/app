"use client";

import * as React from "react";
import { AlertTriangle, Info, OctagonAlert, X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  DOWNTIME_NOTICES,
  getActiveNotices,
  interpolateMessage,
  type DowntimeFeature,
  type DowntimeNoticeDef,
  type DowntimeVariant,
} from "@/config/downtime-notices";

const DISMISSED_KEY = (id: string) => `ps:downtime-dismissed:${id}`;

/**
 * Read a dismissal timestamp. Returns null if not dismissed or if the stored
 * value predates `reshowIntervalHours` (in which case the key is cleared so
 * the banner reappears).
 */
function readDismissedAt(
  id: string,
  reshowIntervalHours: number | undefined,
): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(DISMISSED_KEY(id));
  if (!raw) return null;
  const ts = Number.parseInt(raw, 10);
  if (!Number.isFinite(ts)) return null;
  if (reshowIntervalHours !== undefined) {
    const expiresAt = ts + reshowIntervalHours * 60 * 60 * 1000;
    if (Date.now() >= expiresAt) {
      window.localStorage.removeItem(DISMISSED_KEY(id));
      return null;
    }
  }
  return ts;
}

// ─── Variant styling ───
// Colours sit on the dark theme palette already in use elsewhere in the app.
const VARIANT_STYLES: Record<
  DowntimeVariant,
  {
    accent: string;
    accentBg: string;
    bg: string;
    iconBg: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  informational: {
    accent: "text-[#BCEBFF]",
    accentBg: "bg-[#BCEBFF]",
    bg: "bg-[#041223]",
    iconBg: "bg-[#BCEBFF]/10 ring-[#BCEBFF]/20",
    icon: Info,
  },
  advisory: {
    accent: "text-[#FFB45A]",
    accentBg: "bg-[#FFB45A]",
    bg: "bg-[#041223]",
    iconBg: "bg-[#FFB45A]/10 ring-[#FFB45A]/20",
    icon: AlertTriangle,
  },
  urgent: {
    accent: "text-[#FF6B6B]",
    accentBg: "bg-[#FF6B6B]",
    bg: "bg-[#041223]",
    iconBg: "bg-[#FF6B6B]/10 ring-[#FF6B6B]/20",
    icon: OctagonAlert,
  },
};

interface DowntimeNoticeProps {
  feature: DowntimeFeature;
  className?: string;
}

/**
 * Renders any active downtime notices for the given feature.
 * Automatically shows/hides based on the notice's startUtc/endUtc window
 * (ticks once per minute) and persists per-notice dismissal in localStorage.
 */
export function DowntimeNotice({ feature, className }: DowntimeNoticeProps) {
  // Tick every minute so boundary transitions (start/end) refresh without
  // a page reload — but skip the timer entirely when there are no notices
  // configured for this feature (the common case). Avoids one running
  // interval per mounted DowntimeNotice across the app when nothing is
  // scheduled.
  const hasAnyNoticeForFeature = React.useMemo(
    () =>
      DOWNTIME_NOTICES.some(
        (n) => n.feature === feature || n.feature === "global",
      ),
    [feature],
  );
  const [now, setNow] = React.useState<Date>(() => new Date());
  React.useEffect(() => {
    if (!hasAnyNoticeForFeature) return;
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, [hasAnyNoticeForFeature]);

  // Dismissed set is re-derived on every tick, so the re-show window
  // (reshowIntervalHours) is honoured without needing a separate timer.
  const [dismissalsBumped, setDismissalsBumped] = React.useState(0);
  const dismissedSet = React.useMemo(() => {
    void dismissalsBumped; // re-read localStorage when a new dismiss lands
    const out = new Set<string>();
    if (typeof window === "undefined") return out;
    for (const n of getActiveNotices(feature, now)) {
      if (readDismissedAt(n.id, n.reshowIntervalHours) !== null) {
        out.add(n.id);
      }
    }
    return out;
  }, [feature, now, dismissalsBumped]);

  const active = React.useMemo(
    () => getActiveNotices(feature, now).filter((n) => !dismissedSet.has(n.id)),
    [feature, now, dismissedSet],
  );

  if (active.length === 0) return null;

  const handleDismiss = (id: string) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISMISSED_KEY(id), String(Date.now()));
    }
    // Trigger a re-derive of dismissedSet
    setDismissalsBumped((n) => n + 1);
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {active.map((notice) => (
        <NoticeBanner
          key={notice.id}
          notice={notice}
          onDismiss={
            notice.dismissible ? () => handleDismiss(notice.id) : undefined
          }
        />
      ))}
    </div>
  );
}

interface NoticeBannerProps {
  notice: DowntimeNoticeDef;
  onDismiss?: () => void;
}

function NoticeBanner({ notice, onDismiss }: NoticeBannerProps) {
  const styles = VARIANT_STYLES[notice.variant];
  const Icon = styles.icon;
  const body = interpolateMessage(notice.message, notice);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "relative flex items-start gap-3 overflow-hidden rounded-md border border-[#0F1F30] px-4 py-3 shadow-[0_14px_36px_rgba(0,13,30,0.28)]",
        styles.bg,
      )}
    >
      <div className={cn("absolute inset-y-0 left-0 w-1 opacity-70", styles.accentBg)} />
      <div
        className={cn(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md ring-1",
          styles.iconBg,
        )}
      >
        <Icon className={cn("h-4 w-4", styles.accent)} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className={cn("text-sm font-medium tracking-tight", styles.accent)}>
          {notice.title}
        </p>
        <p className="text-sm leading-relaxed text-[#9CA1A9]">{body}</p>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notice"
          className="ml-2 shrink-0 cursor-pointer rounded-sm p-1 text-[#7192A5] transition-colors hover:bg-white/5 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export default DowntimeNotice;
