import {
  bpsToRatio as bpsToRatioSafe,
  ratioToBps as ratioToBpsSafe,
} from "@/lib/math/primitives";

export type PerpProtocol =
  | "drift"
  | "pacifica"
  | "hyperliquid"
  | "lighter"
  | "aster"
  | "01"
  | "phoenix"
  | "hl:xyz"
  | "hl:flx"
  | "hl:hyna"
  | "hl:km"
  | "hl:cash"
  | "hl:para";

export interface OrderbookLevel {
  price: number;
  size: number;
}

export interface NormalizedOrderbook {
  protocol: PerpProtocol;
  symbol: string;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  timestamp: number;
  receivedAt: number;
}

export interface FilledLevel {
  price: number;
  baseSize: number;
  quoteSize: number;
}

export interface SimulatedFill {
  side: "buy" | "sell";
  targetNotionalUsd: number;
  filledNotionalUsd: number;
  unfilledNotionalUsd: number;
  filledBaseSize: number;
  averagePrice: number | null;
  levels: FilledLevel[];
}

export interface LegExecutionMetrics {
  midPrice: number;
  vwap: number | null;
  slippageRatio: number | null;
  slippagePct: number | null;
  slippageBps: number | null;
  filledUsd: number;
  unfilledUsd: number;
  filledBaseSize: number;
}

export interface ExecutionComputationInput {
  longBook: NormalizedOrderbook;
  shortBook: NormalizedOrderbook;
  notionalPerLegUsd: number;
  longTakerFeeBps?: number;
  shortTakerFeeBps?: number;
  /**
   * Funding spread in **percent units, per hour** (e.g. 0.0125 for 1.25 bps/hr).
   * Callers MUST normalize venue-specific intervals (HL=1h, Aster=8h, Lighter=
   * variable) to per-hour before passing here — see `legsFromMarket` in
   * arbitrage-utils.ts which divides by `intervalHours`. Passing a per-8h
   * value silently inflates the projection by 8×.
   */
  fundingSpreadPct?: number;
  timeFrameDays?: number;
}

export interface ExecutionComputationResult {
  notionalPerLegUsd: number;
  long: LegExecutionMetrics;
  short: LegExecutionMetrics;
  totalSlippageRatio: number | null;
  totalSlippagePct: number | null;
  totalSlippageBps: number | null;
  totalFeesRatio: number;
  totalFeesPct: number;
  totalFeesBps: number;
  totalExecutionCostRatio: number | null;
  totalExecutionCostPct: number | null;
  totalExecutionCostBps: number | null;
  expectedFundingRatio: number | null;
  expectedFundingPct: number | null;
  isProfitable: boolean | null;
  hasInsufficientDepth: boolean;
}

const EPSILON = 1e-9;

export function ratioToPct(value: number): number {
  return value * 100;
}

export function ratioToBps(value: number): number {
  return ratioToBpsSafe(value);
}

export function bpsToRatio(value: number): number {
  return bpsToRatioSafe(value);
}

export function sanitizeOrderbookLevels(
  levels: OrderbookLevel[],
  side: "bids" | "asks",
): OrderbookLevel[] {
  const sanitized = levels
    .filter(
      (level) => Number.isFinite(level.price) && Number.isFinite(level.size),
    )
    .filter((level) => level.price > 0 && level.size > 0);

  sanitized.sort((a, b) =>
    side === "bids" ? b.price - a.price : a.price - b.price,
  );

  return sanitized;
}

export function computeMidPrice(
  book: Pick<NormalizedOrderbook, "bids" | "asks">,
): number | null {
  const bestBid = book.bids[0]?.price;
  const bestAsk = book.asks[0]?.price;
  if (
    bestBid === undefined ||
    bestAsk === undefined ||
    bestBid <= 0 ||
    bestAsk <= 0
  ) {
    return null;
  }
  return (bestBid + bestAsk) / 2;
}

export function simulateFillByNotional(
  levels: OrderbookLevel[],
  targetNotionalUsd: number,
  side: "buy" | "sell",
): SimulatedFill {
  const normalizedTarget = Number.isFinite(targetNotionalUsd)
    ? Math.max(targetNotionalUsd, 0)
    : 0;

  if (normalizedTarget <= 0) {
    return {
      side,
      targetNotionalUsd: 0,
      filledNotionalUsd: 0,
      unfilledNotionalUsd: 0,
      filledBaseSize: 0,
      averagePrice: null,
      levels: [],
    };
  }

  let remainingUsd = normalizedTarget;
  let filledUsd = 0;
  let filledBase = 0;
  const filledLevels: FilledLevel[] = [];

  for (const level of levels) {
    if (remainingUsd <= EPSILON) break;
    if (!Number.isFinite(level.price) || !Number.isFinite(level.size)) continue;
    if (level.price <= 0 || level.size <= 0) continue;

    const levelCapacityUsd = level.price * level.size;
    if (levelCapacityUsd <= EPSILON) continue;

    const takeUsd = Math.min(remainingUsd, levelCapacityUsd);
    const takeBase = takeUsd / level.price;

    filledUsd += takeUsd;
    filledBase += takeBase;
    remainingUsd -= takeUsd;

    filledLevels.push({
      price: level.price,
      baseSize: takeBase,
      quoteSize: takeUsd,
    });
  }

  const unfilled = Math.max(normalizedTarget - filledUsd, 0);
  const averagePrice = filledBase > EPSILON ? filledUsd / filledBase : null;

  return {
    side,
    targetNotionalUsd: normalizedTarget,
    filledNotionalUsd: filledUsd,
    unfilledNotionalUsd: unfilled,
    filledBaseSize: filledBase,
    averagePrice,
    levels: filledLevels,
  };
}

