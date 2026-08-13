import type { NextRequest } from "next/server";
import { z } from "zod";

import { getLiveOrderbook, mapToProtocolSymbol } from "@/lib/perp-orderbook-ws";
import type { PerpProtocol } from "@/lib/perp-orderbook-simulation";
import { parseHip3ProtocolId } from "@/lib/protocol-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const requestSchema = z.object({
  legs: z.object({
    long: z.object({
      protocol: z.string().min(1),
      symbol: z.string().min(1),
    }),
    short: z.object({
      protocol: z.string().min(1),
      symbol: z.string().min(1),
    }),
  }),
  timeoutMs: z.coerce.number().int().positive().max(10_000).optional(),
  maxBookAgeMs: z.coerce.number().int().positive().max(10_000).optional(),
  includeBooks: z.boolean().optional(),
});

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type CachedChart = {
  expiresAt: number;
  payload: {
    requestedProtocol: string;
    effectiveProtocol: string | null;
    symbol: string;
    interval: string;
    candles: Candle[];
    warnings: string[];
    error: string | null;
  };
};

const chartCache = new Map<string, CachedChart>();
const CHART_INTERVAL = "15m";
const CHART_TTL_MS = 60_000;
const CHART_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const CHART_LIMIT = 96;

function resolveFetchProtocol(protocol: string): PerpProtocol | null {
  if (
    protocol === "hyperliquid" ||
    protocol === "pacifica" ||
    protocol === "lighter" ||
    protocol === "aster" ||
    protocol === "01" ||
    protocol === "phoenix"
  ) {
    return protocol;
  }
  if (protocol.startsWith("hl:")) return "hyperliquid";
  return null;
}

function resolveChartProtocol(protocol: string): "hyperliquid" | "pacifica" | "aster" | "lighter" | "01" | "phoenix" | null {
  if (
    protocol === "hyperliquid" ||
    protocol === "pacifica" ||
    protocol === "aster" ||
    protocol === "lighter" ||
    protocol === "01" ||
    protocol === "phoenix"
  ) {
    return protocol;
  }
  if (protocol.startsWith("hl:")) return "hyperliquid";
  return null;
}

async function fetchJsonWithTimeout(url: string, init: RequestInit, timeoutMs = 4_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} while fetching ${url}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampCandles(candles: Candle[]): Candle[] {
  return candles
    .filter((c) => Number.isFinite(c.time) && Number.isFinite(c.close))
    .sort((a, b) => a.time - b.time)
    .slice(-CHART_LIMIT);
}

async function fetchHyperliquidCandles(
  requestedProtocol: string,
  symbol: string,
  timeoutMs?: number,
): Promise<Candle[]> {
  const dex = parseHip3ProtocolId(requestedProtocol);
  const coin = dex ? `${dex}:${symbol}` : symbol;
  const endTime = Date.now();
  const startTime = endTime - CHART_LOOKBACK_MS;

  const response = await fetchJsonWithTimeout(
    "https://api.hyperliquid.xyz/info",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "candleSnapshot",
        req: {
          coin,
          interval: CHART_INTERVAL,
          startTime,
          endTime,
        },
      }),
    },
    timeoutMs,
  );

  if (!Array.isArray(response)) {
    throw new Error("Unexpected Hyperliquid candle response.");
  }

  return clampCandles(
    response.map((entry) => ({
      time: toNumber((entry as Record<string, unknown>).t),
      open: toNumber((entry as Record<string, unknown>).o),
      high: toNumber((entry as Record<string, unknown>).h),
      low: toNumber((entry as Record<string, unknown>).l),
      close: toNumber((entry as Record<string, unknown>).c),
      volume: toNumber((entry as Record<string, unknown>).v),
    })),
  );
}

async function fetchPacificaCandles(symbol: string, timeoutMs?: number): Promise<Candle[]> {
  const endTime = Date.now();
  const startTime = endTime - CHART_LOOKBACK_MS;
  const url = new URL("https://api.pacifica.fi/api/v1/kline");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", CHART_INTERVAL);
  url.searchParams.set("start_time", String(startTime));
  url.searchParams.set("end_time", String(endTime));

  const response = (await fetchJsonWithTimeout(url.toString(), { method: "GET" }, timeoutMs)) as {
    success?: boolean;
    data?: Array<Record<string, unknown>>;
  };

  if (!response?.success || !Array.isArray(response.data)) {
    throw new Error("Unexpected Pacifica candle response.");
  }

  return clampCandles(
    response.data.map((entry) => ({
      time: toNumber(entry.t),
      open: toNumber(entry.o),
      high: toNumber(entry.h),
      low: toNumber(entry.l),
      close: toNumber(entry.c),
      volume: toNumber(entry.v),
    })),
  );
}

