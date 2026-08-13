import type { ArbitrageMarket } from "@/lib/arbitrage-api";
import type {
  ArbitrageRowType,
  PairLeg,
  ProtocolKey,
} from "@/app/strategies/_components/arbitrage-columns";
import { selectLongShort } from "@/lib/select-long-short";
import {
  buildEnabledRates,
  HIP3_PROTOCOL_IDS,
  isProtocolEnabled,
  type ProtocolId,
} from "@/lib/protocol-registry";
import { parseFinite } from "@/lib/math/primitives";
import {
  getCategorySynonyms,
  getUnderlying,
  getUnderlyingLabel,
  isRwaCategory,
  type UnderlyingDefinition,
} from "@/lib/symbol-taxonomy";

/** Display threshold below which a funding rate is rounded to exactly 0
 *  for display purposes — values smaller than this are noise from the
 *  upstream API. We *keep* them in the leg list as 0 (not null) so a
 *  near-zero leg can still pair with a strongly-positive leg for arb,
 *  which is one of the highest-EV setups (vs. the previous behaviour of
 *  silently dropping it from pair selection). */
const ZERO_THRESHOLD = 0.00005;

/**
 * Parse a funding-rate display string into percent-unit number.
 * Strips a trailing "%" and validates finiteness via shared primitive.
 * Returns null only when the input is genuinely missing or non-numeric.
 * Near-zero values are clamped to 0 (not null) so pair-selection can still
 * pair a ~0 venue against a strongly-positive one.
 *
 * Output is in *percent units* (e.g. "0.0125%" → 0.0125).
 */
export function parseFundingRate(
  rateStr: string | undefined | null,
): number | null {
  return parsePercentString(rateStr, { zeroClampThreshold: ZERO_THRESHOLD });
}

function parseApr(rateStr: string | undefined | null): number | null {
  return parsePercentString(rateStr);
}

const PROTOCOL_IDS: readonly ProtocolId[] = [
  "drift",
  "flash",
  "pacifica",
  "hyperliquid",
  "aster",
  "lighter",
  "01",
  "phoenix",
  ...HIP3_PROTOCOL_IDS,
];

function isKnownProtocol(id: string | undefined | null): id is ProtocolId {
  return !!id && (PROTOCOL_IDS as readonly string[]).includes(id);
}

function isExcludedPncVenueAlias(
  symbol: string,
  protocol: ProtocolId,
): boolean {
  // Hyperliquid main `GAS` is Neo's gas token, not natural gas. Keep `GAS`
  // in the taxonomy for venues that truly use it as a natural gas ticker, but
  // prevent the main HL crypto listing from entering the PnC/RWA natgas row.
  return symbol.toUpperCase() === "GAS" && protocol === "hyperliquid";
}

function hasUsableVenueFunding(
  venue: { fundingRate?: string; openInterest?: { long?: number; short?: number } } | null | undefined,
): boolean {
  if (!venue?.fundingRate) return false;
  const parsed = parseFundingRate(venue.fundingRate);
  if (parsed === null) return false;
  if (parsed !== 0) return true;
  // 0% rate is usable only when OI >= $5k (real listing with liquidity).
  const oi = (venue.openInterest?.long ?? 0) + (venue.openInterest?.short ?? 0);
  return oi >= 5000;
}

function hasVenueQuote(market: ArbitrageMarket, protocol: ProtocolId): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const venue = (market as any)[protocol] as VenueQuoteLike | null | undefined;
  return hasUsableVenueFunding(venue);
}

function getBackendBestPair(market: ArbitrageMarket): {
  maxArbApr: number;
  spreadBps1h: number;
  longProtocol: ProtocolId;
  shortProtocol: ProtocolId;
} | null {
  const maxArbApr = parseApr(market.maxArbApr);
  const hourlySpreadPct = parseFundingRate(market.maxArb);
  const longProtocol = market.longProtocol;
  const shortProtocol = market.shortProtocol;

  if (
    maxArbApr === null ||
    !isKnownProtocol(longProtocol) ||
    !isKnownProtocol(shortProtocol) ||
    !isProtocolEnabled(longProtocol) ||
    !isProtocolEnabled(shortProtocol) ||
    !hasVenueQuote(market, longProtocol) ||
    !hasVenueQuote(market, shortProtocol) ||
    longProtocol === shortProtocol
  ) {
    return null;
  }

  return {
    maxArbApr,
    spreadBps1h: hourlySpreadPct !== null ? hourlySpreadPct * 100 : (maxArbApr / 8760) * 100,
    longProtocol,
    shortProtocol,
  };
}

function parsePercentString(
  rateStr: string | undefined | null,
  options: { zeroClampThreshold?: number } = {},
): number | null {
  if (!rateStr) return null;
  const cleaned = rateStr.replace("%", "").trim();
  const parsed = parseFinite(cleaned);
  if (parsed === null) return null;
  if (
    options.zeroClampThreshold !== undefined &&
    Math.abs(parsed) < options.zeroClampThreshold
  ) {
    return 0;
  }
  return parsed;
}

