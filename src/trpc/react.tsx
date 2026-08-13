"use client";

import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { httpBatchLink, loggerLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import { type inferRouterInputs, type inferRouterOutputs } from "@trpc/server";
import { useState, useEffect } from "react";
import { fetchFundingRateHistory } from "@/app/portfolio/hooks/use-funding-rate-history";
import SuperJSON from "superjson";

import { type AppRouter } from "@/server/api/root";
import { createQueryClient } from "./query-client";
import { installQueryPersister } from "./query-persistence";
import {
  metricsCollector,
  createPerformanceTracker,
} from "@/lib/performance/metrics";

let clientQueryClientSingleton: QueryClient | undefined = undefined;
const getQueryClient = () => {
  if (typeof window === "undefined") {
    // Server: always make a new query client (no persistence on server)
    return createQueryClient();
  }
  // Browser: use singleton pattern to keep the same query client and
  // hydrate persisted portfolio caches from localStorage on first call.
  if (!clientQueryClientSingleton) {
    clientQueryClientSingleton = createQueryClient();
    installQueryPersister(clientQueryClientSingleton);
  }

  return clientQueryClientSingleton;
};

export const api = createTRPCReact<AppRouter>();

/**
 * Inference helper for inputs.
 *
 * @example type HelloInput = RouterInputs['example']['hello']
 */
export type RouterInputs = inferRouterInputs<AppRouter>;

/**
 * Inference helper for outputs.
 *
 * @example type HelloOutput = RouterOutputs['example']['hello']
 */
export type RouterOutputs = inferRouterOutputs<AppRouter>;

export function TRPCReactProvider(props: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  // Prefetch funding rate history as soon as the app mounts so the arb screener
  // has a warm cache and Aster interval detection works on first render.
  useEffect(() => {
    void queryClient.prefetchQuery({
      queryKey: ["funding-rate-history-all"],
      queryFn: fetchFundingRateHistory,
      staleTime: 60 * 1000,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [trpcClient] = useState(() =>
    api.createClient({
      links: [
        loggerLink({
          enabled: (op) =>
            process.env.NODE_ENV === "development" ||
            (op.direction === "down" && op.result instanceof Error),
        }),
        httpBatchLink({
          transformer: SuperJSON,
          url: getBaseUrl() + "/api/trpc",
          // Automatically use POST when URL exceeds maxURLLength to avoid 431 errors
          // GET is used for single/small requests, POST automatically for large batches
          maxURLLength: 2000,
          maxItems: 4, // Small batches — one slow query won't block others
          headers: async () => {
            const headers = new Headers();
            headers.set("x-trpc-source", "nextjs-react");

            // Get tokens from browser storage
            if (typeof window !== "undefined") {
              // Get identity token from cookie or sessionStorage
              let privyIdToken: string | null = null;

              // Try cookie first
              const cookies = document.cookie.split(";");
              privyIdToken =
                cookies
                  .find((c) => c.trim().startsWith("privy-id-token="))
                  ?.split("=")[1] || null;

              // Fallback to sessionStorage
              if (!privyIdToken) {
                privyIdToken = sessionStorage.getItem("privy-id-token");
              }

              if (privyIdToken) {
                headers.set("privy-id-token", privyIdToken);
              }

              // Get access token from sessionStorage
              const privyAccessToken =
                sessionStorage.getItem("privy-access-token");
              if (privyAccessToken) {
                headers.set("privy-access-token", privyAccessToken);
              }
            }

            return headers;
          },
          fetch: async (url, options) => {
            const startTime = performance.now();
            const method = options?.method || "GET";

            // Convert url to string for tracking (handles URL, Request, or string)
            let urlString: string;
            if (typeof url === "string") {
              urlString = url;
            } else if (url instanceof URL) {
              urlString = url.toString();
            } else if (url instanceof Request) {
              urlString = url.url;
            } else {
              urlString = String(url);
            }

            // Extract path from URL for tracking
            const urlPath = new URL(urlString, window.location.origin).pathname;
            const tracker = createPerformanceTracker(
              "frontend_request",
              urlPath,
              {
                method,
                url: urlString.substring(0, 200), // Truncate long URLs
              },
            );

            try {
              const response = await fetch(url, options);
              const duration = performance.now() - startTime;

              // Track batch size if it's a POST request
              if (method === "POST" && options?.body) {
                try {
                  const body = JSON.parse(options.body as string);
                  if (Array.isArray(body)) {
                    tracker.addMetadata("batchSize", body.length);
                  }
                } catch {
                  // Ignore parsing errors
                }
              }

              // Log non-OK responses for debugging
              if (!response.ok) {
                // Clone to read body without consuming original
                const clonedResponse = response.clone();
                const text = await clonedResponse
                  .text()
                  .catch(() => "Unable to read response");
                console.error(
                  `❌ tRPC HTTP Error: ${response.status} ${response.statusText}`,
                  `\nURL: ${url}`,
                  `\nMethod: ${method}`,
                  `\nResponse: ${text.substring(0, 500)}`,
                );

                tracker.finish(
                  "error",
                  `${response.status} ${response.statusText}`,
                );
                return response;
              }

              // Check content-length header to detect empty responses
              const contentLength = response.headers.get("content-length");
              if (contentLength === "0") {
                console.error(
                  `❌ tRPC Empty Response Detected`,
                  `\nURL: ${url}`,
                  `\nStatus: ${response.status} ${response.statusText}`,
                  `\nContent-Length: ${contentLength}`,
                );
              }

              // Log slow requests
              if (duration > 1000) {
                console.warn(
                  `[Frontend] ⚠️ Slow request: ${urlPath} took ${Math.round(duration)}ms`,
                );
              }

              tracker.finish("success", undefined, {
                statusCode: response.status,
                duration,
              });

              return response;
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : String(error);
              console.error(
                `❌ tRPC Fetch Error`,
                `\nURL: ${url}`,
                `\nMethod: ${method}`,
                `\nError: ${errorMessage}`,
                `\nStack: ${error instanceof Error ? error.stack : undefined}`,
              );

              tracker.finish("error", errorMessage);
              throw error;
            }
          },
        }),
      ],
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <api.Provider client={trpcClient} queryClient={queryClient}>
        {props.children}
      </api.Provider>
    </QueryClientProvider>
  );
}

function getBaseUrl() {
  if (typeof window !== "undefined") return window.location.origin;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}
