"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { getProtocolLabel, isHip3ProtocolId } from "@/lib/protocol-registry";
import { ProtocolVenueBadge } from "@/components/protocol-venue-badge";

type Level = { price: number; size: number };
type Book = {
  protocol: string;
  symbol: string;
  bids: Level[];
  asks: Level[];
  bestBid?: number;
  bestAsk?: number;
  timestamp: number;
  receivedAt: number;
};

type LiveStatus = "connecting" | "live" | "error";
type BookRow = Partial<Level> & { total: number; depthPct: number; isPlaceholder?: boolean };

interface Props {
  longSymbol: string;
  shortSymbol: string;
  longProtocol: string;
  shortProtocol: string;
  longOpenInterestUsd?: number;
  shortOpenInterestUsd?: number;
  headerTabs?: React.ReactNode;
}

const BOOK_LEVEL_COUNT = 13;
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 8_000;
type AdapterKey = "hyperliquid" | "pacifica" | "lighter" | "aster" | "01" | "phoenix";
type VenueSettings = {
  heartbeatMs?: number;
  priceAggregation?: "quote-unit";
  watchdogMs: number;
};

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

function formatProtocolDisplay(id: string): string {
  return isHip3ProtocolId(id) ? `HIP3-${getProtocolLabel(id)}` : getProtocolLabel(id);
}

function normalizeBaseSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/-PERP$/i, "");
}

function mapToProtocolSymbol(protocol: string, symbol: string): string {
  const base = normalizeBaseSymbol(symbol);
  if (protocol === "lighter") {
    const idx = LIGHTER_MARKET_INDEX[base];
    return idx !== undefined ? String(idx) : base;
  }
  if (protocol === "aster") return base.endsWith("USDT") ? base : `${base}USDT`;
  if (protocol === "01") return base.endsWith("USD") ? base : `${base}USD`;
  return base;
}