function getTotalOI(market: ArbitrageMarket): number {
  // Sum long + short across every known venue, including HIP-3 sub-dexes.
  // Missing venues short-circuit to 0 via optional chaining.
  let total = 0;
  const addVenue = (v: { openInterest?: { long: number; short: number } } | null | undefined) => {
    if (!v?.openInterest) return;
    total += (v.openInterest.long ?? 0) + (v.openInterest.short ?? 0);
  };
  addVenue(market.drift);
  addVenue(market.pacifica);
  if (!isExcludedPncVenueAlias(market.symbol, "hyperliquid")) {
    addVenue(market.hyperliquid);
  }
  addVenue(market.aster);
  addVenue(market.lighter);
  addVenue(market["01"]);
  addVenue(market.phoenix);
  for (const hip3 of HIP3_PROTOCOL_IDS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addVenue((market as any)[hip3]);
  }
  return total;
}

// ─── Venue leg extraction ───
//
// A "leg" is (symbol, venue, rate) — the atom of pair generation. We extract
// per-venue legs from each constituent market, honouring the aster interval
// gating and the lighter per-8h normalisation.

interface RawLeg {
  symbol: string;
  protocol: ProtocolId;
  /** Per-hour percent-unit rate (e.g. 0.0015 for 0.0015%). */
  ratePct: number;
  /** Annualized APR percentage from backend /markets, when available. */
  rateApr: number;
  /** Raw display string from the API ("0.0015%"). */
  rateDisplay: string;
  /** Funding interval in hours, resolved per-market. */
  intervalHours: number;
  /** Next settlement epoch ms, when the API supplies it. */
  nextFundingTime?: number;
}

/** Static fallback intervals per venue. Priority during leg extraction:
 *  per-market API value → history-derived (aster) → this fallback.
 *
 *  Aster fallback is 8h (registry default) so rates never DISAPPEAR when
 *  the funding-rate-history cache briefly empties between refetches.
 *  The previous `null` caused the rate to drop to invalid → column blanked
 *  → looked like "Aster timed out" even though the backend had data.
 *  A consistent slightly-off rate beats an intermittently-missing one. */
const FALLBACK_INTERVAL_HOURS: Record<ProtocolId, number | null> = {
  drift: 1,
  flash: 1,
  pacifica: 1,
  hyperliquid: 1,
  aster: 8,
  lighter: 8,
  "01": 1,
  phoenix: 1,
  // HIP-3 curated sub-dexes — all hourly like main HL.
  "hl:xyz": 1,
  "hl:flx": 1,
  "hl:hyna": 1,
  "hl:km": 1,
  "hl:cash": 1,
  "hl:para": 1,
};

function resolveVenueIntervalHours(
  protocol: ProtocolId,
  apiIntervalHours: number | undefined,
  historyHours?: number,
): number | null {
  // Lighter's live/raw funding rate is an 8h settlement value even when the
  // upstream feed republishes it hourly or labels the cadence as 1h.
  if (protocol === "lighter") return 8;
  return (
    apiIntervalHours ??
    historyHours ??
    FALLBACK_INTERVAL_HOURS[protocol] ??
    null
  );
}

