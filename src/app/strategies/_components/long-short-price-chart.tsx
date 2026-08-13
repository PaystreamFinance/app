"use client";

import * as React from "react";
import type {
  CandlestickData,
  IChartApi,
  ISeriesApi,
  LineData,
  MouseEventParams,
  Time,
  UTCTimestamp,
} from "lightweight-charts";

import { cn } from "@/lib/utils";
import { getProtocolLabel, isHip3ProtocolId } from "@/lib/protocol-registry";
import { ProtocolVenueBadge } from "@/components/protocol-venue-badge";
import { ChartWatermark } from "./backtesting-panel";
import { ChartLoading } from "@/components/chart-loading";

type Timeframe = "1H" | "4H" | "24H" | "7D" | "30D" | "90D";
type LiveStatus = "loading" | "live" | "polling" | "error";
type PriceViewMode = "combined" | "long" | "short";

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type ChartPoint = {
  time: number;
  label: string;
  long?: number;
  short?: number;
  longPrice?: number;
  shortPrice?: number;
  spreadBps?: number;
};

type HoverState = {
  x: number;
  y: number;
  time: number;
  long?: number;
  short?: number;
  longPrice?: number;
  shortPrice?: number;
} | null;

type LegResult = {
  candles: Candle[];
  status: LiveStatus;
  error: string | null;
  lastUpdateAt: number | null;
};

type CandleCacheEntry = {
  candles: Candle[];
  lastUpdateAt: number;
};

interface Props {
  longSymbol: string;
  shortSymbol: string;
  longProtocol: string;
  shortProtocol: string;
  headerTabs?: React.ReactNode;
}

const TIMEFRAME_CONFIG: Record<Timeframe, { interval: string; lookbackMs: number; countBack: number }> = {
  "1H": { interval: "1m", lookbackMs: 60 * 60 * 1000, countBack: 60 },
  "4H": { interval: "1m", lookbackMs: 4 * 60 * 60 * 1000, countBack: 240 },
  "24H": { interval: "15m", lookbackMs: 24 * 60 * 60 * 1000, countBack: 96 },
  "7D": { interval: "1h", lookbackMs: 7 * 24 * 60 * 60 * 1000, countBack: 168 },
  "30D": { interval: "4h", lookbackMs: 30 * 24 * 60 * 60 * 1000, countBack: 180 },
  "90D": { interval: "1d", lookbackMs: 90 * 24 * 60 * 60 * 1000, countBack: 90 },
};

const candleCache = new Map<string, CandleCacheEntry>();

function candleCacheKey(protocol: string, symbol: string, timeframe: Timeframe): string {
  return `${protocol.toLowerCase()}|${normalizeBaseSymbol(symbol)}|${timeframe}`;
}

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
  SKY: 79, SNDK: 139, STABLE: 118, STBL: 85, STRC: 156, STRK: 104, SUI: 16, SYRUP: 44,
  TAO: 13, TIA: 67, TON: 12, TRUMP: 15, TRX: 43, TSLA: 112, UNI: 30, URA: 150,
  USDCAD: 100, USDCHF: 99, USDJPY: 98, USDKRW: 105, USELESS: 66, VIRTUAL: 41, VVV: 69,
  WIF: 5, WLD: 6, WLFI: 72, WTI: 145, XAG: 93, XAU: 92, XCU: 136, XLM: 119,
  XMR: 77, XPD: 146, XPL: 71, XPT: 147, XRP: 7, YZY: 70, ZEC: 90, ZK: 56, ZORA: 53, ZRO: 60,
};

function normalizeBaseSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/-PERP$/i, "");
}

function hyperliquidCoin(protocol: string, symbol: string): string {
  const base = normalizeBaseSymbol(symbol);
  return isHip3ProtocolId(protocol) ? `${protocol.slice(3)}:${base}` : base;
}

function toAsterSymbol(symbol: string): string {
  const base = normalizeBaseSymbol(symbol);
  return base.endsWith("USDT") ? base : `${base}USDT`;
}

function toZeroOneSymbol(symbol: string): string {
  const base = normalizeBaseSymbol(symbol);
  return base.endsWith("USD") ? base : `${base}USD`;
}

function toLighterMarketId(symbol: string): number | null {
  const mapped = LIGHTER_MARKET_INDEX[normalizeBaseSymbol(symbol)];
  return mapped ?? null;
}

function toZeroOneResolution(interval: string): string {
  if (interval === "1m") return "1";
  if (interval === "15m") return "15";
  if (interval === "1h") return "60";
  if (interval === "4h") return "240";
  if (interval === "1d") return "1D";
  return interval;
}

