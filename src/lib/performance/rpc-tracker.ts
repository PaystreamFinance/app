/**
 * RPC Call Tracker
 *
 * Tracks external RPC calls (Solana, blockchain, etc.) to identify bottlenecks
 */

import { metricsCollector, createPerformanceTracker } from "./metrics";

interface RPCCall {
  method: string;
  params?: unknown[];
  startTime: number;
  endTime?: number;
  duration?: number;
  success: boolean;
  error?: string;
  rpcUrl?: string;
}

class RPCTracker {
  private rpcCalls: RPCCall[] = [];
  private readonly maxCalls = 5000;
  private activeCallCount = 0;

  startCall(method: string, params?: unknown[], rpcUrl?: string): string {
    const callId = `${method}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const tracker = createPerformanceTracker("rpc_call", method, {
      rpcUrl,
      params: params ? JSON.stringify(params).substring(0, 200) : undefined,
    });

    this.activeCallCount++;

    const call: RPCCall = {
      method,
      params,
      startTime:
        typeof performance !== "undefined" ? performance.now() : Date.now(),
      success: false,
      rpcUrl,
    };

    // Store tracker in call for later use
    (
      call as unknown as {
        tracker: ReturnType<typeof createPerformanceTracker>;
      }
    ).tracker = tracker;

    this.rpcCalls.push(call);

    if (this.rpcCalls.length > this.maxCalls) {
      this.rpcCalls = this.rpcCalls.slice(-this.maxCalls);
    }

    return callId;
  }

  finishCall(callId: string, success: boolean, error?: string): void {
    const call = this.rpcCalls[this.rpcCalls.length - 1]; // Get last call (simplified)
    if (!call) return;

    call.endTime =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    call.duration = call.endTime - call.startTime;
    call.success = success;
    call.error = error;

    const tracker = (
      call as unknown as {
        tracker?: ReturnType<typeof createPerformanceTracker>;
      }
    ).tracker;
    if (tracker) {
      tracker.finish(success ? "success" : "error", error, {
        duration: call.duration,
      });
    }

    this.activeCallCount = Math.max(0, this.activeCallCount - 1);
  }

  getStats() {
    const completed = this.rpcCalls.filter((c) => c.endTime !== undefined);

    if (completed.length === 0) {
      return {
        totalCalls: 0,
        activeCalls: this.activeCallCount,
        averageDuration: 0,
        slowestCalls: [] as Array<{ method: string; duration: number }>,
        errorRate: 0,
        callsByMethod: new Map<
          string,
          { count: number; totalDuration: number; averageDuration: number }
        >(),
      };
    }

    const durations = completed.map((c) => c.duration!).sort((a, b) => b - a);
    const errors = completed.filter((c) => !c.success).length;

    const callsByMethod = new Map<
      string,
      { count: number; totalDuration: number; averageDuration: number }
    >();

    for (const call of completed) {
      const existing = callsByMethod.get(call.method) ?? {
        count: 0,
        totalDuration: 0,
        averageDuration: 0,
      };

      existing.count++;
      existing.totalDuration += call.duration!;
      existing.averageDuration = existing.totalDuration / existing.count;

      callsByMethod.set(call.method, existing);
    }

    return {
      totalCalls: completed.length,
      activeCalls: this.activeCallCount,
      averageDuration:
        durations.reduce((sum, d) => sum + d, 0) / durations.length,
      slowestCalls: durations.slice(0, 10).map((d) => {
        const call = completed.find((c) => c.duration === d);
        return {
          method: call?.method ?? "unknown",
          duration: d,
        };
      }),
      errorRate: errors / completed.length,
      callsByMethod,
    };
  }

  clear(): void {
    this.rpcCalls = [];
    this.activeCallCount = 0;
  }
}

export const rpcTracker = new RPCTracker();

// Helper to wrap RPC calls
export async function trackRPCCall<T>(
  method: string,
  rpcCall: () => Promise<T>,
  rpcUrl?: string,
): Promise<T> {
  const callId = rpcTracker.startCall(method, undefined, rpcUrl);

  try {
    const result = await rpcCall();
    rpcTracker.finishCall(callId, true);
    return result;
  } catch (error) {
    rpcTracker.finishCall(
      callId,
      false,
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
}