async function fetchAsterCandles(symbol: string, timeoutMs?: number): Promise<Candle[]> {
  const marketSymbol = symbol.toUpperCase().endsWith("USDT") ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
  const url = new URL("https://fapi.asterdex.com/fapi/v1/klines");
  url.searchParams.set("symbol", marketSymbol);
  url.searchParams.set("interval", CHART_INTERVAL);
  url.searchParams.set("limit", String(CHART_LIMIT));

  const response = await fetchJsonWithTimeout(url.toString(), { method: "GET" }, timeoutMs);

  if (!Array.isArray(response)) {
    throw new Error("Unexpected Aster candle response.");
  }

  return clampCandles(
    response.map((entry) => {
      const row = Array.isArray(entry) ? entry : [];
      return {
        time: toNumber(row[0]),
        open: toNumber(row[1]),
        high: toNumber(row[2]),
        low: toNumber(row[3]),
        close: toNumber(row[4]),
        volume: toNumber(row[5]),
      };
    }),
  );
}

async function fetchLighterCandles(symbol: string, timeoutMs?: number): Promise<Candle[]> {
  const marketId = Number(mapToProtocolSymbol("lighter", symbol));
  if (!Number.isFinite(marketId)) {
    throw new Error(`Lighter market id is not mapped for ${symbol}.`);
  }

  const endTime = Date.now();
  const startTime = endTime - CHART_LOOKBACK_MS;
  const url = new URL("https://mainnet.zklighter.elliot.ai/api/v1/candles");
  url.searchParams.set("market_id", String(marketId));
  url.searchParams.set("resolution", CHART_INTERVAL);
  url.searchParams.set("start_timestamp", String(startTime));
  url.searchParams.set("end_timestamp", String(endTime));
  url.searchParams.set("count_back", String(CHART_LIMIT));

  const response = (await fetchJsonWithTimeout(url.toString(), { method: "GET" }, timeoutMs)) as {
    code?: number;
    c?: Array<Record<string, unknown>>;
  };

  if (response?.code !== 200 || !Array.isArray(response.c)) {
    throw new Error("Unexpected Lighter candle response.");
  }

  return clampCandles(
    response.c.map((entry) => ({
      time: toNumber(entry.t),
      open: toNumber(entry.o),
      high: toNumber(entry.h),
      low: toNumber(entry.l),
      close: toNumber(entry.c),
      volume: toNumber(entry.v),
    })),
  );
}

async function fetchZeroOneCandles(symbol: string, timeoutMs?: number): Promise<Candle[]> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`wss://zo-mainnet.n1.xyz/ws/candle@${symbol}:15`);
    const candles = new Map<number, Candle>();
    const timeout = setTimeout(() => {
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      resolve(clampCandles(Array.from(candles.values())));
    }, Math.min(timeoutMs ?? 4_000, 4_000));

    socket.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      try {
        const entry = JSON.parse(event.data) as Record<string, unknown>;
        const seconds = toNumber(entry.t);
        const candle = {
          time: seconds > 10_000_000_000 ? seconds : seconds * 1000,
          open: toNumber(entry.o),
          high: toNumber(entry.h),
          low: toNumber(entry.l),
          close: toNumber(entry.c),
          volume: toNumber(entry.v),
        };
        if (candle.time > 0 && candle.close > 0) {
          candles.set(candle.time, candle);
        }
        if (candles.size >= 24) {
          clearTimeout(timeout);
          socket.close();
          resolve(clampCandles(Array.from(candles.values())));
        }
      } catch {
        /* ignore malformed candle payloads */
      }
    };

    socket.onerror = () => {
      clearTimeout(timeout);
      reject(new Error("Failed to connect to 01 candle stream."));
    };
  });
}

async function fetchPhoenixCandles(symbol: string, timeoutMs?: number): Promise<Candle[]> {
  const url = new URL("https://perp-api.phoenix.trade/candles");
  url.searchParams.set("symbol", symbol.toUpperCase());
  url.searchParams.set("timeframe", CHART_INTERVAL);
  url.searchParams.set("limit", String(CHART_LIMIT));

  const response = await fetchJsonWithTimeout(url.toString(), { method: "GET" }, timeoutMs);

  if (!Array.isArray(response)) {
    throw new Error("Unexpected Phoenix candle response.");
  }

  return clampCandles(
    response.map((entry) => {
      const row = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
      return {
        time: toNumber(row.time),
        open: toNumber(row.markOpen ?? row.open),
        high: toNumber(row.markHigh ?? row.high),
        low: toNumber(row.markLow ?? row.low),
        close: toNumber(row.markClose ?? row.close),
        volume: toNumber(row.volume),
      };
    }),
  );
}

