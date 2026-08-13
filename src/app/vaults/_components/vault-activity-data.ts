export interface VaultActivityRow {
  id: number;
  created_at: string;
  action: string;
  dex: string | null;
  symbol: string | null;
  amount: number | null;
  status: string;
  error_message: string | null;
  details: Record<string, unknown>;
}

export const MOCK_VAULT_ACTIVITY: VaultActivityRow[] = [
  {
    id: 1,
    created_at: "2026-03-17T18:44:25.000Z",
    action: "close",
    dex: "hyperliquid/drift",
    symbol: "ME",
    amount: null,
    status: "success",
    error_message: null,
    details: {},
  },
  {
    id: 2,
    created_at: "2026-03-17T18:44:19.000Z",
    action: "close",
    dex: "aster/hyperliquid",
    symbol: "RES0LV",
    amount: null,
    status: "success",
    error_message: null,
    details: {},
  },
  {
    id: 3,
    created_at: "2026-03-17T18:44:16.000Z",
    action: "close",
    dex: "aster/hyperliquid",
    symbol: "AXS",
    amount: null,
    status: "success",
    error_message: null,
    details: {},
  },
  {
    id: 4,
    created_at: "2026-03-17T16:27:53.000Z",
    action: "trade",
    dex: "hyperliquid/drift",
    symbol: "ME",
    amount: 23.43,
    status: "success",
    error_message: null,
    details: {},
  },
  {
    id: 5,
    created_at: "2026-03-17T16:27:47.000Z",
    action: "trade",
    dex: "aster/hyperliquid",
    symbol: "RES0LV",
    amount: 25,
    status: "success",
    error_message: null,
    details: {},
  },
  {
    id: 6,
    created_at: "2026-03-17T16:27:41.000Z",
    action: "trade",
    dex: "aster/hyperliquid",
    symbol: "AXS",
    amount: 23.75,
    status: "success",
    error_message: null,
    details: {},
  },
  {
    id: 7,
    created_at: "2026-03-17T16:25:38.000Z",
    action: "close",
    dex: "hyperliquid/drift",
    symbol: "ME",
    amount: null,
    status: "success",
    error_message: null,
    details: {},
  },
  {
    id: 8,
    created_at: "2026-03-17T16:25:32.000Z",
    action: "close",
    dex: "aster/hyperliquid",
    symbol: "RES0LV",
    amount: null,
    status: "success",
    error_message: null,
    details: {},
  },
];
