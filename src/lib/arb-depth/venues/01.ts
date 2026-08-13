// ─── 01 Exchange Venue Adapter (Tier 3) ───
//
// Data sources:
//   Orderbook: WS via getLiveOrderbook("01", symbol)
//   OI: Comes from the Paystream /markets response via arb-depth request params

import type { VenueAdapter } from "./base";
import type { VenueData } from "../types";
import { getLiveOrderbook } from "@/lib/perp-orderbook-ws";
import { computeBookLiquidity } from "./utils";

export const zeroOneAdapter: VenueAdapter = {
  venue: "01",
  constants: { interestRate: 0.0001, clampWidth: 0.0005, slippageTier: "tier3" },

  async fetchData(symbol: string): Promise<VenueData | null> {
    try {
      const result = await getLiveOrderbook("01", symbol, { timeoutMs: 6000, maxAgeMs: 4000 });
      const book = { bids: result.book.bids, asks: result.book.asks };
      if (book.bids.length === 0 || book.asks.length === 0) return null;

      const { askLiquidityUsd, bidLiquidityUsd } = computeBookLiquidity(book);
      const midPrice = (book.bids[0]!.price + book.asks[0]!.price) / 2;

      return {
        venue: "01",
        book,
        impact: null,
        oraclePrice: midPrice,
        premium: 0,
        askLiquidityUsd,
        bidLiquidityUsd,
        openInterestUsd: 0, // OI comes from markets API via request params
      };
    } catch {
      return null;
    }
  },
};
