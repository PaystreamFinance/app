# Backend Arb Routes Context

Branch: `staging`

This document summarizes the backend arbitrage API exposed under `/api/arb`.
The server is a Hono app mounted from `api/main.ts`, with arb routes defined in
`api/api/arb/index.ts`.

## Auth Model

Public routes:

- `GET /api/arb/funding-rates/history`
- `GET /api/arb/markets`

All other `/api/arb/*` routes require Privy auth through `privyAuthMiddleware`.
Authenticated handlers read `c.privyUser` and generally require the user to have
an embedded Solana wallet. Some routes also need an embedded Ethereum wallet.

## Supported Arb Protocol IDs

Base protocol IDs:

- `pacifica`
- `hyperliquid`
- `aster`
- `lighter`
- `01`

The backend also supports HIP-3 protocol IDs in the form `hl:<dexName>` wherever
`ArbProtocol` is accepted. These are validated through `isArbProtocol`.

## Market Discovery

### GET `/api/arb/markets`

Public. Returns all available arb markets across supported DEXes.

Purpose:

- Builds a symbol-indexed market list.
- Includes funding rate data, APR values, fees, oracle prices, max leverage, and
  open interest where available.
- Computes the best long/short opportunity by normalizing funding rates across
  different funding intervals.
- Includes base protocols and curated HIP-3 markets.

Typical response shape:

```ts
{
  status: 'success',
  count: number,
  markets: Array<{
    symbol: string,
    pacifica: object | null,
    hyperliquid: object | null,
    aster: object | null,
    lighter: object | null,
    '01': object | null,
    arbOpportunity: object | null
  }>
}
```

### GET `/api/arb/funding-rates/history`

Public. Returns funding-rate history stored in the database.

Purpose:

- Fetches recent funding records.
- Groups historical rates by symbol and DEX.
- Used by market views and analytics.

## Fees

### GET `/api/arb/fees`

Auth required. Returns fee information per DEX for the authenticated user.

Purpose:

- Fetches user-specific fees when the DEX supports it.
- Falls back to known/default fee tiers where required.
- Covers `pacifica`, `hyperliquid`, `aster`, `lighter`, and `01`.

## Trading

### POST `/api/arb/trade`

Auth required. Opens a hedged arb position using one shared market ticker.

Request body:

```ts
{
  market: string,
  totalMarginUsd: number,
  leverage: number,
  protocols: {
    long: ArbProtocol,
    short: ArbProtocol
  },
  jitoFeeSol?: number,
  disableAclp?: boolean
}
```

Purpose:

- Opens one long leg and one short leg using the same `market` ticker.
- Splits `totalMarginUsd` across both legs.
- Computes a matching target size so the hedge is delta-neutral.
- Performs wallet, balance, market, and leverage checks before execution.
- Persists the resulting arb pair in `arb_position_pairs`.

Response status values:

- `success`: both legs succeeded.
- `sent`: bundle/order was sent but not yet confirmed.
- `partial`: one leg succeeded and the other failed, leaving an unhedged state.
- `error`: request or execution failed.

### POST `/api/arb/trade/v2`

Auth required. Opens a hedged arb position using per-leg native tickers.

Request body:

```ts
{
  long: {
    dex: ArbProtocol,
    ticker: string
  },
  short: {
    dex: ArbProtocol,
    ticker: string
  },
  totalMarginUsd: number,
  leverage: number,
  jitoFeeSol?: number,
  disableAclp?: boolean
}
```

Purpose:

- Same execution flow as `/api/arb/trade`.
- Allows cross-ticker hedges, for example `XAU` on Pacifica against `GOLD` on
  Hyperliquid.
- Does not do symbol mapping internally; callers must pass the native ticker for
  each selected DEX.
- Rejects invalid protocol IDs and missing `long.ticker`, `short.ticker`,
  `long.dex`, or `short.dex`.

## Positions

### GET `/api/arb/positions`

Auth required. Returns open positions grouped by protocol.

Purpose:

- Fetches live positions from supported providers.
- Returns unmatched/non-pair-centric protocol positions.
- Calculates total PnL.

Typical response shape:

```ts
{
  status: 'success',
  positions: Partial<Record<ArbProtocol, ArbPositionInfo[]>>,
  totalPnl: number
}
```

### GET `/api/arb/positions/v2`

