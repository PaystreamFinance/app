/**
 * Performance Metrics Collection
 *
 * This module provides comprehensive performance tracking for:
 * - Server-side tRPC procedure execution
 * - Frontend request timing
 * - External API call tracking
 * - RPC call tracking
 */

export interface PerformanceMetric {
  id: string;
  type:
    | "trpc_query"
    | "trpc_mutation"
    | "external_api"
    | "rpc_call"
    | "frontend_request";
  path: string;
  method?: string;
  startTime: number;
  endTime: number;
  duration: number;
  status: "success" | "error" | "timeout";
  error?: string;
  metadata?: {
    input?: unknown;
    outputSize?: number;
    cacheHit?: boolean;
    batchSize?: number;
    externalCalls?: number;
    rpcCalls?: number;
    [key: string]: unknown;
  };
}

export interface PerformanceStats {
  totalRequests: number;
  totalDuration: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  p50: number;
  p95: number;
  p99: number;
  errorRate: number;
  cacheHitRate?: number;
  requestsByPath: Map<
    string,
    {
      count: number;
      totalDuration: number;
      averageDuration: number;
      errors: number;
    }
  >;
}

class PerformanceMetricsCollector {
  private metrics: PerformanceMetric[] = [];
  private readonly maxMetrics = 10000; // Keep last 10k metrics
  private readonly enableCollection: boolean;

  constructor() {
    // Enable in all environments, but can be controlled via env var
    this.enableCollection =
      process.env.NODE_ENV !== "test" &&
      process.env.ENABLE_PERFORMANCE_METRICS !== "false";
  }

  record(metric: Omit<PerformanceMetric, "id" | "duration">): void {
    if (!this.enableCollection) return;

    const duration = metric.endTime - metric.startTime;
    const id = `${metric.type}_${metric.path}_${metric.startTime}_${Math.random().toString(36).substring(7)}`;

    const fullMetric: PerformanceMetric = {
      ...metric,
      id,
      duration,
    };

    this.metrics.push(fullMetric);

    // Keep only the most recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
  }

  getMetrics(filters?: {
    type?: PerformanceMetric["type"];
    path?: string;
    startTime?: number;
    endTime?: number;
  }): PerformanceMetric[] {
    let filtered = this.metrics;

    if (filters?.type) {
      filtered = filtered.filter((m) => m.type === filters.type);
    }
    if (filters?.path) {
      filtered = filtered.filter((m) => m.path.includes(filters.path!));
    }
    if (filters?.startTime) {
      filtered = filtered.filter((m) => m.startTime >= filters.startTime!);
    }
    if (filters?.endTime) {
      filtered = filtered.filter((m) => m.endTime <= filters.endTime!);
    }

    return filtered;
  }

  getStats(timeWindowMs?: number): PerformanceStats {
    const now = Date.now();
    const windowStart = timeWindowMs ? now - timeWindowMs : 0;

    const relevantMetrics = this.metrics.filter(
      (m) => m.startTime >= windowStart,
    );

    if (relevantMetrics.length === 0) {
      return {
        totalRequests: 0,
        totalDuration: 0,
        averageDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        errorRate: 0,
        requestsByPath: new Map(),
      };
    }

    const durations = relevantMetrics
      .map((m) => m.duration)
      .sort((a, b) => a - b);
    const errors = relevantMetrics.filter((m) => m.status === "error").length;

    const totalDuration = durations.reduce((sum, d) => sum + d, 0);
    const averageDuration = totalDuration / durations.length;
    const minDuration = durations[0] ?? 0;
    const maxDuration = durations[durations.length - 1] ?? 0;

    const p50 = durations[Math.floor(durations.length * 0.5)] ?? 0;
    const p95 = durations[Math.floor(durations.length * 0.95)] ?? 0;
    const p99 = durations[Math.floor(durations.length * 0.99)] ?? 0;

    // Group by path
    const requestsByPath = new Map<
      string,
      {
        count: number;
        totalDuration: number;
        averageDuration: number;
        errors: number;
      }
    >();

    for (const metric of relevantMetrics) {
      const existing = requestsByPath.get(metric.path) ?? {
        count: 0,
        totalDuration: 0,
        averageDuration: 0,
        errors: 0,
      };

      existing.count++;
      existing.totalDuration += metric.duration;
      existing.averageDuration = existing.totalDuration / existing.count;
      if (metric.status === "error") {
        existing.errors++;
      }

      requestsByPath.set(metric.path, existing);
    }

    const cacheHits = relevantMetrics.filter(
      (m) => m.metadata?.cacheHit === true,
    ).length;
    const cacheHitRate =
      relevantMetrics.length > 0
        ? cacheHits / relevantMetrics.length
        : undefined;

    return {
      totalRequests: relevantMetrics.length,
      totalDuration,
      averageDuration,
      minDuration,
      maxDuration,
      p50,
      p95,
      p99,
      errorRate: errors / relevantMetrics.length,
      cacheHitRate,
      requestsByPath,
    };
  }

  clear(): void {
    this.metrics = [];
  }

  exportMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }
}

// Singleton instance
export const metricsCollector = new PerformanceMetricsCollector();

// Helper to create a performance tracker
export function createPerformanceTracker(
  type: PerformanceMetric["type"],
  path: string,
  metadata?: PerformanceMetric["metadata"],
) {
  const startTime =
    typeof performance !== "undefined" ? performance.now() : Date.now();

  return {
    finish: (
      status: "success" | "error" | "timeout" = "success",
      error?: string,
      additionalMetadata?: Partial<PerformanceMetric["metadata"]>,
    ) => {
      const endTime =
        typeof performance !== "undefined" ? performance.now() : Date.now();

      metricsCollector.record({
        type,
        path,
        startTime: Date.now() - (endTime - startTime),
        endTime: Date.now(),
        status,
        error,
        metadata: {
          ...metadata,
          ...additionalMetadata,
        },
      });
    },
    addMetadata: (key: string, value: unknown) => {
      if (metadata) {
        metadata[key] = value;
      }
    },
  };
}