function legsFromMarket(
  market: ArbitrageMarket,
  asterHours: number | undefined,
): RawLeg[] {
  const legs: RawLeg[] = [];

  const pushVenue = (
    protocol: ProtocolId,
    rateStr: string | undefined,
    aprStr: string | undefined,
    apiIntervalHours: number | undefined,
    apiNextFunding: number | undefined,
    openInterest: { long?: number; short?: number } | undefined,
    asterHistoryHours?: number,
  ) => {
    if (isExcludedPncVenueAlias(market.symbol, protocol)) return;
    if (!rateStr) return;
    const parsed = parseFundingRate(rateStr);
    if (parsed === null) return;
    if (parsed === 0) {
      const oi = (openInterest?.long ?? 0) + (openInterest?.short ?? 0);
      if (oi < 5000) return;
      // OI ≥ $5k — keep as a valid 0% leg (e.g. BIRD on a venue that hasn't
      // moved yet but has liquidity). The arb is: long here (pay 0%) and
      // short on the high-rate venue to collect the spread.
    }
    // Priority: protocol override (Lighter) → API per-market →
    // history-derived (Aster) → static fallback.
    const interval = resolveVenueIntervalHours(protocol, apiIntervalHours, asterHistoryHours);
    if (interval === null || interval <= 0) return;
    const scaled = parsed / interval;
    if (!Number.isFinite(scaled)) return;
    const rateApr = parseApr(aprStr) ?? scaled * 24 * 365;
    legs.push({
      symbol: market.symbol,
      protocol,
      ratePct: scaled,
      rateApr,
      rateDisplay: rateStr,
      intervalHours: interval,
      nextFundingTime: apiNextFunding,
    });
  };

  pushVenue("drift",       market.drift?.fundingRate,       market.drift?.fundingRateApr,       market.drift?.fundingIntervalHours,       market.drift?.nextFundingTime,       market.drift?.openInterest);
  pushVenue("flash",       market.flash?.fees?.marginPerHour, undefined, undefined, undefined, undefined);
  pushVenue("pacifica",    market.pacifica?.fundingRate,    market.pacifica?.fundingRateApr,    market.pacifica?.fundingIntervalHours,    market.pacifica?.nextFundingTime,    market.pacifica?.openInterest);
  pushVenue("hyperliquid", market.hyperliquid?.fundingRate, market.hyperliquid?.fundingRateApr, market.hyperliquid?.fundingIntervalHours, market.hyperliquid?.nextFundingTime, market.hyperliquid?.openInterest);
  pushVenue("aster",       market.aster?.fundingRate,       market.aster?.fundingRateApr,       market.aster?.fundingIntervalHours,       market.aster?.nextFundingTime,       market.aster?.openInterest,       asterHours);
  pushVenue("lighter",     market.lighter?.fundingRate,     market.lighter?.fundingRateApr,     market.lighter?.fundingIntervalHours,     market.lighter?.nextFundingTime,     market.lighter?.openInterest);
  pushVenue("01",          market["01"]?.fundingRate,       market["01"]?.fundingRateApr,       market["01"]?.fundingIntervalHours,       market["01"]?.nextFundingTime,       market["01"]?.openInterest);
  pushVenue("phoenix",     market.phoenix?.fundingRate,     market.phoenix?.fundingRateApr,     market.phoenix?.fundingIntervalHours,     market.phoenix?.nextFundingTime,     market.phoenix?.openInterest);
  // HIP-3 curated sub-dexes — each symbol may list on any subset of these.
  for (const hip3 of HIP3_PROTOCOL_IDS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = (market as any)[hip3] as VenueQuoteLike | undefined | null;
    if (q) pushVenue(hip3, q.fundingRate, q.fundingRateApr, q.fundingIntervalHours, q.nextFundingTime, q.openInterest);
  }

  return legs.filter((l) => isProtocolEnabled(l.protocol));
}

/** Structural shape used for the hl:* index-access above. */
interface VenueQuoteLike {
  fundingRate?: string;
  fundingRateApr?: string;
  fundingIntervalHours?: number;
  nextFundingTime?: number;
  openInterest?: { long?: number; short?: number };
}

// ─── Merged-market + per-venue field helpers (shared by both row kinds) ───

function mergeConstituents(
  constituents: ArbitrageMarket[],
  displaySymbol: string,
  def?: UnderlyingDefinition,
): {
  merged: ArbitrageMarket;
  sourceSymbolByVenue: Partial<Record<ProtocolId, string>>;
  sourceSymbolsByVenue: Partial<Record<ProtocolId, string[]>>;
} {
  const merged: ArbitrageMarket = { symbol: displaySymbol } as ArbitrageMarket;
  const sourceSymbolByVenue: Partial<Record<ProtocolId, string>> = {};
  const sourceSymbolsByVenue: Partial<Record<ProtocolId, string[]>> = {};
  const venues: ProtocolId[] = [
    "drift", "flash", "pacifica", "hyperliquid", "aster", "lighter", "01", "phoenix",
    ...HIP3_PROTOCOL_IDS,
  ];
  for (const v of venues) {
    const preferred = preferredTradeSymbol(def, v, constituents);
    const ordered = preferred
      ? [
          ...constituents.filter((c) => c.symbol === preferred),
          ...constituents.filter((c) => c.symbol !== preferred),
        ]
      : constituents;
    for (const c of ordered) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const val = (c as any)[v];
      if (isExcludedPncVenueAlias(c.symbol, v)) continue;
      if (val != null && (v === "flash" || hasUsableVenueFunding(val))) {
        sourceSymbolsByVenue[v as ProtocolId] ??= [];
        if (!sourceSymbolsByVenue[v as ProtocolId]!.includes(c.symbol)) {
          sourceSymbolsByVenue[v as ProtocolId]!.push(c.symbol);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((merged as any)[v] == null) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (merged as any)[v] = val;
          sourceSymbolByVenue[v as ProtocolId] = c.symbol;
        }
      }
    }
  }
  return { merged, sourceSymbolByVenue, sourceSymbolsByVenue };
}

function preferredTradeSymbol(
  def: UnderlyingDefinition | undefined,
  venue: ProtocolId,
  constituents: ArbitrageMarket[],
): string | null {
  if (def?.underlying === "gold" && venue === "01") {
    return constituents.some((c) => c.symbol === "PAXG") ? "PAXG" : null;
  }
  return null;
}

