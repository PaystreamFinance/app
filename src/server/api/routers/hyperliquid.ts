import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { env } from "@/env";
import { trackedAxios } from "@/lib/performance/axios-wrapper";
import {
  getCachedBalance,
  setCachedBalance,
  invalidateCachedBalance,
} from "@/lib/performance/balance-cache";
import {
  deduplicateRequest,
  generateRequestKey,
} from "@/lib/performance/request-deduplication";

/**
 * Strip auth headers + request bodies before logging an axios error so
 * Privy id-tokens and bearer access-tokens never leak into server logs.
 */
function redactAxiosError(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== "object") return { error: String(error) };
  const e = error as {
    message?: string;
    code?: string;
    response?: { status?: number; data?: unknown };
  };
  return {
    message: e.message,
    code: e.code,
    status: e.response?.status,
    data: e.response?.data,
  };
}

/** Throws UNAUTHORIZED locally if the caller didn't supply a Privy id-token. */
function requirePrivyAuth(
  privyIdToken: string | null | undefined,
): asserts privyIdToken is string {
  if (!privyIdToken) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }
}

export const hyperliquidRouter = createTRPCRouter({
  /**
   * Get user's Hyperliquid account balance and info
   */
  getBalance: publicProcedure.query(async ({ ctx }) => {
    requirePrivyAuth(ctx.privyIdToken);
    const fetchFresh = async () => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      headers["privy-id-token"] = ctx.privyIdToken!;
      if (ctx.privyAccessToken)
        headers["Authorization"] = `Bearer ${ctx.privyAccessToken}`;

      const response = await trackedAxios.get(
        `${env.SERVER_URL}/api/arb/balance/hyperliquid`,
        {
          headers,
          timeout: 10000,
        },
      );
      setCachedBalance("hyperliquid", ctx.privyIdToken, response.data);
      return response.data;
    };

    try {
      const cached = getCachedBalance("hyperliquid", ctx.privyIdToken);

      if (cached.status === "hit") return cached.data;

      if (cached.status === "stale") {
        const dedupKey = generateRequestKey("hyperliquid.getBalance", {
          privyIdToken: ctx.privyIdToken || "anonymous",
        });
        void deduplicateRequest(dedupKey, fetchFresh).catch(() => {});
        return cached.data;
      }

      const dedupKey = generateRequestKey("hyperliquid.getBalance", {
        privyIdToken: ctx.privyIdToken || "anonymous",
      });
      return await deduplicateRequest(dedupKey, fetchFresh);
    } catch (error) {
      console.error("Error fetching Hyperliquid balance:", redactAxiosError(error));

      if (error && typeof error === "object" && "response" in error) {
        const axiosError = error as {
          response?: {
            status?: number;
            data?: { error?: string; message?: string };
          };
          message?: string;
        };
        const status = axiosError.response?.status;
        const errorMessage =
          axiosError.response?.data?.error ||
          axiosError.response?.data?.message ||
          axiosError.message;

        throw new TRPCError({
          code: status === 401 ? "UNAUTHORIZED" : "INTERNAL_SERVER_ERROR",
          message: errorMessage || "Failed to fetch Hyperliquid balance",
        });
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "An unexpected error occurred while fetching Hyperliquid balance",
      });
    }
  }),

  /**
   * Deposit SOL to Hyperliquid (on-chain transaction)
   * Creates embedded Ethereum wallet if not already exists, gets Unit Solana address,
   * and sends SOL token as deposit. Takes < 1m for deposit to get credited.
   */
  deposit: publicProcedure
    .input(
      z.object({
        asset: z.enum(["sol", "usdc", "usdt"]),
        // Sanity cap — backend re-validates against per-account limits. The
        // upper bound exists only to reject obviously bogus values like 1e308
        // before they hit the upstream service.
        amount: z.number().finite().positive().max(10_000_000),
        // Optional HIP-3 venue routing. When set to "main" (default) the
        // backend deposits to the vanilla HL USDC perp account. When set
        // to one of the curated hl:* venues the backend bridges + swaps
        // USDC into the target collateral before sendAsset'ing to that
        // HIP-3 perp. See protocol-registry HIP3_DEXES for collateral.
        venue: z
          .enum([
            "main",
            "hl:xyz",
            "hl:flx",
            "hl:hyna",
            "hl:km",
            "hl:cash",
            "hl:para",
          ])
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requirePrivyAuth(ctx.privyIdToken);
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "privy-id-token": ctx.privyIdToken,
        };

        if (ctx.privyAccessToken) {
          headers["Authorization"] = `Bearer ${ctx.privyAccessToken}`;
        }

        const url = `${env.SERVER_URL}/api/arb/deposit/hyperliquid`;

        const response = await trackedAxios.post(
          url,
          {
            asset: input.asset,
            amount: input.amount,
            ...(input.venue ? { venue: input.venue } : {}),
          },
          {
            headers,
            timeout: 60000, // 60 seconds timeout for deposit transaction
          },
        );

        invalidateCachedBalance("hyperliquid", ctx.privyIdToken);
        return response.data;
      } catch (error) {
        console.error("Error depositing to Hyperliquid:", redactAxiosError(error));

        if (error && typeof error === "object" && "response" in error) {
          const axiosError = error as {
            response?: {
              status?: number;
              data?: {
                error?: string;
                message?: string;
                details?: string;
              };
            };
            message?: string;
          };
          const status = axiosError.response?.status;
          const errorData = axiosError.response?.data;
          const errorMessage =
            errorData?.error ||
            errorData?.message ||
            errorData?.details ||
            axiosError.message ||
            "Failed to deposit to Hyperliquid";

          throw new TRPCError({
            code:
              status === 401
                ? "UNAUTHORIZED"
                : status === 400
                  ? "BAD_REQUEST"
                  : "INTERNAL_SERVER_ERROR",
            message: errorMessage,
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "An unexpected error occurred while depositing to Hyperliquid",
        });
      }
    }),

  withdraw: publicProcedure
    .input(
      z.object({
        asset: z.enum(["sol"]),
        // amount is in **USD** (backend converts USD → SOL units when sending
        // back to the user's Solana wallet). See PerpDepositWithdrawModal /
        // wallet-sheet for the matching frontend handling. Sanity cap only.
        amount: z.number().finite().positive().max(10_000_000),
        // See the matching `venue` doc in `deposit` above — routes withdraw
        // through the same HL → spot → Solana path, reversing any collateral
        // swap when the selected HIP-3 venue's collateral ≠ USDC.
        venue: z
          .enum([
            "main",
            "hl:xyz",
            "hl:flx",
            "hl:hyna",
            "hl:km",
            "hl:cash",
            "hl:para",
          ])
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requirePrivyAuth(ctx.privyIdToken);
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "privy-id-token": ctx.privyIdToken,
        };

        if (ctx.privyAccessToken) {
          headers["Authorization"] = `Bearer ${ctx.privyAccessToken}`;
        }

        const url = `${env.SERVER_URL}/api/arb/withdraw/hyperliquid`;

        const response = await trackedAxios.post(
          url,
          {
            asset: input.asset,
            amount: input.amount,
            ...(input.venue ? { venue: input.venue } : {}),
          },
          {
            headers,
            timeout: 60000,
          },
        );

        invalidateCachedBalance("hyperliquid", ctx.privyIdToken);
        return response.data;
      } catch (error) {
        console.error("Error withdrawing from Hyperliquid:", redactAxiosError(error));

        if (error && typeof error === "object" && "response" in error) {
          const axiosError = error as {
            response?: {
              status?: number;
              data?: { error?: string; message?: string; details?: string };
            };
            message?: string;
          };
          const status = axiosError.response?.status;
          const errorData = axiosError.response?.data;
          const errorMessage =
            errorData?.error ||
            errorData?.message ||
            errorData?.details ||
            axiosError.message ||
            "Failed to withdraw from Hyperliquid";

          throw new TRPCError({
            code:
              status === 401
                ? "UNAUTHORIZED"
                : status === 400
                  ? "BAD_REQUEST"
                  : "INTERNAL_SERVER_ERROR",
            message: errorMessage,
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "An unexpected error occurred while withdrawing from Hyperliquid",
        });
      }
    }),
});