function hyperliquidCoin(protocol: string, symbol: string): string {
  if (!protocol.startsWith("hl:")) return normalizeBaseSymbol(symbol);
  return `${protocol.slice(3)}:${normalizeBaseSymbol(symbol)}`;
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "-";
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  if (value >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return value.toLocaleString(undefined, { maximumSignificantDigits: 6 });
}

function formatSize(value: number): string {
  if (!Number.isFinite(value)) return "-";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(2)}K`;
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function formatUsdCompact(value: number | null | undefined): string {
  if (!value || !Number.isFinite(value) || value <= 0) return "-";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatAge(receivedAt: number | null | undefined): string {
  if (!receivedAt || !Number.isFinite(receivedAt)) return "-";
  const delta = Math.max(0, Date.now() - receivedAt);
  if (delta < 1000) return "<1s ago";
  return `${(delta / 1000).toFixed(1)}s ago`;
}

function computeMid(book: Book | null): number | null {
  if (!book) return null;
  const bid = book.bestBid ?? book.bids[0]?.price;
  const ask = book.bestAsk ?? book.asks[0]?.price;
  if (!Number.isFinite(bid) || !Number.isFinite(ask)) return null;
  return ((bid ?? 0) + (ask ?? 0)) / 2;
}

function computeSpreadInfo(book: Book | null): { amount: number; percent: number } | null {
  if (!book) return null;
  const bid = book.bestBid ?? book.bids[0]?.price;
  const ask = book.bestAsk ?? book.asks[0]?.price;
  const mid = computeMid(book);
  if (!Number.isFinite(bid) || !Number.isFinite(ask) || !mid || mid <= 0) return null;
  const amount = (ask as number) - (bid as number);
  return { amount, percent: (amount / mid) * 100 };
}

function parseObjectLevels(rawLevels: unknown, priceKey: string, sizeKey: string): Level[] {
  if (!Array.isArray(rawLevels)) return [];
  return rawLevels
    .map((level) => {
      if (!level || typeof level !== "object") return null;
      const record = level as Record<string, unknown>;
      const price = Number(record[priceKey]);
      const size = Number(record[sizeKey]);
      if (!Number.isFinite(price) || !Number.isFinite(size) || price <= 0 || size <= 0) return null;
      return { price, size };
    })
    .filter((level): level is Level => level !== null);
}

function parseTupleLevels(rawLevels: unknown): Level[] {
  if (!Array.isArray(rawLevels)) return [];
  return rawLevels
    .map((level) => {
      if (!Array.isArray(level) || level.length < 2) return null;
      const price = Number(level[0]);
      const size = Number(level[1]);
      if (!Number.isFinite(price) || !Number.isFinite(size) || price <= 0 || size <= 0) return null;
      return { price, size };
    })
    .filter((level): level is Level => level !== null);
}

function sanitizeLevels(levels: Level[], side: "bid" | "ask"): Level[] {
  const rows = levels.filter((level) => level.price > 0 && level.size > 0);
  rows.sort((a, b) => side === "bid" ? b.price - a.price : a.price - b.price);
  return rows;
}

function decimalsForUnit(unit: number): number {
  if (!Number.isFinite(unit) || unit >= 1) return 0;
  return Math.min(8, Math.ceil(Math.abs(Math.log10(unit))) + 1);
}

function quoteUnitForLevels(bids: Level[], asks: Level[]): number {
  const bestBid = sanitizeLevels(bids, "bid")[0]?.price;
  const bestAsk = sanitizeLevels(asks, "ask")[0]?.price;
  const mid = Number.isFinite(bestBid) && Number.isFinite(bestAsk)
    ? ((bestBid ?? 0) + (bestAsk ?? 0)) / 2
    : Math.max(bestBid ?? 0, bestAsk ?? 0);

  if (mid >= 1000) return 1;
  if (mid >= 100) return 0.1;
  if (mid >= 10) return 0.01;
  if (mid >= 1) return 0.001;
  if (mid >= 0.1) return 0.0001;
  if (mid >= 0.01) return 0.00001;
  return 0.000001;
}

function aggregateLevels(levels: Level[], side: "bid" | "ask", unit: number): Level[] {
  if (!Number.isFinite(unit) || unit <= 0) return levels;
  const buckets = new Map<number, number>();
  const decimals = decimalsForUnit(unit);

  for (const level of levels) {
    if (level.price <= 0 || level.size <= 0) continue;
    const rawBucket = side === "bid"
      ? Math.floor(level.price / unit) * unit
      : Math.ceil(level.price / unit) * unit;
    const price = Number(rawBucket.toFixed(decimals));
    if (price <= 0) continue;
    buckets.set(price, (buckets.get(price) ?? 0) + level.size);
  }

  return Array.from(buckets.entries()).map(([price, size]) => ({ price, size }));
}

function bookFromLevels(
  protocol: string,
  symbol: string,
  bids: Level[],
  asks: Level[],
  timestamp?: number,
  aggregation?: VenueSettings["priceAggregation"],
): Book | null {
  const rawBids = sanitizeLevels(bids, "bid");
  const rawAsks = sanitizeLevels(asks, "ask");
  const unit = aggregation === "quote-unit" ? quoteUnitForLevels(bids, asks) : null;
  const cleanBids = sanitizeLevels(unit ? aggregateLevels(bids, "bid", unit) : bids, "bid");
  const cleanAsks = sanitizeLevels(unit ? aggregateLevels(asks, "ask", unit) : asks, "ask");
  if (cleanBids.length === 0 || cleanAsks.length === 0) return null;
  return {
    protocol,
    symbol,
    bids: cleanBids,
    asks: cleanAsks,
    bestBid: rawBids[0]?.price,
    bestAsk: rawAsks[0]?.price,
    timestamp: Number.isFinite(timestamp) ? timestamp as number : Date.now(),
    receivedAt: Date.now(),
  };
}

function updateMapFromTuples(levels: unknown, target: Map<number, number>): void {
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

function updateMapFromObjects(
  levels: unknown,
  target: Map<number, number>,
  priceKey: string,
  sizeKey: string,
): void {
  if (!Array.isArray(levels)) return;
  for (const level of levels) {
    if (!level || typeof level !== "object") continue;
    const record = level as Record<string, unknown>;
    const price = Number(record[priceKey]);
    const size = Number(record[sizeKey]);
    if (!Number.isFinite(price) || !Number.isFinite(size)) continue;
    if (size <= 0) target.delete(price);
    else target.set(price, size);
  }
}

function seedMapFromLevels(levels: Level[], target: Map<number, number>): void {
  target.clear();
  for (const level of levels) {
    if (level.price > 0 && level.size > 0) target.set(level.price, level.size);
  }
}

function levelsFromMap(levels: Map<number, number>, side: "bid" | "ask"): Level[] {
  return sanitizeLevels(
    Array.from(levels.entries()).map(([price, size]) => ({ price, size })),
    side,
  );
}

type SubscribeContext = {
  ws: WebSocket;
  protocol: string;
  baseSymbol: string;
  protocolSymbol: string;
};

type ParseContext = {
  protocol: string;
  baseSymbol: string;
  bidMap: Map<number, number>;
  askMap: Map<number, number>;
  lighterLastNonce: number | null;
  priceAggregation?: VenueSettings["priceAggregation"];
  setLighterLastNonce: (nonce: number | null) => void;
};

type ParseResult =
  | { book: Book | null }
  | { reconnect: true; error?: string }
  | null;

type OrderbookAdapter = {
  key: AdapterKey;
  settings: VenueSettings;
  url: (protocolSymbol: string) => string;
  subscribe: (context: SubscribeContext) => void;
  heartbeat?: () => string;
  parse: (envelope: Record<string, unknown>, context: ParseContext) => ParseResult;
};

const ORDERBOOK_ADAPTERS: Record<AdapterKey, OrderbookAdapter> = {
  hyperliquid: {
    key: "hyperliquid",
    settings: { watchdogMs: 8_000 },
    url: () => "wss://api.hyperliquid.xyz/ws",
    subscribe: ({ ws, protocol, baseSymbol }) => {
      ws.send(JSON.stringify({
        method: "subscribe",
        subscription: { type: "l2Book", coin: hyperliquidCoin(protocol, baseSymbol) },
      }));
    },
    parse: (envelope, { protocol, baseSymbol }) => {
      if (envelope.channel !== "l2Book") return null;
      const data = envelope.data as Record<string, unknown> | undefined;
      const levels = data?.levels as unknown[] | undefined;
      if (!Array.isArray(levels) || levels.length < 2) return null;
      return {
        book: bookFromLevels(
          protocol,
          baseSymbol,
          parseObjectLevels(levels[0], "px", "sz"),
          parseObjectLevels(levels[1], "px", "sz"),
          Number(data?.time),
        ),
      };
    },
  },
  pacifica: {
    key: "pacifica",
    settings: { heartbeatMs: 30_000, watchdogMs: 10_000 },
    url: () => "wss://ws.pacifica.fi/ws",
    subscribe: ({ ws, protocolSymbol }) => {
      ws.send(JSON.stringify({ method: "subscribe", params: { source: "book", symbol: protocolSymbol, agg_level: 1 } }));
    },
    heartbeat: () => JSON.stringify({ method: "ping" }),
    parse: (envelope, { protocol, baseSymbol }) => {
      if (envelope.channel === "pong") return null;
      if (envelope.channel !== "book") return null;
      const data = envelope.data as Record<string, unknown> | undefined;
      const levels = data?.l as unknown[] | undefined;
      if (!Array.isArray(levels) || levels.length < 2) return null;
      return {
        book: bookFromLevels(
          protocol,
          baseSymbol,
          parseObjectLevels(levels[0], "p", "a"),
          parseObjectLevels(levels[1], "p", "a"),
          Number(data?.t),
        ),
      };
    },
  },
  lighter: {
    key: "lighter",
    settings: { heartbeatMs: 30_000, priceAggregation: "quote-unit", watchdogMs: 9_000 },
    url: () => "wss://mainnet.zklighter.elliot.ai/stream",
    subscribe: ({ ws, protocolSymbol }) => {
      ws.send(JSON.stringify({ type: "subscribe", channel: `order_book/${protocolSymbol}` }));
    },
    heartbeat: () => JSON.stringify({ type: "ping" }),
    parse: (envelope, context) => {
      const channel = envelope.channel as string | undefined;
      if (!channel?.startsWith("order_book:")) return null;
      const orderbook = envelope.order_book as Record<string, unknown> | undefined;
      if (!orderbook) return null;
      const nonce = Number(orderbook.nonce ?? envelope.nonce);
      const beginNonce = Number(orderbook.begin_nonce);
      if (Number.isFinite(nonce) && context.lighterLastNonce !== null) {
        if (nonce <= context.lighterLastNonce) return null;
        if (Number.isFinite(beginNonce) && beginNonce !== context.lighterLastNonce) {
          return { reconnect: true, error: "Lighter orderbook continuity broke; reconnecting." };
        }
      }
      updateMapFromObjects(orderbook.bids, context.bidMap, "price", "size");
      updateMapFromObjects(orderbook.asks, context.askMap, "price", "size");
      context.setLighterLastNonce(Number.isFinite(nonce) ? nonce : context.lighterLastNonce);
      return {
        book: bookFromLevels(
          context.protocol,
          context.baseSymbol,
          levelsFromMap(context.bidMap, "bid"),
          levelsFromMap(context.askMap, "ask"),
          Number(envelope.timestamp ?? orderbook.last_updated_at),
          context.priceAggregation,
        ),
      };
    },
  },
  aster: {
    key: "aster",
    settings: { watchdogMs: 8_000 },
    url: (protocolSymbol) => `wss://fstream.asterdex.com/ws/${protocolSymbol.toLowerCase()}@depth20@100ms`,
    subscribe: () => undefined,
    parse: (envelope, { protocol, baseSymbol }) => {
      const data = (envelope.data && typeof envelope.data === "object" ? envelope.data : envelope) as Record<string, unknown>;
      return {
        book: bookFromLevels(
          protocol,
          baseSymbol,
          parseTupleLevels(data.b),
          parseTupleLevels(data.a),
          Number(data.E ?? data.T),
        ),
      };
    },
  },
  "01": {
    key: "01",
    settings: { priceAggregation: "quote-unit", watchdogMs: 12_000 },
    url: (protocolSymbol) => `wss://zo-mainnet.n1.xyz/ws/deltas@${protocolSymbol}`,
    subscribe: () => undefined,
    parse: (envelope, { protocol, baseSymbol, bidMap, askMap }) => {
      const delta = envelope.delta as Record<string, unknown> | undefined;
      if (!delta) return null;
      updateMapFromTuples(delta.bids, bidMap);
      updateMapFromTuples(delta.asks, askMap);
      return {
        book: bookFromLevels(
          protocol,
          baseSymbol,
          levelsFromMap(bidMap, "bid"),
          levelsFromMap(askMap, "ask"),
          Date.now(),
          "quote-unit",
        ),
      };
    },
  },
  phoenix: {
    key: "phoenix",
    settings: { priceAggregation: "quote-unit", watchdogMs: 9_000 },
    url: () => "wss://perp-api.phoenix.trade/v1/ws",
    subscribe: ({ ws, protocolSymbol }) => {
      ws.send(JSON.stringify({
        type: "subscribe",
        subscription: {
          channel: "orderbook",
          symbol: protocolSymbol,
          bypassExecutionBand: false,
        },
      }));
    },
    parse: (envelope, { protocol, baseSymbol }) => {
      if (envelope.channel !== "orderbook") return null;
      const orderbook = envelope.orderbook as Record<string, unknown> | undefined;
      if (!orderbook) return null;
      return {
        book: bookFromLevels(
          protocol,
          baseSymbol,
          parseTupleLevels(orderbook.bids),
          parseTupleLevels(orderbook.asks),
          Date.now(),
          "quote-unit",
        ),
      };
    },
  },
};

