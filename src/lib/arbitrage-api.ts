/**
 * Arbitrage API client for funding rate arbitrage between Drift and Flash Trade
 */

import { PERP_HEDGE_API_URL } from "@/lib/perp-api-url";

// Position types for GET /api/arb/positions
export interface Position {
  symbol: string;
  direction: "long" | "short";
  size: {
    usd: number;
    asset: number;
  };
  pnl: number;
  entryPrice: number;
  leverage: number;
  margin: number;
  /** Cumulative funding income for this leg from the backend (positive =
   *  earned, negative = paid net). Sourced from /arb/positions/v2 response. */
  fundingIncome?: number;
  /** True when the backend returned live: null for this leg (e.g. Aster
   *  rate-limited). The FE substitutes cached data when this is set. */
  liveDataMissing?: boolean;
  takeProfitPrice?: number | null;
  stopLossPrice?: number | null;
  triggerPrices?: {
    tp?: number;
    sl?: number;
  };
}

export interface ArbitragePositionPair {
  pairId?: number;
  publicId?: string;
  symbol?: string;
  status?: string;
  long: Position & { protocol: ArbExecProtocol; symbol: string };
  short: Position & { protocol: ArbExecProtocol; symbol: string };
  totalMargin?: number;
  createdAt?: string;
}

export interface PositionsResponse {
  status: "success";
  positions: {
    drift: Position[];
    flash: Position[];
    pacifica?: Position[];
    hyperliquid?: Position[];
    aster?: Position[];
    lighter?: Position[];
    "01"?: Position[];
    phoenix?: Position[];
    "hl:xyz"?: Position[];
    "hl:flx"?: Position[];
    "hl:hyna"?: Position[];
    "hl:km"?: Position[];
    "hl:cash"?: Position[];
    "hl:para"?: Position[];
  };
  /** Paired /arb/positions/v2 rows. Prefer these for UI rows because each
   * leg carries its own dex-specific symbol. */
  pairs?: ArbitragePositionPair[];
  totalPnl: number;
  /** Lifetime cumulative funding in USD across all open + closed legs.
   *  Positive when the aggregate position earned more funding than it
   *  paid. Backend-sourced from /arb/positions; absent on older builds. */
  totalFundingUsd?: number;
  /** Gross funding received (sum of per-leg positive accruals). */
  fundingEarned?: number;
  /** Gross funding paid (absolute sum of per-leg negative accruals). */
  fundingPaid?: number;
  /** True when the /arb/tp-sl lookup failed (network error, 429, timeout).
   *  False/absent means the lookup ran — if no triggers came back it's
   *  intentional (trigger fired or was removed). Used by the hook to decide
   *  whether to preserve stale TP/SL values from the previous response. */
  tpSlLookupFailed?: boolean;
}

export interface TpSlLookupEntry {
  protocol: ArbExecProtocol;
  market: string;
}

export interface TpSlLookupRequest {
  positions: TpSlLookupEntry[];
}

export interface TpSlLookupResult {
  protocol: ArbExecProtocol;
  market: string;
  status: "success" | "not_found" | "error";
  direction?: "long" | "short";
  triggerPrices?: Position["triggerPrices"];
  error?: string;
}

export interface TpSlLookupResponse {
  status: "success" | "partial";
  results: TpSlLookupResult[];
}

/**
 * Hyperliquid deposit/withdraw venue. `main` routes to the existing USDC
 * perp account; `hl:*` routes to a HIP-3 sub-dex with an auto-swap into
 * its collateral token (see protocol-registry HIP3_DEXES).
 */
export type HyperliquidVenue =
  | "main"
  | "hl:xyz"
  | "hl:flx"
  | "hl:hyna"
  | "hl:km"
  | "hl:cash"
  | "hl:para";

export interface FundingStats {
  interval?: "1hr" | "8hr" | string;
  raw_bps?: number;
  normalized?: {
    label?: string;
    hr1_bps?: number;
    hr8_bps?: number;
    daily_bps?: number;
    yearly_apr_pct?: number;
  };
}

/**
 * Per-venue market quote — the same shape across Pacifica / HL / Aster / Lighter / 01.
 * Fields marked optional are supplied by the staging API and may be undefined
 * on the legacy prod API.
 */
export interface VenueQuote {
  fundingRate: string;
  fundingRateApr: string;
  averageFundingRate: string | null;
  openInterest: {
    long: number;
    short: number;
  };
  oraclePrice: number;
  /** Venue mark price, when provided by /arb/markets. */
  markPrice?: number;
  /** Venue index price, when provided by /arb/markets. */
  indexPrice?: number;
  maxLeverage?: number;
  /** Per-market funding interval in hours (staging only). */
  fundingIntervalHours?: number;
  /** Next funding settlement time (epoch ms, staging only). */
  nextFundingTime?: number;
  /** Contract size multiplier — e.g. 1000 for kBONK. Default 1. (staging only) */
  unitScale?: number;
  /** Upstream native symbol (e.g. "BTCUSD" on 01). (staging only) */
  nativeSymbol?: string;
  /** Backend-normalized funding stats from /arb/markets. */
  fundingStats?: FundingStats;
}

// Market types for GET /api/arb/markets
//
// Unified shape: downstream code always sees this nested form. The API can
// return either this nested shape (legacy prod) or a flat [{protocol, base, …}]
// list (staging). `normalizeMarketsResponse` pivots the flat form into this
// shape. Extra fields (fundingIntervalHours, nextFundingTime, unitScale,
// dex) come through from staging when present and are simply `undefined`
// on prod.
export interface ArbitrageMarket {
  symbol: string;
  drift: {
    marketIndex: number;
    fundingRate: string;
    fundingRateApr: string;
    openInterest: {
      long: number;
      short: number;
    };
    fees: {
      taker: string;
      maker: string;
    };
    oraclePrice: number;
    markPrice?: number;
    indexPrice?: number;
    maxLeverage: number;
    fundingIntervalHours?: number;
    nextFundingTime?: number;
    unitScale?: number;
    fundingStats?: FundingStats;
  } | null;
  flash: {
    marketId: {
      symbol: string;
      pool: string;
    };
    fees: {
      open: string;
      marginPerHour: string;
    };
    oraclePrice: number;
    markPrice?: number;
    indexPrice?: number;
    maxLeverage?: number;
  } | null;
  // HEAD already collapses these venues into the shared VenueQuote alias
  // (which includes fundingIntervalHours / nextFundingTime / unitScale that
  // staging's inline shape was missing for everyone except 01). Keep HEAD.
  pacifica: VenueQuote | null;
  hyperliquid: VenueQuote | null;
  aster: VenueQuote | null;
  lighter: VenueQuote | null;
  "01": VenueQuote | null;
  phoenix: VenueQuote | null;
  // HIP-3 curated sub-dexes. Absent from a symbol if no HIP-3 dex lists it.
  "hl:xyz"?: VenueQuote | null;
  "hl:flx"?: VenueQuote | null;
  "hl:hyna"?: VenueQuote | null;
  "hl:km"?: VenueQuote | null;
  "hl:cash"?: VenueQuote | null;
  "hl:para"?: VenueQuote | null;
  /** Best live 1h-normalized spread, e.g. "0.00312%". */
  maxArb?: string;
  /** Best live spread annualized, e.g. "27.33%". */
  maxArbApr?: string;
  /** Backend-selected lowest-funding protocol for this exact ticker. */
  longProtocol?: ArbExecProtocol;
  /** Backend-selected highest-funding protocol for this exact ticker. */
  shortProtocol?: ArbExecProtocol;
  arbOpportunity: {
    spreadApr: number;
    suggestedDirection: {
      drift: "long" | "short";
      flash: "long" | "short";
    };
  };
}

export interface MarketsResponse {
  status: "success";
  count: number;
  markets: ArbitrageMarket[];
}

// Close types for POST /api/arb/close
/** Backend accepts hl:* in the close list — keep as string[] to avoid
 *  churning this interface whenever new dexes ship. Validation on server. */
