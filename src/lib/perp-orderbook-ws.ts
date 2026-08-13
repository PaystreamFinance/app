import {
  type NormalizedOrderbook,
  type OrderbookLevel,
  type PerpProtocol,
  sanitizeOrderbookLevels,
} from "@/lib/perp-orderbook-simulation";

const DEFAULT_TIMEOUT_MS = 4_000;
const DEFAULT_MAX_AGE_MS = 2_500;
const PACIFICA_PING_INTERVAL_MS = 30_000;
const LIGHTER_PING_INTERVAL_MS = 60_000;
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 10_000;
const ZERO_ONE_API = "https://zo-mainnet.n1.xyz";
// Cap reconnect attempts so a permanently-down upstream can't accumulate a
// reconnect storm or hold one socket per (protocol, symbol) forever on the
// server. Once exceeded, the connection enters "exhausted" status and
// subsequent getLiveOrderbook() calls fail fast — call closeConnection() to
// clear the entry and let a fresh attempt start.
const RECONNECT_MAX_ATTEMPTS = 20;

// Lighter uses integer market indices instead of symbol strings.
const LIGHTER_MARKET_INDEX: Record<string, number> = {
  "0G": 84, "1000BONK": 18, "1000FLOKI": 19, "1000PEPE": 4, "1000SHIB": 17, "1000TOSHI": 81, "2Z": 88, AAPL: 113,
  AAVE: 27, ADA: 39, AERO: 65, AMD: 138, AMZN: 114, APEX: 86, APT: 31, ARB: 50,
  ARC: 132, ASML: 151, ASTER: 83, AUDUSD: 106, AVAX: 9, AVNT: 82, AXS: 131, AZTEC: 144,
  BCH: 58, BERA: 20, BIRB: 133, BMNR: 123, BNB: 25, BOTZ: 154, BRENTOIL: 159, BTC: 1,
  CC: 101, CHIP: 163, COIN: 109, CRCL: 121, CRO: 73, CRV: 36, DASH: 127, DIA: 152,
  DOGE: 3, DOLO: 75, DOT: 11, DUSK: 125, DYDX: 62, EDEN: 89, EDGE: 157, EIGEN: 49,
  ENA: 29, ETH: 0, ETHFI: 64, EURUSD: 96, FARTCOIN: 21, FF: 87, FIL: 103, FOGO: 124,
  GBPUSD: 97, GMX: 61, GOOGL: 116, GRASS: 52, HBAR: 59, HOOD: 108, HYPE: 24, HYUNDAIUSD: 160,
  ICP: 102, INTC: 137, IP: 34, IWM: 153, JTO: 134, JUP: 26, KAITO: 33, LDO: 46,
  LINEA: 76, LINK: 8, LIT: 120, LTC: 35, MAGS: 155, MEGA: 94, MET: 95, META: 117,
  MNT: 63, MON: 91, MORPHO: 68, MSFT: 115, MSTR: 122, MYX: 80, NATGAS: 158, NEAR: 10,
  NMR: 74, NVDA: 110, NZDUSD: 107, ONDO: 38, OP: 55, PAXG: 48, PENDLE: 37, PENGU: 47,
  PIPPIN: 135, PLTR: 111, POL: 14, POPCAT: 23, PROVE: 57, PUMP: 45, PYTH: 78, QQQ: 129,
  RESOLV: 51, RIVER: 126, ROBO: 149, S: 40, SAMSUNGUSD: 162, SEI: 32, SKHYNIXUSD: 161, SKR: 130,
  SKY: 79, SNDK: 139, SOL: 2, SPX: 42, SPY: 128, STABLE: 118, STBL: 85, STRC: 156,
  STRK: 104, SUI: 16, SYRUP: 44, TAO: 13, TIA: 67, TON: 12, TRUMP: 15, TRX: 43,
  TSLA: 112, UNI: 30, URA: 150, USDCAD: 100, USDCHF: 99, USDJPY: 98, USDKRW: 105, USELESS: 66,
  VIRTUAL: 41, VVV: 69, WIF: 5, WLD: 6, WLFI: 72, WTI: 145, XAG: 93, XAU: 92,
  XCU: 136, XLM: 119, XMR: 77, XPD: 146, XPL: 71, XPT: 147, XRP: 7, YZY: 70,
  ZEC: 90, ZK: 56, ZORA: 53, ZRO: 60,
};

