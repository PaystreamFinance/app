import { z } from "zod";
import axios from "axios";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { env } from "@/env";

export const strategiesRouter = createTRPCRouter({
  /**
   * Create a strategy preset
   */
  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().min(1),
        strategy: z.number().nullable().optional(),
        priceLower: z.number().nullable().optional(),
        priceUpper: z.number().nullable().optional(),
        liquidityDistributionA: z.number().nullable().optional(),
        liquidityDistributionB: z.number().nullable().optional(),
        tp: z.number().nullable().optional(),
        sl: z.number().nullable().optional(),
        tpSlType: z.enum(["price", "pnl"]).nullable().optional(),
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

        const url = `${env.SERVER_URL}/api/strategies`;

        const response = await axios.post(url, input, {
          headers,
          timeout: 10000,
        });

        return response.data;
      } catch (error) {
        console.error("Error creating strategy preset:", error);

        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          const errorMessage = error.response?.data?.error || error.message;

          throw new TRPCError({
            code: status === 401 ? "UNAUTHORIZED" : "INTERNAL_SERVER_ERROR",
            message: errorMessage || "Failed to create strategy preset",
            cause: error,
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "An unexpected error occurred while creating strategy preset",
          cause: error,
        });
      }
    }),

  /**
   * List strategy presets
   */
  list: publicProcedure
    .input(
      z.object({
        type: z.enum(["user", "default", "all"]).default("all").optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      try {
        // Build headers with Privy authentication
        const headers: Record<string, string> = {};

        if (ctx.privyIdToken) {
          headers["privy-id-token"] = ctx.privyIdToken;
        }

        if (ctx.privyAccessToken) {
          headers["Authorization"] = `Bearer ${ctx.privyAccessToken}`;
        }

        const url = new URL(`${env.SERVER_URL}/api/strategies`);
        if (input.type) {
          url.searchParams.set("type", input.type);
        }

        const response = await axios.get(url.toString(), {
          headers,
          timeout: 10000,
        });

        console.log("response----response----", response.data);

        return response.data;
      } catch (error) {
        console.error("Error fetching strategy presets:", error);

        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          const errorMessage = error.response?.data?.error || error.message;

          throw new TRPCError({
            code: status === 400 ? "BAD_REQUEST" : "INTERNAL_SERVER_ERROR",
            message: errorMessage || "Failed to fetch strategy presets",
            cause: error,
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "An unexpected error occurred while fetching strategy presets",
          cause: error,
        });
      }
    }),

  /**
   * Update a strategy preset
   */
  update: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().optional(),
        description: z.string().optional(),
        type: z.enum(["user", "default"]).optional(),
        strategy: z.number().nullable().optional(),
        priceLower: z.number().nullable().optional(),
        priceUpper: z.number().nullable().optional(),
        liquidityDistributionA: z.number().nullable().optional(),
        liquidityDistributionB: z.number().nullable().optional(),
        tp: z.number().nullable().optional(),
        sl: z.number().nullable().optional(),
        tpSlType: z.enum(["price", "pnl"]).nullable().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const { id, ...updateData } = input;

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

        const url = `${env.SERVER_URL}/api/strategies/${id}`;

        const response = await axios.put(url, updateData, {
          headers,
          timeout: 10000,
        });

        return response.data;
      } catch (error) {
        console.error("Error updating strategy preset:", error);

        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          const errorMessage = error.response?.data?.error || error.message;

          throw new TRPCError({
            code:
              status === 401
                ? "UNAUTHORIZED"
                : status === 404
                  ? "NOT_FOUND"
                  : "INTERNAL_SERVER_ERROR",
            message: errorMessage || "Failed to update strategy preset",
            cause: error,
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "An unexpected error occurred while updating strategy preset",
          cause: error,
        });
      }
    }),

  /**
   * Delete a strategy preset
   */
  delete: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        // Build headers with Privy authentication
        const headers: Record<string, string> = {};

        if (ctx.privyIdToken) {
          headers["privy-id-token"] = ctx.privyIdToken;
        }

        if (ctx.privyAccessToken) {
          headers["Authorization"] = `Bearer ${ctx.privyAccessToken}`;
        }

        const url = `${env.SERVER_URL}/api/strategies/${input.id}`;

        const response = await axios.delete(url, {
          headers,
          timeout: 10000,
        });

        return response.data;
      } catch (error) {
        console.error("Error deleting strategy preset:", error);

        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          const errorMessage = error.response?.data?.error || error.message;

          throw new TRPCError({
            code:
              status === 401
                ? "UNAUTHORIZED"
                : status === 404
                  ? "NOT_FOUND"
                  : "INTERNAL_SERVER_ERROR",
            message: errorMessage || "Failed to delete strategy preset",
            cause: error,
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "An unexpected error occurred while deleting strategy preset",
          cause: error,
        });
      }
    }),
});
