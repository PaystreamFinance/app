// ─── Symbol Taxonomy ───
//
// Two-level classification for market symbols:
//
//   category   — loose grouping for UI filtering (oil-gas, metals, equities, …)
//   underlying — tight grouping for arbitrage: symbols that share an underlying
//                key are the *same instrument* under different tickers and may
//                be arbed against each other across venues.
//
// Only symbols whose underlying has multiple aliases need to appear here.
// Anything not in the map is its own underlying (self-alias) and falls into
// the `other` category — it still works, it just can't cross-symbol arb.
//
// Categories are a closed set; underlyings are free-form strings.

export type SymbolCategory =
  | "crypto-major"
  | "crypto-alt"
  | "meme"
  | "equities"
  | "indices"
  | "forex"
  | "oil-gas"
  | "metals"
  | "agriculture"
  | "themed-basket"
  | "other";

export interface UnderlyingDefinition {
  /** Canonical underlying key (lowercase). */
  underlying: string;
  /** UI category. */
  category: SymbolCategory;
  /** Upstream symbols that represent this underlying. First entry is preferred
   *  display symbol when the underlying has multiple aliases. */
  symbols: readonly string[];
  /** Optional human label (e.g. "WTI Crude"). Defaults to first symbol. */
  label?: string;
  /** Optional path to a local logo asset (public/). Overrides the CoinGecko
   *  proxy used by TokenLogo. Adding a new RWA = drop a file in
   *  public/images/asset-logos/ and set this path here. */
  logo?: string;
  /** Optional background colour applied behind a transparent logo. Needed
   *  only when the asset (e.g. Figma vector) doesn't already bake in its
   *  tile colour. Hex string, e.g. "#704b0b". */
  logoBg?: string;
}

// ─── Registry ───
//
// Order: list multi-alias underlyings first so the intent is obvious.
// Add new entries here when a new aliased instrument appears upstream.