type ConnectionStatus = "idle" | "connecting" | "open" | "closed" | "exhausted";

export interface LighterMarketStats {
  markPrice: number;
  indexPrice: number;
  openInterest: number;
  fundingRate: number;
  receivedAt: number;
}

interface OrderbookConnectionState {
  key: string;
  protocol: PerpProtocol;
  requestedSymbol: string;
  protocolSymbol: string;
  ws: WebSocket | null;
  connectPromise: Promise<void> | null;
  status: ConnectionStatus;
  reconnectAttempts: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  pacificaPingTimer: ReturnType<typeof setInterval> | null;
  latestBook: NormalizedOrderbook | null;
  lighterStats: LighterMarketStats | null;
  localBids: Map<number, number>;
  localAsks: Map<number, number>;
  lastSequence: number | null;
  lastError: string | null;
}

export interface OrderbookFetchOptions {
  timeoutMs?: number;
  maxAgeMs?: number;
}

export interface OrderbookFetchResult {
  book: NormalizedOrderbook;
  warnings: string[];
}

const globalScope = globalThis as typeof globalThis & {
  __paystreamPerpOrderbookConnections?: Map<string, OrderbookConnectionState>;
};

const connectionRegistry =
  globalScope.__paystreamPerpOrderbookConnections ??
  (globalScope.__paystreamPerpOrderbookConnections = new Map());

let zeroOneMarketIdsPromise: Promise<Map<string, number>> | null = null;

export function normalizeBaseSymbol(symbol: string): string {
  return symbol
    .trim()
    .toUpperCase()
    .replace(/-PERP$/i, "");
}

function normalizeHyperliquidCoin(symbol: string): string {
  const normalized = symbol.trim().replace(/-PERP$/i, "");
  const separatorIndex = normalized.indexOf(":");
  if (separatorIndex > 0 && separatorIndex < normalized.length - 1) {
    const dex = normalized.slice(0, separatorIndex).toLowerCase();
    const coin = normalized.slice(separatorIndex + 1).toUpperCase();
    return `${dex}:${coin}`;
  }
  return normalizeBaseSymbol(symbol);
}

export function mapToProtocolSymbol(
  protocol: PerpProtocol,
  symbol: string,
): string {
  const base = normalizeBaseSymbol(symbol);
  if (protocol === "hyperliquid") return normalizeHyperliquidCoin(symbol);
  if (protocol === "drift") return `${base}-PERP`;
  if (protocol === "lighter") {
    const idx = LIGHTER_MARKET_INDEX[base];
    return idx !== undefined ? String(idx) : base;
  }
  if (protocol === "aster") {
    return base.endsWith("USDT") ? base : `${base}USDT`;
  }
  if (protocol === "01") {
    return base.endsWith("USD") ? base : `${base}USD`;
  }
  return base;
}

function getConnectionKey(protocol: PerpProtocol, symbol: string): string {
  return `${protocol}:${normalizeBaseSymbol(symbol)}`;
}

function toTextPayload(data: unknown): string | null {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }
  if (data instanceof Uint8Array) {
    return new TextDecoder().decode(data);
  }
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    // Blob payloads are uncommon in Node websocket clients.
    return null;
  }
  return null;
}

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

import { getProtocol, isHip3ProtocolId } from "@/lib/protocol-registry";
import { parseFinite } from "@/lib/math/primitives";

function hyperliquidCoin(protocol: PerpProtocol, symbol: string): string {
  return isHip3ProtocolId(protocol) ? `${protocol.slice(3)}:${symbol}` : symbol;
}

