#!/usr/bin/env bun

/**
 * Simulate perp-to-perp execution cost using the implemented route:
 * POST /api/arb/perp-execution-cost
 *
 * Default scenario:
 * - symbol: SOL
 * - long: hyperliquid
 * - short: drift
 * - totalMarginUsd: 1000
 * - leverage: 1
 *
 * Usage examples:
 *   bun run sim:sol:hl
 *   bun run sim:sol:hl -- --margin 1000 --leverage 2 --short pacifica
 *   BASE_URL=http://localhost:3001 bun run sim:sol:hl
 */

const argv = process.argv.slice(2);

if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`Usage:
  bun run sim:sol:hl [-- --symbol SOL --long hyperliquid --short drift --margin 1000 --leverage 1 --days 1 --funding-spread-pct 0.05 --long-fee-bps 4 --short-fee-bps 4 --timeout-ms 4500 --max-book-age-ms 2500]

Examples:
  bun run sim:sol:hl
  bun run sim:sol:hl -- --margin 1000 --leverage 2 --short pacifica
  BASE_URL=http://localhost:3001 bun run sim:sol:hl`);
  process.exit(0);
}

function getArg(name, fallback) {
  const idx = argv.indexOf(name);
  if (idx === -1) return fallback;
  const value = argv[idx + 1];
  if (value === undefined || value.startsWith("--")) return fallback;
  return value;
}

function getNumberArg(name, fallback) {
  const value = getArg(name, String(fallback));
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function fmt(value, digits = 6) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "N/A";
  return Number(value).toFixed(digits);
}

const baseUrl = process.env.BASE_URL || "http://localhost:3000";

const symbol = (getArg("--symbol", "SOL") || "SOL").toUpperCase();
const longProtocol = getArg("--long", "hyperliquid");
const shortProtocol = getArg("--short", "drift");
const totalMarginUsd = getNumberArg("--margin", 1000);
const leverage = getNumberArg("--leverage", 1);
const timeFrameDays = getNumberArg("--days", 1);
const fundingSpreadPct = getNumberArg("--funding-spread-pct", 0.05);
const longTakerBps = getNumberArg("--long-fee-bps", 4);
const shortTakerBps = getNumberArg("--short-fee-bps", 4);
const timeoutMs = getNumberArg("--timeout-ms", 4500);
const maxBookAgeMs = getNumberArg("--max-book-age-ms", 2500);

if (longProtocol === shortProtocol) {
  console.error("long and short protocols must be different.");
  process.exit(1);
}

const payload = {
  symbol,
  protocols: {
    long: longProtocol,
    short: shortProtocol,
  },
  totalMarginUsd,
  leverage,
  timeFrameDays,
  fundingSpreadPct,
  feesBps: {
    longTakerBps,
    shortTakerBps,
  },
  timeoutMs,
  maxBookAgeMs,
};