function getOrderbookAdapter(protocol: string): OrderbookAdapter | null {
  if (protocol === "hyperliquid" || protocol.startsWith("hl:")) return ORDERBOOK_ADAPTERS.hyperliquid;
  if (protocol === "pacifica") return ORDERBOOK_ADAPTERS.pacifica;
  if (protocol === "lighter") return ORDERBOOK_ADAPTERS.lighter;
  if (protocol === "aster") return ORDERBOOK_ADAPTERS.aster;
  if (protocol === "01") return ORDERBOOK_ADAPTERS["01"];
  if (protocol === "phoenix") return ORDERBOOK_ADAPTERS.phoenix;
  return null;
}

function buildBookRows(levels: Level[], side: "bid" | "ask"): BookRow[] {
  const visible = side === "ask"
    ? levels.slice(0, BOOK_LEVEL_COUNT).reverse()
    : levels.slice(0, BOOK_LEVEL_COUNT);
  let running = 0;
  const realRows = visible.map((level) => {
    running += level.price * level.size;
    return { ...level, total: running, depthPct: 0 };
  });
  const maxTotal = Math.max(...realRows.map((row) => row.total), 1);
  const rows = realRows.map((row) => ({ ...row, depthPct: Math.min(100, (row.total / maxTotal) * 100) }));
  const placeholders = Array.from({ length: Math.max(0, BOOK_LEVEL_COUNT - rows.length) }, () => ({
    total: 0,
    depthPct: 0,
    isPlaceholder: true,
  }));
  return side === "ask" ? [...placeholders, ...rows] : [...rows, ...placeholders];
}