function buildWebSocketUrl(state: OrderbookConnectionState): string {
  if (state.protocol === "aster") {
    return `wss://fstream.asterdex.com/ws/${state.protocolSymbol.toLowerCase()}@depth20@100ms`;
  }
  if (state.protocol === "01") {
    return `wss://zo-mainnet.n1.xyz/ws/deltas@${state.protocolSymbol}`;
  }
  if (state.protocol === "phoenix") {
    return "wss://perp-api.phoenix.trade/v1/ws";
  }
  if (isHip3ProtocolId(state.protocol)) {
    return getProtocol("hyperliquid")?.orderbookWsUrl ?? "wss://api.hyperliquid.xyz/ws";
  }
  return getProtocol(state.protocol)?.orderbookWsUrl ?? "wss://dlob.drift.trade/ws";
}

function buildSubscribePayload(state: OrderbookConnectionState): string | null {
  if (state.protocol === "hyperliquid" || isHip3ProtocolId(state.protocol)) {
    return JSON.stringify({
      method: "subscribe",
      subscription: {
        type: "l2Book",
        coin: hyperliquidCoin(state.protocol, state.protocolSymbol),
      },
    });
  }

  if (state.protocol === "pacifica") {
    return JSON.stringify({
      method: "subscribe",
      params: {
        source: "book",
        symbol: state.protocolSymbol,
        agg_level: 1,
      },
    });
  }

  if (state.protocol === "lighter") {
    return JSON.stringify({
      type: "subscribe",
      channel: `order_book/${state.protocolSymbol}`,
    });
  }

  if (state.protocol === "phoenix") {
    return JSON.stringify({
      type: "subscribe",
      subscription: {
        channel: "orderbook",
        symbol: state.protocolSymbol,
        bypassExecutionBand: false,
      },
    });
  }

  if (state.protocol === "aster" || state.protocol === "01") {
    return null;
  }

  return JSON.stringify({
    type: "subscribe",
    channel: "orderbook",
    marketType: "perp",
    market: state.protocolSymbol,
    grouping: 1,
    includeVamm: true,
    includeIndicative: true,
  });
}

function parseObjectNumber(
  record: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const key of keys) {
    const value = parseFinite(record[key]);
    if (value !== null) return value;
  }
  return null;
}

function parseZeroOneSnapshotLevels(rawLevels: unknown): OrderbookLevel[] {
  if (!Array.isArray(rawLevels)) return [];
  return rawLevels
    .map((level) => {
      if (Array.isArray(level) && level.length >= 2) {
        const price = parseFinite(level[0]);
        const size = parseFinite(level[1]);
        return price !== null && size !== null ? { price, size } : null;
      }

      if (level && typeof level === "object") {
        const record = level as Record<string, unknown>;
        const price = parseObjectNumber(record, ["price", "px", "p"]);
        const size = parseObjectNumber(record, ["size", "quantity", "baseSize", "base_size", "sz"]);
        return price !== null && size !== null ? { price, size } : null;
      }

      return null;
    })
    .filter((level): level is OrderbookLevel => level !== null);
}

async function getZeroOneMarketIds(): Promise<Map<string, number>> {
  if (!zeroOneMarketIdsPromise) {
    zeroOneMarketIdsPromise = fetch(`${ZERO_ONE_API}/info`, {
      signal: AbortSignal.timeout(5_000),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`01 /info failed: ${response.status}`);
        const payload = (await response.json()) as { markets?: unknown[] };
        const ids = new Map<string, number>();
        for (const market of payload.markets ?? []) {
          if (!market || typeof market !== "object") continue;
          const record = market as Record<string, unknown>;
          const symbol = typeof record.symbol === "string"
            ? record.symbol.toUpperCase()
            : null;
          const marketId = parseObjectNumber(record, ["marketId", "market_id", "id"]);
          if (symbol && marketId !== null) ids.set(symbol, marketId);
        }
        return ids;
      })
      .catch((error) => {
        zeroOneMarketIdsPromise = null;
        throw error;
      });
  }

  return zeroOneMarketIdsPromise;
}

