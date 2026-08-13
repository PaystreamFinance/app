/**
 * YOU PROBABLY DON'T NEED TO EDIT THIS FILE, UNLESS:
 * 1. You want to modify request context (see Part 1).
 * 2. You want to create a new middleware or type of procedure (see Part 3).
 *
 * TL;DR - This is where all the tRPC server stuff is created and plugged in. The pieces you will
 * need to use are documented accordingly near the end.
 */
import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";

import { db } from "@/server/db";
import {
  metricsCollector,
  createPerformanceTracker,
} from "@/lib/performance/metrics";

/**
 * 1. CONTEXT
 *
 * This section defines the "contexts" that are available in the backend API.
 *
 * These allow you to access things when processing a request, like the database, the session, etc.
 *
 * This helper generates the "internals" for a tRPC context. The API handler and RSC clients each
 * wrap this and provides the required context.
 *
 * @see https://trpc.io/docs/server/context
 */
export const createTRPCContext = async (opts: { headers: Headers }) => {
  // Extract Privy tokens from headers
  const privyIdToken =
    opts.headers.get("privy-id-token") ||
    opts.headers
      .get("cookie")
      ?.split(";")
      .find((c) => c.trim().startsWith("privy-id-token="))
      ?.split("=")[1] ||
    null;
  const privyAccessToken = opts.headers.get("privy-access-token") || null;

  return {
    db,
    privyIdToken,
    privyAccessToken,
    ...opts,
  };
};

/**
 * 2. INITIALIZATION
 *
 * This is where the tRPC API is initialized, connecting the context and transformer. We also parse
 * ZodErrors so that you get typesafety on the frontend if your procedure fails due to validation
 * errors on the backend.
 */
const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

/**
 * Create a server-side caller.
 *
 * @see https://trpc.io/docs/server/server-side-calls
 */
export const createCallerFactory = t.createCallerFactory;

/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build your tRPC API. You should import these a lot in the
 * "/src/server/api/routers" directory.
 */

/**
 * This is how you create new routers and sub-routers in your tRPC API.
 *
 * @see https://trpc.io/docs/router
 */
export const createTRPCRouter = t.router;

/**
 * Enhanced middleware for comprehensive performance tracking
 * Tracks execution time, errors, and metadata for all procedures
 */
const timingMiddleware = t.middleware(async ({ next, path, type, input }) => {
  const startTime = Date.now();
  const tracker = createPerformanceTracker(
    type === "query" ? "trpc_query" : "trpc_mutation",
    path,
    {
      input: input ? JSON.stringify(input).substring(0, 500) : undefined,
    },
  );

  try {
    const result = await next();

    const duration = Date.now() - startTime;

    // Calculate output size if possible
    let outputSize: number | undefined;
    try {
      if (result && typeof result === "object") {
        outputSize = JSON.stringify(result).length;
        tracker.addMetadata("outputSize", outputSize);
      }
    } catch {
      // Ignore serialization errors
    }

    // Log slow requests
    if (duration > 1000) {
      console.warn(`[TRPC] ⚠️ Slow request: ${path} took ${duration}ms`);
    }

    // Log very slow requests
    if (duration > 3000) {
      console.error(`[TRPC] 🐌 Very slow request: ${path} took ${duration}ms`);
    }

    tracker.finish("success", undefined, {
      outputSize,
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    tracker.finish("error", errorMessage);
    throw error;
  }
});

/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your tRPC API. It does not
 * guarantee that a user querying is authorized, but you can still access user session data if they
 * are logged in.
 */
export const publicProcedure = t.procedure.use(timingMiddleware);
