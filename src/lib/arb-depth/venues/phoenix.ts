// ─── Phoenix Venue Adapter (Tier 3) ───
//
// Data sources:
//   Orderbook: WS via getLiveOrderbook("phoenix", symbol)
//   Mark/index: falls back to the live book mid. Divergence UI consumes the
//   Phoenix market WebSocket directly for mark/oracle updates.

import type { VenueAdapter } from "./base";
import type { VenueData } from "../types";
import { getLiveOrderbook } from "@/lib/perp-orderbook-ws";
import { computeBookLiquidity } from "./utils";

export const phoenixAdapter: VenueAdapter = {
  venue: "phoenix",
  constants: { interestRate: 0.0001, clampWidth: 0.0005, slippageTier: "tier3" },

  async fetchData(symbol: string): Promise<VenueData | null> {
    const result = await getLiveOrderbook("phoenix", symbol, {
      timeoutMs: 6_000,
      maxAgeMs: 4_000,
    });
    const book = result.book;
    if (book.bids.length === 0 || book.asks.length === 0) return null;

    const { askLiquidityUsd, bidLiquidityUsd } = computeBookLiquidity(book);
    const midPrice = (book.bids[0]!.price + book.asks[0]!.price) / 2;

    return {
      venue: "phoenix",
      book,
      impact: null,
      oraclePrice: midPrice,
      premium: 0,
      askLiquidityUsd,
      bidLiquidityUsd,
      openInterestUsd: 0,
    };
  },
};