async function fetchZeroOneOrderbookSnapshot(
  protocolSymbol: string,
): Promise<{
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  timestamp: number;
  symbol: string;
  updateId: number | null;
} | null> {
  const marketIds = await getZeroOneMarketIds();
  const marketId = marketIds.get(protocolSymbol.toUpperCase());
  if (marketId === undefined) return null;

  const response = await fetch(`${ZERO_ONE_API}/market/${marketId}/orderbook`, {
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) return null;

  const payload = (await response.json()) as Record<string, unknown>;
  const container = (
    payload.orderbook ??
    payload.data ??
    payload.result ??
    payload
  ) as Record<string, unknown>;

  const bids = parseZeroOneSnapshotLevels(container.bids);
  const asks = parseZeroOneSnapshotLevels(container.asks);
  if (bids.length === 0 || asks.length === 0) return null;

  return {
    bids,
    asks,
    timestamp: Date.now(),
    symbol: protocolSymbol,
    updateId: parseObjectNumber(payload, ["updateId", "update_id"]),
  };
}

function parseHyperliquidLevels(rawLevels: unknown): OrderbookLevel[] {
  if (!Array.isArray(rawLevels)) return [];
  return rawLevels
    .map((level) => {
      if (!level || typeof level !== "object") return null;
      const record = level as Record<string, unknown>;
      const price = Number(record.px);
      const size = Number(record.sz);
      if (!Number.isFinite(price) || !Number.isFinite(size)) return null;
      return { price, size };
    })
    .filter((level): level is OrderbookLevel => level !== null);
}

function parsePacificaLevels(rawLevels: unknown): OrderbookLevel[] {
  if (!Array.isArray(rawLevels)) return [];
  return rawLevels
    .map((level) => {
      if (!level || typeof level !== "object") return null;
      const record = level as Record<string, unknown>;
      const price = Number(record.p);
      const size = Number(record.a);
      if (!Number.isFinite(price) || !Number.isFinite(size)) return null;
      return { price, size };
    })
    .filter((level): level is OrderbookLevel => level !== null);
}

function parseDriftLevels(rawLevels: unknown): OrderbookLevel[] {
  if (!Array.isArray(rawLevels)) return [];
  return rawLevels
    .map((level) => {
      if (!level || typeof level !== "object") return null;
      const record = level as Record<string, unknown>;
      const price = Number(record.price);
      const size = Number(record.size);
      if (!Number.isFinite(price) || !Number.isFinite(size)) return null;
      return { price, size };
    })
    .filter((level): level is OrderbookLevel => level !== null);
}

function parseLighterLevels(rawLevels: unknown): OrderbookLevel[] {
  if (!Array.isArray(rawLevels)) return [];
  return rawLevels
    .map((level) => {
      if (!level || typeof level !== "object") return null;
      const record = level as Record<string, unknown>;
      const price = Number(record.price);
      const size = Number(record.size);
      if (!Number.isFinite(price) || !Number.isFinite(size)) return null;
      return { price, size };
    })
    .filter((level): level is OrderbookLevel => level !== null);
}

function parseTupleLevels(rawLevels: unknown): OrderbookLevel[] {
  if (!Array.isArray(rawLevels)) return [];
  return rawLevels
    .map((level) => {
      if (!Array.isArray(level) || level.length < 2) return null;
      const price = Number(level[0]);
      const size = Number(level[1]);
      if (!Number.isFinite(price) || !Number.isFinite(size)) return null;
      return { price, size };
    })
    .filter((level): level is OrderbookLevel => level !== null);
}

function applyTupleDeltas(
  levels: unknown,
  target: Map<number, number>,
): void {
  if (!Array.isArray(levels)) return;
  for (const level of levels) {
    if (!Array.isArray(level) || level.length < 2) continue;
    const price = Number(level[0]);
    const size = Number(level[1]);
    if (!Number.isFinite(price) || !Number.isFinite(size)) continue;
    if (size <= 0) target.delete(price);
    else target.set(price, size);
  }
}

function levelsFromMap(
  levels: Map<number, number>,
  side: "bids" | "asks",
): OrderbookLevel[] {
  const rows = Array.from(levels.entries()).map(([price, size]) => ({ price, size }));
  return sanitizeOrderbookLevels(rows, side).slice(0, 40);
}

function updateBook(
  state: OrderbookConnectionState,
  book: {
    bids: OrderbookLevel[];
    asks: OrderbookLevel[];
    timestamp?: number;
    symbol?: string;
  },
): void {
  const bids = sanitizeOrderbookLevels(book.bids, "bids");
  const asks = sanitizeOrderbookLevels(book.asks, "asks");
  if (bids.length === 0 || asks.length === 0) return;

  state.latestBook = {
    protocol: state.protocol,
    symbol: normalizeBaseSymbol(book.symbol ?? state.requestedSymbol),
    bids,
    asks,
    timestamp:
      book.timestamp !== undefined && Number.isFinite(book.timestamp)
        ? book.timestamp
        : Date.now(),
    receivedAt: Date.now(),
  };
}

async function hydrateZeroOneSnapshot(
  state: OrderbookConnectionState,
): Promise<void> {
  try {
    const snapshot = await fetchZeroOneOrderbookSnapshot(state.protocolSymbol);
    if (!snapshot) return;
    state.localBids.clear();
    state.localAsks.clear();
    for (const level of sanitizeOrderbookLevels(snapshot.bids, "bids")) {
      state.localBids.set(level.price, level.size);
    }
    for (const level of sanitizeOrderbookLevels(snapshot.asks, "asks")) {
      state.localAsks.set(level.price, level.size);
    }
    state.lastSequence = snapshot.updateId ?? state.lastSequence;
    updateBook(state, snapshot);
  } catch (error) {
    state.lastError =
      error instanceof Error
        ? `01 orderbook snapshot failed: ${error.message}`
        : "01 orderbook snapshot failed";
  }
}

function handleMessage(
  state: OrderbookConnectionState,
  rawMessage: string,
): void {
  const envelope = safeJsonParse<Record<string, unknown>>(rawMessage);
  if (!envelope) return;

  if (state.protocol === "hyperliquid" || isHip3ProtocolId(state.protocol)) {
    if (envelope.channel !== "l2Book") return;
    const data = envelope.data as Record<string, unknown> | undefined;
    if (!data) return;
    const levels = data.levels as unknown[] | undefined;
    if (!Array.isArray(levels) || levels.length < 2) return;
    updateBook(state, {
      bids: parseHyperliquidLevels(levels[0]),
      asks: parseHyperliquidLevels(levels[1]),
      timestamp: Number(data.time),
      symbol: typeof data.coin === "string" ? data.coin : state.requestedSymbol,
    });
    return;
  }

  if (state.protocol === "pacifica") {
    if (envelope.channel === "pong") return;
    if (envelope.channel !== "book") return;
    const data = envelope.data as Record<string, unknown> | undefined;
    if (!data) return;
    const levels = data.l as unknown[] | undefined;
    if (!Array.isArray(levels) || levels.length < 2) return;
    updateBook(state, {
      bids: parsePacificaLevels(levels[0]),
      asks: parsePacificaLevels(levels[1]),
      timestamp: Number(data.t),
      symbol: typeof data.s === "string" ? data.s : state.requestedSymbol,
    });
    return;
  }

  if (state.protocol === "aster") {
    const data = (envelope.data && typeof envelope.data === "object"
      ? envelope.data
      : envelope) as Record<string, unknown>;
    const bids = parseTupleLevels(data.b);
    const asks = parseTupleLevels(data.a);
    updateBook(state, {
      bids,
      asks,
      timestamp: Number(data.E ?? data.T),
      symbol: state.requestedSymbol,
    });
    return;
  }

  if (state.protocol === "01") {
    const delta = envelope.delta as Record<string, unknown> | undefined;
    if (!delta) return;
    const updateId = Number(delta.update_id);
    if (Number.isFinite(updateId) && state.lastSequence !== null && updateId <= state.lastSequence) {
      return;
    }
    applyTupleDeltas(delta.bids, state.localBids);
    applyTupleDeltas(delta.asks, state.localAsks);
    state.lastSequence = Number.isFinite(updateId) ? updateId : state.lastSequence;
    updateBook(state, {
      bids: levelsFromMap(state.localBids, "bids"),
      asks: levelsFromMap(state.localAsks, "asks"),
      timestamp: Date.now(),
      symbol: typeof delta.market_symbol === "string" ? delta.market_symbol : state.requestedSymbol,
    });
    return;
  }

  if (state.protocol === "lighter") {
    const type = envelope.type as string | undefined;
    if (type === "connected") return;
    const ch = envelope.channel as string | undefined;
    if (!ch) return;
    // Handle market_stats updates
    if (ch.startsWith("market_stats:")) {
      const ms = envelope.market_stats as Record<string, unknown> | undefined;
      if (ms) {
        const mark = parseFinite(ms.mark_price);
        const index = parseFinite(ms.index_price);
        const oi = parseFinite(ms.open_interest);
        const fr = parseFinite(ms.current_funding_rate ?? ms.funding_rate);
        // Only update if critical fields are valid
        if (mark !== null && index !== null) {
          state.lighterStats = {
            markPrice: mark,
            indexPrice: index,
            openInterest: oi ?? 0,
            fundingRate: fr ?? 0,
            receivedAt: Date.now(),
          };
        }
      }
      return;
    }
    // Handle order_book updates
    if (!ch.startsWith("order_book:")) return;
    const ob = envelope.order_book as Record<string, unknown> | undefined;
    if (!ob) return;
    updateBook(state, {
      bids: parseLighterLevels(ob.bids),
      asks: parseLighterLevels(ob.asks),
      timestamp: Number(envelope.timestamp ?? ob.last_updated_at),
      symbol: state.requestedSymbol,
    });
    return;
  }

  if (state.protocol === "phoenix") {
    if (envelope.channel !== "orderbook") return;
    const orderbook = envelope.orderbook as Record<string, unknown> | undefined;
    if (!orderbook) return;
    updateBook(state, {
      bids: parseTupleLevels(orderbook.bids),
      asks: parseTupleLevels(orderbook.asks),
      timestamp: Date.now(),
      symbol: typeof envelope.symbol === "string" ? envelope.symbol : state.requestedSymbol,
    });
    return;
  }

  const channel = envelope.channel;
  if (typeof channel !== "string" || !channel.startsWith("orderbook_")) return;

  const driftDataEnvelope = envelope.data;
  let decodedData: Record<string, unknown> | null = null;

  if (typeof driftDataEnvelope === "string") {
    decodedData = safeJsonParse<Record<string, unknown>>(driftDataEnvelope);
  } else if (
    driftDataEnvelope !== null &&
    typeof driftDataEnvelope === "object" &&
    !Array.isArray(driftDataEnvelope)
  ) {
    decodedData = driftDataEnvelope as Record<string, unknown>;
  }

  if (!decodedData) return;
  updateBook(state, {
    bids: parseDriftLevels(decodedData.bids),
    asks: parseDriftLevels(decodedData.asks),
    timestamp: Number(decodedData.timestamp ?? decodedData.slot),
    symbol: state.requestedSymbol,
  });
}

function stopPacificaHeartbeat(state: OrderbookConnectionState): void {
  if (state.pacificaPingTimer) {
    clearInterval(state.pacificaPingTimer);
    state.pacificaPingTimer = null;
  }
}

function startPacificaHeartbeat(state: OrderbookConnectionState): void {
  stopPacificaHeartbeat(state);
  if (state.protocol === "pacifica") {
    state.pacificaPingTimer = setInterval(() => {
      if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
      state.ws.send(JSON.stringify({ method: "ping" }));
    }, PACIFICA_PING_INTERVAL_MS);
  } else if (state.protocol === "lighter") {
    state.pacificaPingTimer = setInterval(() => {
      if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
      state.ws.send(JSON.stringify({ type: "ping" }));
    }, LIGHTER_PING_INTERVAL_MS);
  }
}

function scheduleReconnect(state: OrderbookConnectionState): void {
  if (state.reconnectTimer) return;
  if (state.reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
    state.status = "exhausted";
    state.lastError =
      `Reconnect cap reached for ${state.protocol}:${state.requestedSymbol}` +
      ` after ${RECONNECT_MAX_ATTEMPTS} attempts`;
    return;
  }

  const delay = Math.min(
    RECONNECT_BASE_MS * 2 ** state.reconnectAttempts,
    RECONNECT_MAX_MS,
  );

  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    state.reconnectAttempts += 1;
    void connect(state).catch(() => {
      // Reconnect attempts continue via onclose handlers (until exhausted).
    });
  }, delay);
}

