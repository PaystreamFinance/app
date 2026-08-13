/**
 * Performance Analyzer
 *
 * Analyzes collected metrics and generates insights and recommendations
 */

import {
  metricsCollector,
  type PerformanceMetric,
  type PerformanceStats,
} from "./metrics";
import { rpcTracker } from "./rpc-tracker";
import { externalAPITracker } from "./external-api-tracker";

export interface PerformanceAnalysis {
  summary: {
    totalRequests: number;
    averageLatency: number;
    slowestEndpoints: Array<{
      path: string;
      avgDuration: number;
      count: number;
    }>;
    errorRate: number;
    totalRPCRequests: number;
    totalExternalAPIRequests: number;
  };
  bottlenecks: Array<{
    type: "endpoint" | "rpc" | "external_api";
    name: string;
    averageDuration: number;
    count: number;
    recommendation: string;
  }>;
  recommendations: string[];
  requestBreakdown: {
    byType: Record<string, { count: number; avgDuration: number }>;
    byPath: Array<{
      path: string;
      count: number;
      avgDuration: number;
      p95: number;
      errors: number;
    }>;
  };
  rpcAnalysis: {
    slowestMethods: Array<{
      method: string;
      avgDuration: number;
      count: number;
    }>;
    errorRate: number;
    totalCalls: number;
  };
  externalAPIAnalysis: {
    slowestDomains: Array<{
      domain: string;
      avgDuration: number;
      count: number;
      errors: number;
    }>;
    slowestUrls: Array<{ url: string; avgDuration: number; count: number }>;
    errorRate: number;
    totalCalls: number;
  };
}

