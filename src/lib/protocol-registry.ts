/**
 * Protocol Registry — Single source of truth for all DEX/protocol configuration.
 *
 * To ADD a new DEX:    Add an entry to PROTOCOL_REGISTRY + add its id to ENABLED_PROTOCOLS.
 * To DISABLE a DEX:    Comment out its id in ENABLED_PROTOCOLS.
 * To REMOVE a DEX:     Delete its entry from PROTOCOL_REGISTRY.
 */

// ─── Protocol Definition ───

export interface ProtocolDefinition {
  id: string;
  label: string;
  logo: string;
  chain: "solana" | "evm";
  depositAsset: "USDC" | "USDT" | "SOL";
  depositMint: string;
  fundingInterval: { label: string; hoursPerInterval: number };
  /** Whether this protocol supports live orderbook WebSocket for slippage */
  hasOrderbook: boolean;
  orderbookWsUrl: string | null;
  explorerBaseUrl: string;
  minDeposit: number;
  /** Whether interval is variable per market (detected from history) */
  variableInterval: boolean;
}

// ─── Registry ───

export const PROTOCOL_REGISTRY = {
  drift: {
    id: "drift",
    label: "Drift",
    logo: "/images/markets-logo/drift.webp",
    chain: "solana",
    depositAsset: "USDC",
    depositMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    fundingInterval: { label: "1hr", hoursPerInterval: 1 },
    hasOrderbook: true,
    orderbookWsUrl: "wss://dlob.drift.trade/ws",
    explorerBaseUrl: "https://solscan.io/tx/",
    minDeposit: 0,
    variableInterval: false,
  },
  flash: {
    id: "flash",
    label: "Flash",
    logo: "/images/markets-logo/drift.webp",
    chain: "solana",
    depositAsset: "USDC",
    depositMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    fundingInterval: { label: "1hr", hoursPerInterval: 1 },
    hasOrderbook: false,
    orderbookWsUrl: null,
    explorerBaseUrl: "https://solscan.io/tx/",
    minDeposit: 0,
    variableInterval: false,
  },
  pacifica: {
    id: "pacifica",
    label: "Pacifica",
    logo: "/images/markets-logo/pacifica.webp",
    chain: "solana",
    depositAsset: "USDC",
    depositMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    fundingInterval: { label: "1hr", hoursPerInterval: 1 },
    hasOrderbook: true,
    orderbookWsUrl: "wss://ws.pacifica.fi/ws",
    explorerBaseUrl: "https://solscan.io/tx/",
    minDeposit: 5,
    variableInterval: false,
  },
  hyperliquid: {
    id: "hyperliquid",
    label: "Hyperliquid",
    logo: "/images/markets-logo/hype.webp",
    chain: "evm",
    depositAsset: "SOL",
    depositMint: "So11111111111111111111111111111111111111112",
    fundingInterval: { label: "1hr", hoursPerInterval: 1 },
    hasOrderbook: true,
    orderbookWsUrl: "wss://api.hyperliquid.xyz/ws",
    explorerBaseUrl: "https://solscan.io/tx/",
    minDeposit: 0.12,
    variableInterval: false,
  },
  aster: {
    id: "aster",
    label: "Aster",
    logo: "/images/markets-logo/aster.webp",
    chain: "solana",
    depositAsset: "USDT",
    depositMint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    fundingInterval: { label: "8hr", hoursPerInterval: 8 },
    hasOrderbook: true,
    orderbookWsUrl: "wss://fstream.asterdex.com/ws",
    explorerBaseUrl: "https://app.asterdex.com/explorer/tx/",
    minDeposit: 1,
    variableInterval: true,
  },
  lighter: {
    id: "lighter",
    label: "Lighter",
    logo: "/images/markets-logo/lighter.webp",
    chain: "solana",
    depositAsset: "USDC",
    depositMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    fundingInterval: { label: "1hr", hoursPerInterval: 8 },
    hasOrderbook: true,
    orderbookWsUrl: "wss://mainnet.zklighter.elliot.ai/stream",
    explorerBaseUrl: "https://solscan.io/tx/",
    minDeposit: 5,
    variableInterval: false,
  },
  "01": {
    id: "01",
    label: "01",
    logo: "/images/markets-logo/01.webp",
    chain: "solana",
    depositAsset: "USDC",
    depositMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    fundingInterval: { label: "1hr", hoursPerInterval: 1 },
    hasOrderbook: true,
    orderbookWsUrl: "wss://zo-mainnet.n1.xyz/ws/deltas",
    explorerBaseUrl: "https://solscan.io/tx/",
    // staging set minDeposit:1 for 01 — keep it.
    minDeposit: 1,
    variableInterval: false,
  },
  phoenix: {
    id: "phoenix",
    label: "Phoenix",
    logo: "/images/markets-logo/phoenix.svg",
    chain: "solana",
    depositAsset: "USDC",
    depositMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    fundingInterval: { label: "1hr", hoursPerInterval: 1 },
    hasOrderbook: true,
    orderbookWsUrl: "wss://perp-api.phoenix.trade/v1/ws",
    explorerBaseUrl: "https://solscan.io/tx/",
    minDeposit: 1,
    variableInterval: false,
  },
  // ─── HIP-3 curated Hyperliquid sub-dexes ───
  // Each has its own isolated HL perp margin account scoped to a collateral
  // token. User-facing deposit asset is USDC on Solana — backend bridges to
  // HL spot and auto-swaps into the target collateral before sendAsset.
  // Per-dex SVG logos at /public/images/markets-logo/hip3-<name>.svg.
  "hl:xyz": {
    id: "hl:xyz",
    label: "XYZ",
    logo: "/images/markets-logo/hip3-xyz.svg",
    chain: "solana",
    depositAsset: "USDC",
    depositMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    fundingInterval: { label: "1hr", hoursPerInterval: 1 },
    hasOrderbook: true,
    orderbookWsUrl: "wss://api.hyperliquid.xyz/ws",
    explorerBaseUrl: "https://solscan.io/tx/",
    minDeposit: 0,
    variableInterval: false,
  },
  "hl:flx": {
    id: "hl:flx",
    label: "Usefelix",
    logo: "/images/markets-logo/hip3-felix.svg",
    chain: "solana",
    depositAsset: "USDC",
    depositMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    fundingInterval: { label: "1hr", hoursPerInterval: 1 },
    hasOrderbook: true,
    orderbookWsUrl: "wss://api.hyperliquid.xyz/ws",
    explorerBaseUrl: "https://solscan.io/tx/",
    minDeposit: 0,
    variableInterval: false,
  },
  "hl:hyna": {
    id: "hl:hyna",
    label: "HyENA",
    logo: "/images/markets-logo/hip3-hyENA.svg",
    chain: "solana",
    depositAsset: "USDC",
    depositMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    fundingInterval: { label: "1hr", hoursPerInterval: 1 },
    hasOrderbook: true,
    orderbookWsUrl: "wss://api.hyperliquid.xyz/ws",
    explorerBaseUrl: "https://solscan.io/tx/",
    minDeposit: 0,
    variableInterval: false,
  },
  "hl:km": {
    id: "hl:km",
    label: "Markets",
    logo: "/images/markets-logo/hip3-km.svg",
    chain: "solana",
    depositAsset: "USDC",
    depositMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    fundingInterval: { label: "1hr", hoursPerInterval: 1 },
    hasOrderbook: true,
    orderbookWsUrl: "wss://api.hyperliquid.xyz/ws",
    explorerBaseUrl: "https://solscan.io/tx/",
    minDeposit: 0,
    variableInterval: false,
  },
  "hl:cash": {
    id: "hl:cash",
    label: "Dreamcash",
    logo: "/images/markets-logo/hip3-dreamcash.svg",
    chain: "solana",
    depositAsset: "USDC",
    depositMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    fundingInterval: { label: "1hr", hoursPerInterval: 1 },
    hasOrderbook: true,
    orderbookWsUrl: "wss://api.hyperliquid.xyz/ws",
    explorerBaseUrl: "https://solscan.io/tx/",
    minDeposit: 0,
    variableInterval: false,
  },
  "hl:para": {
    id: "hl:para",
    label: "Paragon",
    logo: "/images/markets-logo/hip3-paragon.svg",
    chain: "solana",
    depositAsset: "USDC",
    depositMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    fundingInterval: { label: "1hr", hoursPerInterval: 1 },
    hasOrderbook: true,
    orderbookWsUrl: "wss://api.hyperliquid.xyz/ws",
    explorerBaseUrl: "https://solscan.io/tx/",
    minDeposit: 0,
    variableInterval: false,
  },
} as const satisfies Record<string, ProtocolDefinition>;

