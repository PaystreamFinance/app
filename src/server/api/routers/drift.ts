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

export const driftRouter = createTRPCRouter({
  /**
   * Get user's spot balances (collateral) in their Drift account
   */
  getBalance: publicProcedure.query(async ({ ctx }) => {
    const fetchFresh = async () => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (ctx.privyIdToken) headers["privy-id-token"] = ctx.privyIdToken;
      if (ctx.privyAccessToken)
        headers["Authorization"] = `Bearer ${ctx.privyAccessToken}`;

      const response = await trackedAxios.get(
        `${env.SERVER_URL}/api/drift/balance`,
        {
          headers,
          timeout: 10000,
        },
      );
      setCachedBalance("drift", ctx.privyIdToken, response.data);
      return response.data;
    };

    try {
      const cached = getCachedBalance("drift", ctx.privyIdToken);

      if (cached.status === "hit") return cached.data;

      if (cached.status === "stale") {
        // Return stale data now, refresh in background
        const dedupKey = generateRequestKey("drift.getBalance", {
          privyIdToken: ctx.privyIdToken || "anonymous",
        });
        void deduplicateRequest(dedupKey, fetchFresh).catch(() => {});
        return cached.data;
      }

      // Cache miss — must wait for fresh data
      const dedupKey = generateRequestKey("drift.getBalance", {
        privyIdToken: ctx.privyIdToken || "anonymous",
      });
      return await deduplicateRequest(dedupKey, fetchFresh);
    } catch (error) {
      console.error("Error fetching Drift balance:", error);

      if (error && typeof error === "object" && "response" in error) {
        const axiosError = error as {
          response?: { status?: number; data?: { error?: string } };
          message?: string;
        };
        const status = axiosError.response?.status;
        const errorMessage =
          axiosError.response?.data?.error || axiosError.message;

        throw new TRPCError({
          code: status === 401 ? "UNAUTHORIZED" : "INTERNAL_SERVER_ERROR",
          message: errorMessage || "Failed to fetch Drift balance",
          cause: error,
        });
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while fetching Drift balance",
        cause: error,
      });
    }
  }),

  /**
   * Deposit collateral into Drift account
   */
  deposit: publicProcedure
    .input(
      z.object({
        amount: z.number().positive(),
        marketIndex: z.number().int().nonnegative(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        // Build headers with Privy authentication
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        if (ctx.privyIdToken) {
          headers["privy-id-token"] = ctx.privyIdToken;
        }

        if (ctx.privyAccessToken) {
          headers["Authorization"] = `Bearer ${ctx.privyAccessToken}`;
        }

        const url = `${env.SERVER_URL}/api/drift/deposit`;

        const response = await trackedAxios.post(
          url,
          {
            amount: input.amount,
            marketIndex: input.marketIndex,
          },
          {
            headers,
            timeout: 30000, // Deposits may take longer
          },
        );

        invalidateCachedBalance("drift", ctx.privyIdToken);
        return response.data;
      } catch (error) {
        console.error("Error depositing to Drift:", error);

        if (error && typeof error === "object" && "response" in error) {
          const axiosError = error as {
            response?: { status?: number; data?: { error?: string } };
            message?: string;
          };
          const status = axiosError.response?.status;
          const errorMessage =
            axiosError.response?.data?.error || axiosError.message;

          throw new TRPCError({
            code: status === 401 ? "UNAUTHORIZED" : "INTERNAL_SERVER_ERROR",
            message: errorMessage || "Failed to deposit to Drift",
            cause: error,
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected error occurred while depositing to Drift",
          cause: error,
        });
      }
    }),

  withdraw: publicProcedure
    .input(
      z.object({
        amount: z.number().positive(),
        marketIndex: z.number().int().nonnegative(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        if (ctx.privyIdToken) {
          headers["privy-id-token"] = ctx.privyIdToken;
        }

        if (ctx.privyAccessToken) {
          headers["Authorization"] = `Bearer ${ctx.privyAccessToken}`;
        }

        const url = `${env.SERVER_URL}/api/drift/withdraw`;

        const response = await trackedAxios.post(
          url,
          {
            amount: input.amount,
            marketIndex: input.marketIndex,
          },
          {
            headers,
            timeout: 30000,
          },
        );

        invalidateCachedBalance("drift", ctx.privyIdToken);
        return response.data;
      } catch (error) {
        console.error("Error withdrawing from Drift:", error);

        if (error && typeof error === "object" && "response" in error) {
          const axiosError = error as {
            response?: { status?: number; data?: { error?: string } };
            message?: string;
          };
          const status = axiosError.response?.status;
          const errorMessage =
            axiosError.response?.data?.error || axiosError.message;

          throw new TRPCError({
            code: status === 401 ? "UNAUTHORIZED" : "INTERNAL_SERVER_ERROR",
            message: errorMessage || "Failed to withdraw from Drift",
            cause: error,
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected error occurred while withdrawing from Drift",
          cause: error,
        });
      }
    }),
});