export function analyzePerformance(timeWindowMs?: number): PerformanceAnalysis {
  const stats = metricsCollector.getStats(timeWindowMs);
  const rpcStats = rpcTracker.getStats();
  const apiStats = externalAPITracker.getStats();

  // Get slowest endpoints
  const slowestEndpoints = Array.from(stats.requestsByPath.entries())
    .map(([path, data]) => ({
      path,
      avgDuration: data.averageDuration,
      count: data.count,
    }))
    .sort((a, b) => b.avgDuration - a.avgDuration)
    .slice(0, 10);

  // Identify bottlenecks
  const bottlenecks: PerformanceAnalysis["bottlenecks"] = [];

  // Slow endpoints
  for (const endpoint of slowestEndpoints.slice(0, 5)) {
    if (endpoint.avgDuration > 1000) {
      bottlenecks.push({
        type: "endpoint",
        name: endpoint.path,
        averageDuration: endpoint.avgDuration,
        count: endpoint.count,
        recommendation: `Consider caching, optimizing database queries, or parallelizing operations for ${endpoint.path}`,
      });
    }
  }

  // Slow RPC calls
  const slowestRPCMethods = Array.from(rpcStats.callsByMethod.entries())
    .map(([method, data]) => ({
      method,
      avgDuration: data.averageDuration,
      count: data.count,
    }))
    .sort((a, b) => b.avgDuration - a.avgDuration)
    .slice(0, 5);

  for (const rpc of slowestRPCMethods) {
    if (rpc.avgDuration > 500) {
      bottlenecks.push({
        type: "rpc",
        name: rpc.method,
        averageDuration: rpc.avgDuration,
        count: rpc.count,
        recommendation: `Consider batching ${rpc.method} calls or using a faster RPC provider`,
      });
    }
  }

  // Slow external APIs
  const slowestAPIDomains = Array.from(apiStats.callsByDomain.entries())
    .map(([domain, data]) => ({
      domain,
      avgDuration: data.averageDuration,
      count: data.count,
      errors: data.errors,
    }))
    .sort((a, b) => b.avgDuration - a.avgDuration)
    .slice(0, 5);

  for (const api of slowestAPIDomains) {
    if (api.avgDuration > 1000) {
      bottlenecks.push({
        type: "external_api",
        name: api.domain,
        averageDuration: api.avgDuration,
        count: api.count,
        recommendation: `Consider caching responses from ${api.domain} or finding an alternative provider`,
      });
    }
  }

  // Generate recommendations
  const recommendations: string[] = [];

  if (stats.averageDuration > 500) {
    recommendations.push(
      `Average request latency is ${Math.round(stats.averageDuration)}ms. Consider optimizing slow endpoints.`,
    );
  }

  if (stats.errorRate > 0.05) {
    recommendations.push(
      `Error rate is ${(stats.errorRate * 100).toFixed(1)}%. Investigate and fix failing requests.`,
    );
  }

  if (stats.cacheHitRate !== undefined && stats.cacheHitRate < 0.3) {
    recommendations.push(
      `Cache hit rate is ${(stats.cacheHitRate * 100).toFixed(1)}%. Consider implementing more aggressive caching.`,
    );
  }

  if (rpcStats.totalCalls > 100 && rpcStats.averageDuration > 300) {
    recommendations.push(
      `High RPC call volume (${rpcStats.totalCalls} calls) with average latency ${Math.round(rpcStats.averageDuration)}ms. Consider batching or using connection pooling.`,
    );
  }

  if (apiStats.totalCalls > 50 && apiStats.averageDuration > 500) {
    recommendations.push(
      `External API calls are slow (avg ${Math.round(apiStats.averageDuration)}ms). Consider caching or finding faster alternatives.`,
    );
  }

  // Request breakdown by type
  const metrics = metricsCollector.getMetrics(
    timeWindowMs ? { startTime: Date.now() - (timeWindowMs ?? 0) } : undefined,
  );
  const byType: Record<
    string,
    { count: number; totalDuration: number; avgDuration: number }
  > = {};

  for (const metric of metrics) {
    const existing = byType[metric.type] ?? {
      count: 0,
      totalDuration: 0,
      avgDuration: 0,
    };
    existing.count++;
    existing.totalDuration += metric.duration;
    existing.avgDuration = existing.totalDuration / existing.count;
    byType[metric.type] = existing;
  }

  // Request breakdown by path with percentiles
  const byPath = Array.from(stats.requestsByPath.entries())
    .map(([path, data]) => {
      const pathMetrics = metrics.filter((m) => m.path === path);
      const durations = pathMetrics
        .map((m) => m.duration)
        .sort((a, b) => a - b);
      const p95 = durations[Math.floor(durations.length * 0.95)] ?? 0;

      return {
        path,
        count: data.count,
        avgDuration: data.averageDuration,
        p95,
        errors: data.errors,
      };
    })
    .sort((a, b) => b.avgDuration - a.avgDuration);

  return {
    summary: {
      totalRequests: stats.totalRequests,
      averageLatency: stats.averageDuration,
      slowestEndpoints: slowestEndpoints.slice(0, 10),
      errorRate: stats.errorRate,
      totalRPCRequests: rpcStats.totalCalls,
      totalExternalAPIRequests: apiStats.totalCalls,
    },
    bottlenecks,
    recommendations,
    requestBreakdown: {
      byType: Object.fromEntries(
        Object.entries(byType).map(([type, data]) => [
          type,
          { count: data.count, avgDuration: data.avgDuration },
        ]),
      ),
      byPath: byPath.slice(0, 20),
    },
    rpcAnalysis: {
      slowestMethods: slowestRPCMethods,
      errorRate: rpcStats.errorRate,
      totalCalls: rpcStats.totalCalls,
    },
    externalAPIAnalysis: {
      slowestDomains: slowestAPIDomains,
      slowestUrls: Array.from(apiStats.callsByUrl.entries())
        .map(([url, data]) => ({
          url: url.substring(0, 100), // Truncate long URLs
          avgDuration: data.averageDuration,
          count: data.count,
        }))
        .sort((a, b) => b.avgDuration - a.avgDuration)
        .slice(0, 10),
      errorRate: apiStats.errorRate,
      totalCalls: apiStats.totalCalls,
    },
  };
}