export const UNDERLYINGS: readonly UnderlyingDefinition[] = [
  // Oil & gas
  { underlying: "wti",      category: "oil-gas", symbols: ["WTI", "CL", "OIL", "WTIOIL"], label: "WTI Crude",    logo: "/images/asset-logos/wti.svg",    logoBg: "#0b705c" },
  { underlying: "brent",    category: "oil-gas", symbols: ["BRENTOIL"],        label: "Brent Crude",  logo: "/images/asset-logos/wti.svg",    logoBg: "#0b705c" },
  { underlying: "natgas",   category: "oil-gas", symbols: ["NATGAS", "GAS"],   label: "Natural Gas",  logo: "/images/asset-logos/natgas.svg", logoBg: "#0b3570" },

  // Metals
  // `GOLD` is HL's label for the same gold spot as `XAU`; `PAXG` tracks spot
  // gold via PAX Gold token. Aliased together for arb purposes.
  { underlying: "gold",     category: "metals",  symbols: ["XAU", "GOLD", "PAXG"], label: "Gold",       logo: "/images/asset-logos/gold.svg",     logoBg: "#704b0b" },
  { underlying: "silver",   category: "metals",  symbols: ["XAG"],                 label: "Silver",     logo: "/images/asset-logos/silver.svg",   logoBg: "#333333" },
  { underlying: "copper",   category: "metals",  symbols: ["COPPER", "XCU"],       label: "Copper",     logo: "/images/asset-logos/copper.svg",   logoBg: "#702e0b" },
  { underlying: "platinum", category: "metals",  symbols: ["PLATINUM", "XPT"],     label: "Platinum",   logo: "/images/asset-logos/platinum.svg", logoBg: "#b5b5b5" },
  { underlying: "palladium",category: "metals",  symbols: ["XPD"],                 label: "Palladium",  logo: "/images/asset-logos/palladium.svg",logoBg: "#c5b9aa" },
  { underlying: "aluminium",category: "metals",  symbols: ["ALUMINIUM"],           label: "Aluminium" },

  // Agriculture
  { underlying: "corn",     category: "agriculture", symbols: ["CORN"],        label: "Corn" },

  // Equities — broad US large-caps + HIP-3 equity listings
  { underlying: "tsla",     category: "equities", symbols: ["TSLA"],   label: "Tesla",     logo: "/images/asset-logos/tsla.png" },
  { underlying: "aapl",     category: "equities", symbols: ["AAPL"],   label: "Apple",     logo: "/images/asset-logos/aapl.png" },
  { underlying: "nvda",     category: "equities", symbols: ["NVDA"],   label: "Nvidia",    logo: "/images/asset-logos/nvda.png" },
  { underlying: "msft",     category: "equities", symbols: ["MSFT"],   label: "Microsoft", logo: "/images/asset-logos/msft.png" },
  { underlying: "amzn",     category: "equities", symbols: ["AMZN"],   label: "Amazon",    logo: "/images/asset-logos/amzn.png" },
  { underlying: "googl",    category: "equities", symbols: ["GOOGL"],  label: "Alphabet",  logo: "/images/asset-logos/googl.png" },
  { underlying: "meta",     category: "equities", symbols: ["META"],   label: "Meta",      logo: "/images/asset-logos/meta.png" },
  { underlying: "nflx",     category: "equities", symbols: ["NFLX"],   label: "Netflix" },
  { underlying: "intc",     category: "equities", symbols: ["INTC"],   label: "Intel" },
  { underlying: "amd",      category: "equities", symbols: ["AMD"],    label: "AMD" },
  { underlying: "mu",       category: "equities", symbols: ["MU"],     label: "Micron" },
  { underlying: "mrvl",     category: "equities", symbols: ["MRVL"],   label: "Marvell" },
  { underlying: "baba",     category: "equities", symbols: ["BABA"],   label: "Alibaba" },
  { underlying: "coin",     category: "equities", symbols: ["COIN"],   label: "Coinbase" },
  { underlying: "gme",      category: "equities", symbols: ["GME"],    label: "GameStop" },
  { underlying: "mstr",     category: "equities", symbols: ["MSTR"],   label: "MicroStrategy" },
  { underlying: "lly",      category: "equities", symbols: ["LLY"],    label: "Eli Lilly" },
  { underlying: "hood",     category: "equities", symbols: ["HOOD"],   label: "Robinhood" },
  { underlying: "dkng",     category: "equities", symbols: ["DKNG"],   label: "DraftKings" },
  { underlying: "bx",       category: "equities", symbols: ["BX"],     label: "Blackstone" },
  { underlying: "cost",     category: "equities", symbols: ["COST"],   label: "Costco" },
  { underlying: "crwv",     category: "equities", symbols: ["CRWV"],   label: "CoreWeave" },
  { underlying: "crcl",     category: "equities", symbols: ["CRCL"],   label: "Circle" },
  { underlying: "bmnr",     category: "equities", symbols: ["BMNR"],   label: "BitMine" },
  { underlying: "hims",     category: "equities", symbols: ["HIMS"],   label: "Hims & Hers" },
  { underlying: "hyundai",  category: "equities", symbols: ["HYUNDAI"],label: "Hyundai" },

  // Indices (Nikkei has two aliases on HL — safe to merge)
  { underlying: "spy",      category: "indices", symbols: ["SPY"],  label: "S&P 500 ETF",     logo: "/images/asset-logos/spx.png" },
  { underlying: "spx",      category: "indices", symbols: ["SPX"],  label: "S&P 500",         logo: "/images/asset-logos/spx.png" },
  { underlying: "qqq",      category: "indices", symbols: ["QQQ"],  label: "Nasdaq 100 ETF",  logo: "/images/asset-logos/qqq.png" },
  { underlying: "nikkei",   category: "indices", symbols: ["JP225", "JPN225"], label: "Nikkei 225" },
  { underlying: "ewj",      category: "indices", symbols: ["EWJ"],  label: "iShares Japan ETF" },
  { underlying: "ewy",      category: "indices", symbols: ["EWY"],  label: "iShares Korea ETF" },

  // Forex
  // EUR vs EURUSD, JPY vs USDJPY: left as separate underlyings until we verify
  // that quote convention matches — arbing them naively risks basis exposure.
  { underlying: "eurusd",   category: "forex", symbols: ["EURUSD"], label: "EUR/USD", logo: "/images/asset-logos/eurusd.png" },
  { underlying: "gbpusd",   category: "forex", symbols: ["GBPUSD"], label: "GBP/USD", logo: "/images/asset-logos/gbpusd.png" },
  { underlying: "usdjpy",   category: "forex", symbols: ["USDJPY"], label: "USD/JPY", logo: "/images/asset-logos/usdjpy.png" },
  { underlying: "eur",      category: "forex", symbols: ["EUR"],    label: "EUR perp" },
  { underlying: "jpy",      category: "forex", symbols: ["JPY"],    label: "JPY perp" },
  { underlying: "dxy",      category: "forex", symbols: ["DXY"],    label: "USD Index" },

  // HIP-3 themed baskets (HL single-venue; kept in a dedicated category so
  // the screener surfaces them distinctly from single equities/indices).
  { underlying: "basket-mag7",      category: "themed-basket", symbols: ["MAG7"],      label: "Magnificent 7" },
  { underlying: "basket-anthropic", category: "themed-basket", symbols: ["ANTHROPIC"], label: "Anthropic basket" },
  { underlying: "basket-aito",      category: "themed-basket", symbols: ["AITO"],      label: "AI Tokens basket" },
  { underlying: "basket-ioxia",     category: "themed-basket", symbols: ["IOXIA"],     label: "IOXIA basket" },
  { underlying: "basket-nuclear",   category: "themed-basket", symbols: ["NUCLEAR"],   label: "Nuclear basket" },
  { underlying: "basket-defense",   category: "themed-basket", symbols: ["DEFENSE"],   label: "Defense basket" },
  { underlying: "basket-biotech",   category: "themed-basket", symbols: ["BIOTECH"],   label: "Biotech basket" },
  { underlying: "basket-infotech",  category: "themed-basket", symbols: ["INFOTECH"],  label: "InfoTech basket" },
  { underlying: "basket-energy",    category: "themed-basket", symbols: ["ENERGY"],    label: "Energy basket" },
  { underlying: "basket-gldmine",   category: "themed-basket", symbols: ["GLDMINE"],   label: "Gold Mining basket" },
  { underlying: "basket-goldjm",    category: "themed-basket", symbols: ["GOLDJM"],    label: "Gold Miners basket" },

  // Crypto majors (explicit so they land in the right category)
  { underlying: "btc",  category: "crypto-major", symbols: ["BTC"],  label: "Bitcoin" },
  { underlying: "eth",  category: "crypto-major", symbols: ["ETH"],  label: "Ethereum" },
  { underlying: "sol",  category: "crypto-major", symbols: ["SOL"],  label: "Solana" },

  // NOTE: K-prefixed HL contracts (kBONK, kPEPE, kSHIB, …) are 1000×
  // contract-size variants. They track the same spot but execution sizing
  // must respect `unitScale`. Do NOT alias them with the 1× listings on
  // other venues — that would silently produce 1000× mis-hedged pairs.
];

