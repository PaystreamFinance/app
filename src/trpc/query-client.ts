import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from "@tanstack/react-query";
import SuperJSON from "superjson";

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // Fresh for 5s — trading data should never be stale
        staleTime: 5000,
        // Keep in cache for 5 min for back-navigation
        gcTime: 5 * 60 * 1000,
        // Always refetch on mount for fresh data on navigation
        refetchOnMount: true,
        // Refetch when user returns to tab
        refetchOnWindowFocus: true,
        // Refetch on reconnect after network drop
        refetchOnReconnect: true,
        // Fast retry — 1 retry with short delay
        retry: 1,
        retryDelay: 500,
        // Structural sharing for performance
        structuralSharing: true,
        // Show previous data while refetching
        placeholderData: (previousData: unknown) => previousData,
      },
      dehydrate: {
        serializeData: SuperJSON.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
      hydrate: {
        deserializeData: SuperJSON.deserialize,
      },
    },
  });