Auth required. Returns active arb pairs enriched with live position data.

Purpose:

- Fetches live positions from all providers.
- Fetches active `arb_position_pairs` from the database.
- Matches live data against stored pair records.
- Returns pair-centric data with risk tags, entry APY, total margin, long/short
  leg data, and unmatched positions.

Typical response shape:

```ts
{
  status: 'success',
  pairs: ArbLivePositionPair[],
  unmatched: Partial<Record<ArbProtocol, ArbPositionInfo[]>>,
  totalPnl: number
}
```

Use this route for modern UI contexts because it preserves DB pair metadata and
supports cross-ticker pairs.

## Activity And History

### GET `/api/arb/activity`

Auth required. Returns historical arb pair activity.

Query params:

```txt
status = open | closing | closed | liquidated | error | all
limit  = 1..100, default 50
offset = default 0
```

Purpose:

- Reads historical records from `arb_position_pairs`.
- Supports status filtering and pagination.
- Returns per-leg trade metadata, close reason, realized PnL, risk tags, and
  summary counts.

Typical response shape:

```ts
{
  status: 'success',
  positions: ArbActivityPosition[],
  summary: {
    totalPositions: number,
    totalRealizedPnl: number,
    countByStatus: {
      open: number,
      closing: number,
      closed: number,
      liquidated: number,
      error: number
    }
  },
  pagination: {
    limit: number,
    offset: number,
    total: number,
    hasMore: boolean
  }
}
```

### GET `/api/arb/activity/funding/history`

Auth required. Returns historical funding payments across DEXes.

Purpose:

- Fetches funding payment history from supported DEXes.
- Includes base protocols and HIP-3 records.
- Aggregates funding earned, funding paid, and net total funding in USD.

Typical response shape:

```ts
{
  status: 'success',
  hyperliquid: FundingPaymentEntry[],
  pacifica: FundingPaymentEntry[],
  aster: FundingPaymentEntry[],
  lighter: FundingPaymentEntry[],
  '01': FundingPaymentEntry[],
  hip3: Partial<Record<Hip3ProtocolId, FundingPaymentEntry[]>>,
  errors: Partial<Record<ArbProtocol, string>>,
  warnings: Partial<Record<ArbProtocol, string>>,
  fundingEarned: number,
  fundingPaid: number,
  totalFundingUsd: number
}
```

### GET `/api/arb/transfers`

Auth required. Returns deposit and withdrawal history.

Query params:

```txt
type     = deposit | withdrawal | all
protocol = pacifica | hyperliquid | aster | lighter | 01 | all
limit    = 1..100, default 50
offset   = default 0
```

Purpose:

- Fetches transfer records from DEX APIs and local records.
- Supports filtering by transfer type and protocol.
- Sorts newest first and paginates the result.

Typical response shape:

```ts
{
  status: 'success',
  transfers: TransferRecord[],
  pagination: {
    limit: number,
    offset: number,
    total: number,
    hasMore: boolean
  }
}
```

## Closing Positions

### POST `/api/arb/close`

Auth required. Closes selected arb position legs.

Request body:

```ts
{
  market: string,
  protocols: ArbProtocol[],
  jitoFeeSol?: number,
  pairId?: number
}
```

Purpose:

- Closes selected protocols for a market.
- When `pairId` is provided, the backend looks up stored per-leg tickers so
  cross-ticker positions can close correctly.
- Updates `arb_position_pairs` after close.
- Rejects unsupported protocols to avoid partially closing legacy/unsupported
  pairs.

Typical response shape:

```ts
{
  status: 'success' | 'sent',
  message: string,
  closed: Partial<Record<ArbProtocol, { txSignature: string, pnl: number }>>,
  totalPnl: number,
  bundleId: string
}
```

### POST `/api/arb/close-all`

Auth required. Closes all open arb positions for the authenticated user.

Purpose:

- Fetches positions across supported providers.
- Closes all detected open positions, including HIP-3 buckets.
- Marks active DB pairs as closed and records realized PnL where possible.

Typical response shape:

```ts
{
  status: 'success' | 'partial',
  message: string,
  results: Partial<Record<ArbProtocol, {
    status: 'success' | 'error',
    closed: Array<{
      symbol: string,
      direction: 'long' | 'short',
      pnl: number,
      orderId?: number,
      txSignature?: string
    }>,
    error?: string
  }>>,
  totalPnl: number,
  bundleId?: string
}
```