async function main() {
  console.log("=== SOL Perp-to-Perp Execution Simulation ===");
  console.log("POST", `${baseUrl}/api/arb/perp-execution-cost`);
  console.log("payload:", JSON.stringify(payload, null, 2));
  console.log("");

  const res = await fetch(`${baseUrl}/api/arb/perp-execution-cost`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok || data?.status !== "success") {
    console.error("Request failed:");
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  }

  const q = data;

  // Recompute formulas locally from response values to make the logic explicit.
  const notionalPerLegUsd = (totalMarginUsd * leverage) / 2;
  const longVwapRecomputed =
    q.long.filledBaseSize > 0 ? q.long.filledUsd / q.long.filledBaseSize : null;
  const shortVwapRecomputed =
    q.short.filledBaseSize > 0 ? q.short.filledUsd / q.short.filledBaseSize : null;
  const longSlippageRatio =
    q.long.vwap != null ? (q.long.vwap - q.long.midPrice) / q.long.midPrice : null;
  const shortSlippageRatio =
    q.short.vwap != null ? (q.short.midPrice - q.short.vwap) / q.short.midPrice : null;
  const totalSlippageRatio =
    longSlippageRatio != null && shortSlippageRatio != null
      ? longSlippageRatio + shortSlippageRatio
      : null;
  const totalFeesRatio = (longTakerBps + shortTakerBps) / 10_000;
  const totalExecutionCostRatio =
    totalSlippageRatio != null ? totalSlippageRatio + totalFeesRatio : null;
  const expectedFundingPct = fundingSpreadPct * 24 * timeFrameDays;
  const expectedFundingRatio = expectedFundingPct / 100;
  const isProfitable =
    totalExecutionCostRatio != null ? expectedFundingRatio > totalExecutionCostRatio : null;

  console.log("=== Route Output (key fields) ===");
  console.log(`symbol: ${q.symbol}`);
  console.log(`long protocol: ${q.long.protocol}`);
  console.log(`short protocol: ${q.short.protocol}`);
  console.log(`notionalPerLegUsd: ${fmt(q.notionalPerLegUsd, 2)}`);
  console.log(`long mid: ${fmt(q.long.midPrice)}`);
  console.log(`long vwap: ${fmt(q.long.vwap)}`);
  console.log(`short mid: ${fmt(q.short.midPrice)}`);
  console.log(`short vwap: ${fmt(q.short.vwap)}`);
  console.log(`totalSlippagePct: ${fmt(q.totalSlippagePct)}%`);
  console.log(`totalExecutionCostPct: ${fmt(q.totalExecutionCostPct)}%`);
  console.log(`expectedFundingPct: ${fmt(q.expectedFundingPct)}%`);
  console.log(`isProfitable: ${String(q.isProfitable)}`);
  console.log(`hasInsufficientDepth: ${String(q.hasInsufficientDepth)}`);
  if (Array.isArray(q.warnings) && q.warnings.length) {
    console.log("warnings:");
    for (const warning of q.warnings) {
      console.log(`  - ${warning}`);
    }
  }
  console.log("");

  console.log("=== Formula Breakdown (implemented logic) ===");
  console.log("0) Orderbook walk logic (per level i):");
  console.log("   levelCapacityUsd_i = price_i * size_i");
  console.log("   takeUsd_i = min(remainingUsd_{i-1}, levelCapacityUsd_i)");
  console.log("   takeBase_i = takeUsd_i / price_i");
  console.log("   filledUsd = Σ takeUsd_i, filledBase = Σ takeBase_i");
  console.log("   VWAP = filledUsd / filledBase");
  console.log(
    `1) notionalPerLegUsd = (totalMarginUsd * leverage) / 2 = (${totalMarginUsd} * ${leverage}) / 2 = ${fmt(notionalPerLegUsd, 2)}`,
  );
  console.log(
    `2) vwapLong = filledUsdLong / filledBaseLong = ${fmt(q.long.filledUsd, 6)} / ${fmt(q.long.filledBaseSize, 6)} = ${fmt(longVwapRecomputed, 6)}`,
  );
  console.log(
    `3) vwapShort = filledUsdShort / filledBaseShort = ${fmt(q.short.filledUsd, 6)} / ${fmt(q.short.filledBaseSize, 6)} = ${fmt(shortVwapRecomputed, 6)}`,
  );
  console.log(
    `4) slippageLong = (vwapLong - midLong) / midLong = (${fmt(q.long.vwap)} - ${fmt(q.long.midPrice)}) / ${fmt(q.long.midPrice)} = ${fmt(longSlippageRatio)}`,
  );
  console.log(
    `5) slippageShort = (midShort - vwapShort) / midShort = (${fmt(q.short.midPrice)} - ${fmt(q.short.vwap)}) / ${fmt(q.short.midPrice)} = ${fmt(shortSlippageRatio)}`,
  );
  console.log(
    `6) totalSlippage = slippageLong + slippageShort = ${fmt(longSlippageRatio)} + ${fmt(shortSlippageRatio)} = ${fmt(totalSlippageRatio)}`,
  );
  console.log(
    `7) totalFeesRatio = (longFeeBps + shortFeeBps) / 10_000 = (${longTakerBps} + ${shortTakerBps}) / 10000 = ${fmt(totalFeesRatio)}`,
  );
  console.log(
    `8) totalExecutionCost = totalSlippage + totalFeesRatio = ${fmt(totalSlippageRatio)} + ${fmt(totalFeesRatio)} = ${fmt(totalExecutionCostRatio)}`,
  );
  console.log(
    `9) expectedFundingPct = fundingSpreadPct * 24 * timeFrameDays = ${fundingSpreadPct} * 24 * ${timeFrameDays} = ${fmt(expectedFundingPct)}%`,
  );
  console.log(
    `10) expectedFundingRatio = expectedFundingPct / 100 = ${fmt(expectedFundingPct)} / 100 = ${fmt(expectedFundingRatio)}`,
  );
  console.log(
    `11) profitable? expectedFundingRatio > totalExecutionCost = ${fmt(expectedFundingRatio)} > ${fmt(totalExecutionCostRatio)} => ${String(isProfitable)}`,
  );

  console.log("");
  console.log("=== Cross-check vs API ===");
  console.log(
    `API long.vwap=${fmt(q.long.vwap)} | recomputed=${fmt(longVwapRecomputed)}`,
  );
  console.log(
    `API short.vwap=${fmt(q.short.vwap)} | recomputed=${fmt(shortVwapRecomputed)}`,
  );
  console.log(
    `API totalSlippageRatio=${fmt(q.totalSlippageRatio)} | local=${fmt(totalSlippageRatio)}`,
  );
  console.log(
    `API totalFeesRatio=${fmt(q.totalFeesRatio)} | local=${fmt(totalFeesRatio)}`,
  );
  console.log(
    `API totalExecutionCostRatio=${fmt(q.totalExecutionCostRatio)} | local=${fmt(totalExecutionCostRatio)}`,
  );
}

main().catch((err) => {
  console.error("Simulation script failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
