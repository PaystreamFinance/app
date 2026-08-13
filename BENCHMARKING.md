# Performance Benchmarking Guide

This document explains how to use the comprehensive benchmarking system we've set up to analyze and optimize your application's performance.

## Overview

The benchmarking system tracks:
- **Server-side tRPC procedure execution** - All API endpoint performance
- **Frontend request timing** - Client-side request latency
- **External API calls** - Third-party API performance (via axios)
- **RPC calls** - Blockchain/Solana RPC call performance
- **Request patterns** - Batching, caching, error rates

## Quick Start

### 1. View Performance Dashboard

Navigate to `/performance` in your application to see real-time performance metrics.

### 2. Run Benchmark Script

```bash
# Run a 60-second benchmark
pnpm tsx scripts/benchmark.ts

# Run a 5-minute benchmark
pnpm tsx scripts/benchmark.ts --duration 300

# Save report to custom file
pnpm tsx scripts/benchmark.ts --output my-report.txt
```

### 3. Access Performance API

The performance metrics are exposed via tRPC:

```typescript
// Get current stats
const stats = await api.performance.getStats.query({ timeWindowMs: 5 * 60 * 1000 });

// Get comprehensive analysis
const analysis = await api.performance.getAnalysis.query({ timeWindowMs: 5 * 60 * 1000 });

// Get text report
const report = await api.performance.getReport.query({ timeWindowMs: 5 * 60 * 1000 });
```

## Architecture

### Core Components

1. **Metrics Collector** (`src/lib/performance/metrics.ts`)
   - Centralized metric storage
   - Tracks all performance data
   - Provides statistics and filtering

2. **RPC Tracker** (`src/lib/performance/rpc-tracker.ts`)
   - Tracks blockchain RPC calls
   - Identifies slow RPC methods
   - Monitors RPC error rates

3. **External API Tracker** (`src/lib/performance/external-api-tracker.ts`)
   - Tracks HTTP API calls (axios)
   - Groups by domain/URL
   - Identifies slow external dependencies

4. **Performance Analyzer** (`src/lib/performance/analyzer.ts`)
   - Analyzes collected metrics
   - Identifies bottlenecks
   - Generates recommendations

### Integration Points

1. **Server Middleware** (`src/server/api/trpc.ts`)
   - Automatically tracks all tRPC procedures
   - Logs slow requests (>1s)
   - Records errors and metadata

2. **Frontend Client** (`src/trpc/react.tsx`)
   - Tracks frontend request timing
   - Monitors batch sizes
   - Records HTTP errors

3. **Axios Wrapper** (`src/lib/performance/axios-wrapper.ts`)
   - Automatically tracks external API calls
   - Use `trackedAxios` instead of regular `axios`

## Usage Examples

### Tracking External API Calls

Replace direct axios usage with the tracked version:

```typescript
// Before
import axios from 'axios';
const response = await axios.get('https://api.example.com/data');

// After
import { trackedAxios } from '@/lib/performance/axios-wrapper';
const response = await trackedAxios.get('https://api.example.com/data');
```

### Tracking RPC Calls

Wrap Solana RPC calls:

```typescript
import { trackRPCCall } from '@/lib/performance/rpc-tracker';

const result = await trackRPCCall(
  'getAccountInfo',
  () => connection.getAccountInfo(accountPubkey),
  rpcUrl
);
```

### Manual Performance Tracking

For custom operations:

```typescript
import { createPerformanceTracker } from '@/lib/performance/metrics';

const tracker = createPerformanceTracker('custom_operation', 'my-operation', {
  customMetadata: 'value',
});

try {
  // Your operation
  await doSomething();
  tracker.finish('success');
} catch (error) {
  tracker.finish('error', error.message);
}
```

## Performance Dashboard

The dashboard at `/performance` shows:

- **Summary Cards**: Total requests, average latency, error rate, RPC calls
- **Slowest Endpoints**: Top endpoints by latency
- **Bottlenecks**: Identified performance issues with recommendations
- **RPC Analysis**: Slowest RPC methods and error rates
- **External API Analysis**: Slowest domains and URLs

## Metrics Collected

### Request Metrics
- Duration (start to finish)
- Status (success/error/timeout)
- Input/output sizes
- Cache hits
- Batch sizes
- Error messages

### RPC Metrics
- Method name
- Duration
- Success/failure
- RPC URL
- Parameters (truncated)

### External API Metrics
- URL and method
- Duration
- Status code
- Response size
- Error messages

## Analysis Features

### Automatic Bottleneck Detection

The analyzer automatically identifies:
- Endpoints taking >1s average
- RPC methods taking >500ms average
- External APIs taking >1s average
- High error rates (>5%)
- Low cache hit rates (<30%)