// ─── Lookup indices (built once at module load) ───

const SYMBOL_TO_UNDERLYING = new Map<string, UnderlyingDefinition>();
for (const def of UNDERLYINGS) {
  for (const s of def.symbols) {
    SYMBOL_TO_UNDERLYING.set(s.toUpperCase(), def);
  }
}

// ─── Helpers ───

/**
 * Return the underlying definition for a symbol. Unknown symbols fall back
 * to a synthetic "other"-category entry whose underlying key is the symbol
 * itself — so unregistered markets still work, they just can't cross-arb.
 */
export function getUnderlying(symbol: string): UnderlyingDefinition {
  const key = symbol.toUpperCase();
  const hit = SYMBOL_TO_UNDERLYING.get(key);
  if (hit) return hit;
  return {
    underlying: key.toLowerCase(),
    category: "other",
    symbols: [symbol],
  };
}

/** Convenience: category for a symbol. */
export function getCategory(symbol: string): SymbolCategory {
  return getUnderlying(symbol).category;
}

/** All aliases for the given underlying key (e.g. "wti" → ["WTI","CL"]). */
export function getAliasesByUnderlying(underlying: string): readonly string[] {
  const key = underlying.toLowerCase();
  const def = UNDERLYINGS.find((d) => d.underlying === key);
  return def?.symbols ?? [];
}

/** Display label for a symbol (falls back to the symbol itself). */
export function getUnderlyingLabel(symbol: string): string {
  const def = getUnderlying(symbol);
  return def.label ?? def.symbols[0] ?? symbol;
}

/** Locally-hosted asset logo for a symbol, if the taxonomy has one.
 *  Returns null so TokenLogo can fall back to its API-proxy/letter-avatar. */
export function getAssetLogo(
  symbol: string,
): { src: string; bg?: string } | null {
  const def = getUnderlying(symbol);
  if (!def.logo) return null;
  return { src: def.logo, bg: def.logoBg };
}

// ─── RWA (Real-World Asset) categories ───
// These can form cross-alias opportunities (WTI ↔ CL, XAU ↔ PAXG), but the
// screener collapses each underlying to its single best pair to avoid noisy
// duplicate commodity/equity rows. Crypto/meme also stay as one best-pair row.
export const RWA_CATEGORIES: ReadonlySet<SymbolCategory> = new Set([
  "oil-gas",
  "metals",
  "equities",
  "indices",
  "forex",
  "agriculture",
]);

export function isRwaCategory(category: SymbolCategory): boolean {
  return RWA_CATEGORIES.has(category);
}

// ─── Category synonyms for search ───
//
// Each category expands to a list of user-friendly keywords. These get
// folded into the row's `searchableText` so a query like "stocks" matches
// every equities row, "commodities" matches oil-gas + metals + agriculture,
// "crypto" matches the three crypto categories, etc. Keep lowercase.

const CATEGORY_SYNONYMS: Record<SymbolCategory, readonly string[]> = {
  "crypto-major":  ["crypto", "coin", "coins"],
  "crypto-alt":    ["crypto", "altcoin", "altcoins", "alt"],
  meme:            ["crypto", "meme", "memes", "memecoin", "memecoins"],
  equities:        ["equity", "equities", "stock", "stocks", "share", "shares"],
  indices:         ["index", "indexes", "indices", "benchmark"],
  forex:           ["fx", "forex", "currency", "currencies"],
  "oil-gas":       ["oil", "gas", "energy", "commodity", "commodities"],
  metals:          ["metal", "metals", "precious", "commodity", "commodities"],
  agriculture:     ["agri", "agriculture", "grain", "grains", "commodity", "commodities"],
  "themed-basket": ["basket", "baskets", "thematic", "theme", "themes", "hip", "hip3", "hip-3"],
  other:           [],
};

export function getCategorySynonyms(category: SymbolCategory): readonly string[] {
  return CATEGORY_SYNONYMS[category] ?? [];
}