function displayRateFromConstituents(
  constituents: ArbitrageMarket[],
  venue: ProtocolId,
): string | undefined {
  for (const c of constituents) {
    if (isExcludedPncVenueAlias(c.symbol, venue)) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const venueData = (c as any)[venue];
    if (hasUsableVenueFunding(venueData)) return venueData.fundingRate as string;
  }
  return undefined;
}

function nextFundingByVenue(
  constituents: ArbitrageMarket[],
): Partial<Record<ProtocolId, number>> {
  const out: Partial<Record<ProtocolId, number>> = {};
  const venues: ProtocolId[] = [
    "drift", "pacifica", "hyperliquid", "aster", "lighter", "01", "phoenix",
    ...HIP3_PROTOCOL_IDS,
  ];
  for (const v of venues) {
    for (const c of constituents) {
      if (isExcludedPncVenueAlias(c.symbol, v)) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const venueData = (c as any)[v] as VenueQuoteLike | null | undefined;
      const t = venueData?.nextFundingTime;
      if (hasUsableVenueFunding(venueData) && typeof t === "number" && Number.isFinite(t)) {
        const existing = out[v];
        if (existing === undefined || t < existing) out[v] = t;
      }
    }
  }
  return out;
}

function buildSearchable(
  def: UnderlyingDefinition,
  constituents: ArbitrageMarket[],
  /**
   * Protocols of the ACTIVE pair on this row (not just venues that exist
   * in the backing data). Searches like "hip"/"hip3"/"hip-3" only match
   * when one of these is actually an hl:* — otherwise a BTC row whose
   * best pair is Pacifica ↔ Lighter would surface in a HIP-3 search just
   * because BTC has an hl:hyna listing somewhere, which is confusing.
   */
  activeProtocols?: readonly (string | null | undefined)[],
  extra?: string,
): string {
  const activeHasHip3 = (activeProtocols ?? []).some(
    (p) => typeof p === "string" && p.startsWith("hl:"),
  );
  const parts = [
    def.underlying,
    def.category,
    def.label ?? "",
    ...def.symbols,
    ...getCategorySynonyms(def.category),
    ...constituents.map((c) => c.symbol),
    activeHasHip3 ? "hip hip3 hip-3" : "",
    extra ?? "",
  ];
  return parts.join(" ").toLowerCase();
}

// ─── Row builders ───

/**
 * RWA-only: evaluate every valid (long, short) pair combination, then emit
 * one underlying summary row whose children are the executable pair rows.
 * Long = lower rate; short = higher rate. Legs must be on different venues.
 */
