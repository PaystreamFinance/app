"use client";

import * as React from "react";

import { isHip3ProtocolId } from "@/lib/protocol-registry";

export type LiveDivergencePrice = {
  markPrice: number | null;
  oraclePrice: number | null;
  indexPrice: number | null;
  openInterestUsd: number | null;
  receivedAt: number | null;
  status: "connecting" | "live" | "fallback" | "error";
};

type LiveDivergencePrices = {
  long: LiveDivergencePrice;
  short: LiveDivergencePrice;
};

type SnapshotPrice = {
  markPrice: number;
  oraclePrice: number;
  indexPrice: number | null;
};

type Leg = {
  protocol: string;
  symbol: string;
  snapshot: SnapshotPrice | null;
  enabled: boolean;
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
  NMR: 74, NVDA: 110, ONDO: 38, OP: 55, PAXG: 48, PENDLE: 37, PENGU: 47,
  PIPPIN: 135, PLTR: 111, POL: 14, POPCAT: 23, PROVE: 57, PUMP: 45, PYTH: 78, QQQ: 129,
  RESOLV: 51, RIVER: 126, ROBO: 149, S: 40, SEI: 32, SKR: 130, SKY: 79, SNDK: 139,
  SOL: 2, SPX: 42, SPY: 128, STABLE: 118, STBL: 85, STRC: 156, STRK: 104, SUI: 16,
  SYRUP: 44, TAO: 13, TIA: 67, TON: 12, TRUMP: 15, TRX: 43, TSLA: 112, UNI: 30,
  URA: 150, USELESS: 66, VIRTUAL: 41, VVV: 69, WIF: 5, WLD: 6, WLFI: 72, WTI: 145,
  XAG: 93, XAU: 92, XCU: 136, XLM: 119, XMR: 77, XPD: 146, XPL: 71, XPT: 147,
  XRP: 7, YZY: 70, ZEC: 90, ZK: 56, ZORA: 53, ZRO: 60,
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

function toFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function withSnapshotFallback(
  live: Partial<LiveDivergencePrice>,
  snapshot: SnapshotPrice | null,
): LiveDivergencePrice {
  return {
    markPrice: live.markPrice ?? snapshot?.markPrice ?? null,
    oraclePrice: live.oraclePrice ?? snapshot?.oraclePrice ?? null,
    indexPrice: live.indexPrice ?? snapshot?.indexPrice ?? null,
    openInterestUsd: live.openInterestUsd ?? null,
    receivedAt: live.receivedAt ?? null,
    status: live.status ?? (snapshot ? "fallback" : "connecting"),
  };
}

function useLiveDivergenceLeg({ protocol, symbol, snapshot, enabled }: Leg): LiveDivergencePrice {
  const [live, setLive] = React.useState<Partial<LiveDivergencePrice>>({});
  const snapshotKey = `${snapshot?.markPrice ?? ""}:${snapshot?.oraclePrice ?? ""}:${snapshot?.indexPrice ?? ""}`;

  React.useEffect(() => {
    if (!enabled) {
      setLive({});
      return;
    }

    let ws: WebSocket | null = null;
    let closed = false;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let watchdog: ReturnType<typeof setTimeout> | null = null;

    const setStatus = (status: LiveDivergencePrice["status"]) => {
      if (!closed) setLive((current) => ({ ...current, status }));
    };

    const armWatchdog = () => {
      if (watchdog) clearTimeout(watchdog);
      watchdog = setTimeout(() => setStatus(snapshot ? "fallback" : "error"), 15_000);
    };

    const publish = (price: Partial<LiveDivergencePrice>) => {
      if (closed) return;
      setLive({
        ...price,
        receivedAt: Date.now(),
        status: "live",
      });
      armWatchdog();
    };

    setLive({});
    armWatchdog();

    const base = normalizeBaseSymbol(symbol);

    if (protocol === "hyperliquid" || isHip3ProtocolId(protocol)) {
      ws = new WebSocket("wss://api.hyperliquid.xyz/ws");
      ws.onopen = () => {
        ws?.send(JSON.stringify({
          method: "subscribe",
          subscription: { type: "activeAssetCtx", coin: hyperliquidCoin(protocol, symbol) },
        }));
      };
      ws.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        try {
          const payload = JSON.parse(event.data) as Record<string, unknown>;
          if (payload.channel !== "activeAssetCtx") return;
          const data = payload.data as Record<string, unknown> | undefined;
          const ctx = data?.ctx as Record<string, unknown> | undefined;
          if (!ctx) return;
          publish({
            markPrice: toFiniteNumber(ctx.markPx),
            oraclePrice: toFiniteNumber(ctx.oraclePx),
            indexPrice: null,
          });
        } catch {
          /* ignore malformed ws payloads */
        }
      };
    } else if (protocol === "pacifica") {
      ws = new WebSocket("wss://ws.pacifica.fi/ws");
      ws.onopen = () => {
        ws?.send(JSON.stringify({ method: "subscribe", params: { source: "prices" } }));
        heartbeat = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ method: "ping" }));
          }
        }, 30_000);
      };
      ws.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        try {
          const payload = JSON.parse(event.data) as Record<string, unknown>;
          if (payload.channel === "pong") return;
          if (payload.channel !== "prices") return;
          const rows = Array.isArray(payload.data)
            ? payload.data
            : payload.data && typeof payload.data === "object"
              ? Object.values(payload.data as Record<string, unknown>)
              : [];
          const row = rows.find((entry) => {
            if (!entry || typeof entry !== "object") return false;
            return String((entry as Record<string, unknown>).symbol).toUpperCase() === base;
          }) as Record<string, unknown> | undefined;
          if (!row) return;
          const oracle = toFiniteNumber(row.oracle);
          publish({
            markPrice: toFiniteNumber(row.mark),
            oraclePrice: oracle,
            indexPrice: oracle,
          });
        } catch {
          /* ignore malformed ws payloads */
        }
      };
    } else if (protocol === "aster") {
      ws = new WebSocket(`wss://fstream.asterdex.com/ws/${toAsterSymbol(symbol).toLowerCase()}@markPrice@1s`);
      ws.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        try {
          const payload = JSON.parse(event.data) as Record<string, unknown>;
          const index = toFiniteNumber(payload.i);
          publish({
            markPrice: toFiniteNumber(payload.p),
            oraclePrice: index,
            indexPrice: index,
          });
        } catch {
          /* ignore malformed ws payloads */
        }
      };
    } else if (protocol === "lighter") {
      const marketId = LIGHTER_MARKET_INDEX[base];
      if (marketId === undefined) {
        setStatus(snapshot ? "fallback" : "error");
        return () => {
          closed = true;
          if (watchdog) clearTimeout(watchdog);
        };
      }
      ws = new WebSocket("wss://mainnet.zklighter.elliot.ai/stream");
      ws.onopen = () => {
        ws?.send(JSON.stringify({ type: "subscribe", channel: `market_stats/${marketId}` }));
        heartbeat = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
        }, 30_000);
      };
      ws.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        try {
          const payload = JSON.parse(event.data) as Record<string, unknown>;
          const channel = payload.channel as string | undefined;
          if (!channel?.startsWith("market_stats:")) return;
          const stats = payload.market_stats as Record<string, unknown> | undefined;
          if (!stats) return;
          const index = toFiniteNumber(stats.index_price);
          publish({
            markPrice: toFiniteNumber(stats.mark_price),
            oraclePrice: index,
            indexPrice: index,
          });
        } catch {
          /* ignore malformed ws payloads */
        }
      };
    } else if (protocol === "phoenix") {
      ws = new WebSocket("wss://perp-api.phoenix.trade/v1/ws");
      ws.onopen = () => {
        ws?.send(JSON.stringify({
          type: "subscribe",
          subscription: {
            channel: "market",
            symbol: base,
          },
        }));
      };
      ws.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        try {
          const payload = JSON.parse(event.data) as Record<string, unknown>;
          if (payload.channel !== "market") return;
          const markPrice = toFiniteNumber(payload.markPx);
          const openInterestBase = toFiniteNumber(payload.openInterest);
          publish({
            markPrice,
            oraclePrice: toFiniteNumber(payload.oraclePx),
            indexPrice: toFiniteNumber(payload.oraclePx),
            openInterestUsd:
              markPrice !== null && openInterestBase !== null
                ? markPrice * openInterestBase
                : null,
          });
        } catch {
          /* ignore malformed ws payloads */
        }
      };
    } else {
      setStatus(snapshot ? "fallback" : "error");
    }

    if (ws) {
      ws.onerror = () => setStatus(snapshot ? "fallback" : "error");
      ws.onclose = () => setStatus(snapshot ? "fallback" : "error");
    }

    return () => {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      if (watchdog) clearTimeout(watchdog);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, protocol, snapshotKey, symbol]);

  return withSnapshotFallback(live, snapshot);
}

export function useLiveDivergencePrices({
  longProtocol,
  shortProtocol,
  longSymbol,
  shortSymbol,
  longSnapshot,
  shortSnapshot,
  enabled = true,
}: {
  longProtocol: string;
  shortProtocol: string;
  longSymbol: string;
  shortSymbol: string;
  longSnapshot: SnapshotPrice | null;
  shortSnapshot: SnapshotPrice | null;
  enabled?: boolean;
}): LiveDivergencePrices {
  const long = useLiveDivergenceLeg({
    protocol: longProtocol,
    symbol: longSymbol,
    snapshot: longSnapshot,
    enabled,
  });
  const short = useLiveDivergenceLeg({
    protocol: shortProtocol,
    symbol: shortSymbol,
    snapshot: shortSnapshot,
    enabled,
  });

  return { long, short };
}
