import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { type NextRequest } from "next/server";

import { env } from "@/env";
import { appRouter } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";

// Increase timeout for long-running queries (default is 10s, increase to 60s)
export const maxDuration = 60;

/**
 * This wraps the `createTRPCContext` helper and provides the required context for the tRPC API when
 * handling a HTTP request (e.g. when you make requests from Client Components).
 */
const createContext = async (req: NextRequest) => {
  return createTRPCContext({
    headers: req.headers,
  });
};

const handler = async (req: NextRequest) => {
  try {
    return await fetchRequestHandler({
      endpoint: "/api/trpc",
      req,
      router: appRouter,
      createContext: () => createContext(req),
      onError:
        env.NODE_ENV === "development"
          ? ({ path, error, type, ctx, input }) => {
              const inputStr =
                input !== undefined ? JSON.stringify(input) : "<no-input>";
              const inputPreview =
                typeof inputStr === "string"
                  ? inputStr.substring(0, 200)
                  : inputStr;
              console.error(
                `❌ tRPC failed on ${path ?? "<no-path>"}: ${error.message}`,
                `\nType: ${type}`,
                `\nCode: ${error.code}`,
                `\nInput: ${inputPreview}`,
                `\nStack: ${error.stack}`,
              );
            }
          : undefined,
      responseMeta: ({ type, errors }) => {
        // Ensure we always return valid JSON, even on errors
        if (errors.length > 0 && type === "query") {
          return {
            status: 200, // Always return 200 for tRPC, errors are in the response body
            headers: {
              "Content-Type": "application/json",
            },
          };
        }
        return {};
      },
    });
  } catch (error) {
    // Catch any unhandled errors and return a valid JSON response
    console.error("❌ Unhandled error in tRPC handler:", error);
    return new Response(
      JSON.stringify({
        error: {
          message:
            error instanceof Error ? error.message : "Internal server error",
          code: "INTERNAL_SERVER_ERROR",
        },
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
};

export { handler as GET, handler as POST };
