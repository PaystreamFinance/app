/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Bell, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { createPortal } from "react-dom";
import { getPrivyIdToken, getPrivyAccessToken } from "@/lib/privy-auth";
import { PERP_HEDGE_API_URL } from "@/lib/perp-api-url";

// ─── API types ───

interface ApiNotification {
  id: string;
  type: string;
  data: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

interface NotificationsResponse {
  status: string;
  notifications: ApiNotification[];
  unreadCount: number;
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}

// ─── Notification type config ───

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  auto_close: {
    label: "Auto-Closed",
    color: "text-[#BC7EFF]",
    icon: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 6v4l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  funding_flip: {
    label: "Funding Flip",
    color: "text-[#F59E0B]",
    icon: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
        <path d="M3 14l4-4 3 3 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13 6h4v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  size_drift: {
    label: "Size Drift",
    color: "text-[#F59E0B]",
    icon: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
        <path d="M10 2L1 18h18L10 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M10 8v4M10 14.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  close_error: {
    label: "Close Error",
    color: "text-[#FF6B6B]",
    icon: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 7l6 6M13 7l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  better_opportunity: {
    label: "Better Opportunity",
    color: "text-[#4ADE80]",
    icon: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
        <path d="M3 14l4-4 3 3 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13 6h4v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
};

const DEFAULT_TYPE_CONFIG = {
  label: "Notification",
  color: "text-[#7ABADB]",
  icon: (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 7v3M10 13v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
};

// ─── Helpers ───

function authHeaders(): HeadersInit | null {
  const idToken = getPrivyIdToken();
  if (!idToken) return null;
  const h: HeadersInit = { "Content-Type": "application/json", "privy-id-token": idToken };
  const accessToken = getPrivyAccessToken();
  if (accessToken) h["Authorization"] = `Bearer ${accessToken}`;
  return h;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// Whitelist Telegram deeplinks — backend response must be a tg: URI or an
// https://t.me/ URL. Anything else (javascript:, data:, arbitrary https) is
// rejected to prevent navigation hijack from a compromised /telegram/link-token.
function isSafeTelegramDeepLink(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) {
    return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol === "tg:") return true;
  if (parsed.protocol === "https:") {
    return parsed.hostname === "t.me" || parsed.hostname === "telegram.me";
  }
  return false;
}

function buildDescription(type: string, data: Record<string, unknown>): string {
  const symbol = (data.symbol as string) ?? "";
  const pnl = data.totalPnl as number | undefined;
  const reason = (data.closeReason as string) ?? (data.reason as string) ?? "";
  const longProto = (data.longProtocol as string) ?? "";
  const shortProto = (data.shortProtocol as string) ?? "";
  const protocols = [longProto, shortProto].filter(Boolean).join(" / ");

  switch (type) {
    case "auto_close":
      return `${symbol} position auto-closed${reason ? ` (${reason.replace(/_/g, " ")})` : ""}${pnl !== undefined ? `. PnL: $${pnl.toFixed(2)}` : ""}${protocols ? ` on ${protocols}` : ""}`;
    case "funding_flip":
      return `Funding rate flipped on ${symbol}${protocols ? ` (${protocols})` : ""}. Position closed.`;
    case "size_drift":
      return `${symbol} position size drifted beyond threshold${protocols ? ` on ${protocols}` : ""}.`;
    case "close_error":
      return `Failed to close ${symbol} position${protocols ? ` on ${protocols}` : ""}. ${(data.error as string) ?? ""}`.trim();
    case "better_opportunity":
      return `Better arb opportunity found for ${symbol}${protocols ? ` on ${protocols}` : ""}.`;
    default: {
      const msg = (data.message as string) ?? (data.text as string);
      if (msg) return msg;
      return `${symbol || "Position"} ${type.replace(/_/g, " ")}${protocols ? ` on ${protocols}` : ""}`;
    }
  }
}

// ─── Component ───

interface NotificationBellProps {
  isMobile?: boolean;
}

export function NotificationBell({ isMobile }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [linkingTelegram, setLinkingTelegram] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Fetch notifications
  const fetchNotifications = useCallback(async (loadMore = false) => {
    const h = authHeaders();
    if (!h) return;
    setLoading(true);
    try {
      const newOffset = loadMore ? offset : 0;
      const res = await fetch(
        `${PERP_HEDGE_API_URL}/notifications?limit=30&offset=${newOffset}`,
        { method: "GET", headers: h },
      );
      if (!res.ok) return;
      const data: NotificationsResponse = await res.json();
      if (loadMore) {
        setNotifications((prev) => [...prev, ...data.notifications]);
      } else {
        setNotifications(data.notifications);
      }
      setUnreadCount(data.unreadCount);
      setHasMore(data.pagination.hasMore);
      setOffset(newOffset + data.notifications.length);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [offset]);

  // Poll unread count every 30s
  useEffect(() => {
    const pollUnread = async () => {
      const h = authHeaders();
      if (!h) return;
      try {
        const res = await fetch(
          `${PERP_HEDGE_API_URL}/notifications?limit=1&offset=0&unread=true`,
          { method: "GET", headers: h },
        );
        if (!res.ok) return;
        const data: NotificationsResponse = await res.json();
        setUnreadCount(data.unreadCount);
      } catch { /* silent */ }
    };
    pollUnread();
    const interval = setInterval(pollUnread, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Fetch full list when panel opens
  useEffect(() => {
    if (open) {
      setOffset(0);
      void fetchNotifications(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Mark single as read
  const markRead = useCallback(async (id: string) => {
    const h = authHeaders();
    if (!h) return;
    try {
      await fetch(`${PERP_HEDGE_API_URL}/notifications/${id}/read`, { method: "POST", headers: h });
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch { /* silent */ }
  }, []);

  // Mark all as read
  const markAllRead = useCallback(async () => {
    const h = authHeaders();
    if (!h) return;
    try {
      await fetch(`${PERP_HEDGE_API_URL}/notifications/read-all`, { method: "POST", headers: h });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch { /* silent */ }
  }, []);

  // Telegram linking
  const handleConnectTelegram = useCallback(async () => {
    if (linkingTelegram) return;
    setLinkingTelegram(true);
    const popup = window.open("about:blank", "_blank");
    try {
      const h = authHeaders();
      if (!h) throw new Error("Not authenticated");
      const res = await fetch(`${PERP_HEDGE_API_URL}/telegram/link-token`, { method: "POST", headers: h });
      if (!res.ok) throw new Error("Failed to generate Telegram link");
      const data = (await res.json()) as { deepLink?: unknown };
      if (!isSafeTelegramDeepLink(data.deepLink)) {
        popup?.close();
        throw new Error("Invalid Telegram link returned");
      }
      if (popup) {
        popup.location.href = data.deepLink;
      } else {
        window.location.href = data.deepLink;
      }
    } catch {
      popup?.close();
    } finally {
      setLinkingTelegram(false);
    }
  }, [linkingTelegram]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (bellRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  const panel = open && typeof document !== "undefined" ? createPortal(
    <div
      ref={panelRef}
      className={cn(
        "fixed z-[100] flex flex-col border border-[#0F1F30] bg-[#041223]",
        isMobile
          ? "inset-x-0 bottom-0 max-h-[80vh] rounded-t-2xl"
          : "right-4 top-14 w-[380px] rounded-none",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#0F1F30] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white">Notifications</span>
          {unreadCount > 0 && (
            <span className="rounded-full bg-[#9CE0FF]/10 px-2 py-0.5 text-[10px] font-medium text-[#9CE0FF]">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-1 text-xs text-[#7192A5] transition-colors hover:text-white"
            >
              <Check className="size-3" />
              Read all
            </button>
          )}
          <button
            onClick={handleConnectTelegram}
            disabled={linkingTelegram}
            className="flex cursor-pointer items-center gap-1.5 border border-[#0F1F30] bg-[#0D1929] px-2.5 py-1.5 text-xs text-[#BCEAFF] transition-colors disabled:opacity-50"
          >
            {linkingTelegram ? "..." : "Telegram"}
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M3 1H1v10h10V9" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5 7L11 1M11 1H7M11 1v4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Notifications list */}
      <div className={cn("flex-1 overflow-y-auto", isMobile ? "max-h-[65vh]" : "max-h-[60vh]")}>
        {loading && notifications.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#7092A5] border-t-transparent" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-8 py-12">
            <svg width="64" height="64" viewBox="0 0 80 80" fill="none" className="mb-4 opacity-30">
              <path d="M40 12C28.954 12 20 20.954 20 32v12c0 4-2 8-6 10h52c-4-2-6-6-6-10V32c0-11.046-8.954-20-20-20z" stroke="#7192A5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M32 54c0 4.418 3.582 8 8 8s8-3.582 8-8" stroke="#7192A5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <h3 className="font-ibm-plex-serif text-sm font-medium text-[#ADE6FF] italic">No notifications yet</h3>
            <p className="mt-1 text-center text-xs text-[#7192A5]">You&apos;ll see position updates here</p>
          </div>
        ) : (
          <>
            {notifications.map((notif) => {
              const config = TYPE_CONFIG[notif.type] ?? DEFAULT_TYPE_CONFIG;
              return (
                <button
                  key={notif.id}
                  onClick={() => { if (!notif.read) void markRead(notif.id); }}
                  className={cn(
                    "flex w-full gap-3 border-b border-[#0F1F30] px-4 py-3 text-left transition-colors",
                    !notif.read ? "bg-[#0A1A2A]" : "bg-transparent",
                  )}
                >
                  <div className={cn("mt-0.5 shrink-0", config.color)}>
                    {config.icon}
                  </div>
                  <div className="flex flex-1 flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-white">{config.label}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="shrink-0 text-[10px] text-[#7192A5]/60">{timeAgo(notif.createdAt)}</span>
                        {!notif.read && <div className="size-1.5 shrink-0 rounded-full bg-[#9CE0FF]" />}
                      </div>
                    </div>
                    <p className="text-xs leading-relaxed text-[#7192A5]">
                      {buildDescription(notif.type, notif.data)}
                    </p>
                  </div>
                </button>
              );
            })}
            {hasMore && (
              <button
                onClick={() => void fetchNotifications(true)}
                disabled={loading}
                className="flex w-full items-center justify-center py-3 text-xs text-[#7192A5] transition-colors hover:text-white disabled:opacity-50"
              >
                {loading ? "Loading..." : "Load more"}
              </button>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  ) : null;

  // Backdrop for mobile
  const backdrop = open && isMobile && typeof document !== "undefined" ? createPortal(
    <div className="fixed inset-0 z-[99] bg-black/50" onClick={() => setOpen(false)} />,
    document.body,
  ) : null;

  return (
    <>
      <button
        ref={bellRef}
        onClick={() => setOpen(!open)}
        className="relative flex cursor-pointer items-center justify-center border border-[rgba(188,235,255,0.08)] p-2"
      >
        <Bell className="size-[19px] text-[#7192A5]" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-[#9CE0FF] text-[9px] font-bold text-[#000D1E]">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {backdrop}
      {panel}
    </>
  );
}