// ─── Types derived from registry ───

/** All known protocol IDs */
export type ProtocolId = keyof typeof PROTOCOL_REGISTRY;

/** Array of all protocol IDs */
export const ALL_PROTOCOL_IDS = Object.keys(PROTOCOL_REGISTRY) as ProtocolId[];

// ─── Kill Switch ───
// Comment out a protocol ID to instantly disable it across the entire app.

export const ENABLED_PROTOCOLS: readonly ProtocolId[] = [
  // "drift",  // disabled
  // "flash",  // disabled: no direct funding rate
  "pacifica",
  "hyperliquid",
  "aster",
  "lighter",
  "01",
  "phoenix",
  // HIP-3 curated sub-dexes. First-class venues alongside Pacifica/Lighter/etc:
  // they get their own screener column and surface in deposit/withdraw lists.
  // Deposit/withdraw still bridges through HL spot + auto-swaps collateral.
  "hl:xyz",
  "hl:flx",
  "hl:hyna",
  "hl:km",
  "hl:cash",
  "hl:para",
] as const;

// ─── HIP-3 ────────────────────────────────────────────────────────────────
//
// Six Hyperliquid HIP-3 dexes. Protocol ids are `hl:<dex>`. Each has its
// own isolated HL margin account scoped to the collateral token below.
// Deposits/withdraws on this venue always start from USDC on Solana; the
// backend bridges and auto-swaps to the correct collateral before
// sendAsset'ing to the HIP-3 perp.

