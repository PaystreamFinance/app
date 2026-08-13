import type { NextRequest } from "next/server";
import { z } from "zod";

import type { SlippageTier } from "@/lib/arb-depth/types";
import { computeExecutionCost } from "@/lib/perp-orderbook-simulation";
import type { PerpProtocol } from "@/lib/perp-orderbook-simulation";
import { ratioToBps, ratioToPct } from "@/lib/perp-orderbook-simulation";
import { getLiveOrderbooksForPair } from "@/lib/perp-orderbook-ws";
import { computeSlippage } from "@/lib/arb-depth/venues/utils";
import { HIP3_PROTOCOL_IDS } from "@/lib/protocol-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EXECUTION_COST_PROTOCOLS = [
  "drift",
  "pacifica",
  "hyperliquid",
  "aster",
  "lighter",
  "01",
  "phoenix",
  ...HIP3_PROTOCOL_IDS,
] as const;

const protocolSchema = z.enum(EXECUTION_COST_PROTOCOLS);
const ORDERBOOK_SUPPORTED_PROTOCOLS = new Set([
  "drift",
  "pacifica",
  "hyperliquid",
  "aster",
  "lighter",
  "01",
  "phoenix",
  ...HIP3_PROTOCOL_IDS,
]);

function getSlippageTier(protocol: PerpProtocol): SlippageTier {
  switch (protocol) {
    case "hyperliquid":
    case "drift":
    case "hl:xyz":
    case "hl:flx":
    case "hl:hyna":
    case "hl:km":
    case "hl:cash":
    case "hl:para":
      return "tier1";
    case "pacifica":
      return "tier1_5";
    case "aster":
    case "lighter":
    case "01":
    case "phoenix":
      return "tier3";
  }
}

