"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPrivyIdToken, getPrivyAccessToken } from "@/lib/privy-auth";
import { isHip3ProtocolId } from "@/lib/protocol-registry";
import type { UnifiedActivityRow, UnifiedActivityType } from "../_components/unified-activity-columns";

import { PERP_HEDGE_API_URL } from "@/lib/perp-api-url";

// Poll transfers 3x at 15s when user clicks the Activity tab.
let transferClickPollCount = 0;

export function triggerTransferActivityPoll() {
  transferClickPollCount = 3;
}

const TOKEN_ICONS: Record<string, string> = {
  SOL: "/icons/sol.svg",
  USDC: "/icons/usdc.svg",
  USDT: "/icons/usdt.svg",
  ETH: "/icons/eth.svg",
  BTC: "/icons/btc.svg",
};

function getTokenIcon(symbol: string): string {
  return TOKEN_ICONS[symbol.toUpperCase()] ?? "/icons/sol.svg";
}

function authHeaders(): HeadersInit | null {
  const idToken = getPrivyIdToken();
  if (!idToken) return null;
  const h: HeadersInit = { "Content-Type": "application/json", "privy-id-token": idToken };
  const accessToken = getPrivyAccessToken();
  if (accessToken) h["Authorization"] = `Bearer ${accessToken}`;
  return h;
}

// ─── Transfer types ───
interface Transfer {
  publicId: string;
  type: "deposit" | "withdrawal";
  protocol: string;
  venue?: string | null;
  dex?: string | null;
  subDex?: string | null;
  protocolFrom?: string | null;
  protocolTo?: string | null;
  fromProtocol?: string | null;
  toProtocol?: string | null;
  sourceProtocol?: string | null;
  destinationProtocol?: string | null;
  sourceVenue?: string | null;
  destinationVenue?: string | null;
  targetVenue?: string | null;
  asset: string;
  amount: number;
  /** USD value of the transfer. Hyperliquid populates this directly; for
   *  Pacifica/Lighter/Aster the backend leaves it undefined and we fall
   *  back to `amount` (those venues are USDC-denominated). */
  usdcValue?: number;
  /** Hyperliquid alternate field shape — `delta.usdc` mirrors `usdcValue`
   *  on some response variants. Kept for safety. */
  delta?: { usdc?: number };
  status:
    | "initiated"
    | "pending"
    | "processing"
    | "queued"
    | "submitted"
    | "confirmed"
    | "success"
    | "completed"
    | "failed"
    | "error";
  transferStatus?: string | null;
  withdrawalStatus?: string | null;
  state?: string | null;
  metadata?: TransferNestedFields | null;
  data?: TransferNestedFields | null;
  txHash: string | null;
  createdAt: string;
}

interface TransferNestedFields {
  status?: string | null;
  withdrawalStatus?: string | null;
  venue?: string | null;
  dex?: string | null;
  subDex?: string | null;
  protocol?: string | null;
  protocolFrom?: string | null;
  protocolTo?: string | null;
  fromProtocol?: string | null;
  toProtocol?: string | null;
  sourceProtocol?: string | null;
  destinationProtocol?: string | null;
  sourceVenue?: string | null;
  destinationVenue?: string | null;
  targetVenue?: string | null;
  [key: string]: unknown;
}

// Stablecoins where 1 token ≈ $1 — no need to show token amount separately
const STABLECOIN_ASSETS = new Set(["USDC", "USDT"]);
const HIP3_VENUE_ALIASES: Record<string, string> = {
  dreamcash: "cash",
  felix: "flx",
  usefelix: "flx",
  hyena: "hyna",
  markets: "km",
  paragon: "para",
  xyz: "xyz",
};

