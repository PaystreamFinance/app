import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { env } from "@/env";
import { trackedAxios } from "@/lib/performance/axios-wrapper";

export const swapRouter = createTRPCRouter({
  quote: publicProcedure
    .input(
      z.object({
        inputMint: z.string(),
        outputMint: z.string(),
        amount: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (ctx.privyIdToken) headers["privy-id-token"] = ctx.privyIdToken;
      if (ctx.privyAccessToken)
        headers["Authorization"] = `Bearer ${ctx.privyAccessToken}`;

      try {
        const response = await trackedAxios.get(
          `${env.SERVER_URL}/api/swap/quote`,
          {
            params: {
              inputMint: input.inputMint,
              outputMint: input.outputMint,
              amount: input.amount,
            },
            headers,
            timeout: 15000,
          },
        );
        return response.data;
      } catch (error: any) {
        const msg =
          error?.response?.data?.message ??
          error?.message ??
          "Failed to fetch swap quote";
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
      }
    }),

  execute: publicProcedure
    .input(
      z.object({
        transaction: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (ctx.privyIdToken) headers["privy-id-token"] = ctx.privyIdToken;
      if (ctx.privyAccessToken)
        headers["Authorization"] = `Bearer ${ctx.privyAccessToken}`;

      try {
        const response = await trackedAxios.post(
          `${env.SERVER_URL}/api/swap/execute`,
          { transaction: input.transaction },
          { headers, timeout: 30000 },
        );
        return response.data;
      } catch (error: any) {
        const msg =
          error?.response?.data?.message ??
          error?.message ??
          "Failed to execute swap";
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
      }
    }),
});