function buildPairRows(
  def: UnderlyingDefinition,
  constituents: ArbitrageMarket[],
  intervalMap: Record<string, Partial<Record<"aster" | "lighter", number>>> | undefined,
): ArbitrageRowType[] {
  const displaySymbol = def.symbols[0] ?? constituents[0]?.symbol ?? "";
  const { merged, sourceSymbolByVenue, sourceSymbolsByVenue } = mergeConstituents(constituents, displaySymbol, def);

  // Flatten all legs across alias markets
  const legs: RawLeg[] = [];
  for (const c of constituents) {
    legs.push(...legsFromMarket(c, intervalMap?.[c.symbol]?.aster));
  }

  if (legs.length === 0) {
    // No rates at all — emit a single "listing only" row so it's still
    // visible when the user searches for the underlying.
    return [
      singleListingRow(def, constituents, merged, displaySymbol, sourceSymbolByVenue, sourceSymbolsByVenue),
    ];
  }

  const rows: ArbitrageRowType[] = [];
  for (let i = 0; i < legs.length; i++) {
    for (let j = i + 1; j < legs.length; j++) {
      const a = legs[i]!;
      const b = legs[j]!;
      if (a.protocol === b.protocol) continue; // same venue is not an arb

      // Assign long/short by rate ordering
      const low = a.ratePct <= b.ratePct ? a : b;
      const high = low === a ? b : a;
      const spread = high.ratePct - low.ratePct;
      const spreadApr = high.rateApr - low.rateApr;

      const longLeg: PairLeg = {
        symbol: low.symbol,
        protocol: low.protocol as ProtocolKey,
        ratePct: low.ratePct,
        rateDisplay: low.rateDisplay,
        intervalHours: low.intervalHours,
        nextFundingTime: low.nextFundingTime,
      };
      const shortLeg: PairLeg = {
        symbol: high.symbol,
        protocol: high.protocol as ProtocolKey,
        ratePct: high.ratePct,
        rateDisplay: high.rateDisplay,
        intervalHours: high.intervalHours,
        nextFundingTime: high.nextFundingTime,
      };
      const earliestNextFunding = (() => {
        const candidates = [longLeg.nextFundingTime, shortLeg.nextFundingTime]
          .filter((t): t is number => typeof t === "number" && Number.isFinite(t));
        return candidates.length > 0 ? Math.min(...candidates) : undefined;
      })();

      // Per-venue cells show ONLY the two pair legs; others blank. That's
      // the visual cue that this row is about a specific pair.
      const cellFor = (venue: ProtocolId): string | undefined => {
        if (longLeg.protocol === venue) return longLeg.rateDisplay;
        if (shortLeg.protocol === venue) return shortLeg.rateDisplay;
        return undefined;
      };

      rows.push({
        id: `${def.underlying}|${longLeg.protocol}:${longLeg.symbol}|${shortLeg.protocol}:${shortLeg.symbol}`,
        symbol: displaySymbol,
        oiRank: 0,
        maxArb: spreadApr,
        spreadBps1h: spread * 100,
        longProtocol: longLeg.protocol,
        shortProtocol: shortLeg.protocol,
        fundingRateDrift:       cellFor("drift"),
        fundingRateFlash:       cellFor("flash"),
        fundingRatePacifica:    cellFor("pacifica"),
        fundingRateHyperliquid: cellFor("hyperliquid"),
        fundingRateAster:       cellFor("aster"),
        fundingRateLighter:     cellFor("lighter"),
        fundingRate01:          cellFor("01"),
        fundingRatePhoenix:     cellFor("phoenix"),
        fundingRateHlXyz:       cellFor("hl:xyz"),
        fundingRateHlFlx:       cellFor("hl:flx"),
        fundingRateHlHyna:      cellFor("hl:hyna"),
        fundingRateHlKm:        cellFor("hl:km"),
        fundingRateHlCash:      cellFor("hl:cash"),
        fundingRateHlPara:      cellFor("hl:para"),
        fundingRateApr: merged.drift?.fundingRateApr,
        fundingRatePct: undefined,
        fees: { drift: merged.drift?.fees, flash: merged.flash?.fees },
        marketData: merged,
        category: def.category,
        underlying: def.underlying,
        constituentSymbols: constituents.map((c) => c.symbol),
        sourceSymbolByVenue: {
          ...sourceSymbolByVenue,
          [longLeg.protocol]: longLeg.symbol,
          [shortLeg.protocol]: shortLeg.symbol,
        },
        sourceSymbolsByVenue,
        pairKind: "pair",
        longLeg,
        shortLeg,
        searchableText: buildSearchable(
          def,
          constituents,
          [longLeg.protocol, shortLeg.protocol],
          `${longLeg.symbol} ${longLeg.protocol} ${shortLeg.symbol} ${shortLeg.protocol}`,
        ),
        nextFundingTime: earliestNextFunding,
        nextFundingTimeByVenue: nextFundingByVenue(constituents),
      });
    }
  }

  // If no pairs could be formed (single leg), fall back to listing row.
  if (rows.length === 0) {
    return [singleListingRow(def, constituents, merged, displaySymbol, sourceSymbolByVenue, sourceSymbolsByVenue)];
  }
  const sortedPairs = sortPairRows(rows);
  const bestPair = sortedPairs[0]!;

  const earliestNextFunding = (() => {
    const candidates: number[] = [];
    const allVenues: ProtocolId[] = [
      "drift", "pacifica", "hyperliquid", "aster", "lighter", "01", "phoenix",
      ...HIP3_PROTOCOL_IDS,
    ];
    for (const c of constituents) {
      for (const v of allVenues) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const venueData = (c as any)[v] as VenueQuoteLike | null | undefined;
        const t = venueData?.nextFundingTime;
        if (hasUsableVenueFunding(venueData) && typeof t === "number" && Number.isFinite(t)) candidates.push(t);
      }
    }
    return candidates.length > 0 ? Math.min(...candidates) : undefined;
  })();

  return [{
    id: `underlying-${def.underlying}`,
    symbol: displaySymbol,
    oiRank: 0,
    maxArb: bestPair.maxArb,
    spreadBps1h: bestPair.spreadBps1h,
    longProtocol: bestPair.longProtocol,
    shortProtocol: bestPair.shortProtocol,
    fundingRateDrift: displayRateFromConstituents(constituents, "drift"),
    fundingRateFlash: merged.flash?.fees?.marginPerHour ?? undefined,
    fundingRatePacifica: displayRateFromConstituents(constituents, "pacifica"),
    fundingRateHyperliquid: displayRateFromConstituents(constituents, "hyperliquid"),
    fundingRateAster: displayRateFromConstituents(constituents, "aster"),
    fundingRateLighter: displayRateFromConstituents(constituents, "lighter"),
    fundingRate01: displayRateFromConstituents(constituents, "01"),
    fundingRatePhoenix: displayRateFromConstituents(constituents, "phoenix"),
    fundingRateHlXyz: displayRateFromConstituents(constituents, "hl:xyz"),
    fundingRateHlFlx: displayRateFromConstituents(constituents, "hl:flx"),
    fundingRateHlHyna: displayRateFromConstituents(constituents, "hl:hyna"),
    fundingRateHlKm: displayRateFromConstituents(constituents, "hl:km"),
    fundingRateHlCash: displayRateFromConstituents(constituents, "hl:cash"),
    fundingRateHlPara: displayRateFromConstituents(constituents, "hl:para"),
    fundingRateApr: merged.drift?.fundingRateApr,
    fundingRatePct: undefined,
    fees: { drift: merged.drift?.fees, flash: merged.flash?.fees },
    marketData: merged,
    category: def.category,
    underlying: def.underlying,
    constituentSymbols: constituents.map((c) => c.symbol),
    sourceSymbolByVenue,
    sourceSymbolsByVenue,
    pairKind: "group",
    longLeg: bestPair.longLeg,
    shortLeg: bestPair.shortLeg,
    searchableText: buildSearchable(
      def,
      constituents,
      [bestPair.longProtocol, bestPair.shortProtocol],
      sortedPairs
        .map((row) =>
          `${row.longLeg?.symbol ?? ""} ${row.longLeg?.protocol ?? ""} ${row.shortLeg?.symbol ?? ""} ${row.shortLeg?.protocol ?? ""}`,
        )
        .join(" "),
    ),
    nextFundingTime: earliestNextFunding,
    nextFundingTimeByVenue: nextFundingByVenue(constituents),
    subPools: sortedPairs,
    pairCount: sortedPairs.length,
  }];
}