function transferToRow(t: Transfer): UnifiedActivityRow {
  const isDeposit = t.type === "deposit";
  const amount = Number(t.amount) || 0;
  const isStable = STABLECOIN_ASSETS.has(t.asset.toUpperCase());
  const status = normalizeTransferStatus(t);
  const transferProtocol = resolveTransferProtocol(t);
  // Prefer the API-supplied USD value (Hyperliquid sets `usdcValue` /
  // `delta.usdc`). For Pacifica/Lighter/Aster the field is absent and the
  // raw `amount` is already USDC-denominated, so it doubles as the USD value.
  const usdValue =
    typeof t.usdcValue === "number" && Number.isFinite(t.usdcValue)
      ? t.usdcValue
      : typeof t.delta?.usdc === "number" && Number.isFinite(t.delta.usdc)
        ? t.delta.usdc
        : amount;
  return {
    id: `xfer-${t.publicId}`,
    token: t.asset,
    tokenIcon: getTokenIcon(t.asset),
    value: status === "pending" ? "" : `$${usdValue.toFixed(2)}`,
    valueNum: usdValue,
    isNegative: false,
    isPending: status === "pending",
    protocolFrom: isDeposit ? "privy" : transferProtocol,
    protocolTo: isDeposit ? transferProtocol : "privy",
    type: isDeposit ? "deposit" : "withdrawal",
    timestamp: t.createdAt,
    txHash: t.txHash,
    transferStatus: status,
    tokenAmount: isStable ? amount : null,
  };
}

function normalizeHip3Venue(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized || normalized === "main" || normalized === "hyperliquid") return null;
  if (isHip3ProtocolId(normalized)) return normalized;
  const bareDex = HIP3_VENUE_ALIASES[normalized] ?? normalized.replace(/^hl[-_:]/, "");
  const protocolId = `hl:${bareDex}`;
  return isHip3ProtocolId(protocolId) ? protocolId : null;
}

function firstHip3Venue(candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    const venue = normalizeHip3Venue(candidate);
    if (venue) return venue;
  }
  return null;
}

const HIP3_TRANSFER_FIELD_RE =
  /(venue|dex|subdex|hip3|protocol|source|destination|target)/i;

function findHip3VenueDeep(value: unknown, seen = new WeakSet<object>()): string | null {
  if (!value || typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (typeof nested === "string" && HIP3_TRANSFER_FIELD_RE.test(key)) {
      const venue = normalizeHip3Venue(nested);
      if (venue) return venue;
    }

    if (nested && typeof nested === "object") {
      const venue = findHip3VenueDeep(nested, seen);
      if (venue) return venue;
    }
  }

  return null;
}

function resolveTransferProtocol(t: Transfer): string {
  const destinationCandidates = [
    t.protocolTo,
    t.toProtocol,
    t.destinationProtocol,
    t.destinationVenue,
    t.targetVenue,
    t.metadata?.protocolTo,
    t.metadata?.toProtocol,
    t.metadata?.destinationProtocol,
    t.metadata?.destinationVenue,
    t.metadata?.targetVenue,
    t.data?.protocolTo,
    t.data?.toProtocol,
    t.data?.destinationProtocol,
    t.data?.destinationVenue,
    t.data?.targetVenue,
  ];
  const sourceCandidates = [
    t.protocolFrom,
    t.fromProtocol,
    t.sourceProtocol,
    t.sourceVenue,
    t.metadata?.protocolFrom,
    t.metadata?.fromProtocol,
    t.metadata?.sourceProtocol,
    t.metadata?.sourceVenue,
    t.data?.protocolFrom,
    t.data?.fromProtocol,
    t.data?.sourceProtocol,
    t.data?.sourceVenue,
  ];
  const sharedCandidates = [
    t.protocol,
    t.venue,
    t.dex,
    t.subDex,
    t.metadata?.protocol,
    t.metadata?.venue,
    t.metadata?.dex,
    t.metadata?.subDex,
    t.data?.protocol,
    t.data?.venue,
    t.data?.dex,
    t.data?.subDex,
  ];

  const hip3Venue = firstHip3Venue([
    ...(t.type === "deposit" ? destinationCandidates : sourceCandidates),
    ...sharedCandidates,
  ]);
  if (hip3Venue) return hip3Venue;

  const nestedHip3Venue = findHip3VenueDeep({
    metadata: t.metadata,
    data: t.data,
    transfer: t,
  });
  if (nestedHip3Venue) return nestedHip3Venue;

  const protocol = String(t.protocol ?? "").trim().toLowerCase();
  return protocol || "unknown";
}