function useLiveOrderbook(protocol: string, symbol: string) {
  const [book, setBook] = React.useState<Book | null>(null);
  const [status, setStatus] = React.useState<LiveStatus>("connecting");
  const [error, setError] = React.useState<string | null>(null);
  const [lastMessageAt, setLastMessageAt] = React.useState<number | null>(null);
  const hasBookRef = React.useRef(false);

  React.useEffect(() => {
    let ws: WebSocket | null = null;
    let closedByEffect = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let watchdogTimer: ReturnType<typeof setInterval> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectAttempts = 0;
    const baseSymbol = normalizeBaseSymbol(symbol);
    const adapter = getOrderbookAdapter(protocol);
    const bidMap = new Map<number, number>();
    const askMap = new Map<number, number>();
    let lighterLastNonce: number | null = null;
    let snapshotAbort: AbortController | null = null;

    const resetStreamState = (clearDisplay: boolean) => {
      bidMap.clear();
      askMap.clear();
      lighterLastNonce = null;
      snapshotAbort?.abort();
      snapshotAbort = null;
      if (clearDisplay) {
        hasBookRef.current = false;
        setBook(null);
        setLastMessageAt(null);
      }
    };

    const scheduleReconnect = () => {
      if (closedByEffect || reconnectTimer) return;
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempts, RECONNECT_MAX_MS);
      reconnectAttempts += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect(false);
      }, delay);
    };

    const publishBook = (nextBook: Book | null) => {
      if (!nextBook) return;
      reconnectAttempts = 0;
      hasBookRef.current = true;
      setBook(nextBook);
      setStatus("live");
      setError(null);
      setLastMessageAt(Date.now());
    };

    const publishLighterBook = (nextBook: Book | null) => {
      if (!nextBook) return;
      const hasFullDepth = nextBook.bids.length >= BOOK_LEVEL_COUNT && nextBook.asks.length >= BOOK_LEVEL_COUNT;
      if (hasFullDepth) {
        publishBook(nextBook);
        return;
      }

      setLastMessageAt(Date.now());
    };

    const hydrateLighterSnapshot = async (marketId: string) => {
      const controller = new AbortController();
      snapshotAbort = controller;
      try {
        const params = new URLSearchParams({
          marketId,
          symbol: baseSymbol,
          limit: "80",
        });
        const response = await fetch(`/api/arb/lighter-orderbook-snapshot?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json() as { bids?: Level[]; asks?: Level[]; timestamp?: number };
        if (closedByEffect || controller.signal.aborted) return;
        seedMapFromLevels(payload.bids ?? [], bidMap);
        seedMapFromLevels(payload.asks ?? [], askMap);
        publishLighterBook(bookFromLevels(
          protocol,
          baseSymbol,
          levelsFromMap(bidMap, "bid"),
          levelsFromMap(askMap, "ask"),
          payload.timestamp,
          adapter?.settings.priceAggregation,
        ));
      } catch {
        if (controller.signal.aborted || closedByEffect) return;
        setError(`Lighter snapshot failed; waiting for stream snapshot.`);
      } finally {
        if (snapshotAbort === controller) snapshotAbort = null;
      }
    };

    const handleMessage = (raw: string) => {
      if (!adapter) return;
      let envelope: Record<string, unknown>;
      try {
        envelope = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return;
      }

      const result = adapter.parse(envelope, {
        protocol,
        baseSymbol,
        bidMap,
        askMap,
        lighterLastNonce,
        priceAggregation: adapter.settings.priceAggregation,
        setLighterLastNonce: (nonce) => {
          lighterLastNonce = nonce;
        },
      });
      if (!result) return;
      if ("reconnect" in result) {
        setStatus(hasBookRef.current ? "live" : "connecting");
        setError(hasBookRef.current ? null : (result.error ?? null));
        resetStreamState(false);
        try {
          ws?.close();
        } catch {
          /* ignore */
        }
        return;
      }
      if (adapter.key === "lighter") {
        publishLighterBook(result.book);
      } else {
        publishBook(result.book);
      }
    };

    const connect = (clearDisplay = false) => {
      resetStreamState(clearDisplay);
      setStatus(hasBookRef.current ? "live" : "connecting");
      setError(null);

      if (!adapter) {
        setStatus("error");
        setError(`Live orderbook is not available for ${protocol}.`);
        return;
      }

      const protocolSymbol = mapToProtocolSymbol(protocol, baseSymbol);
      const url = adapter.url(protocolSymbol);

      ws = new WebSocket(url);
      ws.onopen = () => {
        if (!ws || closedByEffect) return;
        if (adapter.key === "lighter") void hydrateLighterSnapshot(protocolSymbol);
        adapter.subscribe({
          ws,
          protocol,
          baseSymbol,
          protocolSymbol,
        });
        const heartbeatMessage = adapter.heartbeat?.();
        if (heartbeatMessage) {
          heartbeatTimer = setInterval(() => {
            if (ws?.readyState === WebSocket.OPEN) ws.send(heartbeatMessage);
          }, adapter.settings.heartbeatMs ?? 30_000);
        }
      };
      ws.onmessage = (event) => {
        if (typeof event.data === "string") handleMessage(event.data);
      };
      ws.onerror = () => {
        setStatus(hasBookRef.current ? "live" : "error");
        setError(hasBookRef.current ? null : `Orderbook stream error from ${formatProtocolDisplay(protocol)}.`);
        resetStreamState(false);
      };
      ws.onclose = () => {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
        if (closedByEffect) return;
        setStatus(hasBookRef.current ? "live" : "connecting");
        setError(null);
        resetStreamState(false);
        scheduleReconnect();
      };
    };

    watchdogTimer = setInterval(() => {
      setLastMessageAt((current) => {
        if (!adapter) return current;
        if (current && Date.now() - current > adapter.settings.watchdogMs) {
          setStatus(hasBookRef.current ? "live" : "connecting");
          setError(null);
          const reconnectStartedAt = Date.now();
          try {
            ws?.close();
          } catch {
            /* ignore */
          }
          return reconnectStartedAt;
        }
        return current;
      });
    }, 1_000);

    connect(true);

    return () => {
      closedByEffect = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (watchdogTimer) clearInterval(watchdogTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    };
  }, [protocol, symbol]);

  return { book, status, error, lastMessageAt };
}

function OrderbookRow({ row, side }: { row: BookRow; side: "bid" | "ask" }) {
  const color = side === "ask" ? "#FF6F7D" : "#2ED8B6";
  const bg = side === "ask" ? "rgba(188, 63, 77, 0.27)" : "rgba(28, 154, 137, 0.26)";

  if (row.isPlaceholder) {
    return (
      <div className="grid h-[22px] grid-cols-[1fr_0.72fr_0.88fr] items-center border-b border-[#061729] px-2 text-[11px] text-[#29465A] last:border-b-0">
        <span>--</span>
        <span className="text-right">--</span>
        <span className="text-right">--</span>
      </div>
    );
  }

  return (
    <div className="relative grid h-[22px] grid-cols-[1fr_0.72fr_0.88fr] items-center overflow-hidden border-b border-[#061729] px-2 text-[11px] last:border-b-0">
      <div
        className="absolute inset-y-[1px] left-0"
        style={{ width: `${row.depthPct}%`, background: bg }}
      />
      <span className="relative font-medium" style={{ color }}>{formatPrice(row.price ?? NaN)}</span>
      <span className="relative text-right text-[#B8D7E6]">{formatSize(row.size ?? NaN)}</span>
      <span className="relative text-right text-[#6F8798]">{formatSize(row.total)}</span>
    </div>
  );
}

function OrderbookPane({
  intent,
  protocol,
  symbol,
  book,
  status,
  error,
  lastMessageAt,
  openInterestUsd,
}: {
  intent: "Buy" | "Sell";
  protocol: string;
  symbol: string;
  book: Book | null;
  status: LiveStatus;
  error: string | null;
  lastMessageAt: number | null;
  openInterestUsd?: number;
}) {
  const spread = computeSpreadInfo(book);
  const asks = buildBookRows(book?.asks ?? [], "ask");
  const bids = buildBookRows(book?.bids ?? [], "bid");
  const isLive = status === "live" && !!book;
  const badgeClasses = intent === "Buy"
    ? "border-[#0A605A] bg-[#063C3D] text-[#45E5C4]"
    : "border-[#6A2430] bg-[#3B1825] text-[#FF8290]";

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center justify-between gap-2 px-1 pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("border px-2 py-0.5 text-[11px] font-medium", badgeClasses)}>
            {intent}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-[10px] text-[#7192A5]">
          <span className="max-w-[78px] truncate border border-[#12324A] bg-[#06192B] px-1.5 py-0.5 text-[#9CCFE6]">
            OI {formatUsdCompact(openInterestUsd)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_0.72fr_0.88fr] px-2 pb-2 text-[11px] text-[#667F91]">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>

      <div className="bg-[#020F1E]">
        {asks.map((row, index) => <OrderbookRow key={`ask-${row.price ?? `empty-${index}`}`} row={row} side="ask" />)}
        <div className="grid h-8 grid-cols-[1fr_0.72fr_0.88fr] items-center border-y border-[#08233A] bg-[#062039] px-2 text-[11px] text-[#BCEBFF]">
          <span>Spread</span>
          <span className="text-right">{spread ? formatPrice(spread.amount) : "-"}</span>
          <span className="text-right">{spread ? `${(spread.percent * 100).toFixed(2)} bps` : "-"}</span>
        </div>
        {bids.map((row, index) => <OrderbookRow key={`bid-${row.price ?? `empty-${index}`}`} row={row} side="bid" />)}
      </div>

      {(!isLive || error) && (
        <div className="px-2 pt-2 text-[11px] text-[#D9A441]">
          {error ?? `Connecting ${formatAge(lastMessageAt)}`}
        </div>
      )}
    </div>
  );
}

export function PerpOrderbookPanel({
  longSymbol,
  shortSymbol,
  longProtocol,
  shortProtocol,
  longOpenInterestUsd,
  shortOpenInterestUsd,
  headerTabs,
}: Props) {
  const longBook = useLiveOrderbook(longProtocol, longSymbol);
  const shortBook = useLiveOrderbook(shortProtocol, shortSymbol);

  return (
    <div className="flex h-full flex-col bg-[#041223]">
      <div className="flex items-center justify-between border-b border-[#0F1F30] px-3 pt-3 pb-2">
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-[#BCEBFF]">
          <span className="truncate">{formatProtocolDisplay(longProtocol)}</span>
          <span className="text-[#4A6073]">/</span>
          <span className="truncate">{formatProtocolDisplay(shortProtocol)}</span>
        </div>
        <div className="flex items-center gap-3">{headerTabs}</div>
      </div>

      <div className="min-h-[240px] flex-1 overflow-hidden p-3">
        <div className="grid min-h-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:gap-2">
          <OrderbookPane
            intent="Buy"
            protocol={longProtocol}
            symbol={longSymbol}
            book={longBook.book}
            status={longBook.status}
            error={longBook.error}
            lastMessageAt={longBook.lastMessageAt}
            openInterestUsd={longOpenInterestUsd}
          />
          <OrderbookPane
            intent="Sell"
            protocol={shortProtocol}
            symbol={shortSymbol}
            book={shortBook.book}
            status={shortBook.status}
            error={shortBook.error}
            lastMessageAt={shortBook.lastMessageAt}
            openInterestUsd={shortOpenInterestUsd}
          />
        </div>
      </div>
    </div>
  );
}