function sortPairRows(rows: ArbitrageRowType[]): ArbitrageRowType[] {
  return [...rows].sort((a, b) => {
    const spreadDelta = b.maxArb - a.maxArb;
    if (Math.abs(spreadDelta) > 1e-12) return spreadDelta;

    const aSameSymbol = a.longLeg?.symbol === a.shortLeg?.symbol;
    const bSameSymbol = b.longLeg?.symbol === b.shortLeg?.symbol;
    if (aSameSymbol !== bSameSymbol) return aSameSymbol ? -1 : 1;

    return a.id.localeCompare(b.id);
  });
}

/**
 * Non-RWA: one row per underlying using the best pair (same behaviour as
 * the pre-RWA screener, just with alias merging).
 */
function buildSingleRow(
  def: UnderlyingDefinition,
  constituents: ArbitrageMarket[],
  intervalMap: Record<string, Partial<Record<"aster" | "lighter", number>>> | undefined,
): ArbitrageRowType {
  const displaySymbol = def.symbols[0] ?? constituents[0]?.symbol ?? "";
  const { merged, sourceSymbolByVenue, sourceSymbolsByVenue } = mergeConstituents(constituents, displaySymbol, def);

  // Pick the best rate per venue across all alias markets
  const pickVenueRate = (venue: ProtocolId): number | null => {
    for (const c of constituents) {
      const legs = legsFromMarket(c, intervalMap?.[c.symbol]?.aster);
      const hit = legs.find((l) => l.protocol === venue);
      if (hit) return hit.ratePct;
    }
    return null;
  };

  const pickVenueApr = (venue: ProtocolId): number | null => {
    for (const c of constituents) {
      const legs = legsFromMarket(c, intervalMap?.[c.symbol]?.aster);
      const hit = legs.find((l) => l.protocol === venue);
      if (hit) return hit.rateApr;
    }
    return null;
  };

  const rates: Partial<Record<ProtocolId, number | null>> = {
    drift:       pickVenueRate("drift"),
    pacifica:    pickVenueRate("pacifica"),
    hyperliquid: pickVenueRate("hyperliquid"),
    aster:       pickVenueRate("aster"),
    lighter:     pickVenueRate("lighter"),
    "01":        pickVenueRate("01"),
    phoenix:     pickVenueRate("phoenix"),
  };
  // Include HIP-3 sub-dexes so selectLongShort can form cross-venue pairs
  // between main HL and a HIP-3 dex (rare but possible).
  for (const hip3 of HIP3_PROTOCOL_IDS) {
    rates[hip3] = pickVenueRate(hip3);
  }

  const aprs: Partial<Record<ProtocolId, number | null>> = {
    drift:       pickVenueApr("drift"),
    pacifica:    pickVenueApr("pacifica"),
    hyperliquid: pickVenueApr("hyperliquid"),
    aster:       pickVenueApr("aster"),
    lighter:     pickVenueApr("lighter"),
    "01":        pickVenueApr("01"),
    phoenix:     pickVenueApr("phoenix"),
  };
  for (const hip3 of HIP3_PROTOCOL_IDS) {
    aprs[hip3] = pickVenueApr(hip3);
  }

  const earliestNextFunding = (() => {
    const candidates: number[] = [];
    const allVenues: ProtocolId[] = [
      "drift", "pacifica", "hyperliquid", "aster", "lighter", "01", "phoenix",
      ...HIP3_PROTOCOL_IDS,
    ];
    for (const c of constituents) {
      for (const v of allVenues) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const venueData = (c as any)[v] as VenueQuoteLike | null | undefined;
        const t = venueData?.nextFundingTime;
        if (hasUsableVenueFunding(venueData) && typeof t === "number" && Number.isFinite(t)) candidates.push(t);
      }
    }
    return candidates.length > 0 ? Math.min(...candidates) : undefined;
  })();

  const backendBestSource =
    constituents.find((c) => c.symbol === displaySymbol) ?? constituents[0];
  const backendBest = backendBestSource ? getBackendBestPair(backendBestSource) : null;
  if (backendBestSource) {
    merged.maxArb = backendBestSource.maxArb;
    merged.maxArbApr = backendBestSource.maxArbApr;
    merged.longProtocol = backendBestSource.longProtocol;
    merged.shortProtocol = backendBestSource.shortProtocol;
  }
  const feBest = selectLongShort(buildEnabledRates(aprs));
  const longProtocol = backendBest?.longProtocol ?? feBest.long;
  const shortProtocol = backendBest?.shortProtocol ?? feBest.short;
  const maxArb = backendBest?.maxArbApr ?? feBest.spread;

  const spreadBps1h = (() => {
    if (backendBest) return backendBest.spreadBps1h;
    if (!longProtocol || !shortProtocol) return 0;
    const shortRate = rates[shortProtocol as ProtocolId];
    const longRate = rates[longProtocol as ProtocolId];
    if (shortRate == null || longRate == null) return 0;
    return (shortRate - longRate) * 100;
  })();

  const legFor = (protocol: string | null | undefined): PairLeg | undefined => {
    if (!isKnownProtocol(protocol)) return undefined;
    return {
      symbol: displaySymbol,
      protocol: protocol as ProtocolKey,
      ratePct: rates[protocol] ?? 0,
      rateDisplay: displayRateFromConstituents(constituents, protocol) ?? "",
    };
  };

  return {
    id: `underlying-${def.underlying}`,
    symbol: displaySymbol,
    oiRank: 0,
    maxArb,
    spreadBps1h,
    longProtocol: longProtocol as ProtocolKey,
    shortProtocol: shortProtocol as ProtocolKey,
    fundingRateDrift:       displayRateFromConstituents(constituents, "drift"),
    fundingRateFlash:       merged.flash?.fees?.marginPerHour ?? undefined,
    fundingRatePacifica:    displayRateFromConstituents(constituents, "pacifica"),
    fundingRateHyperliquid: displayRateFromConstituents(constituents, "hyperliquid"),
    fundingRateAster:       displayRateFromConstituents(constituents, "aster"),
    fundingRateLighter:     displayRateFromConstituents(constituents, "lighter"),
    fundingRate01:          displayRateFromConstituents(constituents, "01"),
    fundingRatePhoenix:     displayRateFromConstituents(constituents, "phoenix"),
    fundingRateHlXyz:       displayRateFromConstituents(constituents, "hl:xyz"),
    fundingRateHlFlx:       displayRateFromConstituents(constituents, "hl:flx"),
    fundingRateHlHyna:      displayRateFromConstituents(constituents, "hl:hyna"),
    fundingRateHlKm:        displayRateFromConstituents(constituents, "hl:km"),
    fundingRateHlCash:      displayRateFromConstituents(constituents, "hl:cash"),
    fundingRateHlPara:      displayRateFromConstituents(constituents, "hl:para"),
    fundingRateApr: merged.drift?.fundingRateApr,
    fundingRatePct: (() => {
      const r = merged.drift?.fundingRate;
      if (!r) return undefined;
      const n = parseFinite(r.replace("%", ""));
      return n === null ? undefined : n / 100;
    })(),
    fees: { drift: merged.drift?.fees, flash: merged.flash?.fees },
    marketData: merged,
    category: def.category,
    underlying: def.underlying,
    constituentSymbols: constituents.map((c) => c.symbol),
    sourceSymbolByVenue,
    sourceSymbolsByVenue,
    pairKind: "single",
    longLeg: legFor(longProtocol),
    shortLeg: legFor(shortProtocol),
    searchableText: buildSearchable(def, constituents, [longProtocol, shortProtocol]),
    nextFundingTime: earliestNextFunding,
    nextFundingTimeByVenue: nextFundingByVenue(constituents),
  };
}