/**
 * Close and remove a connection from the registry. Use this when a caller
 * sees `status === "exhausted"` (e.g. surfaced as a fetch error) and wants
 * to drop the dead state so a fresh connect attempt can begin. Also useful
 * in tests / dev HMR to prevent connection leaks across reloads.
 */
export function closeConnection(protocol: PerpProtocol, symbol: string): void {
  const key = getConnectionKey(protocol, symbol);
  const state = connectionRegistry.get(key);
  if (!state) return;
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
  stopPacificaHeartbeat(state);
  if (state.ws) {
    try {
      state.ws.close();
    } catch {
      /* ignore */
    }
    state.ws = null;
  }
  connectionRegistry.delete(key);
}

function createState(
  protocol: PerpProtocol,
  symbol: string,
): OrderbookConnectionState {
  const requestedSymbol = normalizeBaseSymbol(symbol);
  return {
    key: getConnectionKey(protocol, requestedSymbol),
    protocol,
    requestedSymbol,
    protocolSymbol: mapToProtocolSymbol(protocol, requestedSymbol),
    ws: null,
    connectPromise: null,
    status: "idle",
    reconnectAttempts: 0,
    reconnectTimer: null,
    pacificaPingTimer: null,
    latestBook: null,
    lighterStats: null,
    localBids: new Map(),
    localAsks: new Map(),
    lastSequence: null,
    lastError: null,
  };
}