function isPollingOnlyCandleProtocol(protocol: string): boolean {
  return protocol === "lighter" || protocol === "01";
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function candleFromRecord(record: Record<string, unknown>): Candle | null {
  const time = toFiniteNumber(record.t ?? record.time);
  const open = toFiniteNumber(record.o);
  const high = toFiniteNumber(record.h);
  const low = toFiniteNumber(record.l);
  const close = toFiniteNumber(record.c);
  const volume = toFiniteNumber(record.v) ?? 0;
  if (time === null || open === null || high === null || low === null || close === null) return null;
  return { time, open, high, low, close, volume };
}

function candleFromAsterRow(row: unknown): Candle | null {
  if (!Array.isArray(row)) return null;
  const time = toFiniteNumber(row[0]);
  const open = toFiniteNumber(row[1]);
  const high = toFiniteNumber(row[2]);
  const low = toFiniteNumber(row[3]);
  const close = toFiniteNumber(row[4]);
  const volume = toFiniteNumber(row[5]) ?? 0;
  if (time === null || open === null || high === null || low === null || close === null) return null;
  return { time, open, high, low, close, volume };
}

function candlesFromZeroOnePayload(payload: unknown): Candle[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  if (record.s !== "ok") return [];
  const times = Array.isArray(record.t) ? record.t : [];
  const opens = Array.isArray(record.o) ? record.o : [];
  const highs = Array.isArray(record.h) ? record.h : [];
  const lows = Array.isArray(record.l) ? record.l : [];
  const closes = Array.isArray(record.c) ? record.c : [];
  const volumes = Array.isArray(record.v) ? record.v : [];

  return times
    .map((rawTime, index) => {
      const timeSeconds = toFiniteNumber(rawTime);
      const open = toFiniteNumber(opens[index]);
      const high = toFiniteNumber(highs[index]);
      const low = toFiniteNumber(lows[index]);
      const close = toFiniteNumber(closes[index]);
      const volume = toFiniteNumber(volumes[index]) ?? 0;
      if (
        timeSeconds === null ||
        open === null ||
        high === null ||
        low === null ||
        close === null
      ) {
        return null;
      }
      return { time: timeSeconds * 1000, open, high, low, close, volume };
    })
    .filter((candle): candle is Candle => candle !== null);
}

function mergeCandles(current: Candle[], incoming: Candle[], limit = 500): Candle[] {
  const byTime = new Map<number, Candle>();
  for (const candle of current) byTime.set(candle.time, candle);
  for (const candle of incoming) byTime.set(candle.time, candle);
  return Array.from(byTime.values())
    .filter((candle) => candle.close > 0)
    .sort((a, b) => a.time - b.time)
    .slice(-limit);
}

async function fetchLegCandles(
  protocol: string,
  symbol: string,
  timeframe: Timeframe,
  signal: AbortSignal,
): Promise<Candle[]> {
  const { interval, lookbackMs, countBack } = TIMEFRAME_CONFIG[timeframe];
  const endTime = Date.now();
  const startTime = endTime - lookbackMs;

  if (protocol === "hyperliquid" || isHip3ProtocolId(protocol)) {
    const response = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "candleSnapshot",
        req: { coin: hyperliquidCoin(protocol, symbol), interval, startTime, endTime },
      }),
      cache: "no-store",
      signal,
    });
    if (!response.ok) throw new Error(`Hyperliquid candles HTTP ${response.status}`);
    const payload = await response.json() as unknown;
    if (!Array.isArray(payload)) throw new Error("Unexpected Hyperliquid candle response.");
    return payload
      .map((entry) => entry && typeof entry === "object" ? candleFromRecord(entry as Record<string, unknown>) : null)
      .filter((candle): candle is Candle => candle !== null);
  }

  if (protocol === "pacifica") {
    const url = new URL("https://api.pacifica.fi/api/v1/kline/mark");
    url.searchParams.set("symbol", normalizeBaseSymbol(symbol));
    url.searchParams.set("interval", interval);
    url.searchParams.set("start_time", String(startTime));
    url.searchParams.set("end_time", String(endTime));
    const response = await fetch(url.toString(), { cache: "no-store", signal });
    if (!response.ok) throw new Error(`Pacifica candles HTTP ${response.status}`);
    const payload = await response.json() as { success?: boolean; data?: unknown[] };
    if (!payload.success || !Array.isArray(payload.data)) throw new Error("Unexpected Pacifica candle response.");
    return payload.data
      .map((entry) => entry && typeof entry === "object" ? candleFromRecord(entry as Record<string, unknown>) : null)
      .filter((candle): candle is Candle => candle !== null);
  }

  if (protocol === "aster") {
    const url = new URL("https://fapi.asterdex.com/fapi/v1/markPriceKlines");
    url.searchParams.set("symbol", toAsterSymbol(symbol));
    url.searchParams.set("interval", interval);
    url.searchParams.set("limit", String(countBack));
    const response = await fetch(url.toString(), { cache: "no-store", signal });
    if (!response.ok) throw new Error(`Aster candles HTTP ${response.status}`);
    const payload = await response.json() as unknown;
    if (!Array.isArray(payload)) throw new Error("Unexpected Aster candle response.");
    return payload
      .map(candleFromAsterRow)
      .filter((candle): candle is Candle => candle !== null);
  }

  if (protocol === "lighter") {
    const marketId = toLighterMarketId(symbol);
    if (marketId === null) throw new Error(`No Lighter market id for ${normalizeBaseSymbol(symbol)}.`);
    const url = new URL("https://mainnet.zklighter.elliot.ai/api/v1/candles");
    url.searchParams.set("market_id", String(marketId));
    url.searchParams.set("resolution", interval);
    url.searchParams.set("start_timestamp", String(startTime));
    url.searchParams.set("end_timestamp", String(endTime));
    url.searchParams.set("count_back", String(countBack));
    const response = await fetch(url.toString(), { cache: "no-store", signal });
    if (!response.ok) throw new Error(`Lighter candles HTTP ${response.status}`);
    const payload = await response.json() as { code?: number; c?: unknown[] };
    if (payload.code !== 200 || !Array.isArray(payload.c)) throw new Error("Unexpected Lighter candle response.");
    return payload.c
      .map((entry) => entry && typeof entry === "object" ? candleFromRecord(entry as Record<string, unknown>) : null)
      .filter((candle): candle is Candle => candle !== null);
  }

  if (protocol === "01") {
    const url = new URL("https://zo-mainnet.n1.xyz/tv/history");
    url.searchParams.set("symbol", toZeroOneSymbol(symbol));
    url.searchParams.set("resolution", toZeroOneResolution(interval));
    url.searchParams.set("from", String(Math.floor(startTime / 1000)));
    url.searchParams.set("to", String(Math.floor(endTime / 1000)));
    const response = await fetch(url.toString(), { cache: "no-store", signal });
    if (!response.ok) throw new Error(`01 candles HTTP ${response.status}`);
    const payload = await response.json() as unknown;
    const candles = candlesFromZeroOnePayload(payload);
    if (candles.length === 0) throw new Error("Unexpected 01 candle response.");
    return candles;
  }

  if (protocol === "phoenix") {
    const url = new URL("https://perp-api.phoenix.trade/candles");
    url.searchParams.set("symbol", normalizeBaseSymbol(symbol));
    url.searchParams.set("timeframe", interval);
    url.searchParams.set("startTime", String(startTime));
    url.searchParams.set("endTime", String(endTime));
    url.searchParams.set("limit", String(countBack));
    const response = await fetch(url.toString(), { cache: "no-store", signal });
    if (!response.ok) throw new Error(`Phoenix candles HTTP ${response.status}`);
    const payload = await response.json() as unknown;
    if (!Array.isArray(payload)) throw new Error("Unexpected Phoenix candle response.");
    return payload
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const record = entry as Record<string, unknown>;
        const time = toFiniteNumber(record.time);
        const open = toFiniteNumber(record.markOpen ?? record.open);
        const high = toFiniteNumber(record.markHigh ?? record.high);
        const low = toFiniteNumber(record.markLow ?? record.low);
        const close = toFiniteNumber(record.markClose ?? record.close);
        const volume = toFiniteNumber(record.volume) ?? 0;
        if (time === null || open === null || high === null || low === null || close === null) return null;
        return { time, open, high, low, close, volume };
      })
      .filter((candle): candle is Candle => candle !== null);
  }

  throw new Error(`${getProtocolLabel(protocol)} does not expose client-side candles here.`);
}