function singleListingRow(
  def: UnderlyingDefinition,
  constituents: ArbitrageMarket[],
  merged: ArbitrageMarket,
  displaySymbol: string,
  sourceSymbolByVenue: Partial<Record<ProtocolId, string>> = {},
  sourceSymbolsByVenue: Partial<Record<ProtocolId, string[]>> = {},
): ArbitrageRowType {
  return {
    id: `underlying-${def.underlying}`,
    symbol: displaySymbol,
    oiRank: 0,
    maxArb: 0,
    spreadBps1h: 0,
    longProtocol: null as unknown as ProtocolKey,
    shortProtocol: null as unknown as ProtocolKey,
    fundingRateDrift:       displayRateFromConstituents(constituents, "drift"),
    fundingRateFlash:       merged.flash?.fees?.marginPerHour ?? undefined,
    fundingRatePacifica:    displayRateFromConstituents(constituents, "pacifica"),
    fundingRateHyperliquid: displayRateFromConstituents(constituents, "hyperliquid"),
    fundingRateAster:       displayRateFromConstituents(constituents, "aster"),
    fundingRateLighter:     displayRateFromConstituents(constituents, "lighter"),
    fundingRate01:          displayRateFromConstituents(constituents, "01"),
    fundingRatePhoenix:     displayRateFromConstituents(constituents, "phoenix"),
    fundingRateHlXyz:       displayRateFromConstituents(constituents, "hl:xyz"),
    fundingRateHlFlx:       displayRateFromConstituents(constituents, "hl:flx"),
    fundingRateHlHyna:      displayRateFromConstituents(constituents, "hl:hyna"),
    fundingRateHlKm:        displayRateFromConstituents(constituents, "hl:km"),
    fundingRateHlCash:      displayRateFromConstituents(constituents, "hl:cash"),
    fundingRateHlPara:      displayRateFromConstituents(constituents, "hl:para"),
    fundingRateApr: merged.drift?.fundingRateApr,
    fundingRatePct: undefined,
    fees: { drift: merged.drift?.fees, flash: merged.flash?.fees },
    marketData: merged,
    category: def.category,
    underlying: def.underlying,
    constituentSymbols: constituents.map((c) => c.symbol),
    sourceSymbolByVenue,
    sourceSymbolsByVenue,
    pairKind: "single",
    searchableText: buildSearchable(def, constituents),
    nextFundingTimeByVenue: nextFundingByVenue(constituents),
  };
}