async function fetchLegBook(
  requestedProtocol: string,
  symbol: string,
  timeoutMs?: number,
  maxAgeMs?: number,
) {
  const effectiveProtocol = resolveFetchProtocol(requestedProtocol);
  if (!effectiveProtocol) {
    return {
      requestedProtocol,
      effectiveProtocol: null,
      symbol,
      book: null,
      warnings: [] as string[],
      error: `Live orderbook is not available for ${requestedProtocol} yet.`,
    };
  }

  const dex = parseHip3ProtocolId(requestedProtocol);
  const fetchSymbol = dex ? `${dex}:${symbol}` : symbol;

  try {
    const result = await getLiveOrderbook(effectiveProtocol, fetchSymbol, {
      timeoutMs,
      maxAgeMs,
    });
    return {
      requestedProtocol,
      effectiveProtocol,
      symbol,
      book: result.book,
      warnings: result.warnings,
      error: null as string | null,
    };
  } catch (error) {
    return {
      requestedProtocol,
      effectiveProtocol,
      symbol,
      book: null,
      warnings: [] as string[],
      error:
        error instanceof Error ? error.message : "Failed to fetch orderbook.",
    };
  }
}

async function fetchLegChart(
  requestedProtocol: string,
  symbol: string,
  timeoutMs?: number,
) {
  const cacheKey = `${requestedProtocol}:${symbol}`;
  const cached = chartCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  const effectiveProtocol = resolveChartProtocol(requestedProtocol);
  if (!effectiveProtocol) {
    return {
      requestedProtocol,
      effectiveProtocol: null,
      symbol,
      interval: CHART_INTERVAL,
      candles: [] as Candle[],
      warnings: [] as string[],
      error: `Venue price chart is not available for ${requestedProtocol} yet.`,
    };
  }

  try {
    let candles: Candle[] = [];

    if (effectiveProtocol === "hyperliquid") {
      candles = await fetchHyperliquidCandles(requestedProtocol, symbol, timeoutMs);
    } else if (effectiveProtocol === "pacifica") {
      candles = await fetchPacificaCandles(symbol, timeoutMs);
    } else if (effectiveProtocol === "aster") {
      candles = await fetchAsterCandles(symbol, timeoutMs);
    } else if (effectiveProtocol === "lighter") {
      candles = await fetchLighterCandles(symbol, timeoutMs);
    } else if (effectiveProtocol === "01") {
      candles = await fetchZeroOneCandles(symbol, timeoutMs);
    } else {
      candles = await fetchPhoenixCandles(symbol, timeoutMs);
    }

    const payload = {
      requestedProtocol,
      effectiveProtocol,
      symbol,
      interval: CHART_INTERVAL,
      candles,
      warnings: [] as string[],
      error: candles.length ? null : "No recent candles returned for this venue.",
    };

    chartCache.set(cacheKey, {
      expiresAt: Date.now() + CHART_TTL_MS,
      payload,
    });

    return payload;
  } catch (error) {
    return {
      requestedProtocol,
      effectiveProtocol,
      symbol,
      interval: CHART_INTERVAL,
      candles: [] as Candle[],
      warnings: [] as string[],
      error: error instanceof Error ? error.message : "Failed to fetch venue chart.",
    };
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const json = (await request.json()) as unknown;
    const input = requestSchema.parse(json);

    const emptyBook = (protocol: string, symbol: string) => ({
      requestedProtocol: protocol,
      effectiveProtocol: null,
      symbol,
      book: null,
      warnings: [] as string[],
      error: null as string | null,
    });
    const includeBooks = input.includeBooks ?? true;

    const [longBook, shortBook, longChart, shortChart] = await Promise.all([
      includeBooks
        ? fetchLegBook(
            input.legs.long.protocol,
            input.legs.long.symbol,
            input.timeoutMs,
            input.maxBookAgeMs,
          )
        : Promise.resolve(emptyBook(input.legs.long.protocol, input.legs.long.symbol)),
      includeBooks
        ? fetchLegBook(
            input.legs.short.protocol,
            input.legs.short.symbol,
            input.timeoutMs,
            input.maxBookAgeMs,
          )
        : Promise.resolve(emptyBook(input.legs.short.protocol, input.legs.short.symbol)),
      fetchLegChart(input.legs.long.protocol, input.legs.long.symbol, input.timeoutMs),
      fetchLegChart(input.legs.short.protocol, input.legs.short.symbol, input.timeoutMs),
    ]);

    return Response.json({
      status: "success",
      long: {
        ...longBook,
        chart: longChart,
      },
      short: {
        ...shortBook,
        chart: shortChart,
      },
      fetchedAt: Date.now(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        {
          status: "error",
          error: "Invalid request payload",
          details: error.issues,
        },
        { status: 400 },
      );
    }

    return Response.json(
      {
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch orderbook view data",
      },
      { status: 500 },
    );
  }
}