export interface CloseArbRequest {
  market: string; // Market symbol (e.g., "SOL")
  protocols: string[]; // Protocols to close on (e.g., ["drift", "pacifica"])
  publicId?: string; // UUID from /arb/positions/v2 — backend resolves per-leg tickers
  pairId?: number;
  jitoFeeSol?: number; // Optional Jito bundle tip in SOL (default: 0.0001)
}

export interface CloseArbClosedEntry {
  direction: "long" | "short";
  txSignature?: string;
  orderId?: number;
  pnl: number;
}

export interface CloseArbResponse {
  status: "success" | "error";
  message: string;
  closed?: Record<string, CloseArbClosedEntry>;
  totalPnl?: number;
  bundleId?: string;
  error?: string;
}

// Trade types for POST /api/arb/trade
/**
 * Protocol id accepted by /arb/trade, /arb/close, /arb/set-tp-sl.
 *
 * Union of the base venues plus the 6 curated HIP-3 sub-dexes. Backend
 * enforces validation; client stays protocol-agnostic at the execution
 * seam so no per-protocol branch is needed to support new venues.
 */
export type ArbExecProtocol =
  | "drift"
  | "flash"
  | "pacifica"
  | "hyperliquid"
  | "aster"
  | "lighter"
  | "01"
  | "phoenix"
  | "hl:xyz"
  | "hl:flx"
  | "hl:hyna"
  | "hl:km"
  | "hl:cash"
  | "hl:para";

export interface TradeRequest {
  market: string; // Market symbol (e.g., "SOL")
  totalMarginUsd: number; // Total margin split evenly between both positions
  leverage: number; // Position leverage
  protocols: {
    // ArbExecProtocol is the canonical union — it already includes "01"
    // (added in staging) and the HIP-3 sub-dexes (added on this branch).
    long: ArbExecProtocol;
    short: ArbExecProtocol;
  };
  jitoFeeSol?: number; // Optional Jito bundle tip in SOL (default: 0.0001)
  /** When true, suppresses backend auto-close triggers. UI default is `true`
   *  (Autoclose toggle OFF) — flip it via the Autoclose switch in the trade modal. */
  disableAutoclose?: boolean;
}

export interface TradeV2LegRequest {
  dex: ArbExecProtocol;
  ticker: string;
}

export interface TradeV2Request {
  long: TradeV2LegRequest;
  short: TradeV2LegRequest;
  totalMarginUsd: number;
  leverage: number;
  jitoFeeSol?: number;
  disableAutoclose?: boolean;
}

export interface TradePosition {
  txSignature?: string;
  orderId?: number;
  status?: string;
  direction: "long" | "short";
  margin: number;
  notional: number;
  error?: string;
}

export interface TradeFees {
  total: number;
}

export interface TradeResponse {
  status: string; // "success" | "sent" | "partial" | "error" etc.
  message: string;
  error?: string;
  /** Keyed by ArbExecProtocol — backend may emit hl:* entries for HIP-3
   *  legs and "01" for the new venue. Partial-record shape keeps the type
   *  explicit about "any protocol". */
  positions: Partial<Record<ArbExecProtocol, TradePosition>>;
  fees?: TradeFees;
  bundleId?: string;
  pairId?: number;
}

// ─── Staging-shape normalizer ───
//
// Staging returns a flat list of per-(protocol, symbol) entries. Production
// returns a symbol-keyed object. This normalizer detects the flat shape and
// pivots it into the nested ArbitrageMarket form used throughout the app.
// Prod responses fall through unchanged.

interface StagingMarketEntry {
  protocol: string;
  nativeSymbol: string;
  base: string;
  quote?: string;
  unitScale?: number;
  dex?: string;
  fundingRate?: string;
  fundingRateApr?: string;
  averageFundingRate?: string | null;
  openInterest?: { long: number; short: number };
  oraclePrice?: number;
  markPrice?: number;
  mark_price?: number;
  markPx?: number;
  mark_px?: number;
  mark?: number;
  indexPrice?: number;
  index_price?: number;
  indexPx?: number;
  index_px?: number;
  maxLeverage?: number;
  fundingIntervalHours?: number;
  nextFundingTime?: number;
  fundingStats?: FundingStats;
  maxArb?: string;
  maxArbApr?: string;
  longProtocol?: ArbExecProtocol;
  shortProtocol?: ArbExecProtocol;
}

const KNOWN_VENUE_KEYS = new Set([
  "drift",
  "flash",
  "pacifica",
  "hyperliquid",
  "aster",
  "lighter",
  "01",
  "phoenix",
  // HIP-3 curated sub-dexes
  "hl:xyz",
  "hl:flx",
  "hl:hyna",
  "hl:km",
  "hl:cash",
  "hl:para",
]);

function isStagingShape(
  markets: readonly unknown[],
): markets is readonly StagingMarketEntry[] {
  const first = markets[0] as Record<string, unknown> | undefined;
  return !!first && typeof first.protocol === "string" && typeof first.base === "string";
}

/**
 * Convert a staging entry into a venue quote, or `null` when essential
 * pricing data is missing. Returning null (instead of coercing oraclePrice
 * or openInterest to 0) prevents the zeros from poisoning downstream
 * divisors (premium, notional, slippage). Callers must skip the venue when
 * this returns null — same semantics as "venue did not quote this symbol".
 */
function entryToVenueQuote(e: StagingMarketEntry): VenueQuote | null {
  // Treat missing OR non-positive oraclePrice as "no quote". Oracle prices
  // can never legitimately be 0 for any tradeable market.
  if (
    typeof e.oraclePrice !== "number" ||
    !Number.isFinite(e.oraclePrice) ||
    e.oraclePrice <= 0
  ) {
    return null;
  }
  const openInterest = e.openInterest ?? { long: 0, short: 0 };
  const totalOpenInterest = (openInterest.long ?? 0) + (openInterest.short ?? 0);
  const fundingRate = e.fundingRate ?? "0%";
  const parsedFundingRate = parseFloat(fundingRate.replace("%", "").trim());
  const hasFundingRate = Number.isFinite(parsedFundingRate);
  if (
    !hasFundingRate ||
    Math.abs(parsedFundingRate) < 0.0000001 ||
    totalOpenInterest <= 0
  ) {
    return null;
  }
  return {
    fundingRate,
    fundingRateApr: e.fundingRateApr ?? "0%",
    averageFundingRate: e.averageFundingRate ?? null,
    // OI may be genuinely missing on some venues; keep zeros here but
    // downstream OI consumers must guard against `0` themselves (they do).
    openInterest,
    oraclePrice: e.oraclePrice,
    markPrice: numberField(e as unknown as Record<string, unknown>, "markPrice", "mark_price", "markPx", "mark_px", "mark"),
    indexPrice: numberField(e as unknown as Record<string, unknown>, "indexPrice", "index_price", "indexPx", "index_px"),
    maxLeverage: e.maxLeverage,
    // Lighter raw funding rates are 8h settlement values. Some upstream
    // payloads expose an hourly recording cadence here; keep the venue quote
    // semantics as settlement interval so FE math normalizes correctly.
    fundingIntervalHours: e.protocol === "lighter" ? 8 : e.fundingIntervalHours,
    nextFundingTime: e.nextFundingTime,
    unitScale: e.unitScale,
    nativeSymbol: e.nativeSymbol,
    fundingStats: e.fundingStats,
  };
}