// ─── Main transform ───

export function transformMarketsToRows(
  markets: ArbitrageMarket[] | undefined,
  intervalMap?: Record<string, Partial<Record<"aster" | "lighter", number>>>,
): ArbitrageRowType[] {
  if (!markets) return [];

  // 1. Bucket input markets by canonical underlying
  const byUnderlying = new Map<
    string,
    { def: UnderlyingDefinition; constituents: ArbitrageMarket[] }
  >();
  for (const m of markets) {
    const def = getUnderlying(m.symbol);
    const bucket = byUnderlying.get(def.underlying);
    if (bucket) bucket.constituents.push(m);
    else byUnderlying.set(def.underlying, { def, constituents: [m] });
  }

  // 2. Sort aliases inside each bucket by canonical order
  for (const { def, constituents } of byUnderlying.values()) {
    const order = new Map<string, number>();
    def.symbols.forEach((s, i) => order.set(s.toUpperCase(), i));
    constituents.sort(
      (a, b) =>
        (order.get(a.symbol.toUpperCase()) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(b.symbol.toUpperCase()) ?? Number.MAX_SAFE_INTEGER),
    );
  }

  // 3. Sort buckets by total OI (descending) so rows come in OI order.
  // Resolved-from-staging conflict note: staging added "01" to the legacy
  // per-row processor below this block; HEAD replaced that processor with
  // the bucket+RWA-pair architecture (legsFromMarket / buildPairRows /
  // buildSingleRow). "01" is already a first-class venue in the new path
  // (see getTotalOI, FALLBACK_INTERVAL_HOURS, pickVenueRate, cellFor),
  // so we drop staging's hunk wholesale.
  const buckets = Array.from(byUnderlying.values()).sort((a, b) => {
    const oiA = a.constituents.reduce((s, c) => s + getTotalOI(c), 0);
    const oiB = b.constituents.reduce((s, c) => s + getTotalOI(c), 0);
    return oiB - oiA;
  });

  // 4. Emit rows per bucket. Assign an absolute, OI-derived rank during
  //    emission so downstream filtering/searching never renumbers the
  //    displayed rank — avoids the "was 82, now 114" reshuffle the user
  //    sees when the arbable-filter set changes between renders.
  //    RWA buckets can emit multiple pair rows; all share the bucket's
  //    single rank (they represent the same underlying).
  const rows: ArbitrageRowType[] = [];
  buckets.forEach(({ def, constituents }, bucketIndex) => {
    const rank = bucketIndex + 1;
    const emitted = isRwaCategory(def.category)
      ? buildPairRows(def, constituents, intervalMap)
      : [buildSingleRow(def, constituents, intervalMap)];
    for (const row of emitted) {
      row.oiRank = rank;
      rows.push(row);
    }
  });
  return rows;
}

// Re-exports for convenience
export { getUnderlyingLabel };

/**
 * Screener filter: keep rows that represent a real arbitrage opportunity.
   * `group` rows represent RWA underlyings with one or more executable child
   * pairs. `single` rows qualify only when `maxArb > 0` (i.e. ≥2 venues
   * quoted rates). This drops the dozens of HL-only listings (HIP-3 baskets
   * etc.) from the screener.
 */
export function isArbableRow(row: ArbitrageRowType): boolean {
  if (row.pairKind === "group" || row.pairKind === "pair") return true;
  return row.maxArb > 0;
}