function getOrCreateState(
  protocol: PerpProtocol,
  symbol: string,
): OrderbookConnectionState {
  const key = getConnectionKey(protocol, symbol);
  const existing = connectionRegistry.get(key);
  if (existing) return existing;

  const state = createState(protocol, symbol);
  connectionRegistry.set(state.key, state);
  return state;
}

async function connect(state: OrderbookConnectionState): Promise<void> {
  if (state.status === "exhausted") {
    throw new Error(
      state.lastError ??
        `Reconnect attempts exhausted for ${state.protocol}:${state.requestedSymbol}`,
    );
  }
  if (state.ws && state.ws.readyState === WebSocket.OPEN) return;
  if (state.connectPromise) {
    await state.connectPromise;
    return;
  }

  state.connectPromise = new Promise<void>((resolve, reject) => {
    const url = buildWebSocketUrl(state);
    const ws = new WebSocket(url);
    state.ws = ws;
    state.status = "connecting";

    let settled = false;
    const settleResolve = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    const settleReject = (error: Error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };

    ws.onopen = () => {
      state.status = "open";
      state.reconnectAttempts = 0;
      state.lastError = null;
      const subscribePayload = buildSubscribePayload(state);
      if (subscribePayload) ws.send(subscribePayload);
      // Lighter: also subscribe to market_stats on the same connection
      if (state.protocol === "lighter") {
        ws.send(JSON.stringify({ type: "subscribe", channel: `market_stats/${state.protocolSymbol}` }));
      }
      if (state.protocol === "01") {
        void hydrateZeroOneSnapshot(state).finally(settleResolve);
      } else {
        settleResolve();
      }
      startPacificaHeartbeat(state);
    };

    ws.onmessage = (event) => {
      const raw = toTextPayload(event.data);
      if (!raw) return;
      handleMessage(state, raw);
    };

    ws.onerror = () => {
      state.lastError = `WebSocket error from ${state.protocol}:${state.requestedSymbol}`;
      if (state.status !== "open") {
        settleReject(new Error(state.lastError));
      }
    };

    ws.onclose = () => {
      stopPacificaHeartbeat(state);
      state.status = "closed";
      state.ws = null;
      scheduleReconnect(state);
      if (!settled) {
        const message =
          state.lastError ??
          `WebSocket closed before ready: ${state.protocol}:${state.requestedSymbol}`;
        settleReject(new Error(message));
      }
    };
  }).finally(() => {
    state.connectPromise = null;
  });

  await state.connectPromise;
}