function parseWsCandle(protocol: string, payload: Record<string, unknown>): Candle | null {
  if (protocol === "hyperliquid" || isHip3ProtocolId(protocol)) {
    const data = payload.data;
    const record = Array.isArray(data) ? data[data.length - 1] : data;
    return record && typeof record === "object" ? candleFromRecord(record as Record<string, unknown>) : null;
  }

  if (protocol === "pacifica") {
    const data = payload.data;
    return data && typeof data === "object" ? candleFromRecord(data as Record<string, unknown>) : null;
  }

  if (protocol === "aster") {
    const data = (payload.data && typeof payload.data === "object" ? payload.data : payload) as Record<string, unknown>;
    const kline = data.k;
    if (!kline || typeof kline !== "object") return null;
    const record = kline as Record<string, unknown>;
    const time = toFiniteNumber(record.t);
    const open = toFiniteNumber(record.o);
    const high = toFiniteNumber(record.h);
    const low = toFiniteNumber(record.l);
    const close = toFiniteNumber(record.c);
    const volume = toFiniteNumber(record.v) ?? 0;
    if (time === null || open === null || high === null || low === null || close === null) return null;
    return { time, open, high, low, close, volume };
  }

  if (protocol === "phoenix") {
    if (payload.channel !== "candle") return null;
    const candle = payload.candle;
    return candle && typeof candle === "object"
      ? candleFromRecord(candle as Record<string, unknown>)
      : null;
  }

  return null;
}

