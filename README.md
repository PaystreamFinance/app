# Paystream App

> **Archived reference implementation.** Paystream is no longer actively maintained. This code has not been independently audited and must not be used to custody funds or execute production trades without a complete security review.

The Paystream web application is a Next.js interface for exploring and executing delta-neutral and spot/perpetual strategies across Solana and perpetual-futures venues. It includes market discovery, position management, portfolio views, funding-rate history, deposits and withdrawals, and transaction monitoring.

The application is published for education, research, and reuse. It is provided without hosted services, credentials, operational support, or any guarantee that upstream APIs remain compatible.

## Security and financial-risk warning

This software can construct or request financial transactions. Bugs, stale market data, compromised dependencies, incorrect configuration, or changes in third-party protocols can cause permanent loss of funds.

- Do not use real keys or production wallets during development.
- Start on test networks and with disposable accounts.
- Review every transaction and signing flow independently.
- Never expose server-only environment variables through a `NEXT_PUBLIC_` name.
- See [SECURITY.md](SECURITY.md) before deploying or reporting a vulnerability.

Nothing in this repository is financial, investment, legal, or tax advice.

## Stack

- Next.js 15 and React 19
- TypeScript and Tailwind CSS
- Privy embedded wallets
- Drizzle ORM with PostgreSQL
- Solana Web3.js and protocol SDKs
- tRPC and TanStack Query

## Local development

Requirements:

- Node.js 20 or newer
- pnpm 9.6
- PostgreSQL 16 when using database-backed features

```bash
cp .env.example .env.local
pnpm install --frozen-lockfile
docker compose up -d postgres
pnpm db:migrate
pnpm dev
```

Open `http://localhost:3000`. Environment variables are documented in [.env.example](.env.example). Several integrations require accounts and credentials from their respective providers.

Useful checks:

```bash
pnpm typecheck
pnpm format:check
pnpm sec:audit
pnpm build
```

## Repository relationship

The companion API and worker implementation lives in [PaystreamFinance/backend](https://github.com/PaystreamFinance/backend). Set `NEXT_PUBLIC_PERP_HEDGE_API_URL` or `NEXT_PUBLIC_ARBITRAGE_API_URL` to your own deployment; do not depend on historical Paystream endpoints.

## Project status

This repository is archived in the maintenance sense: issues and pull requests may not receive a response. Protocol integrations, dependency versions, and deployment documentation represent the state of the project at publication time.

## License

Licensed under the [Apache License 2.0](LICENSE). Paystream names and logos are not granted for use by the license; see the trademark clause in the license.