function isFresh(book: NormalizedOrderbook, maxAgeMs: number): boolean {
  return Date.now() - book.receivedAt <= maxAgeMs;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForOrderbook(
  state: OrderbookConnectionState,
  options: OrderbookFetchOptions,
): Promise<OrderbookFetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const startedAt = Date.now();

  await connect(state);

  if (state.protocol === "01" && !state.latestBook) {
    await hydrateZeroOneSnapshot(state);
  }

  while (Date.now() - startedAt <= timeoutMs) {
    const book = state.latestBook;
    if (book && isFresh(book, maxAgeMs)) {
      return { book, warnings: [] };
    }
    await sleep(50);
  }

  if (state.latestBook) {
    const ageMs = Date.now() - state.latestBook.receivedAt;
    return {
      book: state.latestBook,
      warnings: [
        `Using stale ${state.protocol} orderbook (${ageMs}ms old) after waiting ${timeoutMs}ms.`,
      ],
    };
  }

  throw new Error(
    `No ${state.protocol} orderbook snapshot available for ${state.requestedSymbol} after ${timeoutMs}ms.`,
  );
}

export async function getLiveOrderbook(
  protocol: PerpProtocol,
  symbol: string,
  options: OrderbookFetchOptions = {},
): Promise<OrderbookFetchResult> {
  const state = getOrCreateState(protocol, symbol);
  return waitForOrderbook(state, options);
}