### POST `/api/arb/set-tp-sl`

Auth required. Sets take-profit or stop-loss triggers for existing positions.

Request body:

```ts
{
  positions: Array<{
    protocol: ArbProtocol,
    market: string,
    type: 'tp' | 'sl',
    triggerPrice?: number,
    triggerPricePercent?: number
  }>
}
```

Rules:

- `positions` must be a non-empty array.
- Each target must provide exactly one of `triggerPrice` or
  `triggerPricePercent`.
- `triggerPrice` must be positive.
- `triggerPricePercent` must be greater than 0 and less than 100.

Purpose:

- Sets TP or SL on one or more existing positions.
- Resolves percentage-based trigger prices from the position entry price.
- Shares execution logic with the internal worker endpoint.

Typical response shape:

```ts
{
  status: 'success' | 'partial',
  message: string,
  results: Array<{
    protocol: ArbProtocol,
    market: string,
    type: 'tp' | 'sl',
    triggerPrice: number,
    triggerPricePercent?: number,
    entryPrice?: number,
    status: 'success' | 'error',
    direction?: 'long' | 'short',
    error?: string
  }>
}
```

## Deposits

### GET `/api/arb/deposit/hyperliquid`

Auth required. Returns supported Hyperliquid deposit assets and minimums.

Purpose:

- Returns supported assets.
- Tells callers to use `POST /api/arb/deposit/hyperliquid` to execute the
  deposit.

### POST `/api/arb/deposit/hyperliquid`

Auth required. Deposits into Hyperliquid through the Unit protocol.

Request body:

```ts
{
  asset: 'sol' | 'usdc' | 'usdt',
  amount: number,
  venue?: string
}
```

Purpose:

- For `sol`, sends SOL directly through the Hyperliquid/Unit deposit flow.
- For `usdc` or `usdt`, checks whether the wallet already has enough SOL and
  swaps through Jupiter only if needed.
- Queues automatic Hyperliquid spot-to-perp conversion.
- `venue` defaults to main Hyperliquid perps. HIP-3 venues may be passed as
  supported by `parseHlVenue`.

Important validation:

- `asset` must be `sol`, `usdc`, or `usdt`.
- `amount` must be positive.
- Direct SOL deposits must meet the minimum SOL deposit.

### GET `/api/arb/deposit/hyperliquid/:asset`

Auth required. Legacy helper that returns a Hyperliquid deposit address for a
specific asset.

Purpose:

- Validates the requested asset.
- Ensures or creates an Ethereum wallet if needed.
- Returns the Unit deposit address and minimum amount.

### POST `/api/arb/deposit/hyperliquid/convert`

Auth required. Converts Hyperliquid spot balance into perp collateral.

Purpose:

- Checks Hyperliquid spot `USOL`.
- Sells `USOL` for USDC on Hyperliquid spot.
- Transfers USDC from spot to perp.

### POST `/api/arb/deposit/aster`

Auth required. Deposits into Aster.

Request body:

```ts
{
  asset?: 'usdt' | 'usdc' | 'sol',
  amount: number
}
```

Purpose:

- Deposits USDT directly through the Aster Solana deposit program.
- If `asset` is USDC or SOL, swaps to USDT through Jupiter when needed.
- Records transfer and swap metadata.

Important validation:

- Defaults `asset` to `usdt`.
- `amount` must be positive.
- Direct USDT deposits must be at least 1 USDT.

### POST `/api/arb/deposit/lighter`

Auth required. Deposits USDC into Lighter.

Request body:

```ts
{
  amount: number
}
```

Purpose:

- Gets a Lighter intent address for the user.
- Sends SPL USDC from the embedded Solana wallet to that intent address.
- Requires or creates an embedded Ethereum wallet because Lighter account
  identity is ETH-based.

Important validation:

- `amount` must be positive.
- Minimum deposit is 5 USDC.

### GET `/api/arb/deposit/lighter/status`

Auth required. Checks latest Lighter deposit status.

Purpose:

- Proxies Lighter deposit status information for the authenticated ETH wallet.

### POST `/api/arb/deposit/01`

Auth required. Deposits USDC into the user's 01 account.

Request body:

```ts
{
  asset?: 'usdc' | 'usdt' | 'sol',
  amount: number
}
```

Purpose:

- Deposits USDC through the 01/Nord SDK.
- If `asset` is USDT or SOL, swaps to USDC first when needed.
- Records transfer and swap metadata.

Important validation:

- Defaults `asset` to `usdc`.
- `amount` must be positive.
- Direct USDC deposits must be at least 1 USDC.

## Balances

### GET `/api/arb/balance/hyperliquid`

Auth required. Returns Hyperliquid balance data for the authenticated user.

### GET `/api/arb/balance/aster`

Auth required. Returns Aster balance data for the authenticated user.

Purpose:

- Gets or creates Aster API credentials.
- Sums account balances and fetches position count where available.

### GET `/api/arb/balance/lighter`

Auth required. Returns Lighter balance data for the authenticated user.

Purpose:

- Reads account balance, position value, and unrealized PnL.

### GET `/api/arb/balance/01`

Auth required. Returns 01 account balance data for the authenticated user.

Purpose:

- Reads 01/Nord account data.
- Reports USDC-denominated value and available-to-trade information.

## Withdrawals

### POST `/api/arb/withdraw/hyperliquid`

Auth required. Withdraws from Hyperliquid perps back to the user's Solana wallet.

Request body:

```ts
{
  amount: number | string,
  venue?: string
}
```

Purpose:

- Transfers USDC from Hyperliquid perp to spot.
- Buys `USOL` with USDC on Hyperliquid spot.
- Gets a Unit withdraw address.
- Sends `USOL` to the Unit bridge address so native SOL arrives in the user's
  Solana wallet.

Important validation:

- `amount` is required and must be positive.
- Requires both embedded Solana and Ethereum wallets.
- `venue` must be supported by `parseHlVenue`.

### POST `/api/arb/withdraw/aster`

Auth required. Withdraws USDT from Aster to the user's Solana wallet.

Request body:

```ts
{
  amount: number | string
}
```

Purpose:

- Gets or creates Aster API credentials.
- Estimates the withdrawal fee.
- Executes the Aster withdrawal to the user's Solana address.
- Records the transfer.

Important validation:

- `amount` is required.
- Minimum amount is 1 USDT.

### POST `/api/arb/withdraw/lighter`

Auth required. Fast-withdraws USDC from Lighter to the user's L1 Ethereum address.

Request body:

```ts
{
  amount: number | string
}
```

Purpose:

- Gets or creates Lighter API credentials.
- Checks available Lighter balance.
- Gets fast-withdraw pool and fee information.
- Signs and submits the Lighter fast-withdraw transaction.
- Records the transfer.

Important validation:

- `amount` is required.
- Minimum amount is 1 USDC.
- Requires an embedded Ethereum wallet.
- Available balance must cover amount plus fee.

### POST `/api/arb/withdraw/01`

Auth required. Withdraws USDC from 01 back to the user's Solana wallet.

Request body:

```ts
{
  amount: number | string
}
```

Purpose:

- Uses the 01/Nord session signer.
- Submits the withdrawal to the authenticated user's Solana wallet.
- Records the transfer with the returned action ID.

Important validation:

- `amount` is required.
- Minimum amount is defined by the 01 withdrawal handler.
- Only one 01 withdrawal per user may be in flight at a time.

## Error Conventions

Most arb routes return errors in this shape:

```ts
{
  status: 'error',
  message: string,
  error?: string,
  details?: string
}
```

Common status codes:

- `400`: missing or invalid request data.
- `401`: missing Privy auth.
- `409`: conflicting in-flight action, currently used by 01 withdrawal.
- `500`: unexpected backend or provider failure.

## Frontend/Agent Context Notes

- Prefer `/api/arb/positions/v2` for position UIs because it is pair-centric and
  includes risk metadata.
- Use `/api/arb/trade/v2` when the two DEXes use different native tickers for
  the same underlying asset.
- Use `pairId` when closing positions from stored pair data; this lets the
  backend recover correct per-leg tickers.
- `disableAclp` is available on trade requests to disable ACLP-related behavior.
- HIP-3 protocols are represented as `hl:<dexName>` and can appear wherever
  `ArbProtocol` is accepted.
- Public market routes do not require auth, but trading, position management,
  deposits, balances, withdrawals, and history do.
</content>
</invoke>