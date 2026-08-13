# Math module

Single source of truth for every numeric transform that touches money or
market data. The goal is that **no file outside `src/lib/math/` ever calls
`parseFloat` or `Number()` on an API/user string directly**.

## Layout

| File | Purpose |
| ---- | ------- |
| `primitives.ts` | `parseFinite`, `parsePositive`, `parseNonNegative`, `safeDiv`, `clamp`, `safeFloorCents`, `bpsToRatio`, `ratioToBps`, `safeSum` |
| `funding.ts`    | `parseFundingRate` (canonical), `scaleFundingRate` |
| `premium.ts`    | `computePremium(mark, oracle)` — safe `(mark - oracle) / oracle` |
| `index.ts`      | Barrel re-export for component code |

## Rules for new code

1. **External strings → `parseFinite` / `parsePositive`.** Never
   `parseFloat(apiResponse.foo)` directly — that lets `NaN` / `±Infinity`
   through.
2. **Division → `safeDiv`.** Anywhere `a / b` could see `b === 0` or
   non-finite inputs, use `safeDiv` with an explicit fallback.
3. **Funding rates → `@/lib/math/funding`.** The two legacy parsers in
   `arbitrage-utils.ts` / `spotperp-utils.ts` return percent-units (for
   historic table-row contracts); everything else should use the canonical
   decimal-ratio parser.
4. **Premium (mark vs oracle) → `computePremium`.**

## What these helpers deliberately do NOT do

- No `decimal.js` / `bignumber.js`. Native `number` handles amounts up to
  ~$9T in cents. Using a decimal lib adds a large dep surface for a
  problem we don't have.
- No rounding at compute time. Format on the way out, keep precision
  during math.