export function computeLegExecution(
  book: NormalizedOrderbook,
  leg: "long" | "short",
  notionalUsd: number,
): LegExecutionMetrics {
  const midPrice = computeMidPrice(book);
  if (midPrice === null) {
    return {
      midPrice: 0,
      vwap: null,
      slippageRatio: null,
      slippagePct: null,
      slippageBps: null,
      filledUsd: 0,
      unfilledUsd: Math.max(notionalUsd, 0),
      filledBaseSize: 0,
    };
  }

  const fill =
    leg === "long"
      ? simulateFillByNotional(book.asks, notionalUsd, "buy")
      : simulateFillByNotional(book.bids, notionalUsd, "sell");

  const vwap = fill.averagePrice;
  const rawSlippageRatio =
    vwap === null
      ? null
      : leg === "long"
        ? (vwap - midPrice) / midPrice
        : (midPrice - vwap) / midPrice;
  const slippageRatio =
    rawSlippageRatio === null ? null : Math.max(rawSlippageRatio, 0);

  return {
    midPrice,
    vwap,
    slippageRatio,
    slippagePct: slippageRatio === null ? null : ratioToPct(slippageRatio),
    slippageBps: slippageRatio === null ? null : ratioToBps(slippageRatio),
    filledUsd: fill.filledNotionalUsd,
    unfilledUsd: fill.unfilledNotionalUsd,
    filledBaseSize: fill.filledBaseSize,
  };
}

export function computeExecutionCost(
  input: ExecutionComputationInput,
): ExecutionComputationResult {
  const notionalPerLegUsd = Math.max(input.notionalPerLegUsd, 0);
  const timeFrameDays = input.timeFrameDays ?? 1;
  const long = computeLegExecution(input.longBook, "long", notionalPerLegUsd);
  const short = computeLegExecution(
    input.shortBook,
    "short",
    notionalPerLegUsd,
  );

  const hasInsufficientDepth =
    long.unfilledUsd > EPSILON || short.unfilledUsd > EPSILON;

  const totalSlippageRatio =
    long.slippageRatio !== null && short.slippageRatio !== null
      ? long.slippageRatio + short.slippageRatio
      : null;

  const totalFeesBps =
    Math.max(input.longTakerFeeBps ?? 0, 0) +
    Math.max(input.shortTakerFeeBps ?? 0, 0);
  const totalFeesRatio = bpsToRatio(totalFeesBps);

  const totalExecutionCostRatio =
    totalSlippageRatio === null ? null : totalSlippageRatio + totalFeesRatio;

  // input.fundingSpreadPct is per-hour percent (see contract on the type).
  // Total expected % over the holding period = rate * 24 * days.
  const expectedFundingPct =
    input.fundingSpreadPct === undefined
      ? null
      : input.fundingSpreadPct * 24 * timeFrameDays;
  const expectedFundingRatio =
    expectedFundingPct === null ? null : expectedFundingPct / 100;

  const isProfitable =
    expectedFundingRatio === null || totalExecutionCostRatio === null
      ? null
      : expectedFundingRatio > totalExecutionCostRatio;

  return {
    notionalPerLegUsd,
    long,
    short,
    totalSlippageRatio,
    totalSlippagePct:
      totalSlippageRatio === null ? null : ratioToPct(totalSlippageRatio),
    totalSlippageBps:
      totalSlippageRatio === null ? null : ratioToBps(totalSlippageRatio),
    totalFeesRatio,
    totalFeesPct: ratioToPct(totalFeesRatio),
    totalFeesBps,
    totalExecutionCostRatio,
    totalExecutionCostPct:
      totalExecutionCostRatio === null
        ? null
        : ratioToPct(totalExecutionCostRatio),
    totalExecutionCostBps:
      totalExecutionCostRatio === null
        ? null
        : ratioToBps(totalExecutionCostRatio),
    expectedFundingRatio,
    expectedFundingPct,
    isProfitable,
    hasInsufficientDepth,
  };
}
