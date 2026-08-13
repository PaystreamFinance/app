import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Level = { price: number; size: number };

const querySchema = z.object({
  marketId: z.coerce.number().int().min(0),
  symbol: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(13).max(250).default(80),
});

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function aggregateOrders(rawOrders: unknown, side: "bid" | "ask"): Level[] {
  if (!Array.isArray(rawOrders)) return [];
  const levels = new Map<number, number>();

  for (const order of rawOrders) {
    if (!order || typeof order !== "object") continue;
    const record = order as Record<string, unknown>;
    const price = toNumber(record.price);
    const size = toNumber(record.remaining_base_amount ?? record.size);
    if (price <= 0 || size <= 0) continue;
    levels.set(price, (levels.get(price) ?? 0) + size);
  }

  return Array.from(levels.entries())
    .map(([price, size]) => ({ price, size }))
    .sort((a, b) => side === "bid" ? b.price - a.price : a.price - b.price);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    marketId: url.searchParams.get("marketId"),
    symbol: url.searchParams.get("symbol") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Lighter snapshot request." }, { status: 400 });
  }

  const upstream = new URL("https://mainnet.zklighter.elliot.ai/api/v1/orderBookOrders");
  upstream.searchParams.set("market_id", String(parsed.data.marketId));
  upstream.searchParams.set("limit", String(parsed.data.limit));

  const response = await fetch(upstream.toString(), { cache: "no-store" });
  if (!response.ok) {
    return NextResponse.json(
      { error: `Lighter snapshot failed with HTTP ${response.status}.` },
      { status: 502 },
    );
  }

  const payload = await response.json() as Record<string, unknown>;
  return NextResponse.json({
    protocol: "lighter",
    symbol: parsed.data.symbol,
    bids: aggregateOrders(payload.bids, "bid"),
    asks: aggregateOrders(payload.asks, "ask"),
    timestamp: Date.now(),
  });
}