export type Hip3DexName = "xyz" | "flx" | "hyna" | "km" | "cash" | "para";
export type Hip3ProtocolId = `hl:${Hip3DexName}`;

export const HIP3_DEXES = {
  xyz:  { collateral: "USDC" },
  flx:  { collateral: "USDH" },
  hyna: { collateral: "USDE" },
  km:   { collateral: "USDH" },
  cash: { collateral: "USDT" },
  para: { collateral: "USDC" },
} as const;

export const HIP3_PROTOCOL_IDS: readonly Hip3ProtocolId[] = [
  "hl:xyz",
  "hl:flx",
  "hl:hyna",
  "hl:km",
  "hl:cash",
  "hl:para",
] as const;

/** Validation-copy constant, mirrored from backend. */
export const HIP3_VENUE_ERROR_COPY =
  'Use "main" or one of the curated HIP-3 protocols (hl:xyz, hl:flx, hl:hyna, hl:km, hl:cash, hl:para).';

export function isHip3ProtocolId(p: string): p is Hip3ProtocolId {
  if (!p.startsWith("hl:")) return false;
  return (p.slice(3) as Hip3DexName) in HIP3_DEXES;
}

export function parseHip3ProtocolId(p: string): Hip3DexName | null {
  if (!p.startsWith("hl:")) return null;
  const name = p.slice(3) as Hip3DexName;
  return name in HIP3_DEXES ? name : null;
}

/** Collateral token for a HIP-3 dex (USDC / USDH / USDE / USDT). */
export function getHip3Collateral(id: string): string | null {
  const name = parseHip3ProtocolId(id);
  return name ? HIP3_DEXES[name].collateral : null;
}

/** Set for O(1) lookups */
const _enabledSet = new Set<string>(ENABLED_PROTOCOLS);

// ─── Helpers ───

export function getProtocol(id: string): ProtocolDefinition | undefined {
  return (PROTOCOL_REGISTRY as Record<string, ProtocolDefinition>)[id];
}

export function getProtocolLabel(id: string): string {
  return getProtocol(id)?.label ?? id;
}

export function getProtocolLogo(id: string): string {
  return getProtocol(id)?.logo ?? "/images/markets-logo/drift.webp";
}

export function getProtocolIntervalHours(id: string): number {
  return getProtocol(id)?.fundingInterval.hoursPerInterval ?? 1;
}

/**
 * How often this protocol's history entries are recorded (in hours).
 * Lighter: entries stored every 1h even though each rate covers 8h.
 * All others: recording cadence matches the settlement interval.
 */
export function getProtocolRecordingCadenceHours(id: string): number {
  if (id === "lighter") return 1;
  return getProtocolIntervalHours(id);
}

export function isProtocolEnabled(id: string): boolean {
  return _enabledSet.has(id);
}

export function isVariableInterval(id: string): boolean {
  return getProtocol(id)?.variableInterval ?? false;
}

export function getOrderbookProtocols(): ProtocolDefinition[] {
  return ENABLED_PROTOCOLS
    .map((id) => PROTOCOL_REGISTRY[id])
    .filter((p) => p.hasOrderbook);
}