function normalizeTransferStatus(t: Transfer): "pending" | "confirmed" | "failed" {
  const statusCandidates = [
    t.withdrawalStatus,
    t.transferStatus,
    t.state,
    t.metadata?.withdrawalStatus,
    t.metadata?.status,
    t.data?.withdrawalStatus,
    t.data?.status,
    t.status,
  ];
  const normalized = statusCandidates
    .map((status) => String(status ?? "").trim().toLowerCase())
    .filter(Boolean);

  if (normalized.some((status) =>
    ["failed", "error", "rejected", "cancelled", "canceled"].includes(status),
  )) {
    return "failed";
  }
  if (normalized.some((status) =>
    ["initiated", "pending", "processing", "queued", "submitted", "in_progress"].includes(status),
  )) {
    return "pending";
  }
  if (
    t.type === "withdrawal" &&
    t.protocol === "01" &&
    !t.txHash &&
    normalized.some((status) => ["confirmed", "success", "completed", "complete"].includes(status))
  ) {
    return "pending";
  }
  if (normalized.some((status) =>
    ["confirmed", "success", "completed", "complete"].includes(status),
  )) {
    return "confirmed";
  }
  return "pending";
}

// ─── Activity position types ───
interface PositionLeg {
  protocol: string;
  symbol?: string;
  marginUsd: number;
  notionalUsd: number;
  leverage: number;
  entryPrice: number | null;
  liquidationPrice: number | null;
  txSignature: string | null;
  status: string;
}

interface ActivityPosition {
  publicId: string;
  symbol: string;
  status: "open" | "closing" | "closed" | "liquidated" | "error";
  long: PositionLeg;
  short: PositionLeg;
  sizeAsset: number | null;
  totalMargin: number;
  closeReason: string | null;
  closeReasonLabel: string | null;
  realizedPnl: number | null;
  closeLongTx: string | null;
  closeShortTx: string | null;
  createdAt: string;
  closedAt: string | null;
  /** Backend-stored at trade time. When `true`, ACLP auto-close triggers
   *  (liquidation-proximity, OI-cascade, equity-drawdown) were suppressed
   *  for this position. Used by the activity row to render the ShieldOff
   *  indicator. May be absent on positions opened before the field was
   *  surfaced — treat undefined as "default ACLP behavior". */
  disableAclp?: boolean | null;
}

interface ActivitySummary {
  totalPositions: number;
  totalRealizedPnl: number;
  countByStatus: Record<string, number>;
}

import { getCloseActivityType } from "@/lib/autoclose-reasons";

function mapCloseType(pos: ActivityPosition): UnifiedActivityType {
  if (pos.status === "liquidated") return "liquidation";
  if (pos.status === "error") return "error";
  return getCloseActivityType(pos.closeReason);
}

