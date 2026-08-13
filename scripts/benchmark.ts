#!/usr/bin/env tsx
/**
 * Performance Benchmarking Script
 *
 * Runs performance benchmarks and generates reports
 *
 * Usage:
 *   pnpm tsx scripts/benchmark.ts [options]
 *
 * Options:
 *   --duration <seconds>  Duration to run benchmarks (default: 60)
 *   --endpoint <path>      Specific endpoint to benchmark
 *   --output <file>        Output file for report (default: benchmark-report.txt)
 */

import { createCaller } from "../src/server/api/root";
import { createTRPCContext } from "../src/server/api/trpc";
import {
  analyzePerformance,
  generateReport,
} from "../src/lib/performance/analyzer";
import { metricsCollector } from "../src/lib/performance/metrics";
import { rpcTracker } from "../src/lib/performance/rpc-tracker";
import { externalAPITracker } from "../src/lib/performance/external-api-tracker";
import { writeFileSync } from "fs";
import { join } from "path";

interface BenchmarkOptions {
  duration: number;
  endpoint?: string;
  output: string;
}

async function runBenchmark(options: BenchmarkOptions) {
  console.log("🚀 Starting Performance Benchmark...");
  console.log(`Duration: ${options.duration} seconds`);
  if (options.endpoint) {
    console.log(`Target Endpoint: ${options.endpoint}`);
  }
  console.log("");

  // Clear existing metrics
  metricsCollector.clear();
  rpcTracker.clear();
  externalAPITracker.clear();

  const startTime = Date.now();
  const endTime = startTime + options.duration * 1000;

  // Create tRPC caller for server-side calls
  const context = await createTRPCContext({ headers: new Headers() });
  // Cast to any so this script can be run even when some routers
  // (like discover/pools) are not present on the current AppRouter.
  const caller: any = createCaller(context as any);

  console.log("📊 Collecting metrics...");
  console.log("(This will simulate normal usage patterns)");
  console.log("");

  // Simulate some common requests
  const commonEndpoints = [
    () =>
      caller.discover.getTrendingPools({
        limit: 10,
        page: 1,
        timePeriod: "24h",
      }),
    () =>
      caller.discover.getCategoryBestPools({
        category: "bluechips",
        limit: 10,
        page: 1,
        timePeriod: "24h",
      }),
    () =>
      caller.pools
        .getDLMMPairs({ page: "1", per_page: "10" })
        .catch(() => null), // May fail, that's ok
  ];

  let iteration = 0;
  while (Date.now() < endTime) {
    iteration++;

    // Run a batch of requests
    const batch = commonEndpoints.map((fn) => fn().catch(() => null));
    await Promise.allSettled(batch);

    // Small delay to avoid overwhelming the server
    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (iteration % 10 === 0) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const remaining = options.duration - elapsed;
      console.log(`⏱️  ${elapsed}s elapsed, ${remaining}s remaining...`);
    }
  }

  console.log("");
  console.log("✅ Benchmark complete!");
  console.log("");

  // Generate analysis
  const timeWindow = Date.now() - startTime;
  const analysis = analyzePerformance(timeWindow);
  const report = generateReport(analysis);

  // Output report
  console.log(report);
  console.log("");

  // Save to file
  const outputPath = join(process.cwd(), options.output);
  writeFileSync(outputPath, report, "utf-8");
  console.log(`📄 Report saved to: ${outputPath}`);

  // Summary statistics
  console.log("");
  console.log("📈 Summary:");
  console.log(`  Total Requests: ${analysis.summary.totalRequests}`);
  console.log(
    `  Average Latency: ${Math.round(analysis.summary.averageLatency)}ms`,
  );
  console.log(
    `  Error Rate: ${(analysis.summary.errorRate * 100).toFixed(2)}%`,
  );
  console.log(`  RPC Calls: ${analysis.summary.totalRPCRequests}`);
  console.log(
    `  External API Calls: ${analysis.summary.totalExternalAPIRequests}`,
  );
  console.log(`  Bottlenecks Found: ${analysis.bottlenecks.length}`);
}

// Parse command line arguments
const args = process.argv.slice(2);
const options: BenchmarkOptions = {
  duration: 60,
  output: "benchmark-report.txt",
};

for (let i = 0; i < args.length; i++) {
  const nextArg = args[i + 1];
  if (args[i] === "--duration" && nextArg !== undefined) {
    options.duration = parseInt(nextArg, 10);
    i++;
  } else if (args[i] === "--endpoint" && nextArg !== undefined) {
    options.endpoint = nextArg;
    i++;
  } else if (args[i] === "--output" && nextArg !== undefined) {
    options.output = nextArg;
    i++;
  }
}

runBenchmark(options).catch((error) => {
  console.error("❌ Benchmark failed:", error);
  process.exit(1);
});