function normalizeMarketsResponse(
  raw: { status: string; count?: number; markets: unknown[] },
): MarketsResponse {
  if (!Array.isArray(raw.markets) || raw.markets.length === 0) {
    return raw as MarketsResponse;
  }
  if (!isStagingShape(raw.markets)) {
    return raw as MarketsResponse;
  }

  // Pivot: bucket entries by `base` (the symbol) and assign each into its
  // venue slot. Unknown protocols are dropped with a console note.
  const bySymbol = new Map<string, ArbitrageMarket>();
  for (const entry of raw.markets) {
    const venue = entry.protocol;
    if (!KNOWN_VENUE_KEYS.has(venue)) continue;

    const symbol = entry.base.toUpperCase();
    let market = bySymbol.get(symbol);
    if (!market) {
      market = {
        symbol,
        drift: null,
        flash: null,
        pacifica: null,
        hyperliquid: null,
        aster: null,
        lighter: null,
        "01": null,
        phoenix: null,
        maxArb: entry.maxArb,
        maxArbApr: entry.maxArbApr,
        longProtocol: entry.longProtocol,
        shortProtocol: entry.shortProtocol,
        // HIP-3 slots are optional on the type; left absent (not null) so
        // downstream code can distinguish "dex does not list this symbol"
        // from "dex lists it but data is null".
        arbOpportunity: {
          spreadApr: 0,
          suggestedDirection: { drift: "long", flash: "short" },
        },
      };
      bySymbol.set(symbol, market);
    } else {
      market.maxArb ??= entry.maxArb;
      market.maxArbApr ??= entry.maxArbApr;
      market.longProtocol ??= entry.longProtocol;
      market.shortProtocol ??= entry.shortProtocol;
    }
    if (!market) continue;

    const quote = entryToVenueQuote(entry);
    if (!quote) continue; // missing oraclePrice → skip venue (treated as not-quoted)

    if (venue === "drift") {
      market.drift = {
        marketIndex: 0,
        fundingRate: quote.fundingRate,
        fundingRateApr: quote.fundingRateApr,
        openInterest: quote.openInterest,
        fees: { taker: "", maker: "" },
        oraclePrice: quote.oraclePrice,
        markPrice: quote.markPrice,
        indexPrice: quote.indexPrice,
        maxLeverage: quote.maxLeverage ?? 0,
        fundingIntervalHours: quote.fundingIntervalHours,
        nextFundingTime: quote.nextFundingTime,
        unitScale: quote.unitScale,
        fundingStats: quote.fundingStats,
      };
    } else if (venue === "flash") {
      // Staging doesn't currently emit flash; leave null if encountered.
      market.flash = null;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (market as any)[venue] = quote;
    }
  }

  return {
    status: "success",
    count: bySymbol.size,
    markets: Array.from(bySymbol.values()),
  };
}

/**
 * Fetch arbitrage markets from the new /api/arb/markets endpoint
 */
export async function fetchMarkets(
  idToken?: string,
  accessToken?: string,
): Promise<MarketsResponse> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  // Add Privy auth headers if provided - backend requires BOTH
  if (idToken) {
    headers["privy-id-token"] = idToken;
  }
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const url = `${PERP_HEDGE_API_URL}/arb/markets`;
  // Logging the headers object would leak the Privy id token and bearer.
  // Keep diagnostics presence-only.
  console.log("[fetchMarkets] Fetching from:", url);
  console.log("[fetchMarkets] ID token present:", !!idToken);
  console.log("[fetchMarkets] Access token present:", !!accessToken);

  const response = await fetch(url, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(30_000),
  });

  console.log("[fetchMarkets] Response status:", response.status);
  console.log("[fetchMarkets] Response ok:", response.ok);

  const responseText = await response.text();
  console.log("[fetchMarkets] Response body:", responseText.substring(0, 500));

  if (!response.ok) {
    throw new Error(`Failed to fetch markets: ${response.statusText}`);
  }

  const rawData = JSON.parse(responseText);
  const data = normalizeMarketsResponse(rawData);
  console.log("[fetchMarkets] Parsed data:", data);

  // Debug: Check for common markets that should have Drift data
  if (data.markets && Array.isArray(data.markets)) {
    const commonMarkets = ["SOL", "BTC", "ETH", "POPCAT", "RAY", "JUP"];
    const driftStatus = commonMarkets.map((symbol) => {
      const market = data.markets.find(
        (m: ArbitrageMarket) => m.symbol === symbol,
      );
      return {
        symbol,
        hasDrift: !!market?.drift,
        fundingRate: market?.drift?.fundingRate || "N/A",
      };
    });
    console.log("[fetchMarkets] Common markets Drift status:", driftStatus);
  }

  return data;
}

/**
 * Fetch user's arbitrage positions from both position sources:
 * - /api/arb/positions for base venues
 * - /api/arb/positions/v2 for HIP-3 paired venues
 *
 * Requires Privy auth: idToken for privy-id-token header, accessToken for Authorization.
 */
export async function fetchPositions(
  idToken: string,
  accessToken?: string,
): Promise<PositionsResponse> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "privy-id-token": idToken,
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${PERP_HEDGE_API_URL}/arb/positions/v2`, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch positions: ${response.statusText}`);
  }
  const raw = (await response.json()) as unknown;
  const normalized =
    normalizePositionsResponse(raw) ?? {
      status: "success",
      positions: createEmptyPositions(),
      pairs: [],
      totalPnl: 0,
    };
  return enrichPositionsWithTpSl(normalized, headers);
}

function createEmptyPositions(): PositionsResponse["positions"] {
  return {
    drift: [],
    flash: [],
    pacifica: [],
    hyperliquid: [],
    aster: [],
    lighter: [],
    "01": [],
    phoenix: [],
    "hl:xyz": [],
    "hl:flx": [],
    "hl:hyna": [],
    "hl:km": [],
    "hl:cash": [],
    "hl:para": [],
  };
}

function normalizeTpSlLookupMarket(symbol: string): string {
  return symbol.replace(/-PERP$/i, "").trim().toUpperCase();
}

function supportsTpSlLookupProtocol(protocol: string): protocol is ArbExecProtocol {
  return (
    protocol === "pacifica" ||
    protocol === "hyperliquid" ||
    protocol === "aster" ||
    protocol === "lighter" ||
    protocol === "01" ||
    protocol === "phoenix" ||
    protocol.startsWith("hl:")
  );
}

function tpSlLookupKey(
  protocol: string,
  market: string,
  direction?: "long" | "short",
): string {
  return `${protocol}:${normalizeTpSlLookupMarket(market)}:${direction ?? "*"}`;
}

async function fetchTpSlTriggerPrices(
  request: TpSlLookupRequest,
  headers: HeadersInit,
): Promise<TpSlLookupResponse | null> {
  if (request.positions.length === 0) return null;
  try {
    const response = await fetch(`${PERP_HEDGE_API_URL}/arb/tp-sl`, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(10_000),
    });
    const rawText = await response.text().catch(() => "");
    const data = rawText ? (JSON.parse(rawText) as TpSlLookupResponse) : null;
    if (!response.ok) {
      console.warn("[tp-sl] lookup failed:", {
        status: response.status,
        statusText: response.statusText,
        body: rawText,
      });
      return null;
    }
    return data;
  } catch (err) {
    console.warn("[tp-sl] lookup failed:", err);
    return null;
  }
}