export function generateReport(analysis: PerformanceAnalysis): string {
  const lines: string[] = [];

  lines.push("=".repeat(80));
  lines.push("PERFORMANCE ANALYSIS REPORT");
  lines.push("=".repeat(80));
  lines.push("");

  // Summary
  lines.push("SUMMARY");
  lines.push("-".repeat(80));
  lines.push(`Total Requests: ${analysis.summary.totalRequests}`);
  lines.push(
    `Average Latency: ${Math.round(analysis.summary.averageLatency)}ms`,
  );
  lines.push(`Error Rate: ${(analysis.summary.errorRate * 100).toFixed(2)}%`);
  lines.push(`Total RPC Requests: ${analysis.summary.totalRPCRequests}`);
  lines.push(
    `Total External API Requests: ${analysis.summary.totalExternalAPIRequests}`,
  );
  lines.push("");

  // Slowest Endpoints
  if (analysis.summary.slowestEndpoints.length > 0) {
    lines.push("SLOWEST ENDPOINTS");
    lines.push("-".repeat(80));
    for (const endpoint of analysis.summary.slowestEndpoints) {
      lines.push(
        `  ${endpoint.path}: ${Math.round(endpoint.avgDuration)}ms (${endpoint.count} requests)`,
      );
    }
    lines.push("");
  }

  // Bottlenecks
  if (analysis.bottlenecks.length > 0) {
    lines.push("BOTTLENECKS");
    lines.push("-".repeat(80));
    for (const bottleneck of analysis.bottlenecks) {
      lines.push(`  [${bottleneck.type.toUpperCase()}] ${bottleneck.name}`);
      lines.push(
        `    Average Duration: ${Math.round(bottleneck.averageDuration)}ms`,
      );
      lines.push(`    Request Count: ${bottleneck.count}`);
      lines.push(`    Recommendation: ${bottleneck.recommendation}`);
      lines.push("");
    }
  }

  // Recommendations
  if (analysis.recommendations.length > 0) {
    lines.push("RECOMMENDATIONS");
    lines.push("-".repeat(80));
    for (const rec of analysis.recommendations) {
      lines.push(`  • ${rec}`);
    }
    lines.push("");
  }

  // RPC Analysis
  if (analysis.rpcAnalysis.totalCalls > 0) {
    lines.push("RPC CALL ANALYSIS");
    lines.push("-".repeat(80));
    lines.push(`Total RPC Calls: ${analysis.rpcAnalysis.totalCalls}`);
    lines.push(
      `Error Rate: ${(analysis.rpcAnalysis.errorRate * 100).toFixed(2)}%`,
    );
    if (analysis.rpcAnalysis.slowestMethods.length > 0) {
      lines.push("Slowest Methods:");
      for (const method of analysis.rpcAnalysis.slowestMethods) {
        lines.push(
          `  ${method.method}: ${Math.round(method.avgDuration)}ms (${method.count} calls)`,
        );
      }
    }
    lines.push("");
  }

  // External API Analysis
  if (analysis.externalAPIAnalysis.totalCalls > 0) {
    lines.push("EXTERNAL API ANALYSIS");
    lines.push("-".repeat(80));
    lines.push(`Total API Calls: ${analysis.externalAPIAnalysis.totalCalls}`);
    lines.push(
      `Error Rate: ${(analysis.externalAPIAnalysis.errorRate * 100).toFixed(2)}%`,
    );
    if (analysis.externalAPIAnalysis.slowestDomains.length > 0) {
      lines.push("Slowest Domains:");
      for (const domain of analysis.externalAPIAnalysis.slowestDomains) {
        lines.push(
          `  ${domain.domain}: ${Math.round(domain.avgDuration)}ms (${domain.count} calls, ${domain.errors} errors)`,
        );
      }
    }
    lines.push("");
  }

  lines.push("=".repeat(80));

  return lines.join("\n");
}