export async function getLiveOrderbooksForPair(params: {
  symbol: string;
  longSymbol?: string;
  shortSymbol?: string;
  longProtocol: PerpProtocol;
  shortProtocol: PerpProtocol;
  timeoutMs?: number;
  maxAgeMs?: number;
}): Promise<{ long: OrderbookFetchResult; short: OrderbookFetchResult }> {
  const [long, short] = await Promise.all([
    getLiveOrderbook(params.longProtocol, params.longSymbol ?? params.symbol, {
      timeoutMs: params.timeoutMs,
      maxAgeMs: params.maxAgeMs,
    }),
    getLiveOrderbook(params.shortProtocol, params.shortSymbol ?? params.symbol, {
      timeoutMs: params.timeoutMs,
      maxAgeMs: params.maxAgeMs,
    }),
  ]);

  return { long, short };
}

/**
 * Get cached Lighter market stats (mark price, index price, OI, funding).
 * Returns null if no stats have been received yet.
 * Stats are updated on the same WS connection as the orderbook.
 */
export function isLighterSymbolSupported(symbol: string): boolean {
  const base = symbol.toUpperCase().replace(/-PERP$/i, "");
  return base in LIGHTER_MARKET_INDEX;
}

export function getLighterMarketStats(symbol: string): LighterMarketStats | null {
  const state = connectionRegistry.get(`lighter:${symbol.toUpperCase().replace(/-PERP$/i, "")}`);
  return state?.lighterStats ?? null;
}