function collectTpSlLookupEntries(
  positionsResponse: PositionsResponse,
): TpSlLookupEntry[] {
  const seen = new Set<string>();
  const entries: TpSlLookupEntry[] = [];
  const add = (protocol: string, symbol: string) => {
    if (!supportsTpSlLookupProtocol(protocol)) return;
    const market = normalizeTpSlLookupMarket(symbol);
    if (!market) return;
    const key = `${protocol}:${market}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({ protocol, market });
  };

  for (const pair of positionsResponse.pairs ?? []) {
    add(pair.long.protocol, pair.long.symbol);
    add(pair.short.protocol, pair.short.symbol);
  }
  for (const [protocol, list] of Object.entries(positionsResponse.positions)) {
    if (!Array.isArray(list)) continue;
    for (const position of list) {
      add(protocol, position.symbol);
    }
  }
  return entries;
}

function applyTpSlLookupResults(
  positionsResponse: PositionsResponse,
  results: TpSlLookupResult[],
): PositionsResponse {
  const resultBySpecificLeg = new Map<string, Position["triggerPrices"]>();
  const resultByAnyDirection = new Map<string, Position["triggerPrices"]>();
  for (const result of results) {
    if (result.status !== "success" || !result.triggerPrices) continue;
    const market = normalizeTpSlLookupMarket(result.market);
    if (!market) continue;
    if (result.direction) {
      resultBySpecificLeg.set(
        tpSlLookupKey(result.protocol, market, result.direction),
        result.triggerPrices,
      );
    } else {
      resultByAnyDirection.set(
        tpSlLookupKey(result.protocol, market),
        result.triggerPrices,
      );
    }
  }
  if (resultBySpecificLeg.size === 0 && resultByAnyDirection.size === 0) {
    return positionsResponse;
  }

  const patch = <T extends Position>(position: T, protocol: string): T => {
    const specific = resultBySpecificLeg.get(
      tpSlLookupKey(protocol, position.symbol, position.direction),
    );
    const fallback = resultByAnyDirection.get(
      tpSlLookupKey(protocol, position.symbol),
    );
    const triggerPrices = specific ?? fallback;
    if (!triggerPrices) return position;
    return {
      ...position,
      triggerPrices,
      takeProfitPrice: triggerPrices.tp ?? position.takeProfitPrice ?? null,
      stopLossPrice: triggerPrices.sl ?? position.stopLossPrice ?? null,
    };
  };

  const positions = { ...positionsResponse.positions } as PositionsResponse["positions"];
  for (const [protocol, list] of Object.entries(positions)) {
    if (!Array.isArray(list)) continue;
    positions[protocol as keyof typeof positions] = list.map((position) =>
      patch(position, protocol),
    ) as typeof list;
  }

  return {
    ...positionsResponse,
    positions,
    pairs: positionsResponse.pairs?.map((pair) => ({
      ...pair,
      long: patch(pair.long, pair.long.protocol),
      short: patch(pair.short, pair.short.protocol),
    })),
  };
}

async function enrichPositionsWithTpSl(
  positionsResponse: PositionsResponse,
  headers: HeadersInit,
): Promise<PositionsResponse> {
  const positions = collectTpSlLookupEntries(positionsResponse);
  const lookup = await fetchTpSlTriggerPrices({ positions }, headers);
  if (lookup?.results) {
    return applyTpSlLookupResults(positionsResponse, lookup.results);
  }
  // Lookup failed (network error, 429, timeout) — flag it so the hook can
  // preserve stale TP/SL from the previous response instead of showing "—".
  return { ...positionsResponse, tpSlLookupFailed: true };
}

function mergePositionsResponses(
  base: PositionsResponse | null,
  hip3: PositionsResponse | null,
): PositionsResponse {
  const positions = createEmptyPositions();
  for (const response of [base, hip3]) {
    if (!response) continue;
    for (const [protocol, list] of Object.entries(response.positions)) {
      if (!Array.isArray(list) || list.length === 0) continue;
      (positions[protocol as ArbExecProtocol] ??= []).push(...list);
    }
  }

  const pairs = [...(base?.pairs ?? []), ...(hip3?.pairs ?? [])];
  const totalPnl =
    (base?.totalPnl ?? 0) +
    (hip3?.totalPnl ?? 0);
  const fundingEarned =
    (base?.fundingEarned ?? 0) +
    (hip3?.fundingEarned ?? 0);
  const fundingPaid =
    (base?.fundingPaid ?? 0) +
    (hip3?.fundingPaid ?? 0);
  const totalFundingUsd =
    (base?.totalFundingUsd ?? 0) +
    (hip3?.totalFundingUsd ?? 0);

  return {
    status: "success",
    positions,
    pairs,
    totalPnl,
    totalFundingUsd:
      base?.totalFundingUsd !== undefined || hip3?.totalFundingUsd !== undefined
        ? totalFundingUsd
        : undefined,
    fundingEarned:
      base?.fundingEarned !== undefined || hip3?.fundingEarned !== undefined
        ? fundingEarned
        : undefined,
    fundingPaid:
      base?.fundingPaid !== undefined || hip3?.fundingPaid !== undefined
        ? fundingPaid
        : undefined,
  };
}

function normalizePositionsResponse(raw: unknown): PositionsResponse | null {
  return normalizePositionsV2Response(raw) ?? normalizeLegacyPositionsResponse(raw);
}

function getPositionsContainer(raw: unknown): Record<string, unknown> | null {
  const data = raw as Record<string, unknown> | unknown[] | null;
  if (!data || typeof data !== "object") return null;
  return Array.isArray(data) ? { positions: data } : data;
}

function normalizePositionsV2Response(raw: unknown): PositionsResponse | null {
  const container = getPositionsContainer(raw);
  if (!container) return null;
  const nestedData = (container as Record<string, unknown>).data;
  const nestedRecord =
    nestedData && typeof nestedData === "object" && !Array.isArray(nestedData)
      ? (nestedData as Record<string, unknown>)
      : null;
  const isPositionLikeRecord = (record: Record<string, unknown> | null) =>
    !!record &&
    (typeof record.long_protocol === "string" ||
      typeof record.longProtocol === "string" ||
      (!!record.long && !!record.short));
  const rawPositions =
    // v2 shape: { pairs: [...], unmatched: {...} }
    (container as Record<string, unknown>).pairs ??
    (container as Record<string, unknown>).positions ??
    (Array.isArray(nestedData) ? nestedData : undefined) ??
    nestedRecord?.positions ??
    nestedRecord?.position ??
    (container as Record<string, unknown>).position ??
    (isPositionLikeRecord(nestedRecord) ? nestedRecord : undefined) ??
    (isPositionLikeRecord(container as Record<string, unknown>)
      ? (container as Record<string, unknown>)
      : undefined);
  const rawPositionList = Array.isArray(rawPositions)
    ? rawPositions
    : rawPositions && typeof rawPositions === "object"
      ? [rawPositions]
      : null;
  if (!rawPositionList) return null;
  const summaryRecord = nestedRecord ?? (container as Record<string, unknown>);

  const positions = createEmptyPositions();
  const pairs: ArbitragePositionPair[] = [];

  for (const item of rawPositionList) {
    const pair = normalizePositionPair(item);
    if (!pair) continue;
    pairs.push(pair);
    (positions[pair.long.protocol] ??= []).push(pair.long);
    (positions[pair.short.protocol] ??= []).push(pair.short);
  }
  if (rawPositionList.length > 0 && pairs.length === 0) return null;

  // Parse orphan/unmatched legs from v2 response into the per-protocol
  // positions map so the fallback row builder can still show them.
  const unmatched = (container as Record<string, unknown>).unmatched;
  if (unmatched && typeof unmatched === "object" && !Array.isArray(unmatched)) {
    for (const [protocol, legList] of Object.entries(
      unmatched as Record<string, unknown>,
    )) {
      if (!Array.isArray(legList) || legList.length === 0) continue;
      for (const rawLeg of legList) {
        const rec = rawLeg as Record<string, unknown>;
        const dir = rec?.direction === "short" ? "short" : ("long" as const);
        const leg = normalizePositionLeg(rawLeg, dir);
        if (!leg) continue;
        (positions[protocol as ArbExecProtocol] ??= []).push(leg);
      }
    }
  }

  return {
    status: "success",
    positions,
    pairs,
    totalPnl:
      typeof summaryRecord.totalPnl === "number"
        ? summaryRecord.totalPnl
        : pairs.reduce(
            (sum, pair) => sum + (pair.long.pnl ?? 0) + (pair.short.pnl ?? 0),
            0,
          ),
    totalFundingUsd:
      typeof summaryRecord.totalFundingUsd === "number" ? summaryRecord.totalFundingUsd : undefined,
    fundingEarned:
      typeof summaryRecord.fundingEarned === "number" ? summaryRecord.fundingEarned : undefined,
    fundingPaid:
      typeof summaryRecord.fundingPaid === "number" ? summaryRecord.fundingPaid : undefined,
  };
}

function getLegacyPositionsMap(raw: unknown): Record<string, unknown[]> | null {
  const container = getPositionsContainer(raw);
  if (!container) return null;
  const nestedData = container.data;
  const nestedRecord =
    nestedData && typeof nestedData === "object" && !Array.isArray(nestedData)
      ? (nestedData as Record<string, unknown>)
      : null;
  const candidates = [
    container.positions,
    nestedRecord?.positions,
    nestedRecord,
    container,
  ];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      continue;
    }
    const record = candidate as Record<string, unknown>;
    const entries = Object.entries(record).filter(
      ([protocol, value]) => KNOWN_VENUE_KEYS.has(protocol) && Array.isArray(value),
    );
    if (entries.length === 0) continue;
    return Object.fromEntries(entries) as Record<string, unknown[]>;
  }
  return null;
}

function normalizeLegacyPositionsResponse(raw: unknown): PositionsResponse | null {
  const positionMap = getLegacyPositionsMap(raw);
  if (!positionMap) return null;
  const container = getPositionsContainer(raw);
  const nestedData = container?.data;
  const summaryRecord =
    nestedData && typeof nestedData === "object" && !Array.isArray(nestedData)
      ? (nestedData as Record<string, unknown>)
      : (container ?? {});
  const positions = createEmptyPositions();
  let totalPnl = 0;

  for (const [protocol, list] of Object.entries(positionMap)) {
    for (const item of list) {
      const normalized = normalizeMappedPosition(item, protocol);
      if (!normalized) continue;
      (positions[protocol as ArbExecProtocol] ??= []).push(normalized);
      totalPnl += normalized.pnl ?? 0;
    }
  }

  return {
    status: "success",
    positions,
    pairs: [],
    totalPnl:
      numberField(summaryRecord, "totalPnl", "total_pnl", "totalPnlUsd", "total_pnl_usd") ??
      totalPnl,
    totalFundingUsd:
      numberField(summaryRecord, "totalFundingUsd", "total_funding_usd"),
    fundingEarned: numberField(summaryRecord, "fundingEarned", "funding_earned"),
    fundingPaid: numberField(summaryRecord, "fundingPaid", "funding_paid"),
  };
}

function normalizeMappedPosition(raw: unknown, protocol: string): Position | null {
  const record = raw as Record<string, unknown> | null;
  if (!record || typeof record !== "object") return null;
  const direction = stringField(record, "direction", "side");
  if (direction !== "long" && direction !== "short") return null;
  const symbol = stringField(record, "symbol", "market", "ticker", "asset");
  if (!symbol) return null;
  const size = record.size as { usd?: unknown; asset?: unknown } | undefined;
  const sizeUsd =
    typeof size?.usd === "number"
      ? size.usd
      : typeof size?.usd === "string"
        ? Number(size.usd) || 0
        : numberField(
            record,
            "sizeUsd",
            "size_usd",
            "notionalUsd",
            "notional_usd",
            "positionValueUsd",
            "position_value_usd",
          ) ?? 0;
  const sizeAsset =
    typeof size?.asset === "number"
      ? size.asset
      : typeof size?.asset === "string"
        ? Number(size.asset) || 0
        : numberField(record, "sizeAsset", "size_asset", "baseSize", "base_size") ?? 0;

  const triggerPrices = normalizeTriggerPrices(record);
  const takeProfitPrice =
    triggerPrices?.tp ??
    numberField(
      record,
      "takeProfitPrice",
      "take_profit_price",
      "tpPrice",
      "tp_price",
      "takeProfit",
      "take_profit",
      "tp",
    ) ??
    null;
  const stopLossPrice =
    triggerPrices?.sl ??
    numberField(
      record,
      "stopLossPrice",
      "stop_loss_price",
      "slPrice",
      "sl_price",
      "stopLoss",
      "stop_loss",
      "sl",
    ) ??
    null;

  return {
    symbol,
    direction,
    size: {
      usd: sizeUsd,
      asset: sizeAsset,
    },
    pnl: numberField(record, "pnl", "pnlUsd", "pnl_usd", "unrealizedPnl", "unrealized_pnl") ?? 0,
    entryPrice:
      numberField(record, "entryPrice", "entry_price", "entry_price_usd") ?? 0,
    leverage: numberField(record, "leverage") ?? 0,
    margin: numberField(record, "margin", "marginUsd", "margin_usd", "currentMarginUsd", "current_margin_usd") ?? 0,
    fundingIncome: numberField(record, "fundingIncome", "funding_income"),
    takeProfitPrice,
    stopLossPrice,
    triggerPrices,
  };
}

function normalizePositionPair(item: unknown): ArbitragePositionPair | null {
  const pair = item as Record<string, unknown> | null;
  if (!pair || typeof pair !== "object") return null;
  const flatPair = normalizeFlatPositionPair(pair);
  if (flatPair) return flatPair;
  const long = normalizePositionLeg(pair.long, "long");
  const short = normalizePositionLeg(pair.short, "short");
  if (!long || !short) return null;
  return {
    pairId: typeof pair.pairId === "number" ? pair.pairId : undefined,
    publicId: typeof pair.publicId === "string" ? pair.publicId : undefined,
    symbol: typeof pair.symbol === "string" ? pair.symbol : undefined,
    status: typeof pair.status === "string" ? pair.status : undefined,
    long,
    short,
    totalMargin:
      typeof pair.totalMargin === "number" ? pair.totalMargin : undefined,
    createdAt: typeof pair.createdAt === "string" ? pair.createdAt : undefined,
  };
}

function numberField(
  record: Record<string, unknown>,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function stringField(
  record: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function normalizeTriggerPrices(
  record: Record<string, unknown>,
  prefix?: "long" | "short",
): Position["triggerPrices"] | undefined {
  const triggerKeys = prefix
    ? [
        `${prefix}TriggerPrices`,
        `${prefix}_trigger_prices`,
        `${prefix}_triggerPrices`,
      ]
    : ["triggerPrices", "trigger_prices"];
  for (const key of triggerKeys) {
    const value = record[key];
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const prices = value as Record<string, unknown>;
    const tp = numberField(prices, "tp", "takeProfit", "take_profit");
    const sl = numberField(prices, "sl", "stopLoss", "stop_loss");
    if (tp === undefined && sl === undefined) continue;
    return {
      ...(tp !== undefined ? { tp } : {}),
      ...(sl !== undefined ? { sl } : {}),
    };
  }
  return undefined;
}

function normalizeFlatPositionPair(
  pair: Record<string, unknown>,
): ArbitragePositionPair | null {
  const longProtocol = stringField(pair, "long_protocol", "longProtocol");
  const shortProtocol = stringField(pair, "short_protocol", "shortProtocol");
  if (!longProtocol || !shortProtocol) return null;

  const symbol = stringField(pair, "symbol") ?? "—";
  const longSymbol = stringField(pair, "long_symbol", "longSymbol") ?? symbol;
  const shortSymbol = stringField(pair, "short_symbol", "shortSymbol") ?? symbol;
  const sizeAsset = numberField(pair, "size_asset", "sizeAsset") ?? 0;
  const longMargin =
    numberField(pair, "current_long_margin_usd", "currentLongMarginUsd") ??
    numberField(pair, "long_margin_usd", "longMarginUsd") ??
    0;
  const shortMargin =
    numberField(pair, "current_short_margin_usd", "currentShortMarginUsd") ??
    numberField(pair, "short_margin_usd", "shortMarginUsd") ??
    0;
  const originalLongMargin =
    numberField(pair, "long_margin_usd", "longMarginUsd") ?? longMargin;
  const originalShortMargin =
    numberField(pair, "short_margin_usd", "shortMarginUsd") ?? shortMargin;
  const longTriggerPrices = normalizeTriggerPrices(pair, "long");
  const shortTriggerPrices = normalizeTriggerPrices(pair, "short");

  // TP/SL keys in the v2 paired response MUST be leg-prefixed. Falling back
  // to unprefixed `tp_price`/`sl_price`/`take_profit_price`/`stop_loss_price`
  // would leak a single value into both legs (and would also let an SL field
  // appear under the TP slot if upstream ever ships an ambiguous `triggerPrice`).
  // Per-leg arrays from the legacy `/arb/positions` shape go through
  // `normalizePositionLeg` instead — that path has its own per-leg object
  // scope and isn't affected.
  const long: ArbitragePositionPair["long"] = {
    symbol: longSymbol,
    protocol: longProtocol as ArbExecProtocol,
    direction: "long",
    size: {
      usd: numberField(pair, "long_notional_usd", "longNotionalUsd") ?? 0,
      asset: sizeAsset,
    },
    pnl: longMargin - originalLongMargin,
    entryPrice:
      numberField(pair, "long_entry_price", "longEntryPrice") ??
      numberField(pair, "oracle_price_at_entry", "oraclePriceAtEntry") ??
      0,
    leverage: numberField(pair, "long_leverage", "longLeverage") ?? 0,
    margin: longMargin,
    fundingIncome: numberField(pair, "long_funding_income", "longFundingIncome"),
    takeProfitPrice: longTriggerPrices?.tp ?? numberField(
      pair,
      "long_take_profit_price",
      "longTakeProfitPrice",
      "long_tp_price",
      "longTpPrice",
    ) ?? null,
    stopLossPrice: longTriggerPrices?.sl ?? numberField(
      pair,
      "long_stop_loss_price",
      "longStopLossPrice",
      "long_sl_price",
      "longSlPrice",
    ) ?? null,
    triggerPrices: longTriggerPrices,
  };

  const short: ArbitragePositionPair["short"] = {
    symbol: shortSymbol,
    protocol: shortProtocol as ArbExecProtocol,
    direction: "short",
    size: {
      usd: numberField(pair, "short_notional_usd", "shortNotionalUsd") ?? 0,
      asset: sizeAsset,
    },
    pnl: shortMargin - originalShortMargin,
    entryPrice:
      numberField(pair, "short_entry_price", "shortEntryPrice") ??
      numberField(pair, "oracle_price_at_entry", "oraclePriceAtEntry") ??
      0,
    leverage: numberField(pair, "short_leverage", "shortLeverage") ?? 0,
    margin: shortMargin,
    fundingIncome: numberField(pair, "short_funding_income", "shortFundingIncome"),
    takeProfitPrice: shortTriggerPrices?.tp ?? numberField(
      pair,
      "short_take_profit_price",
      "shortTakeProfitPrice",
      "short_tp_price",
      "shortTpPrice",
    ) ?? null,
    stopLossPrice: shortTriggerPrices?.sl ?? numberField(
      pair,
      "short_stop_loss_price",
      "shortStopLossPrice",
      "short_sl_price",
      "shortSlPrice",
    ) ?? null,
    triggerPrices: shortTriggerPrices,
  };

  return {
    pairId: numberField(pair, "id", "pairId"),
    publicId: stringField(pair, "public_id", "publicId"),
    symbol,
    status: stringField(pair, "status"),
    long,
    short,
    totalMargin:
      numberField(pair, "current_total_margin_usd", "currentTotalMarginUsd") ??
      longMargin + shortMargin,
    createdAt: stringField(pair, "created_at", "createdAt"),
  };
}

function normalizePositionLeg(
  raw: unknown,
  direction: "long" | "short",
): ArbitragePositionPair["long"] | null {
  const leg = raw as Record<string, unknown> | null;
  if (!leg || typeof leg !== "object") return null;
  const protocol = leg.protocol;
  const symbol = leg.symbol;
  if (typeof protocol !== "string" || typeof symbol !== "string") return null;

  // v2 response nests live trading data under `leg.live`. Check it first,
  // fall back to top-level fields for legacy/flat formats.
  const live =
    typeof leg.live === "object" && leg.live !== null
      ? (leg.live as Record<string, unknown>)
      : null;

  const sizeRaw = (live?.size ?? leg.size) as
    | { usd?: unknown; asset?: unknown }
    | undefined;
  const triggerPrices =
    (live ? normalizeTriggerPrices(live) : undefined) ??
    normalizeTriggerPrices(leg);
  const takeProfitPrice =
    triggerPrices?.tp ??
    numberField(
      live ?? {},
      "takeProfitPrice",
      "take_profit_price",
      "tpPrice",
      "tp_price",
      "takeProfit",
      "take_profit",
      "tp",
    ) ??
    numberField(
      leg,
      "takeProfitPrice",
      "take_profit_price",
      "tpPrice",
      "tp_price",
      "takeProfit",
      "take_profit",
      "tp",
    ) ??
    null;
  const stopLossPrice =
    triggerPrices?.sl ??
    numberField(
      live ?? {},
      "stopLossPrice",
      "stop_loss_price",
      "slPrice",
      "sl_price",
      "stopLoss",
      "stop_loss",
      "sl",
    ) ??
    numberField(
      leg,
      "stopLossPrice",
      "stop_loss_price",
      "slPrice",
      "sl_price",
      "stopLoss",
      "stop_loss",
      "sl",
    ) ??
    null;
  return {
    symbol,
    protocol: protocol as ArbExecProtocol,
    direction,
    size: {
      usd:
        typeof sizeRaw?.usd === "number"
          ? sizeRaw.usd
          : typeof sizeRaw?.usd === "string"
            ? Number(sizeRaw.usd) || 0
            : numberField(leg, "notionalUsd", "notional_usd") ?? 0,
      asset:
        typeof sizeRaw?.asset === "number"
          ? sizeRaw.asset
          : typeof sizeRaw?.asset === "string"
            ? Number(sizeRaw.asset) || 0
            : 0,
    },
    pnl:
      numberField(live ?? {}, "pnl", "pnlUsd", "pnl_usd", "unrealizedPnl", "unrealized_pnl") ??
      numberField(leg, "pnl", "pnlUsd", "pnl_usd", "unrealizedPnl") ??
      0,
    entryPrice:
      numberField(live ?? {}, "entryPrice", "entry_price") ??
      numberField(leg, "entryPrice", "entry_price", "entry_price_usd") ??
      0,
    leverage:
      numberField(live ?? {}, "leverage") ?? numberField(leg, "leverage") ?? 0,
    margin:
      numberField(live ?? {}, "margin", "marginUsd", "margin_usd") ??
      numberField(leg, "margin", "marginUsd", "margin_usd") ??
      0,
    fundingIncome:
      numberField(live ?? {}, "fundingIncome", "funding_income") ??
      numberField(leg, "fundingIncome", "funding_income"),
    liveDataMissing: live === null ? true : undefined,
    takeProfitPrice,
    stopLossPrice,
    triggerPrices,
  };
}

/**
 * Execute an arbitrage trade.
 *
 * Routes to /arb/trade for same-symbol legs across base venues, or /arb/trade/v2
 * when the legs use distinct per-leg tickers across HIP-3 / HL-paired venues
 * (e.g. XAU on one DEX vs GOLD on another). Pass `paired: true` to target /v2.
 */
export async function executeTrade(
  request: TradeRequest | TradeV2Request,
  idToken: string,
  accessToken?: string,
  options?: { paired?: boolean },
): Promise<TradeResponse> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "privy-id-token": idToken,
  };

  // Add access token if provided
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000); // 60s timeout

  try {
    const endpoint = options?.paired ? "/arb/trade/v2" : "/arb/trade";
    const response = await fetch(`${PERP_HEDGE_API_URL}${endpoint}`, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
          data.message ||
          `Failed to execute trade: ${response.statusText}`,
      );
    }

    return data;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(
        "Trade request timed out after 60 seconds. Please try again.",
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Close arbitrage positions on specified protocols
 */
export async function closeArbPosition(
  request: CloseArbRequest,
  idToken: string,
  accessToken?: string,
): Promise<CloseArbResponse> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "privy-id-token": idToken,
  };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000); // 60s timeout

  try {
    const response = await fetch(`${PERP_HEDGE_API_URL}/arb/close`, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    const data = await response.json();
    console.log("[closeArbPosition] Response data:", data);

    if (!response.ok) {
      throw new Error(
        data.error ||
          data.message ||
          `Failed to close position: ${response.statusText}`,
      );
    }

    return data;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(
        "Close position request timed out after 60 seconds. Please try again.",
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export interface ArbFeeResponse {
  status: "success";
  message: string;
  data: {
    fees: {
      dex: string;
      takerFeeBps: number;
      makerFeeBps: number;
      tierLabel: string;
      volumePeriod: string;
      fundingInterval: string;
      source: string;
      feeLevel?: number;
      // Upstream shape varies per venue (different keys for tier index, vol
      // threshold, taker/maker bps). Keep as `unknown[]` so the field stays
      // forward-compatible without `any`-leaking through downstream call sites.
      feeTiers: unknown[];
    }[];
  };
}

export async function fetchArbFees(
  idToken: string,
  accessToken?: string,
): Promise<ArbFeeResponse> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "privy-id-token": idToken,
  };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${PERP_HEDGE_API_URL}/arb/fees`, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch arb fees: ${response.statusText}`);
  }

  return response.json();
}

/** Per-DEX BalanceData shape. All numeric fields are stringified USD
 *  (or stringified collateral-units for HIP-3 venues with non-USD
 *  collateral). `quoteUnit` is the collateral token: USDC | USDH |
 *  USDE | USDT. Pacifica also surfaces fee/orders extras. */
export interface AggregateBalanceData {
  accountValue: string;
  accountEquity: string;
  availableToTrade: string;
  withdrawable: string;
  totalMarginUsed: string;
  totalPositionValue: string;
  positionsCount: number;
  quoteUnit: "USDC" | "USDH" | "USDE" | "USDT" | string;
  // Pacifica-only extras (preserved on the entry that has them).
  pendingBalance?: string;
  feeLevel?: number;
  makerFee?: string | number;
  takerFee?: string | number;
  ordersCount?: number;
}

export type AggregateBalanceEntry =
  | {
      dex: string;
      status: "success";
      message?: string;
      data: AggregateBalanceData;
    }
  | {
      dex: string;
      status: "error";
      message: string;
      error?: string;
    };

/** Bucketed total across DEXes that share a collateral token. Backend
 *  emits one bucket per quoteUnit so a USDC user doesn't see USDC + USDE
 *  numbers naïvely added together. */
export interface AggregateBalanceTotal {
  quoteUnit: string;
  accountValue: string;
  accountEquity: string;
  availableToTrade: string;
  withdrawable: string;
  totalMarginUsed: string;
  totalPositionValue: string;
  positionsCount: number;
}

export interface AggregateBalanceSummary {
  positionsCount: number;
  dexesReporting: number;
  dexesFailed: number;
  dexesTotal: number;
}

export interface AllBalancesResponse {
  status: "success" | "partial";
  message: string;
  data: {
    /** Keyed by ArbExecProtocol id. Entries for disabled venues are
     *  absent. Failed venues carry status:"error" instead of data. */
    balances: Partial<Record<ArbExecProtocol, AggregateBalanceEntry>>;
    /** One total per collateral kind found in `balances`. */
    totalsByQuoteUnit: Record<string, AggregateBalanceTotal>;
    summary: AggregateBalanceSummary;
  };
}

export interface PerpExecutionCostRequest {
  symbol: string;
  symbols?: {
    long?: string;
    short?: string;
  };
  openInterestUsd?: {
    long?: number;
    short?: number;
  };
  protocols: {
    long: ArbExecProtocol;
    short: ArbExecProtocol;
  };
  totalMarginUsd: number;
  leverage: number;
  timeFrameDays?: number;
  fundingSpreadPct?: number;
  feesBps?: {
    longTakerBps?: number;
    shortTakerBps?: number;
  };
  timeoutMs?: number;
  maxBookAgeMs?: number;
}

export interface PerpExecutionCostLeg {
  protocol: ArbExecProtocol;
  midPrice: number;
  vwap: number | null;
  slippageRatio: number | null;
  slippagePct: number | null;
  slippageBps: number | null;
  filledUsd: number;
  unfilledUsd: number;
  filledBaseSize: number;
}

export interface PerpExecutionCostResponse {
  status: "success";
  symbol: string;
  symbols?: {
    long: string;
    short: string;
  };
  protocols: PerpExecutionCostRequest["protocols"];
  timeFrameDays: number;
  notionalPerLegUsd: number;
  long: PerpExecutionCostLeg;
  short: PerpExecutionCostLeg;
  totalSlippageRatio: number | null;
  totalSlippagePct: number | null;
  totalSlippageBps: number | null;
  totalFeesRatio: number;
  totalFeesPct: number;
  totalFeesBps: number;
  totalExecutionCostRatio: number | null;
  totalExecutionCostPct: number | null;
  totalExecutionCostBps: number | null;
  expectedFundingRatio: number | null;
  expectedFundingPct: number | null;
  isProfitable: boolean | null;
  hasInsufficientDepth: boolean;
  bookTimestamps: {
    long: {
      exchangeTimestamp: number;
      receivedAt: number;
    };
    short: {
      exchangeTimestamp: number;
      receivedAt: number;
    };
  };
  warnings: string[];
}

interface PerpExecutionCostErrorResponse {
  status: "error";
  error: string;
  details?: unknown;
}

export async function fetchPerpExecutionCost(
  request: PerpExecutionCostRequest,
): Promise<PerpExecutionCostResponse> {
  const response = await fetch("/api/arb/perp-execution-cost", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(20_000),
  });

  const data = (await response.json()) as
    | PerpExecutionCostResponse
    | PerpExecutionCostErrorResponse;

  if (!response.ok || data.status !== "success") {
    throw new Error(
      data.status === "error"
        ? data.error
        : `Failed to fetch perp execution cost: ${response.statusText}`,
    );
  }

  return data;
}

// ─── Arb Depth v4.0 ───

export interface ArbDepthClientRequest {
  symbol: string;
  symbols?: {
    long?: string;
    short?: string;
  };
  longVenue: string;
  shortVenue: string;
  r0Pct: number;
  longTakerFeeBps: number;
  shortTakerFeeBps: number;
  /** OI fallback from markets API — used when venue WS doesn't return OI */
  longVenueOiUsd?: number;
  shortVenueOiUsd?: number;
}

export interface ArbDepthClientResponse {
  status: "success";
  data: {
    viable: boolean;
    reason?: string;
    optimalSize?: number;
    arbDepth?: number;
    r0?: number;
    c?: number;
    alpha?: number;
    effectiveImbalance?: number;
    maxSizeBeforeZeroRate?: number;
    slippageAtOptimal?: number;
    slippageAtDepth?: number;
    paybackConservative?: number;
    paybackOptimistic?: number;
    compressionRisk?: number;
    entryCostUsd?: number;
    smallDepthReason?: string;
    warnings: string[];
  };
}

export async function fetchArbDepth(
  request: ArbDepthClientRequest,
): Promise<ArbDepthClientResponse> {
  const response = await fetch("/api/arb/arb-depth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await response.json()) as
    | ArbDepthClientResponse
    | { status: "error"; error: string };
  if (!response.ok || data.status !== "success") {
    throw new Error(
      data.status === "error"
        ? (data as { error: string }).error
        : `Failed to fetch arb depth: ${response.statusText}`,
    );
  }
  return data as ArbDepthClientResponse;
}

/**
 * Execute a hedge trade (LP + Perp)
 */
export interface HedgeTradeRequest {
  baseTokenAmount: number; // Total base token amount to hedge (e.g., 50 POPCAT)
  market: string; // Perp market (e.g., "SOL" or "SOL-PERP")
  poolType: "amm" | "cpmm"; // Pool type
  poolAddress: string; // Pool address
  protocol?:
    | "drift"
    | "flash"
    | "pacifica"
    | "hyperliquid"
    | "aster"
    | "lighter"; // Optional, defaults to "drift"
  leverage?: number; // Optional, defaults to 1
  slippage?: number; // Optional, defaults to 1% (0.01)
  jitoFeeSol?: number; // Optional Jito bundle tip in SOL
}

export interface HedgeTradeResponse {
  status: "success" | "error";
  message?: string;
  data?: {
    base_token_amount: number;
    base_token_per_side: number;
    pool_txn_hash: string;
    pool_id: string;
    pool_base_amount: string;
    pool_quote_amount: string;
    perp_txn_hash?: string;
    perp_market: string;
    perp_market_index?: number;
    perp_base_amount: string;
    perp_protocol?: string;
    perp_leverage?: number;
    perp_notional_usd?: number;
    perp_order_id?: number;
    bundle_id?: string;
  };
  error?: string;
  details?: string;
}

function parseHedgeResponse(text: string): HedgeTradeResponse {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Hedge API returned empty response");
  }
  if (trimmed === "null") {
    throw new Error("Hedge API returned null");
  }

  // Try direct parse first
  try {
    return JSON.parse(trimmed) as HedgeTradeResponse;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (!msg.includes("after JSON data") && !msg.includes("end of data")) {
      if (process.env.NODE_ENV === "development") {
        console.error(
          "Hedge API raw response (first 500 chars):",
          trimmed.slice(0, 500),
        );
      }
      throw new Error(`Hedge API returned invalid JSON: ${msg}`);
    }
  }

  // "Unexpected non-whitespace after JSON" / "end of data" → valid JSON + extra bytes.
  // Extract first complete { ... } and re-parse.
  const firstBrace = trimmed.indexOf("{");
  if (firstBrace === -1) {
    throw new Error("Hedge API returned no JSON object");
  }
  let depth = 0;
  let end = -1;
  for (let i = firstBrace; i < trimmed.length; i++) {
    const c = trimmed[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end === -1) {
    throw new Error("Hedge API returned incomplete JSON object");
  }
  const jsonStr = trimmed.slice(0, end);
  try {
    return JSON.parse(jsonStr) as HedgeTradeResponse;
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.error(
        "Hedge API raw response (first 500 chars):",
        trimmed.slice(0, 500),
      );
    }
    throw new Error(
      `Hedge API returned invalid JSON: ${e instanceof Error ? e.message : "parse error"}`,
    );
  }
}

/**
 * Get Privy identity token from cookie or sessionStorage (client-side only)
 */
function getPrivyIdToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  // Try cookie first
  const cookies = document.cookie.split(";");
  let privyIdToken: string | null =
    cookies
      .find((c) => c.trim().startsWith("privy-id-token="))
      ?.split("=")[1] || null;

  // Fallback to sessionStorage
  if (!privyIdToken) {
    privyIdToken = sessionStorage.getItem("privy-id-token");
  }

  return privyIdToken;
}

/**
 * Get Privy access token from sessionStorage (client-side only)
 */
function getPrivyAccessToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return sessionStorage.getItem("privy-access-token");
}

export async function executeHedgeTrade(
  request: HedgeTradeRequest,
): Promise<HedgeTradeResponse> {
  // Get tokens for authentication
  const privyIdToken = getPrivyIdToken();
  const privyAccessToken = getPrivyAccessToken();

  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  // Add identity token if available
  if (privyIdToken) {
    headers["privy-id-token"] = privyIdToken;
  }

  // Add access token as Authorization Bearer if available
  if (privyAccessToken) {
    headers["Authorization"] = `Bearer ${privyAccessToken}`;
  }

  const response = await fetch(`${PERP_HEDGE_API_URL}/trade/hedge`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      baseTokenAmount: request.baseTokenAmount,
      market: request.market,
      poolType: request.poolType,
      poolAddress: request.poolAddress,
      protocol: request.protocol ?? "drift", // Default to drift
      leverage: request.leverage ?? 1, // Default to 1
      slippage: request.slippage ?? 0.01, // Default 1%
      jitoFeeSol: request.jitoFeeSol, // Optional
    }),
    signal: AbortSignal.timeout(60_000),
  });

  const text = await response.text();
  let data: HedgeTradeResponse;
  try {
    data = parseHedgeResponse(text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "parse error";
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(
          "Hedge trade endpoint not found (404). The POST /trade/hedge route is not available on the arbitrage API. " +
            "Ensure the hedge API is deployed and NEXT_PUBLIC_ARBITRAGE_API_URL points to a server that supports /api/trade/hedge.",
        );
      }
      const preview = text.trim().slice(0, 200);
      throw new Error(
        `Hedge API error (${response.status}): ${msg}. Body: ${preview || "(empty)"}`,
      );
    }
    throw e;
  }

  if (!response.ok) {
    throw new Error(
      data.error || `Failed to execute hedge trade: ${response.statusText}`,
    );
  }

  return data;
}

/**
 * Health check endpoint
 */
export async function checkHealth(): Promise<{
  status: string;
  servicesInitialized: boolean;
  timestamp: string;
}> {
  const response = await fetch(`${PERP_HEDGE_API_URL}/health`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    throw new Error(`Health check failed: ${response.statusText}`);
  }

  return response.json();
}

// ─── TP/SL ──────────────────────────────────────────────────────────────
//
// POST /api/arb/set-tp-sl — attach take-profit or stop-loss triggers to
// existing positions. Each entry is ONE type (TP or SL) per (protocol,
// market). To set both on a single position send two entries. `direction`
// is derived server-side from the open position; client doesn't send it.
//
// Per backend contract (docs/backend-arb-routes.md): each entry must
// provide EXACTLY ONE of `triggerPrice` (positive number) or
// `triggerPricePercent` (0 < x < 100). Sending both is rejected with 400;
// sending neither is rejected. The discriminated union below makes that
// constraint a compile-time guarantee.

export type SetTpSlEntry = {
  protocol: ArbExecProtocol;
  market: string;
  type: "tp" | "sl";
} & (
  | {
      /** Absolute trigger price (> 0). */
      triggerPrice: number;
      triggerPricePercent?: never;
    }
  | {
      /** Pct distance from entry, on the profitable side for TP / losing
       *  side for SL. Backend resolves the absolute price using the
       *  position's stored entry price. Must satisfy 0 < x < 100. */
      triggerPricePercent: number;
      triggerPrice?: never;
    }
);

export interface SetTpSlRequest {
  positions: SetTpSlEntry[];
}

export interface SetTpSlResultItem {
  protocol: ArbExecProtocol;
  market: string;
  type: "tp" | "sl";
  /** Resolved absolute trigger price returned by the backend. Present on
   *  successful items for both absolute-price and percent requests. */
  triggerPrice: number;
  triggerPricePercent?: number;
  entryPrice?: number;
  status: "success" | "error";
  direction?: "long" | "short";
  error?: string;
}

export interface SetTpSlResponse {
  /** "success" when every item succeeded, "partial" when mixed, "error"
   *  on 400-level failures. Always inspect `results[]` — a 200 may still
   *  contain per-item errors under "partial". */
  status: "success" | "partial" | "error";
  message: string;
  error?: string;
  results?: SetTpSlResultItem[];
}

export async function setTpSl(
  request: SetTpSlRequest,
  idToken: string,
  accessToken?: string,
): Promise<SetTpSlResponse> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "privy-id-token": idToken,
  };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  const response = await fetch(`${PERP_HEDGE_API_URL}/arb/set-tp-sl`, {
    method: "POST",
    headers,
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(15_000),
  });

  // Read the body as text first so we can log the raw response on errors —
  // some backends return non-JSON 4xx bodies that JSON.parse silently drops.
  const rawText = await response.text().catch(() => "");
  let data: SetTpSlResponse | null = null;
  try {
    data = rawText ? (JSON.parse(rawText) as SetTpSlResponse) : null;
  } catch {
    data = null;
  }

  // 401 surfaces as a proper error. 400 with a body comes back as
  // status:"error" and we propagate it. We log the full payload so the
  // exact backend rejection reason is visible in the console.
  if (!response.ok) {
    console.error("[setTpSl] HTTP error:", {
      status: response.status,
      statusText: response.statusText,
      body: rawText,
      parsed: data,
    });
    const msg =
      data?.error ||
      data?.message ||
      data?.results
        ?.filter((r) => r.status === "error")
        .map((r) => `${r.type.toUpperCase()}: ${r.error ?? "failed"}`)
        .join(" · ") ||
      rawText ||
      `Failed to set TP/SL: ${response.statusText}`;
    throw new Error(msg);
  }
  if (!data) {
    throw new Error("Empty response from set-tp-sl");
  }
  return data;
}