function openCandleSocket(
  protocol: string,
  symbol: string,
  interval: string,
  onCandle: (candle: Candle) => void,
  onError: () => void,
): WebSocket | null {
  if (isPollingOnlyCandleProtocol(protocol)) return null;

  if (protocol === "hyperliquid" || isHip3ProtocolId(protocol)) {
    const ws = new WebSocket("wss://api.hyperliquid.xyz/ws");
    ws.onopen = () => {
      ws.send(JSON.stringify({
        method: "subscribe",
        subscription: { type: "candle", coin: hyperliquidCoin(protocol, symbol), interval },
      }));
    };
    ws.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      try {
        const candle = parseWsCandle(protocol, JSON.parse(event.data) as Record<string, unknown>);
        if (candle) onCandle(candle);
      } catch {
        /* ignore malformed ws payloads */
      }
    };
    ws.onerror = onError;
    return ws;
  }

  if (protocol === "pacifica") {
    const ws = new WebSocket("wss://ws.pacifica.fi/ws");
    ws.onopen = () => {
      ws.send(JSON.stringify({
        method: "subscribe",
        params: { source: "mark_price_candle", symbol: normalizeBaseSymbol(symbol), interval },
      }));
    };
    ws.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      try {
        const candle = parseWsCandle(protocol, JSON.parse(event.data) as Record<string, unknown>);
        if (candle) onCandle(candle);
      } catch {
        /* ignore malformed ws payloads */
      }
    };
    ws.onerror = onError;
    return ws;
  }

  if (protocol === "aster") {
    const ws = new WebSocket(`wss://fstream.asterdex.com/ws/${toAsterSymbol(symbol).toLowerCase()}@kline_${interval}`);
    ws.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      try {
        const candle = parseWsCandle(protocol, JSON.parse(event.data) as Record<string, unknown>);
        if (candle) onCandle(candle);
      } catch {
        /* ignore malformed ws payloads */
      }
    };
    ws.onerror = onError;
    return ws;
  }

  if (protocol === "phoenix") {
    const ws = new WebSocket("wss://perp-api.phoenix.trade/v1/ws");
    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: "subscribe",
        subscription: {
          channel: "candles",
          symbol: normalizeBaseSymbol(symbol),
          timeframe: interval,
        },
      }));
    };
    ws.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      try {
        const candle = parseWsCandle(protocol, JSON.parse(event.data) as Record<string, unknown>);
        if (candle) onCandle(candle);
      } catch {
        /* ignore malformed ws payloads */
      }
    };
    ws.onerror = onError;
    return ws;
  }

  return null;
}

function useLegCandles(protocol: string, symbol: string, timeframe: Timeframe): LegResult {
  const [candles, setCandles] = React.useState<Candle[]>([]);
  const [status, setStatus] = React.useState<LiveStatus>("loading");
  const [error, setError] = React.useState<string | null>(null);
  const [lastUpdateAt, setLastUpdateAt] = React.useState<number | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    const { interval } = TIMEFRAME_CONFIG[timeframe];
    const cacheKey = candleCacheKey(protocol, symbol, timeframe);
    const cached = candleCache.get(cacheKey);
    let ws: WebSocket | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    setCandles((current) => cached?.candles ?? current);
    setError(null);
    setLastUpdateAt(cached?.lastUpdateAt ?? null);
    setStatus(cached ? (isPollingOnlyCandleProtocol(protocol) ? "polling" : "live") : "loading");

    const load = async (isRefresh = false) => {
      try {
        if (!isRefresh && !cached) setStatus("loading");
        const nextCandles = await fetchLegCandles(protocol, symbol, timeframe, controller.signal);
        if (closed) return;
        const loadedAt = Date.now();
        setCandles((current) => {
          const merged = isRefresh || cached
            ? mergeCandles(current, nextCandles)
            : nextCandles;
          candleCache.set(cacheKey, { candles: merged, lastUpdateAt: loadedAt });
          return merged;
        });
        setStatus(isPollingOnlyCandleProtocol(protocol) ? "polling" : "live");
        setError(null);
        setLastUpdateAt(loadedAt);
      } catch (err) {
        if (closed || controller.signal.aborted) return;
        setStatus(cached ? (isPollingOnlyCandleProtocol(protocol) ? "polling" : "live") : "error");
        setError(err instanceof Error ? err.message : "Failed to load candles.");
      }
    };

    void load(false);

    ws = openCandleSocket(
      protocol,
      symbol,
      interval,
      (candle) => {
        if (closed) return;
        const loadedAt = Date.now();
        setCandles((current) => {
          const merged = mergeCandles(current, [candle]);
          candleCache.set(cacheKey, { candles: merged, lastUpdateAt: loadedAt });
          return merged;
        });
        setStatus("live");
        setError(null);
        setLastUpdateAt(loadedAt);
      },
      () => {
        if (!closed) setStatus((current) => current === "loading" ? "loading" : "polling");
      },
    );

    const pollMs = isPollingOnlyCandleProtocol(protocol) ? 15_000 : 45_000;
    pollTimer = setInterval(() => void load(true), pollMs);

    return () => {
      closed = true;
      controller.abort();
      if (pollTimer) clearInterval(pollTimer);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    };
  }, [protocol, symbol, timeframe]);

  return { candles, status, error, lastUpdateAt };
}

