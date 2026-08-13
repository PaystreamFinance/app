import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { PublicKey } from "@solana/web3.js";
import { VoltrClient } from "@voltr/vault-sdk";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { getSupabase } from "@/lib/supabase";
import { getConnection } from "@/lib/solana-connection";

function requireSupabase() {
  const client = getSupabase();
  if (!client) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Supabase is not configured",
    });
  }
  return client;
}

const VAULT_ADDRESS = new PublicKey("5LUoeiurbbnweLnZ6TMUWe8Fbk4BTuomzjLF1iSeix9t");
const ADAPTOR_PROGRAM_ID = new PublicKey("3pnpK9nrs1R65eMV1wqCXkDkhSgN18xb1G5pgYPwoZjJ");
const STRATEGY_SEED = "paystream-funding-arb";

export const vaultsRouter = createTRPCRouter({
  getActivityLogs: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ input }) => {
      const supabase = requireSupabase();
      const { data: logs, error, count } = await supabase
        .from("activity_logs")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);

      if (error) throw new Error(error.message);

      return { logs: logs ?? [], total: count ?? 0 };
    }),

  getStrategyState: publicProcedure.query(async () => {
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from("strategy_state")
      .select("*")
      .eq("id", 1)
      .single();

    if (error) throw new Error(error.message);
    return data;
  }),

  getPositionMonitors: publicProcedure.query(async () => {
    const supabase = requireSupabase();
    const { data: positions, error } = await supabase
      .from("position_monitors")
      .select("*")
      .neq("status", "closed")
      .order("opened_at", { ascending: true });

    if (error) throw new Error(error.message);
    return { positions: positions ?? [] };
  }),

  getEquitySnapshot: publicProcedure.query(async () => {
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from("equity_snapshots")
      .select("*")
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data;
  }),

  getVaultMetrics: publicProcedure.query(async () => {
    const connection = getConnection();
    const vc = new VoltrClient(connection);

    const vaultAccount = await vc.fetchVaultAccount(VAULT_ADDRESS);
    const totalAssets = vaultAccount.asset.totalValue.toNumber() / 1_000_000;

    const { vaultLpMint: lpMint } = vc.findVaultAddresses(VAULT_ADDRESS);
    const lpMintInfo = await connection.getTokenSupply(lpMint);
    const lpSupply = parseFloat(lpMintInfo.value.uiAmountString ?? "0");
    const lpPrice = lpSupply > 0 ? totalAssets / lpSupply : 1.0;
    const performance = (lpPrice - 1.0) * 100;

    const [strategy] = PublicKey.findProgramAddressSync(
      [Buffer.from(STRATEGY_SEED)],
      ADAPTOR_PROGRAM_ID,
    );
    const { strategyInitReceipt } = vc.findVaultStrategyAddresses(
      VAULT_ADDRESS,
      strategy,
    );
    let strategyValue = 0;
    let strategyLastUpdated = 0;
    try {
      const receipt = await vc.fetchStrategyInitReceiptAccount(strategyInitReceipt);
      strategyValue = receipt.positionValue.toNumber() / 1_000_000;
      strategyLastUpdated = receipt.lastUpdatedTs.toNumber();
    } catch {
      // strategy not yet initialized
    }
    const idleBalance = totalAssets - strategyValue;

    return {
      totalAssets,
      lpPrice,
      lpSupply,
      performance,
      strategyValue,
      strategyLastUpdated,
      idleBalance,
    };
  }),

  getVaultTransactions: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50) }))
    .query(async ({ input }) => {
      const connection = getConnection();
      const sigs = await connection.getSignaturesForAddress(VAULT_ADDRESS, {
        limit: input.limit,
      });
      return sigs.map((s) => ({
        signature: s.signature,
        blockTime: s.blockTime ?? null,
        slot: s.slot,
        err: s.err ? true : false,
        memo: s.memo ?? null,
      }));
    }),

  getUserPosition: publicProcedure
    .input(z.object({ userAddress: z.string() }))
    .query(async ({ input }) => {
      const connection = getConnection();
      const vc = new VoltrClient(connection);
      const { getAssociatedTokenAddressSync } = await import("@solana/spl-token");

      const userPubkey = new PublicKey(input.userAddress);
      const { vaultLpMint: lpMint } = vc.findVaultAddresses(VAULT_ADDRESS);

      // LP balance
      let lpBalance = 0;
      try {
        const lpAta = getAssociatedTokenAddressSync(lpMint, userPubkey);
        const result = await connection.getTokenAccountBalance(lpAta);
        lpBalance = parseFloat(result.value.uiAmountString ?? "0");
      } catch {
        // ATA doesn't exist yet
      }

      // LP price (same logic as getVaultMetrics)
      let lpValueUsdc = 0;
      try {
        const vaultAccount = await vc.fetchVaultAccount(VAULT_ADDRESS);
        const totalAssets = vaultAccount.asset.totalValue.toNumber() / 1_000_000;
        const lpMintInfo = await connection.getTokenSupply(lpMint);
        const lpSupply = parseFloat(lpMintInfo.value.uiAmountString ?? "0");
        const lpPrice = lpSupply > 0 ? totalAssets / lpSupply : 1.0;
        lpValueUsdc = lpBalance * lpPrice;
      } catch {
        // fallback: 1:1
        lpValueUsdc = lpBalance;
      }

      // Pending withdrawal receipt
      let pendingWithdrawal: {
        lpAmount: number;
        eligibleAt: string;
        isReady: boolean;
      } | null = null;
      try {
        const receiptPda = vc.findRequestWithdrawVaultReceipt(
          VAULT_ADDRESS,
          userPubkey,
        );
        const receipt = await vc.fetchRequestWithdrawVaultReceiptAccount(receiptPda);
        const lpAmount = receipt.amountLpEscrowed.toNumber() / 1_000_000_000;
        const withdrawableFromTs = receipt.withdrawableFromTs.toNumber();
        const eligibleAt = new Date(withdrawableFromTs * 1000).toISOString();
        const isReady = Math.floor(Date.now() / 1000) >= withdrawableFromTs;
        pendingWithdrawal = { lpAmount, eligibleAt, isReady };
      } catch {
        // No pending withdrawal
      }

      return { lpBalance, lpValueUsdc, pendingWithdrawal };
    }),
});