### Recommendations

The system provides actionable recommendations:
- Caching strategies
- Query optimization suggestions
- RPC batching recommendations
- Alternative provider suggestions

## Best Practices

1. **Regular Monitoring**: Check the dashboard regularly during development
2. **Benchmark Before/After**: Run benchmarks before and after optimizations
3. **Track External APIs**: Use `trackedAxios` for all external calls
4. **Monitor RPC Calls**: Wrap blockchain RPC calls with tracking
5. **Review Reports**: Use the generated reports to prioritize optimizations

## Troubleshooting

### Metrics Not Appearing

- Ensure `ENABLE_PERFORMANCE_METRICS` is not set to `false`
- Check that middleware is properly integrated
- Verify metrics collector is imported

### High Memory Usage

- Metrics are automatically capped (10k requests, 5k RPC calls, 5k API calls)
- Clear metrics periodically: `api.performance.clearMetrics.mutate()`

### Slow Dashboard

- Reduce time window for analysis
- Clear old metrics periodically
- Consider pagination for large datasets

## API Reference

### Performance Router Endpoints

- `performance.getStats` - Get statistics
- `performance.getMetrics` - Get raw metrics
- `performance.getRPCStats` - Get RPC statistics
- `performance.getExternalAPIStats` - Get external API statistics
- `performance.getAnalysis` - Get comprehensive analysis
- `performance.getReport` - Get text report
- `performance.clearMetrics` - Clear all metrics

## Next Steps

1. **Identify Slow Endpoints**: Use the dashboard to find bottlenecks
2. **Optimize Queries**: Review slow database queries
3. **Implement Caching**: Add caching for slow endpoints
4. **Batch RPC Calls**: Group RPC calls where possible
5. **Monitor External APIs**: Consider caching or alternatives for slow APIs
6. **Set Up Alerts**: Configure alerts for high latency or error rates

## Example Optimization Workflow

1. Run benchmark: `pnpm tsx scripts/benchmark.ts --duration 300`
2. Review report for bottlenecks
3. Check dashboard for real-time metrics
4. Implement optimizations (caching, query optimization, etc.)
5. Re-run benchmark to verify improvements
6. Compare before/after reports

## Performance Optimizations Implemented

### Caching Strategy

**Position Endpoints** (cpmm, amm, dlmm, damm, clmm):
- **Cache TTL**: 30 seconds (fresh), 5 minutes (stale but acceptable)
- **Cache Key**: `${type}-${privyIdToken}-${poolAddress || 'all'}-${includeUnderlying}`
- **Expected Impact**: Reduce latency from 5-16s to <100ms for cached requests
- **Cache Location**: `src/lib/performance/positions-cache.ts`

**Drift Balance**:
- **Cache TTL**: 30 seconds
- **Expected Impact**: Reduce latency from 7s to <100ms for cached requests
- **Cache Location**: `src/lib/performance/drift-cache.ts`

**Pool Info** (getDLMMPoolInfo, getDammv2PoolInfo):
- **Cache TTL**: 1 minute (pool info changes less frequently)
- **Expected Impact**: Reduce latency from 4.4s to <100ms for cached requests
- **Cache Location**: `src/lib/performance/pool-info-cache.ts`

**Copy Trading** (getCopiedPositions):
- **Cache TTL**: 30 seconds
- **Expected Impact**: Reduce latency from 5s to <100ms for cached requests
- **Cache Location**: `src/lib/performance/copy-trading-cache.ts`

### Activities Endpoint Optimization

**Fixed Pagination Issue**:
- **Before**: Fetched ALL pages by default (could be 10+ sequential API calls)
- **After**: Fetches only first page by default, requires `fetchAll: true` to fetch all pages
- **Expected Impact**: Reduce latency from 6.7s to <1s for typical use cases
- **Input Schema**: Added `fetchAll?: boolean` parameter

### External API Tracking

**All axios calls replaced with trackedAxios**:
- Automatically tracks all external API calls
- Identifies slow external dependencies
- Monitors response sizes and status codes
- **Files Updated**: All router files now use `trackedAxios` instead of `axios`

### Expected Performance Improvements

After optimizations:
- **Cache Hit Rate**: 0% → 60-80% (for position endpoints)
- **Average Latency**: 1332ms → 200-400ms
- **Slowest Endpoint**: 16s → <1s (cached) or 2-3s (uncached)
- **Activities Endpoint**: 6.7s → <500ms (first page only)

### Cache Invalidation

Caches are automatically invalidated after TTL expires. For manual invalidation:
- Position caches: Use `invalidatePositionsCache()` from `positions-cache.ts`
- Other caches: Clear via `api.performance.clearMetrics.mutate()` or restart server

