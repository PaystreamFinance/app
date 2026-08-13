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

export const pacificaRouter = createTRPCRouter({
  /**
   * Get user's Pacifica account balance and info
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
        `${env.SERVER_URL}/api/pacifica/balance`,
        {
          headers,
          timeout: 10000,
        },
      );
      setCachedBalance("pacifica", ctx.privyIdToken, response.data);
      return response.data;
    };

    try {
      const cached = getCachedBalance("pacifica", ctx.privyIdToken);

      if (cached.status === "hit") return cached.data;

      if (cached.status === "stale") {
        const dedupKey = generateRequestKey("pacifica.getBalance", {
          privyIdToken: ctx.privyIdToken || "anonymous",
        });
        void deduplicateRequest(dedupKey, fetchFresh).catch(() => {});
        return cached.data;
      }

      const dedupKey = generateRequestKey("pacifica.getBalance", {
        privyIdToken: ctx.privyIdToken || "anonymous",
      });
      return await deduplicateRequest(dedupKey, fetchFresh);
    } catch (error) {
      console.error("Error fetching Pacifica balance:", error);

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
          message: errorMessage || "Failed to fetch Pacifica balance",
          cause: error,
        });
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while fetching Pacifica balance",
        cause: error,
      });
    }
  }),

  /**
   * Deposit USDC to Pacifica (on-chain transaction)
   */
  deposit: publicProcedure
    .input(
      z.object({
        amountUsdc: z.number().positive(),
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

        const url = `${env.SERVER_URL}/api/pacifica/deposit`;

        const requestBody = {
          amount: input.amountUsdc, // Backend expects 'amount' field, not 'amountUsdc'
        };

        // Log request for debugging
        console.log("Pacifica deposit request:", {
          url,
          body: requestBody,
          headers: Object.keys(headers),
          hasIdToken: !!ctx.privyIdToken,
          hasAccessToken: !!ctx.privyAccessToken,
        });

        const response = await trackedAxios.post(url, requestBody, {
          headers,
          timeout: 30000, // Deposits may take longer
        });

        invalidateCachedBalance("pacifica", ctx.privyIdToken);
        return response.data;
      } catch (error) {
        console.error("Error depositing to Pacifica:", error);

        if (error && typeof error === "object" && "response" in error) {
          const axiosError = error as {
            response?: {
              status?: number;
              data?: {
                error?: string;
                message?: string;
                [key: string]: any;
              };
            };
            message?: string;
          };
          const status = axiosError.response?.status;

          // Try to extract error message from various possible locations
          const responseData = axiosError.response?.data;
          const errorMessage =
            responseData?.error ||
            responseData?.message ||
            (typeof responseData === "string" ? responseData : null) ||
            axiosError.message ||
            "Failed to deposit to Pacifica";

          // Log the full response for debugging
          console.error("Pacifica deposit error response:", {
            status,
            data: responseData,
            fullError: error,
          });

          throw new TRPCError({
            code:
              status === 401
                ? "UNAUTHORIZED"
                : status === 400
                  ? "BAD_REQUEST"
                  : "INTERNAL_SERVER_ERROR",
            message: errorMessage,
            cause: error,
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected error occurred while depositing to Pacifica",
          cause: error,
        });
      }
    }),

  withdraw: publicProcedure
    .input(
      z.object({
        amountUsdc: z.number().positive(),
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

        const url = `${env.SERVER_URL}/api/pacifica/withdraw`;

        const response = await trackedAxios.post(
          url,
          { amount: input.amountUsdc },
          {
            headers,
            timeout: 30000,
          },
        );

        invalidateCachedBalance("pacifica", ctx.privyIdToken);
        return response.data;
      } catch (error) {
        console.error("Error withdrawing from Pacifica:", error);

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
            axiosError.message ||
            "Failed to withdraw from Pacifica";

          throw new TRPCError({
            code:
              status === 401
                ? "UNAUTHORIZED"
                : status === 400
                  ? "BAD_REQUEST"
                  : "INTERNAL_SERVER_ERROR",
            message: errorMessage,
            cause: error,
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "An unexpected error occurred while withdrawing from Pacifica",
          cause: error,
        });
      }
    }),
});
