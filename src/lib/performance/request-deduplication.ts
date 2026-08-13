/**
 * Request Deduplication Utility
 * Prevents duplicate in-flight requests to the same endpoint
 * Works seamlessly with caching layer to improve cache hit rates
 */

type PendingRequest = {
  promise: Promise<any>;
  timestamp: number;
};

// Store pending requests by key
const pendingRequests = new Map<string, PendingRequest>();

// Cleanup interval: remove completed requests older than 30 seconds
const CLEANUP_INTERVAL = 30 * 1000;
const MAX_PENDING_AGE = 60 * 1000; // 60 seconds max age for pending requests

// Periodic cleanup
setInterval(() => {
  const now = Date.now();
  for (const [key, request] of pendingRequests.entries()) {
    if (now - request.timestamp > MAX_PENDING_AGE) {
      pendingRequests.delete(key);
    }
  }
}, CLEANUP_INTERVAL);

/**
 * Deduplicate requests by key
 * If a request with the same key is already in-flight, return the existing promise
 * Otherwise, execute the request and cache the promise
 */
export async function deduplicateRequest<T>(
  key: string,
  requestFn: () => Promise<T>,
): Promise<T> {
  // Check if request is already in-flight
  const existing = pendingRequests.get(key);
  if (existing) {
    // Return existing promise
    return existing.promise as Promise<T>;
  }

  // Execute new request
  const promise = requestFn()
    .then((result) => {
      // Remove from pending after completion
      pendingRequests.delete(key);
      return result;
    })
    .catch((error) => {
      // Remove from pending after error
      pendingRequests.delete(key);
      throw error;
    });

  // Store pending request
  pendingRequests.set(key, {
    promise,
    timestamp: Date.now(),
  });

  return promise;
}

/**
 * Generate a cache key for request deduplication
 */
export function generateRequestKey(
  endpoint: string,
  params: Record<string, any>,
): string {
  // Sort params for consistent key generation
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${key}=${JSON.stringify(params[key])}`)
    .join("&");

  return `${endpoint}?${sortedParams}`;
}

/**
 * Clear all pending requests (useful for testing)
 */
export function clearPendingRequests(): void {
  pendingRequests.clear();
}

/**
 * Get stats about pending requests
 */
export function getPendingRequestsStats() {
  return {
    count: pendingRequests.size,
    keys: Array.from(pendingRequests.keys()),
  };
}
