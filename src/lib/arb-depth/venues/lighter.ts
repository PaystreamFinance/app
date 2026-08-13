// ─── Lighter Venue Adapter (Tier 3) ───
//
// Data sources:
//   Orderbook: WS via getLiveOrderbook("lighter", symbol)
//   Mark price, Index price, OI, Funding: WS market_stats channel (same connection, cached)
//
// market_stats is subscribed alongside order_book on the same persistent WS.
// No additional connections opened per request.

import type { VenueAdapter } from "./base";
import type { VenueData } from "../types";
import { getLiveOrderbook, getLighterMarketStats, isLighterSymbolSupported } from "@/lib/perp-orderbook-ws";
import { computeBookLiquidity } from "./utils";
import { computePremium } from "@/lib/math/premium";

export const lighterAdapter: VenueAdapter = {
  venue: "lighter",
  constants: { interestRate: 0.0001, clampWidth: 0.005, slippageTier: "tier3" },

  async fetchData(symbol: string): Promise<VenueData | null> {
    // Early check: skip unsupported symbols to avoid 6s WS timeout
    if (!isLighterSymbolSupported(symbol)) return null;

    try {
      const result = await getLiveOrderbook("lighter", symbol, { timeoutMs: 6000, maxAgeMs: 4000 });
      const book = { bids: result.book.bids, asks: result.book.asks };
      if (book.bids.length === 0 || book.asks.length === 0) return null;

      const { askLiquidityUsd, bidLiquidityUsd } = computeBookLiquidity(book);
      const midPrice = (book.bids[0]!.price + book.asks[0]!.price) / 2;

      // market_stats arrives on the same WS — cached by the connection
      const stats = getLighterMarketStats(symbol);

      const oraclePrice = stats?.indexPrice ?? midPrice;
      const markPrice = stats?.markPrice ?? midPrice;
      const premium = computePremium(markPrice, oraclePrice);

      return {
        venue: "lighter",
        book,
        impact: null,
        oraclePrice,
        premium,
        askLiquidityUsd,
        bidLiquidityUsd,
        openInterestUsd: 0, // OI comes from markets API via request params
      };
    } catch {
      return null;
    }
  },
};
