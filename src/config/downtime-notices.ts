// ─── Downtime / maintenance notices ───
//
// Central registry of operational notices shown in-product. Each entry renders
// as a dismissible banner on pages that mount <DowntimeNotice feature="…"/>.
//
// ─── Authoring guidelines (keep these; the banner is user-facing) ───
//   • Name the feature precisely — "Arbitrage Screener", "Trade Execution",
//     "Markets API". Avoid "the app" / "the thing".
//   • Times are UTC; the component renders both UTC and the user's local TZ.
//   • State the impact explicitly — what still works, what does not.
//   • Neutral closer ("We appreciate your patience"). No emoji, no
//     exclamations, no marketing voice.
//
// ─── Schema ───
//   id           stable string, used as the localStorage dismissal key
//   feature      which page/area mounts this notice; "global" shows everywhere
//   title        short heading
//   message      body; may reference {{startUtc}}, {{endUtc}}, {{startLocal}},
//                {{endLocal}} placeholders (interpolated at render time)
//   startUtc     ISO-8601; notice is hidden before this time
//   endUtc       ISO-8601; notice is hidden after this time
//   variant      informational | advisory | urgent
//   dismissible  whether the user can close the banner
//   reshowIntervalHours  optional; a dismissed banner reappears after this many
//                hours. Unset = dismissal sticks until localStorage is cleared.

export type DowntimeVariant = "informational" | "advisory" | "urgent";

export type DowntimeFeature =
  | "global"
  | "arb-screener"
  | "trade-execution"
  | "markets-api"
  | "portfolio"
  | "deposit-withdraw";

export interface DowntimeNoticeDef {
  id: string;
  feature: DowntimeFeature;
  title: string;
  message: string;
  startUtc: string;
  endUtc: string;
  variant: DowntimeVariant;
  dismissible: boolean;
  /** If set, a dismissed banner re-appears after this many hours. */
  reshowIntervalHours?: number;
}

// ─── Active notices ───

export const DOWNTIME_NOTICES: readonly DowntimeNoticeDef[] = [
  {
    id: "arb-balance-rate-limit-advisory-2026-05-08",
    feature: "arb-screener",
    title: "Balance data may refresh slowly",
    message:
      "We are aware that some venue balances may intermittently fail to load " +
      "or appear stale because upstream balance endpoints are rate-limiting " +
      "requests. Trading and open positions remain available; if a balance " +
      "does not appear, wait briefly and refresh. We are working on improving " +
      "this behavior.",
    startUtc: "2026-05-08T18:17:27Z",
    endUtc: "2026-05-09T18:17:27Z",
    variant: "advisory",
    dismissible: true,
    reshowIntervalHours: 4,
  },
  //
  // Template — copy, uncomment, fill in the window, and deploy:
  //
  // {
  //   id: "arb-screener-maintenance-YYYY-MM-DD",
  //   feature: "arb-screener",
  //   title: "Scheduled maintenance · Arbitrage Screener",
  //   message:
  //     "The Arbitrage Screener will be temporarily unavailable from " +
  //     "{{startUtc}} to {{endUtc}} ({{startLocal}} – {{endLocal}} local) " +
  //     "while we carry out an infrastructure upgrade. Open positions are " +
  //     "unaffected. We appreciate your patience.",
  //   startUtc: "YYYY-MM-DDTHH:MM:00Z",
  //   endUtc:   "YYYY-MM-DDTHH:MM:00Z",
  //   variant: "advisory",
  //   dismissible: true,
  //   reshowIntervalHours: 1,
  // },
];

// ─── Helpers ───

export function isWithinWindow(
  def: Pick<DowntimeNoticeDef, "startUtc" | "endUtc">,
  now: Date,
): boolean {
  const start = Date.parse(def.startUtc);
  const end = Date.parse(def.endUtc);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  const t = now.getTime();
  return t >= start && t <= end;
}

export function getActiveNotices(
  feature: DowntimeFeature,
  now: Date = new Date(),
): DowntimeNoticeDef[] {
  return DOWNTIME_NOTICES.filter(
    (n) =>
      (n.feature === feature || n.feature === "global") &&
      isWithinWindow(n, now),
  );
}

// ISO → "22 Apr 2026, 14:00 UTC" / "22 Apr 2026, 10:00 (EDT)"
export function formatNoticeTime(
  iso: string,
  style: "utc" | "local",
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const opts: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: style === "utc" ? "UTC" : undefined,
  };
  const base = new Intl.DateTimeFormat("en-GB", opts).format(d);
  if (style === "utc") return `${base} UTC`;
  // Append the short timezone label to the local format
  const tz = Intl.DateTimeFormat(undefined, { timeZoneName: "short" })
    .formatToParts(d)
    .find((p) => p.type === "timeZoneName")?.value;
  return tz ? `${base} (${tz})` : base;
}

export function interpolateMessage(
  message: string,
  def: Pick<DowntimeNoticeDef, "startUtc" | "endUtc">,
): string {
  return message
    .replaceAll("{{startUtc}}", formatNoticeTime(def.startUtc, "utc"))
    .replaceAll("{{endUtc}}", formatNoticeTime(def.endUtc, "utc"))
    .replaceAll("{{startLocal}}", formatNoticeTime(def.startUtc, "local"))
    .replaceAll("{{endLocal}}", formatNoticeTime(def.endUtc, "local"));
}
