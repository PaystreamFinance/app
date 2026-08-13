/**
 * Performance Metrics API Router
 *
 * Exposes performance metrics and analysis endpoints
 * Only accessible on staging and local environments
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { metricsCollector } from "@/lib/performance/metrics";
import { rpcTracker } from "@/lib/performance/rpc-tracker";
import { externalAPITracker } from "@/lib/performance/external-api-tracker";
import { analyzePerformance, generateReport } from "@/lib/performance/analyzer";

/**
 * Check if the current environment allows access to performance endpoints
 * Only allow on localhost and staging.paystream.finance
 */
function checkEnvironmentAccess(ctx: any) {
  // In development, always allow
  if (process.env.NODE_ENV === "development") {
    return;
  }

  // Check the host header from the request
  const host = ctx.headers?.get?.("host") || ctx.headers?.host;

  const allowedHosts = [
    "localhost",
    "localhost:3000",
    "127.0.0.1",
    "127.0.0.1:3000",
    "staging.paystream.finance",
  ];

  if (!host || !allowedHosts.some((allowed) => host.includes(allowed))) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Performance dashboard is only available on staging and local environments",
    });
  }
}

export const performanceRouter = createTRPCRouter({
  /**
   * Get current performance statistics
   */
  getStats: publicProcedure
    .input(
      z
        .object({
          timeWindowMs: z.number().optional(), // Time window in milliseconds
        })
        .optional(),
    )
    .query(({ input, ctx }) => {
      checkEnvironmentAccess(ctx);
      return metricsCollector.getStats(input?.timeWindowMs);
    }),

  /**
   * Get all metrics (for detailed analysis)
   */
  getMetrics: publicProcedure
    .input(
      z
        .object({
          type: z
            .enum([
              "trpc_query",
              "trpc_mutation",
              "external_api",
              "rpc_call",
              "frontend_request",
            ])
            .optional(),
          path: z.string().optional(),
          startTime: z.number().optional(),
          endTime: z.number().optional(),
          limit: z.number().max(1000).default(100),
        })
        .optional(),
    )
    .query(({ input, ctx }) => {
      checkEnvironmentAccess(ctx);
      const metrics = metricsCollector.getMetrics({
        type: input?.type,
        path: input?.path,
        startTime: input?.startTime,
        endTime: input?.endTime,
      });

      // Return limited results
      return metrics.slice(-(input?.limit ?? 100));
    }),

  /**
   * Get RPC statistics
   */
  getRPCStats: publicProcedure.query(({ ctx }) => {
    checkEnvironmentAccess(ctx);
    return rpcTracker.getStats();
  }),

  /**
   * Get external API statistics
   */
  getExternalAPIStats: publicProcedure.query(({ ctx }) => {
    checkEnvironmentAccess(ctx);
    return externalAPITracker.getStats();
  }),

  /**
   * Get comprehensive performance analysis
   */
  getAnalysis: publicProcedure
    .input(
      z
        .object({
          timeWindowMs: z.number().optional(),
        })
        .optional(),
    )
    .query(({ input, ctx }) => {
      checkEnvironmentAccess(ctx);
      return analyzePerformance(input?.timeWindowMs);
    }),

  /**
   * Get performance report as text
   */
  getReport: publicProcedure
    .input(
      z
        .object({
          timeWindowMs: z.number().optional(),
        })
        .optional(),
    )
    .query(({ input, ctx }) => {
      checkEnvironmentAccess(ctx);
      const analysis = analyzePerformance(input?.timeWindowMs);
      return generateReport(analysis);
    }),

  /**
   * Clear all metrics (for testing/reset)
   */
  clearMetrics: publicProcedure.mutation(({ ctx }) => {
    checkEnvironmentAccess(ctx);
    metricsCollector.clear();
    rpcTracker.clear();
    externalAPITracker.clear();
    return { success: true };
  }),
});