function buildPositionActivityRow(
  pos: ActivityPosition,
  event: "open" | "close",
): UnifiedActivityRow {
  const type: UnifiedActivityType =
    event === "open" ? "open_arb" : mapCloseType(pos);
  const pnl = pos.realizedPnl ?? 0;
  const margin = pos.totalMargin || ((pos.long?.marginUsd ?? 0) + (pos.short?.marginUsd ?? 0));
  const longSymbol = pos.long?.symbol ?? pos.symbol;
  const shortSymbol = pos.short?.symbol ?? pos.symbol;
  const pairLabel =
    longSymbol && shortSymbol && longSymbol !== shortSymbol
      ? `${longSymbol} / ${shortSymbol}`
      : longSymbol || shortSymbol || pos.symbol || "—";

  let value = `$${margin.toFixed(2)}`;
  let valueSuffix: string | undefined;
  let isNegative = false;

  if (type !== "open_arb" && pnl !== 0) {
    isNegative = pnl < 0;
    value = `${isNegative ? "-" : ""}$${Math.abs(pnl).toFixed(2)}`;
    if (margin > 0) valueSuffix = `${pnl >= 0 ? "+" : ""}${((pnl / margin) * 100).toFixed(0)}%`;
  }

  return {
    id: `pos-${event}-${pos.publicId}`,
    token: pairLabel,
    tokenIcon: getTokenIcon(longSymbol ?? pos.symbol ?? ""),
    value,
    valueNum: pnl || margin,
    valueSuffix,
    isNegative,
    isPending: pos.status === "closing",
    protocolFrom: pos.long?.protocol ?? "unknown",
    protocolTo: pos.short?.protocol ?? "unknown",
    protocolNote: type === "auto_close" && pos.closeReasonLabel ? `(${pos.closeReasonLabel.toLowerCase()})` : undefined,
    type,
    timestamp:
      event === "open"
        ? pos.createdAt ?? new Date().toISOString()
        : pos.closedAt ?? pos.createdAt ?? new Date().toISOString(),
    txHash:
      event === "open"
        ? pos.long?.txSignature ?? pos.short?.txSignature ?? null
        : pos.closeLongTx ?? pos.closeShortTx ?? null,
    tokenAmount: pos.sizeAsset ?? null,
    autoCloseDisabled: pos.disableAclp === true,
  };
}

function positionToRows(pos: ActivityPosition): UnifiedActivityRow[] {
  if (pos.status === "error") {
    return [buildPositionActivityRow(pos, "close")];
  }

  const rows = [buildPositionActivityRow(pos, "open")];
  if (pos.status !== "open") {
    rows.push(buildPositionActivityRow(pos, "close"));
  }
  return rows;
}

export function useUnifiedActivity(authenticated: boolean) {
  const transfersQuery = useQuery<Transfer[]>({
    queryKey: ["unified-transfers"],
    queryFn: async () => {
      try {
        const h = authHeaders();
        if (!h) return [];
        const res = await fetch(`${PERP_HEDGE_API_URL}/arb/transfers?limit=100`, { method: "GET", headers: h });
        if (!res.ok) return [];
        const data = await res.json();
        if (transferClickPollCount > 0) transferClickPollCount--;
        return data?.transfers ?? [];
      } catch { return []; }
    },
    enabled: authenticated,
    staleTime: 0,
    gcTime: 30 * 60 * 1000,
    refetchInterval: () => transferClickPollCount > 0 ? 15_000 : false,
    retry: false,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    placeholderData: (prev: Transfer[] | undefined) => prev,
  });

  const activityQuery = useQuery<{ positions: ActivityPosition[]; summary: ActivitySummary | null }>({
    queryKey: ["unified-activity"],
    queryFn: async () => {
      try {
        const h = authHeaders();
        if (!h) return { positions: [], summary: null };
        const res = await fetch(`${PERP_HEDGE_API_URL}/arb/activity?limit=100`, { method: "GET", headers: h });
        if (!res.ok) return { positions: [], summary: null };
        const data = await res.json();
        return { positions: data?.positions ?? [], summary: data?.summary ?? null };
      } catch { return { positions: [], summary: null }; }
    },
    enabled: authenticated,
    staleTime: 10_000,
    gcTime: 30 * 60 * 1000,
    refetchInterval: 15_000,
    retry: false,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    placeholderData: (prev: { positions: ActivityPosition[]; summary: ActivitySummary | null } | undefined) => prev,
  });

  const rows = useMemo<UnifiedActivityRow[]>(() => {
    const xferRows = (transfersQuery.data ?? []).map(transferToRow);
    const posRows = (activityQuery.data?.positions ?? []).flatMap(positionToRows);
    return [...xferRows, ...posRows].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [transfersQuery.data, activityQuery.data]);

  return {
    rows,
    summary: activityQuery.data?.summary ?? null,
    isPending: transfersQuery.isPending || activityQuery.isPending,
  };
}