### Monitoring

Use the performance dashboard (`/performance`) to monitor:
- Cache hit rates (should increase significantly)
- External API latency breakdown
- Before/after comparisons
- Identify any remaining bottlenecks

## Latest Performance Optimizations (January 2026)

### Request Deduplication

**Problem**: Multiple parallel requests to the same endpoint were bypassing cache, causing duplicate API calls and 0% cache hit rate.

**Solution**: Implemented request deduplication layer that prevents duplicate in-flight requests.

**Implementation**:
- **Location**: `src/lib/performance/request-deduplication.ts`
- **How it works**: Tracks pending requests by key, returns existing promise if request is already in-flight
- **Auto-cleanup**: Automatically removes completed requests after 60 seconds
- **Applied to**: All position endpoints (dlmm, cpmm, amm, clmm, damm), activities, drift, copy-trading

**Expected Impact**:
- Reduce duplicate requests from ~30% to ~0%
- Increase cache hit rate from 0% to 60-80%
- Reduce average latency by 60-80% for cached requests

### Activities Endpoint Caching

**Problem**: Activities endpoints (`getActivities`, `getPositionActivities`) were fetching data on every request, causing 3-6 second delays.

**Solution**: Implemented caching layer with 15-second TTL (shorter than positions due to more frequent updates).

**Implementation**:
- **Cache Location**: `src/lib/performance/activities-cache.ts`
- **Cache TTL**: 15 seconds (activities change more frequently than positions)
- **Cache Keys**: Separate keys for different pagination parameters and position NFTs
- **Applied to**: `activities.getActivities` and `activities.getPositionActivities`

**Expected Impact**:
- Reduce latency from 3-6s to 300-800ms for cached requests
- Reduce server load by 70-80% for activities endpoints

### Activities Endpoint Optimization

**Problem**: `getPositionActivities` was fetching all pages by default (10+ sequential API calls), causing 3-6 second delays.

**Solution**: Already had `fetchAll` flag for `getActivities`, now both endpoints use caching and deduplication.

**Implementation**:
- **Before**: Fetched ALL pages by default (could be 10+ sequential API calls)
- **After**: Uses cache first, then deduplicates requests, significantly reducing latency
- **Input Schema**: Both endpoints now benefit from caching and deduplication

**Expected Impact**:
- Reduce latency from 3-6s to 300-800ms for typical use cases
- Reduce external API calls by 80-90%

### Performance Improvements Summary

After all optimizations:

| Endpoint | Before (avg) | After (expected) | Improvement |
|----------|--------------|------------------|-------------|
| `dlmm.getPositions` | 9706ms | 200-500ms | 95% faster |
| `drift.getBalance` | 7672ms | 100-200ms | 97% faster |
| `copyTrading.getCopiedPositions` | 6814ms | 200-400ms | 94% faster |
| `cpmm.getPositions` | 3792ms | 150-300ms | 92% faster |
| `activities.getPositionActivities` | 3242ms | 300-800ms | 75% faster |
| `activities.getActivities` | 3165ms | 300-600ms | 81% faster |
| `amm.getPositions` | 3022ms | 150-300ms | 90% faster |

**Overall Metrics**:
- **Cache Hit Rate**: 0% → 60-80% (expected)
- **Average Latency**: 743ms → 150-300ms (60-80% faster)
- **Duplicate Requests**: ~30% → ~0%
- **External API Calls**: Reduced by 70-80%

### Verification

To verify improvements:

1. **Monitor Performance Dashboard** (`/performance`):
   - Check cache hit rates increasing
   - Monitor average latency decreasing
   - Verify duplicate requests eliminated

2. **Run Benchmarks**:
   ```bash
   pnpm tsx scripts/benchmark.ts --duration 300
   ```

3. **Check Request Deduplication Stats**:
   - Available via performance API
   - Shows pending request counts
   - Identifies deduplication effectiveness

### Technical Details

**Request Deduplication**:
- Uses in-memory Map to track pending requests
- Generates unique keys based on endpoint + parameters
- Returns existing promise for duplicate requests
- Auto-cleanup every 30 seconds
- Max pending age: 60 seconds

**Activities Caching**:
- Shorter TTL (15s) than positions (30s) due to higher update frequency
- Separate cache keys for different query parameters
- Max cache size: 500 entries (auto-cleanup oldest)
- Invalidation: Automatic after TTL expiry

**Integration**:
- All caching layers work seamlessly together
- Request deduplication sits above caching layer
- Cache checked first, then deduplication, then actual request
- No breaking changes to existing APIs
