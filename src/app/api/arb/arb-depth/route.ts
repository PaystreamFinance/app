import type { NextRequest } from "next/server";
import { z } from "zod";
import { computeArbDepthForPair } from "@/lib/arb-depth/compute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const venueSchema = z.enum([
  "hyperliquid",
  "pacifica",
  "lighter",
  "aster",
  "01",
  "phoenix",
  "hl:xyz",
  "hl:flx",
  "hl:hyna",
  "hl:km",
  "hl:cash",
  "hl:para",
]);

const requestSchema = z
  .object({
    symbol: z.string().min(1).max(20).regex(/^[A-Za-z0-9]+(-PERP)?$/),
    symbols: z
      .object({
        long: z.string().min(1).max(20).regex(/^[A-Za-z0-9]+(-PERP)?$/).optional(),
        short: z.string().min(1).max(20).regex(/^[A-Za-z0-9]+(-PERP)?$/).optional(),
      })
      .optional(),
    longVenue: venueSchema,
    shortVenue: venueSchema,
    r0Pct: z.coerce.number(),
    longTakerFeeBps: z.coerce.number().nonnegative(),
    shortTakerFeeBps: z.coerce.number().nonnegative(),
    longVenueOiUsd: z.coerce.number().nonnegative().optional(),
    shortVenueOiUsd: z.coerce.number().nonnegative().optional(),
  })
  .refine((input) => input.longVenue !== input.shortVenue, {
    message: "Long and short venues must be different.",
    path: ["longVenue"],
  });

export async function POST(request: NextRequest): Promise<Response> {
  try {
    let json: unknown;
    try { json = await request.json(); } catch {
      return Response.json({ status: "error", error: "Invalid JSON body" }, { status: 400 });
    }
    const input = requestSchema.parse(json);

    const result = await computeArbDepthForPair({
      symbol: input.symbol,
      symbols: input.symbols,
      longVenue: input.longVenue,
      shortVenue: input.shortVenue,
      r0Pct: input.r0Pct,
      longTakerFeeBps: input.longTakerFeeBps,
      shortTakerFeeBps: input.shortTakerFeeBps,
      longVenueOiUsd: input.longVenueOiUsd,
      shortVenueOiUsd: input.shortVenueOiUsd,
    });

    return Response.json({ status: "success", data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { status: "error", error: "Invalid request payload", details: error.issues },
        { status: 400 },
      );
    }

    const message = error instanceof Error ? error.message : "Failed to compute arb depth";
    return Response.json({ status: "error", error: message }, { status: 500 });
  }
}