const requestSchema = z
  .object({
    symbol: z.string().min(1),
    symbols: z
      .object({
        long: z.string().min(1).optional(),
        short: z.string().min(1).optional(),
      })
      .optional(),
    openInterestUsd: z
      .object({
        long: z.coerce.number().positive().optional(),
        short: z.coerce.number().positive().optional(),
      })
      .optional(),
    protocols: z.object({
      long: protocolSchema,
      short: protocolSchema,
    }),
    totalMarginUsd: z.coerce.number().positive(),
    leverage: z.coerce.number().positive(),
    timeFrameDays: z.coerce.number().positive().default(1),
    fundingSpreadPct: z.coerce.number().optional(),
    feesBps: z
      .object({
        longTakerBps: z.coerce.number().nonnegative().optional(),
        shortTakerBps: z.coerce.number().nonnegative().optional(),
      })
      .optional(),
    timeoutMs: z.coerce.number().int().positive().max(15_000).optional(),
    maxBookAgeMs: z.coerce.number().int().positive().max(15_000).optional(),
  })
  .refine((input) => input.protocols.long !== input.protocols.short, {
    message: "Long and short protocols must be different.",
    path: ["protocols"],
  });

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const json = (await request.json()) as unknown;
    const input = requestSchema.parse(json);

    // Orderbook simulation is only enabled for venues with live book adapters.
    if (
      !ORDERBOOK_SUPPORTED_PROTOCOLS.has(input.protocols.long) ||
      !ORDERBOOK_SUPPORTED_PROTOCOLS.has(input.protocols.short)
    ) {
      const unsupported = [input.protocols.long, input.protocols.short].filter(
        (p) => !ORDERBOOK_SUPPORTED_PROTOCOLS.has(p),
      );
      return Response.json(
        {
          status: "error",
          error: `Execution cost quote not yet available for: ${unsupported.join(", ")}`,
        },
        { status: 400 },
      );
    }

    const notionalPerLegUsd = (input.totalMarginUsd * input.leverage) / 2;
    // Safe to cast — unsupported protocols are rejected above
    const longProto = input.protocols.long as PerpProtocol;
    const shortProto = input.protocols.short as PerpProtocol;

    const books = await getLiveOrderbooksForPair({
      symbol: input.symbol,
      longSymbol: input.symbols?.long,
      shortSymbol: input.symbols?.short,
      longProtocol: longProto,
      shortProtocol: shortProto,
      timeoutMs: input.timeoutMs,
      maxAgeMs: input.maxBookAgeMs,
    });

    const metrics = computeExecutionCost({
      longBook: books.long.book,
      shortBook: books.short.book,
      notionalPerLegUsd,
      longTakerFeeBps: input.feesBps?.longTakerBps,
      shortTakerFeeBps: input.feesBps?.shortTakerBps,
      fundingSpreadPct: input.fundingSpreadPct,
      timeFrameDays: input.timeFrameDays,
    });

    const longTier = getSlippageTier(longProto);
    const shortTier = getSlippageTier(shortProto);

    const longSlippage = computeSlippage(
      "long",
      books.long.book,
      notionalPerLegUsd,
      null,
      input.openInterestUsd?.long,
      longTier,
    );
    const shortSlippage = computeSlippage(
      "short",
      books.short.book,
      notionalPerLegUsd,
      null,
      input.openInterestUsd?.short,
      shortTier,
    );

    const longSlippageRatio = longSlippage.slippageRatio;
    const shortSlippageRatio = shortSlippage.slippageRatio;
    const totalSlippageRatio = longSlippageRatio + shortSlippageRatio;
    const totalExecutionCostRatio =
      totalSlippageRatio + metrics.totalFeesRatio;

    const warnings = [
      ...books.long.warnings.map((warning) => `long:${warning}`),
      ...books.short.warnings.map((warning) => `short:${warning}`),
    ];

    if (metrics.hasInsufficientDepth) {
      warnings.push(
        "Insufficient orderbook depth to fully fill leveraged notional on one or both legs.",
      );
      if (input.openInterestUsd?.long || input.openInterestUsd?.short) {
        warnings.push(
          "Execution cost extends beyond visible book depth; unfilled size was extrapolated with the venue OI slippage model.",
        );
      } else {
        warnings.push(
          "Execution cost may be understated because the trade size exceeds the visible orderbook and no venue OI was provided for extrapolation.",
        );
      }
    }

    return Response.json({
      status: "success",
      symbol: books.long.book.symbol,
      symbols: {
        long: books.long.book.symbol,
        short: books.short.book.symbol,
      },
      protocols: input.protocols,
      timeFrameDays: input.timeFrameDays,
      notionalPerLegUsd: metrics.notionalPerLegUsd,
      long: {
        protocol: input.protocols.long,
        midPrice: metrics.long.midPrice,
        vwap: metrics.long.vwap,
        slippageRatio: longSlippageRatio,
        slippagePct: ratioToPct(longSlippageRatio),
        slippageBps: ratioToBps(longSlippageRatio),
        filledUsd: metrics.long.filledUsd,
        unfilledUsd: metrics.long.unfilledUsd,
        filledBaseSize: metrics.long.filledBaseSize,
      },
      short: {
        protocol: input.protocols.short,
        midPrice: metrics.short.midPrice,
        vwap: metrics.short.vwap,
        slippageRatio: shortSlippageRatio,
        slippagePct: ratioToPct(shortSlippageRatio),
        slippageBps: ratioToBps(shortSlippageRatio),
        filledUsd: metrics.short.filledUsd,
        unfilledUsd: metrics.short.unfilledUsd,
        filledBaseSize: metrics.short.filledBaseSize,
      },
      totalSlippageRatio,
      totalSlippagePct: ratioToPct(totalSlippageRatio),
      totalSlippageBps: ratioToBps(totalSlippageRatio),
      totalFeesRatio: metrics.totalFeesRatio,
      totalFeesPct: metrics.totalFeesPct,
      totalFeesBps: metrics.totalFeesBps,
      totalExecutionCostRatio,
      totalExecutionCostPct: ratioToPct(totalExecutionCostRatio),
      totalExecutionCostBps: ratioToBps(totalExecutionCostRatio),
      expectedFundingRatio: metrics.expectedFundingRatio,
      expectedFundingPct: metrics.expectedFundingPct,
      isProfitable:
        metrics.expectedFundingRatio === null
          ? null
          : metrics.expectedFundingRatio > totalExecutionCostRatio,
      hasInsufficientDepth: metrics.hasInsufficientDepth,
      bookTimestamps: {
        long: {
          exchangeTimestamp: books.long.book.timestamp,
          receivedAt: books.long.book.receivedAt,
        },
        short: {
          exchangeTimestamp: books.short.book.timestamp,
          receivedAt: books.short.book.receivedAt,
        },
      },
      warnings,
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

    const message =
      error instanceof Error
        ? error.message
        : "Failed to compute execution cost";
    return Response.json(
      {
        status: "error",
        error: message,
      },
      { status: 500 },
    );
  }
}