function formatAge(timestamp: number | null): string {
  if (!timestamp) return "--";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 1) return "now";
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m`;
}

function formatPrice(value: number | undefined): string {
  if (!Number.isFinite(value)) return "--";
  const price = value as number;
  if (price >= 1000) return price.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (price >= 1) return price.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return price.toLocaleString(undefined, { maximumSignificantDigits: 6 });
}

function mergeChartData(longCandles: Candle[], shortCandles: Candle[]): ChartPoint[] {
  const longStart = longCandles.find((candle) => candle.close > 0)?.close;
  const shortStart = shortCandles.find((candle) => candle.close > 0)?.close;
  const byTime = new Map<number, ChartPoint>();

  for (const candle of longCandles) {
    if (!longStart || candle.close <= 0) continue;
    const point = byTime.get(candle.time) ?? {
      time: candle.time,
      label: new Date(candle.time).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
    };
    point.long = (candle.close / longStart) * 100;
    point.longPrice = candle.close;
    byTime.set(candle.time, point);
  }

  for (const candle of shortCandles) {
    if (!shortStart || candle.close <= 0) continue;
    const point = byTime.get(candle.time) ?? {
      time: candle.time,
      label: new Date(candle.time).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
    };
    point.short = (candle.close / shortStart) * 100;
    point.shortPrice = candle.close;
    byTime.set(candle.time, point);
  }

  return Array.from(byTime.values())
    .map((point) => ({
      ...point,
      spreadBps: point.longPrice && point.shortPrice
        ? ((point.longPrice - point.shortPrice) / point.shortPrice) * 10_000
        : undefined,
    }))
    .sort((a, b) => a.time - b.time);
}

function toUtcTimestamp(timeMs: number): UTCTimestamp {
  return Math.floor(timeMs / 1000) as UTCTimestamp;
}

function toLineData(
  data: ChartPoint[],
  key: "long" | "short",
): LineData<Time>[] {
  const priceKey = key === "long" ? "longPrice" : "shortPrice";
  const seen = new Set<number>();
  const rows: LineData<Time>[] = [];
  for (const point of data) {
    const value = point[priceKey];
    if (value === undefined) continue;
    const time = toUtcTimestamp(point.time);
    const rawTime = time as number;
    if (seen.has(rawTime)) continue;
    seen.add(rawTime);
    rows.push({ time, value });
  }
  return rows;
}

function toCandlestickData(candles: Candle[]): CandlestickData<Time>[] {
  const seen = new Set<number>();
  const rows: CandlestickData<Time>[] = [];
  for (const candle of candles) {
    const time = toUtcTimestamp(candle.time);
    const rawTime = time as number;
    if (seen.has(rawTime)) continue;
    seen.add(rawTime);
    rows.push({
      time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    });
  }
  return rows;
}

function TradingViewLongShortChart({
  data,
  longCandles,
  shortCandles,
  mode,
  resetKey,
}: {
  data: ChartPoint[];
  longCandles: Candle[];
  shortCandles: Candle[];
  mode: PriceViewMode;
  resetKey: string;
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const chartRef = React.useRef<IChartApi | null>(null);
  const candleSeriesRef = React.useRef<ISeriesApi<"Candlestick"> | null>(null);
  const longSeriesRef = React.useRef<ISeriesApi<"Line"> | null>(null);
  const shortSeriesRef = React.useRef<ISeriesApi<"Line"> | null>(null);
  const lastResetKeyRef = React.useRef<string | null>(null);
  const dataRef = React.useRef(data);
  const [hover, setHover] = React.useState<HoverState>(null);

  React.useEffect(() => {
    dataRef.current = data;
  }, [data]);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    let chart: IChartApi | null = null;
    let resizeFrame: number | null = null;
    let resizeSettleTimer: ReturnType<typeof setTimeout> | null = null;
    let handleWindowResize: (() => void) | null = null;
    let handleWindowOrientationChange: (() => void) | null = null;

    void import("lightweight-charts").then(({ CandlestickSeries, ColorType, CrosshairMode, LastPriceAnimationMode, LineSeries, createChart }) => {
      if (disposed || !containerRef.current) return;
      const element = containerRef.current;
      const resizeChart = (fitContent = false) => {
        if (!chart || !containerRef.current) return;
        const width = Math.floor(containerRef.current.clientWidth);
        const height = Math.floor(containerRef.current.clientHeight);
        if (width <= 0 || height <= 0) return;
        chart.resize(width, height, true);
        if (fitContent) chart.timeScale().fitContent();
      };
      const scheduleResize = (fitContent = false) => {
        if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => {
          resizeFrame = null;
          resizeChart(fitContent);
        });
        if (resizeSettleTimer) clearTimeout(resizeSettleTimer);
        resizeSettleTimer = setTimeout(() => resizeChart(fitContent), 140);
      };

      chart = createChart(element, {
        autoSize: true,
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: "#7192A5",
          fontFamily: "Inter, sans-serif",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: "#0F1F30", style: 2 },
          horzLines: { color: "#0F1F30", style: 2 },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: "#7092A5", labelBackgroundColor: "#06192B" },
          horzLine: { color: "#7092A5", labelBackgroundColor: "#06192B" },
        },
        rightPriceScale: {
          borderColor: "#0F1F30",
          scaleMargins: { top: 0.16, bottom: 0.16 },
        },
        timeScale: {
          borderColor: "#0F1F30",
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 8,
          barSpacing: 6,
          minBarSpacing: 0.4,
          fixLeftEdge: false,
          fixRightEdge: false,
          lockVisibleTimeRangeOnResize: false,
        },
        localization: {
          priceFormatter: (price: number) => formatPrice(price),
          timeFormatter: (time: Time) => {
            const timestamp = typeof time === "number" ? time * 1000 : Date.now();
            return new Date(timestamp).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });
          },
        },
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: true,
        },
        handleScale: {
          axisPressedMouseMove: true,
          mouseWheel: true,
          pinch: true,
        },
      });

      const candleSeries = mode === "combined" ? null : chart.addSeries(CandlestickSeries, {
        upColor: "#2ED8B6",
        downColor: "#FF6F7D",
        wickUpColor: "#8BDCF2",
        wickDownColor: "#FF8290",
        borderUpColor: "#2ED8B6",
        borderDownColor: "#FF6F7D",
        priceLineVisible: true,
        priceLineColor: mode === "long" ? "#8BDCF2" : "#FF8290",
        lastValueVisible: true,
      });
      const longSeries = mode === "combined" ? chart.addSeries(LineSeries, {
        color: "#45E5C4",
        lineWidth: 2,
        priceLineVisible: true,
        priceLineColor: "#45E5C4",
        lastValueVisible: true,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
        lastPriceAnimation: LastPriceAnimationMode.OnDataUpdate,
      }) : null;
      const shortSeries = mode === "combined" ? chart.addSeries(LineSeries, {
        color: "#FF8290",
        lineWidth: 2,
        priceLineVisible: true,
        priceLineColor: "#FF8290",
        lastValueVisible: true,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
        lastPriceAnimation: LastPriceAnimationMode.OnDataUpdate,
      }) : null;

      chartRef.current = chart;
      candleSeriesRef.current = candleSeries;
      longSeriesRef.current = longSeries;
      shortSeriesRef.current = shortSeries;

      const handleCrosshair = (param: MouseEventParams<Time>) => {
        if (!param.point || param.time === undefined) {
          setHover(null);
          return;
        }
        const candleRow = candleSeriesRef.current
          ? param.seriesData.get(candleSeriesRef.current) as CandlestickData<Time> | undefined
          : undefined;
        const longRow = longSeriesRef.current
          ? param.seriesData.get(longSeriesRef.current) as LineData<Time> | undefined
          : undefined;
        const shortRow = shortSeriesRef.current
          ? param.seriesData.get(shortSeriesRef.current) as LineData<Time> | undefined
          : undefined;
        const timeSeconds = typeof param.time === "number" ? param.time : null;
        const point = timeSeconds
          ? dataRef.current.find((item) => Math.floor(item.time / 1000) === timeSeconds)
          : undefined;
        setHover({
          x: param.point.x,
          y: param.point.y,
          time: timeSeconds ? timeSeconds * 1000 : Date.now(),
          long: typeof longRow?.value === "number" ? longRow.value : mode === "long" && typeof candleRow?.close === "number" ? candleRow.close : undefined,
          short: typeof shortRow?.value === "number" ? shortRow.value : undefined,
          longPrice: typeof longRow?.value === "number" ? longRow.value : mode === "long" && typeof candleRow?.close === "number" ? candleRow.close : point?.longPrice,
          shortPrice: typeof shortRow?.value === "number" ? shortRow.value : mode === "short" && typeof candleRow?.close === "number" ? candleRow.close : point?.shortPrice,
        });
      };

      chart.subscribeCrosshairMove(handleCrosshair);
      resizeObserver = new ResizeObserver(() => scheduleResize(true));
      resizeObserver.observe(element);
      handleWindowResize = () => scheduleResize(true);
      handleWindowOrientationChange = () => scheduleResize(true);
      window.addEventListener("resize", handleWindowResize);
      window.addEventListener("orientationchange", handleWindowOrientationChange);
      scheduleResize(true);

      return () => {
        chart?.unsubscribeCrosshairMove(handleCrosshair);
      };
    });

    return () => {
      disposed = true;
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      if (resizeSettleTimer) clearTimeout(resizeSettleTimer);
      if (handleWindowResize) window.removeEventListener("resize", handleWindowResize);
      if (handleWindowOrientationChange) window.removeEventListener("orientationchange", handleWindowOrientationChange);
      resizeObserver?.disconnect();
      chartRef.current?.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      longSeriesRef.current = null;
      shortSeriesRef.current = null;
      chart = null;
    };
  }, [mode]);

  React.useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const longSeries = longSeriesRef.current;
    const shortSeries = shortSeriesRef.current;
    if (mode === "combined") {
      if (!longSeries || !shortSeries) return;
      longSeries.setData(toLineData(data, "long"));
      shortSeries.setData(toLineData(data, "short"));
    } else {
      if (!candleSeries) return;
      candleSeries.setData(toCandlestickData(mode === "long" ? longCandles : shortCandles));
    }
    if (lastResetKeyRef.current !== resetKey) {
      lastResetKeyRef.current = resetKey;
      chartRef.current?.timeScale().fitContent();
    }
  }, [data, longCandles, mode, resetKey, shortCandles]);

  return (
    <div className="relative h-full min-h-[280px] w-full">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-3 text-[11px]">
        {mode !== "short" && (
          <span className="flex items-center gap-1.5 text-[#BCEBFF]">
            <span className="block size-2 rounded-full bg-[#45E5C4]" />
            {mode === "long" ? "Long candles" : "Long price"}
          </span>
        )}
        {mode !== "long" && (
          <span className="flex items-center gap-1.5 text-[#BCEBFF]">
            <span className="block size-2 rounded-full bg-[#FF8290]" />
            {mode === "short" ? "Short candles" : "Short price"}
          </span>
        )}
      </div>
      {hover && (
        <div
          className="pointer-events-none absolute z-10 min-w-[150px] border border-[#0F1F30] bg-[#000D1E]/95 px-3 py-2 text-[11px] shadow-lg"
          style={{
            left: Math.min(Math.max(hover.x + 12, 8), Math.max(8, (containerRef.current?.clientWidth ?? 220) - 166)),
            top: Math.min(Math.max(hover.y + 12, 8), Math.max(8, (containerRef.current?.clientHeight ?? 180) - 92)),
          }}
        >
          <div className="mb-1 text-[#BCEBFF]">
            {new Date(hover.time).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
          <div className="flex items-center justify-between gap-4 text-[#45E5C4]">
            <span>Long</span>
            <span>{hover.longPrice !== undefined ? formatPrice(hover.longPrice) : "--"}</span>
          </div>
          <div className="flex items-center justify-between gap-4 text-[#FF8290]">
            <span>Short</span>
            <span>{hover.shortPrice !== undefined ? formatPrice(hover.shortPrice) : "--"}</span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-4 text-[#7192A5]">
            <span>Index</span>
            <span>
              {hover.long !== undefined ? hover.long.toFixed(2) : "--"}
              {" / "}
              {hover.short !== undefined ? hover.short.toFixed(2) : "--"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function LegStatus({
  intent,
  protocol,
  symbol,
  result,
}: {
  intent: "Long" | "Short";
  protocol: string;
  symbol: string;
  result: LegResult;
}) {
  const isLive = result.status === "live";
  const isPolling = result.status === "polling";
  return (
    <div className="flex min-w-0 items-center gap-2 text-xs">
      <ProtocolVenueBadge protocol={protocol} className="size-5" />
      <span className={cn(
        "border px-2 py-0.5 font-medium",
        intent === "Long"
          ? "border-[#0A605A] bg-[#063C3D] text-[#45E5C4]"
          : "border-[#6A2430] bg-[#3B1825] text-[#FF8290]",
      )}>
        {intent}
      </span>
      <span className="truncate text-[#D8F2FF]">{getProtocolLabel(protocol)}</span>
      <span className="truncate text-[#7192A5]">{symbol}</span>
      <span className="mx-1 h-4 w-px shrink-0 bg-[#0F1F30]" />
      <span className={cn(
        "size-1.5 shrink-0 rounded-full",
        isLive ? "bg-[#20D0B8]" : isPolling ? "bg-[#D9A441]" : result.status === "loading" ? "bg-[#7192A5]" : "bg-[#FF755F]",
      )} />
      <span className={cn(
        "shrink-0",
        isLive ? "text-[#20D0B8]" : isPolling ? "text-[#D9A441]" : result.status === "loading" ? "text-[#7192A5]" : "text-[#FF755F]",
      )}>
        {isLive ? "live" : isPolling ? "polling" : result.status}
      </span>
      <span className="shrink-0 text-[#7192A5]">{formatAge(result.lastUpdateAt)}</span>
    </div>
  );
}

export function LongShortPriceChart({
  longSymbol,
  shortSymbol,
  longProtocol,
  shortProtocol,
  headerTabs,
}: Props) {
  const [timeframe, setTimeframe] = React.useState<Timeframe>("4H");
  const [priceViewMode, setPriceViewMode] = React.useState<PriceViewMode>("combined");
  const longResult = useLegCandles(longProtocol, longSymbol, timeframe);
  const shortResult = useLegCandles(shortProtocol, shortSymbol, timeframe);
  const chartData = React.useMemo(
    () => mergeChartData(longResult.candles, shortResult.candles),
    [longResult.candles, shortResult.candles],
  );
  const activeResult = priceViewMode === "short" ? shortResult : longResult;
  const isLoading = priceViewMode === "combined"
    ? longResult.status === "loading" || shortResult.status === "loading"
    : activeResult.status === "loading";
  const hasData = priceViewMode === "combined"
    ? chartData.some((point) => point.long !== undefined || point.short !== undefined)
    : activeResult.candles.length > 0;

  return (
    <div className="flex h-full flex-col bg-[#041223]">
      <div className="flex flex-col gap-3 px-4 pt-3 pb-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">{headerTabs}</div>
        <div className="flex shrink-0 flex-wrap items-center justify-start gap-2 sm:justify-end">
          <div className="grid grid-cols-3 overflow-hidden border border-[#0F1F30] bg-[#020F1E] text-[10px]">
            {[
              { key: "combined", label: "Both" },
              { key: "long", label: "Long" },
              { key: "short", label: "Short" },
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setPriceViewMode(option.key as PriceViewMode)}
                className={cn(
                  "h-6 min-w-11 border-r border-[#0F1F30] px-2 text-center leading-6 transition-colors last:border-r-0",
                  priceViewMode === option.key
                    ? "bg-[#0F1F30] text-[#BCEAFF]"
                    : "bg-transparent text-[#7192A5] hover:bg-[#071B30]",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-6 overflow-hidden border border-[#0F1F30] bg-[#020F1E] text-[10px]">
            {(Object.keys(TIMEFRAME_CONFIG) as Timeframe[]).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={cn(
                  "h-6 w-9 border-r border-[#0F1F30] text-center leading-6 transition-colors last:border-r-0",
                  timeframe === tf
                    ? "bg-[#0F1F30] text-[#BCEAFF]"
                    : "bg-transparent text-[#7192A5] hover:bg-[#071B30]",
                )}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-3">
        <LegStatus intent="Long" protocol={longProtocol} symbol={longSymbol} result={longResult} />
        <span className="hidden h-4 w-px shrink-0 bg-[#0F1F30] sm:block" />
        <LegStatus intent="Short" protocol={shortProtocol} symbol={shortSymbol} result={shortResult} />
      </div>

      <div className="relative min-h-[300px] flex-1 px-2 pt-4 pb-3">
        <ChartWatermark />

        {isLoading && !hasData && (
          <div className="absolute inset-0">
            <ChartLoading text="Loading live price chart..." />
          </div>
        )}

        {!isLoading && !hasData && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-[#7192A5]">
            <span>No client-side price candles available for this pair yet.</span>
            {(longResult.error || shortResult.error) && (
              <span className="text-xs text-[#D9A441]">
                {[longResult.error, shortResult.error].filter(Boolean).join(" ")}
              </span>
            )}
          </div>
        )}

        {hasData && (
          <TradingViewLongShortChart
            data={chartData}
            longCandles={longResult.candles}
            shortCandles={shortResult.candles}
            mode={priceViewMode}
            resetKey={`${longProtocol}:${longSymbol}:${shortProtocol}:${shortSymbol}:${timeframe}:${priceViewMode}`}
          />
        )}
      </div>
    </div>
  );
}
