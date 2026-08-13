/**
 * Mock data for position actions with strategy and bins fields.
 * Mirrors the expected backend response shape so the UI can be built
 * before the API adds these fields.
 *
 * TODO: Remove this file once the backend returns `strategy` and `bin_range`
 * on each action in the getPositionActivities response.
 */

export interface MockPositionAction {
  id: string;
  action: string;
  amount_a: string;
  amount_b: string;
  token_a_price: number | null;
  token_b_price: number | null;
  txn_sig: string;
  created_at: string;
  strategy: "spot" | "curve" | "bidask" | null;
  bin_range: string | null;
}

export const MOCK_POSITION_ACTIONS: MockPositionAction[] = [
  {
    id: "mock-1",
    action: "add_liquidity",
    amount_a: "500000000",
    amount_b: "126450000",
    token_a_price: 172.45,
    token_b_price: 1.0,
    txn_sig: "5xYz...mock1",
    created_at: "2025-12-24T01:08:19.240Z",
    strategy: "spot",
    bin_range: "40-80",
  },
  {
    id: "mock-2",
    action: "remove_liquidity",
    amount_a: "250000000",
    amount_b: "63225000",
    token_a_price: 174.12,
    token_b_price: 1.0,
    txn_sig: "7aBc...mock2",
    created_at: "2025-12-24T01:08:19.240Z",
    strategy: "curve",
    bin_range: "40-80",
  },
  {
    id: "mock-3",
    action: "claim_fees",
    amount_a: "12000000",
    amount_b: "5430000",
    token_a_price: 173.88,
    token_b_price: 1.0,
    txn_sig: "9dEf...mock3",
    created_at: "2025-12-24T01:08:19.240Z",
    strategy: "bidask",
    bin_range: "40-80",
  },
];