export function getWithdrawableProtocols(): ProtocolDefinition[] {
  return ENABLED_PROTOCOLS
    .filter((id) => id !== "flash")
    .map((id) => PROTOCOL_REGISTRY[id]);
}

/**
 * Get the effective margin for a position leg, adjusted per protocol.
 * Lighter: margin + |pnl| — PnL is not reflected in the raw margin returned by the API,
 *   so we add it back to get the true current value of the position.
 * All others: margin as-is.
 */
export function getEffectiveMargin(protocol: string, margin: number, pnl: number): number {
  if (protocol === "lighter") return margin + Math.abs(pnl);
  return margin;
}

export function getExplorerUrl(protocol: string, txHash: string): string {
  const p = getProtocol(protocol);
  if (!p) return `https://solscan.io/tx/${txHash}`;
  return `${p.explorerBaseUrl}${txHash}`;
}

// ─── Backward-compatible lookup maps (auto-derived) ───

export const PROTOCOL_LABELS: Record<string, string> = Object.fromEntries(
  ALL_PROTOCOL_IDS.map((id) => [id, PROTOCOL_REGISTRY[id].label]),
);

export const PROTOCOL_LOGOS: Record<string, string> = Object.fromEntries(
  ALL_PROTOCOL_IDS.map((id) => [id, PROTOCOL_REGISTRY[id].logo]),
);

/** Alias for PROTOCOL_LOGOS — used in some components */
export const PROTOCOL_ICONS: Record<string, string> = PROTOCOL_LOGOS;

export const PROTOCOL_HOURS_PER_INTERVAL: Record<string, number> = Object.fromEntries(
  ALL_PROTOCOL_IDS.map((id) => [id, PROTOCOL_REGISTRY[id].fundingInterval.hoursPerInterval]),
);

// ─── Enabled protocol columns config (for table generation) ───

/** Protocol IDs used for funding rate columns in the arb screener
 *  (excludes flash, which has no direct funding rate). */
export const ARB_COLUMN_PROTOCOLS = ENABLED_PROTOCOLS.filter((id) => id !== "flash");

/** Protocol IDs used in selectLongShort calculations. */
export const ARB_RATE_PROTOCOLS = ENABLED_PROTOCOLS.filter((id) => id !== "flash");

/** Field-key for `fundingRate<Protocol>` accessors on `ArbitrageRowType`.
 *  Pascal-cases each `:`-segment so `hl:xyz` → `fundingRateHlXyz`,
 *  `01` → `fundingRate01`, `lighter` → `fundingRateLighter`. */
export function protocolToFundingRateField(id: string): string {
  const pascal = id
    .split(":")
    .map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1) : p))
    .join("");
  return `fundingRate${pascal}`;
}

/** Protocols with orderbook support (for slippage/execution cost) */
export const ORDERBOOK_SUPPORTED_IDS = new Set(
  getOrderbookProtocols().map((p) => p.id),
);

// ─── Trade modal helpers ───

/** Protocols available for long/short selection in trade modals */
export const TRADE_PROTOCOLS = ENABLED_PROTOCOLS.filter((id) => id !== "flash");

/** First enabled trade protocol — used as fallback default */
export const DEFAULT_TRADE_PROTOCOL: ProtocolId =
  (TRADE_PROTOCOLS[0] as ProtocolId | undefined) ?? "pacifica";

/** Build funding-rate entries for selectLongShort, filtering to enabled only */
export function buildEnabledRates(
  rateMap: Partial<Record<string, number | null>>,
): Array<{ protocol: string; fundingRate: number | null }> {
  return TRADE_PROTOCOLS.map((id) => ({
    protocol: id,
    fundingRate: rateMap[id] ?? null,
  }));
}

/**
 * Spot-perp: pick the best perp protocol from enabled protocols.
 * Prefers the highest positive rate; falls back to highest absolute rate.
 */
export function pickBestPerpProtocol(
  rateMap: Partial<Record<string, number | null>>,
): ProtocolId {
  const candidates = TRADE_PROTOCOLS
    .filter((id) => rateMap[id] != null)
    .map((id) => ({ protocol: id, rate: rateMap[id]! }));

  const positives = candidates.filter((c) => c.rate > 0);
  const list = positives.length > 0 ? positives : candidates;
  if (list.length === 0) return DEFAULT_TRADE_PROTOCOL;
  return list.reduce((best, cur) => (cur.rate > best.rate ? cur : best))
    .protocol;
}
