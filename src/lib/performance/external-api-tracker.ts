/**
 * External API Call Tracker
 *
 * Tracks external HTTP API calls (axios, fetch) to identify slow external dependencies
 */

import { metricsCollector, createPerformanceTracker } from "./metrics";

interface ExternalAPICall {
  url: string;
  method: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  statusCode?: number;
  success: boolean;
  error?: string;
  responseSize?: number;
}

class ExternalAPITracker {
  private apiCalls: ExternalAPICall[] = [];
  private readonly maxCalls = 5000;

  startCall(url: string, method: string = "GET"): string {
    const callId = `${method}_${url}_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const tracker = createPerformanceTracker("external_api", url, {
      method,
    });

    const call: ExternalAPICall = {
      url,
      method,
      startTime:
        typeof performance !== "undefined" ? performance.now() : Date.now(),
      success: false,
    };

    // Store tracker
    (
      call as unknown as {
        tracker: ReturnType<typeof createPerformanceTracker>;
      }
    ).tracker = tracker;

    this.apiCalls.push(call);

    if (this.apiCalls.length > this.maxCalls) {
      this.apiCalls = this.apiCalls.slice(-this.maxCalls);
    }

    return callId;
  }

  finishCall(
    callId: string,
    success: boolean,
    statusCode?: number,
    error?: string,
    responseSize?: number,
  ): void {
    const call = this.apiCalls[this.apiCalls.length - 1]; // Get last call
    if (!call) return;

    call.endTime =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    call.duration = call.endTime - call.startTime;
    call.success = success;
    call.statusCode = statusCode;
    call.error = error;
    call.responseSize = responseSize;

    const tracker = (
      call as unknown as {
        tracker?: ReturnType<typeof createPerformanceTracker>;
      }
    ).tracker;
    if (tracker) {
      tracker.finish(success ? "success" : "error", error, {
        statusCode,
        responseSize,
        duration: call.duration,
      });
    }
  }

  getStats() {
    const completed = this.apiCalls.filter((c) => c.endTime !== undefined);

    if (completed.length === 0) {
      return {
        totalCalls: 0,
        averageDuration: 0,
        slowestCalls: [] as Array<{
          url: string;
          method: string;
          duration: number;
        }>,
        errorRate: 0,
        callsByDomain: new Map<
          string,
          {
            count: number;
            totalDuration: number;
            averageDuration: number;
            errors: number;
          }
        >(),
        callsByUrl: new Map<
          string,
          {
            count: number;
            totalDuration: number;
            averageDuration: number;
            errors: number;
          }
        >(),
      };
    }

    const durations = completed.map((c) => c.duration!).sort((a, b) => b - a);
    const errors = completed.filter((c) => !c.success).length;

    const callsByDomain = new Map<
      string,
      {
        count: number;
        totalDuration: number;
        averageDuration: number;
        errors: number;
      }
    >();
    const callsByUrl = new Map<
      string,
      {
        count: number;
        totalDuration: number;
        averageDuration: number;
        errors: number;
      }
    >();

    for (const call of completed) {
      try {
        const urlObj = new URL(call.url);
        const domain = urlObj.hostname;

        const domainStats = callsByDomain.get(domain) ?? {
          count: 0,
          totalDuration: 0,
          averageDuration: 0,
          errors: 0,
        };

        domainStats.count++;
        domainStats.totalDuration += call.duration!;
        domainStats.averageDuration =
          domainStats.totalDuration / domainStats.count;
        if (!call.success) domainStats.errors++;

        callsByDomain.set(domain, domainStats);
      } catch {
        // Invalid URL, skip domain grouping
      }

      const urlStats = callsByUrl.get(call.url) ?? {
        count: 0,
        totalDuration: 0,
        averageDuration: 0,
        errors: 0,
      };

      urlStats.count++;
      urlStats.totalDuration += call.duration!;
      urlStats.averageDuration = urlStats.totalDuration / urlStats.count;
      if (!call.success) urlStats.errors++;

      callsByUrl.set(call.url, urlStats);
    }

    return {
      totalCalls: completed.length,
      averageDuration:
        durations.reduce((sum, d) => sum + d, 0) / durations.length,
      slowestCalls: durations.slice(0, 10).map((d) => {
        const call = completed.find((c) => c.duration === d);
        return {
          url: call?.url ?? "unknown",
          method: call?.method ?? "unknown",
          duration: d,
        };
      }),
      errorRate: errors / completed.length,
      callsByDomain,
      callsByUrl,
    };
  }

  clear(): void {
    this.apiCalls = [];
  }
}

export const externalAPITracker = new ExternalAPITracker();

// Helper to wrap axios calls
export async function trackAxiosCall<T>(
  url: string,
  method: string,
  axiosCall: () => Promise<{
    data: T;
    status: number;
    headers: Record<string, string>;
  }>,
): Promise<{ data: T; status: number; headers: Record<string, string> }> {
  const callId = externalAPITracker.startCall(url, method);

  try {
    const result = await axiosCall();
    const responseSize = JSON.stringify(result.data).length;
    externalAPITracker.finishCall(
      callId,
      true,
      result.status,
      undefined,
      responseSize,
    );
    return result;
  } catch (error: unknown) {
    const statusCode = (error as { response?: { status?: number } })?.response
      ?.status;
    const errorMessage = error instanceof Error ? error.message : String(error);
    externalAPITracker.finishCall(callId, false, statusCode, errorMessage);
    throw error;
  }
}
