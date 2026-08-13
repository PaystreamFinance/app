"use client";

import { useEffect, useState } from "react";
import { api } from "@/trpc/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import MaxWidthWrapper from "@/components/max-width-wrapper";
import CommonAppLayout from "@/app/_components/common-app-layout";
import {
  RefreshCw,
  Trash2,
  TrendingUp,
  AlertTriangle,
  Zap,
  Globe,
  Lock,
  Copy,
} from "lucide-react";
import { toast } from "sonner";

export default function PerformancePage() {
  const [isAllowed, setIsAllowed] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [timeWindow, setTimeWindow] = useState<number | undefined>(
    5 * 60 * 1000,
  ); // 5 minutes default

  // Check if we're on staging or localhost
  useEffect(() => {
    const hostname = window.location.hostname;
    const allowed =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "staging.paystream.finance";
    setIsAllowed(allowed);
  }, []);

  const { data: analysis, refetch: refetchAnalysis } =
    api.performance.getAnalysis.useQuery(
      { timeWindowMs: timeWindow },
      { refetchInterval: autoRefresh ? 5000 : false },
    );

  const { data: rpcStats } = api.performance.getRPCStats.useQuery(undefined, {
    refetchInterval: autoRefresh ? 5000 : false,
  });

  const { data: apiStats } = api.performance.getExternalAPIStats.useQuery(
    undefined,
    { refetchInterval: autoRefresh ? 5000 : false },
  );

  const clearMetrics = api.performance.clearMetrics.useMutation({
    onSuccess: () => {
      refetchAnalysis();
    },
  });

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        refetchAnalysis();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refetchAnalysis]);

  // Show access denied for production
  if (!isAllowed) {
    return (
      <CommonAppLayout>
        <MaxWidthWrapper className="min-h-screen p-8">
          <div className="flex min-h-[60vh] items-center justify-center">
            <Card className="max-w-md rounded-[12px] border-[#0F1F30] bg-[#000D1E]">
              <CardHeader className="text-center">
                <div className="mb-4 flex justify-center">
                  <div className="rounded-full bg-red-500/10 p-4">
                    <Lock className="size-12 text-red-400" />
                  </div>
                </div>
                <CardTitle className="text-2xl text-[#BBEBFF]">
                  Access Denied
                </CardTitle>
                <CardDescription className="mt-2 text-[#BBEBFF80]">
                  The performance dashboard is only available on staging and
                  local environments.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <div className="space-y-2 text-sm text-[#BBEBFF60]">
                  <p>Allowed environments:</p>
                  <ul className="list-inside list-disc space-y-1">
                    <li>localhost</li>
                    <li>127.0.0.1</li>
                    <li>staging.paystream.finance</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        </MaxWidthWrapper>
      </CommonAppLayout>
    );
  }

  if (!analysis) {
    return (
      <CommonAppLayout>
        <MaxWidthWrapper className="min-h-screen p-8">
          <div className="flex min-h-[60vh] items-center justify-center">
            <div className="text-center">
              <div className="text-lg text-[#BBEBFF]">
                Loading performance data...
              </div>
            </div>
          </div>
        </MaxWidthWrapper>
      </CommonAppLayout>
    );
  }

  const getLatencyColor = (ms: number) => {
    if (ms > 3000) return "text-red-400";
    if (ms > 1000) return "text-orange-400";
    if (ms > 500) return "text-yellow-400";
    return "text-[#BBEBFF]";
  };

  const getLatencyBadgeVariant = (ms: number) => {
    if (ms > 3000) return "destructive";
    if (ms > 1000) return "default";
    return "secondary";
  };

  return (
    <CommonAppLayout>
      <MaxWidthWrapper className="min-h-screen p-8">
        <div className="space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="mb-2 text-4xl font-bold text-[#BBEBFF]">
                Performance Dashboard
              </h1>
              <p className="text-sm text-[#BBEBFF80]">
                Real-time performance metrics and analysis
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                variant="ghost"
                onClick={() => {
                  if (!analysis) return;

                  const statsData = {
                    summary: analysis.summary,
                    slowestEndpoints: analysis.summary.slowestEndpoints,
                    requestBreakdown: analysis.requestBreakdown,
                    bottlenecks: analysis.bottlenecks,
                    rpcAnalysis: analysis.rpcAnalysis,
                    externalAPIAnalysis: analysis.externalAPIAnalysis,
                    recommendations: analysis.recommendations,
                    timestamp: new Date().toISOString(),
                  };

                  const jsonString = JSON.stringify(statsData, null, 2);

                  navigator.clipboard
                    .writeText(jsonString)
                    .then(() => {
                      toast.success("Stats copied to clipboard!", {
                        description: "Performance data exported as JSON",
                      });
                    })
                    .catch((err) => {
                      console.error("Failed to copy:", err);
                      toast.error("Failed to copy stats", {
                        description: "Please try again",
                      });
                    });
                }}
                className="gap-2 text-[#BBEBFF] hover:bg-[#0F1F30] hover:text-[#BBEBFF]"
              >
                <Copy className="size-4" />
                Copy Stats
              </Button>
              <Button
                variant={autoRefresh ? "primary" : "ghost"}
                onClick={() => setAutoRefresh(!autoRefresh)}
                className="gap-2"
              >
                <RefreshCw
                  className={`size-4 ${autoRefresh ? "animate-spin" : ""}`}
                />
                {autoRefresh ? "Auto-Refresh On" : "Start Auto-Refresh"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => clearMetrics.mutate()}
                className="gap-2 text-red-400 hover:bg-red-400/10 hover:text-red-300"
              >
                <Trash2 className="size-4" />
                Clear Metrics
              </Button>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="rounded-[12px] border-[#0F1F30] bg-[#000D1E]">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-[#BBEBFF80]">
                  <TrendingUp className="size-4" />
                  Total Requests
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-[#BBEBFF]">
                  {analysis.summary.totalRequests}
                </div>
                <p className="mt-1 text-xs text-[#BBEBFF60]">
                  All tracked requests
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-[12px] border-[#0F1F30] bg-[#000D1E]">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-[#BBEBFF80]">
                  <Zap className="size-4" />
                  Avg Latency
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className={`text-3xl font-bold ${getLatencyColor(analysis.summary.averageLatency)}`}
                >
                  {Math.round(analysis.summary.averageLatency)}ms
                </div>
                <p className="mt-1 text-xs text-[#BBEBFF60]">
                  Average response time
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-[12px] border-[#0F1F30] bg-[#000D1E]">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-[#BBEBFF80]">
                  <AlertTriangle className="size-4" />
                  Error Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className={`text-3xl font-bold ${
                    analysis.summary.errorRate > 0.05
                      ? "text-red-400"
                      : "text-[#BBEBFF]"
                  }`}
                >
                  {(analysis.summary.errorRate * 100).toFixed(2)}%
                </div>
                <p className="mt-1 text-xs text-[#BBEBFF60]">Failed requests</p>
              </CardContent>
            </Card>

            <Card className="rounded-[12px] border-[#0F1F30] bg-[#000D1E]">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-[#BBEBFF80]">
                  <Globe className="size-4" />
                  RPC Calls
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-[#BBEBFF]">
                  {analysis.summary.totalRPCRequests}
                </div>
                <p className="mt-1 text-xs text-[#BBEBFF60]">
                  Blockchain RPC requests
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Recommendations */}
          {analysis.recommendations.length > 0 && (
            <Alert className="rounded-[12px] border-[#0F1F30] bg-[#041223]">
              <AlertTriangle className="size-4 text-yellow-400" />
              <AlertDescription className="text-[#BBEBFF]">
                <div className="mb-3 font-semibold text-[#BBEBFF]">
                  Recommendations:
                </div>
                <ul className="list-inside list-disc space-y-2 text-sm">
                  {analysis.recommendations.map((rec, i) => (
                    <li key={i} className="text-[#BBEBFF80]">
                      {rec}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Tabs */}
          <Tabs defaultValue="endpoints" className="w-full">
            <TabsList className="gap-1 rounded-[12px] border border-[#0F1F30] bg-[#000D1E] p-1.5">
              <TabsTrigger
                value="endpoints"
                className="rounded-lg text-[#BBEBFF60] data-[state=active]:bg-[#0F1F30] data-[state=active]:text-[#BBEBFF]"
              >
                Endpoints
              </TabsTrigger>
              <TabsTrigger
                value="bottlenecks"
                className="rounded-lg text-[#BBEBFF60] data-[state=active]:bg-[#0F1F30] data-[state=active]:text-[#BBEBFF]"
              >
                Bottlenecks
              </TabsTrigger>
              <TabsTrigger
                value="rpc"
                className="rounded-lg text-[#BBEBFF60] data-[state=active]:bg-[#0F1F30] data-[state=active]:text-[#BBEBFF]"
              >
                RPC Calls
              </TabsTrigger>
              <TabsTrigger
                value="external"
                className="rounded-lg text-[#BBEBFF60] data-[state=active]:bg-[#0F1F30] data-[state=active]:text-[#BBEBFF]"
              >
                External APIs
              </TabsTrigger>
            </TabsList>

            <TabsContent value="endpoints" className="mt-6 space-y-4">
              <Card className="rounded-[12px] border-[#0F1F30] bg-[#000D1E]">
                <CardHeader>
                  <CardTitle className="text-[#BBEBFF]">
                    Slowest Endpoints
                  </CardTitle>
                  <CardDescription className="text-[#BBEBFF60]">
                    Top endpoints by average latency
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {analysis.summary.slowestEndpoints.map((endpoint, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-[9px] border border-[#0F1F30] bg-[#041223] p-4 transition-colors hover:bg-[#0F1F30]"
                      >
                        <div className="flex-1">
                          <div className="font-mono text-sm text-[#BBEBFF]">
                            {endpoint.path}
                          </div>
                          <div className="mt-1 text-xs text-[#BBEBFF60]">
                            {endpoint.count} requests
                          </div>
                        </div>
                        <Badge
                          variant={getLatencyBadgeVariant(endpoint.avgDuration)}
                          className={`ml-4 ${
                            endpoint.avgDuration > 3000
                              ? "border-red-500/30 bg-red-500/20 text-red-400"
                              : endpoint.avgDuration > 1000
                                ? "border-orange-500/30 bg-orange-500/20 text-orange-400"
                                : "border-[#0F1F30] bg-[#0F1F30] text-[#BBEBFF]"
                          }`}
                        >
                          {Math.round(endpoint.avgDuration)}ms
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-[12px] border-[#0F1F30] bg-[#000D1E]">
                <CardHeader>
                  <CardTitle className="text-[#BBEBFF]">
                    Request Breakdown
                  </CardTitle>
                  <CardDescription className="text-[#BBEBFF60]">
                    Detailed statistics by endpoint
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {analysis.requestBreakdown.byPath
                      .slice(0, 20)
                      .map((item, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between rounded-[9px] border border-[#0F1F30] bg-[#041223] p-4 transition-colors hover:bg-[#0F1F30]"
                        >
                          <div className="flex-1">
                            <div className="font-mono text-sm text-[#BBEBFF]">
                              {item.path}
                            </div>
                            <div className="mt-1 text-xs text-[#BBEBFF60]">
                              {item.count} requests • P95:{" "}
                              {Math.round(item.p95)}ms
                              {item.errors > 0 && ` • ${item.errors} errors`}
                            </div>
                          </div>
                          <Badge
                            variant={getLatencyBadgeVariant(item.avgDuration)}
                            className={`ml-4 ${
                              item.avgDuration > 3000
                                ? "border-red-500/30 bg-red-500/20 text-red-400"
                                : item.avgDuration > 1000
                                  ? "border-orange-500/30 bg-orange-500/20 text-orange-400"
                                  : "border-[#0F1F30] bg-[#0F1F30] text-[#BBEBFF]"
                            }`}
                          >
                            {Math.round(item.avgDuration)}ms avg
                          </Badge>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="bottlenecks" className="mt-6 space-y-4">
              <Card className="rounded-[12px] border-[#0F1F30] bg-[#000D1E]">
                <CardHeader>
                  <CardTitle className="text-[#BBEBFF]">
                    Performance Bottlenecks
                  </CardTitle>
                  <CardDescription className="text-[#BBEBFF60]">
                    Identified performance issues
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {analysis.bottlenecks.map((bottleneck, i) => (
                      <div
                        key={i}
                        className="rounded-[12px] border border-[#0F1F30] bg-[#041223] p-5 transition-colors hover:bg-[#0F1F30]"
                      >
                        <div className="mb-3 flex items-start justify-between">
                          <div className="flex-1">
                            <Badge
                              variant="destructive"
                              className="mb-3 border-red-500/30 bg-red-500/20 text-red-400"
                            >
                              {bottleneck.type.toUpperCase()}
                            </Badge>
                            <div className="text-lg font-semibold text-[#BBEBFF]">
                              {bottleneck.name}
                            </div>
                          </div>
                          <div className="ml-4 text-right">
                            <div
                              className={`text-2xl font-bold ${getLatencyColor(bottleneck.averageDuration)}`}
                            >
                              {Math.round(bottleneck.averageDuration)}ms
                            </div>
                            <div className="mt-1 text-xs text-[#BBEBFF60]">
                              {bottleneck.count} calls
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 border-t border-[#0F1F30] pt-3 text-sm text-[#BBEBFF80]">
                          {bottleneck.recommendation}
                        </div>
                      </div>
                    ))}
                    {analysis.bottlenecks.length === 0 && (
                      <div className="py-12 text-center text-[#BBEBFF60]">
                        <div className="mb-2 text-2xl">🎉</div>
                        <div>No bottlenecks identified!</div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="rpc" className="mt-6 space-y-4">
              <Card className="rounded-[12px] border-[#0F1F30] bg-[#000D1E]">
                <CardHeader>
                  <CardTitle className="text-[#BBEBFF]">
                    RPC Call Statistics
                  </CardTitle>
                  <CardDescription className="text-[#BBEBFF60]">
                    {rpcStats && (
                      <>
                        Total: {rpcStats.totalCalls} calls • Error Rate:{" "}
                        {(rpcStats.errorRate * 100).toFixed(2)}%
                      </>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {analysis.rpcAnalysis.slowestMethods.length > 0 ? (
                    <div className="space-y-2">
                      {analysis.rpcAnalysis.slowestMethods.map((method, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between rounded-[9px] border border-[#0F1F30] bg-[#041223] p-4 transition-colors hover:bg-[#0F1F30]"
                        >
                          <div className="flex-1">
                            <div className="font-mono text-sm text-[#BBEBFF]">
                              {method.method}
                            </div>
                            <div className="mt-1 text-xs text-[#BBEBFF60]">
                              {method.count} calls
                            </div>
                          </div>
                          <Badge
                            variant={getLatencyBadgeVariant(method.avgDuration)}
                            className={`ml-4 ${
                              method.avgDuration > 500
                                ? "border-red-500/30 bg-red-500/20 text-red-400"
                                : "border-[#0F1F30] bg-[#0F1F30] text-[#BBEBFF]"
                            }`}
                          >
                            {Math.round(method.avgDuration)}ms
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-12 text-center text-[#BBEBFF60]">
                      No RPC calls tracked yet
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="external" className="mt-6 space-y-4">
              <Card className="rounded-[12px] border-[#0F1F30] bg-[#000D1E]">
                <CardHeader>
                  <CardTitle className="text-[#BBEBFF]">
                    External API Statistics
                  </CardTitle>
                  <CardDescription className="text-[#BBEBFF60]">
                    Total: {analysis.externalAPIAnalysis.totalCalls} calls •
                    Error Rate:{" "}
                    {(analysis.externalAPIAnalysis.errorRate * 100).toFixed(2)}%
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div>
                      <h3 className="mb-3 font-semibold text-[#BBEBFF]">
                        Slowest Domains
                      </h3>
                      <div className="space-y-2">
                        {analysis.externalAPIAnalysis.slowestDomains.map(
                          (domain, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between rounded-[9px] border border-[#0F1F30] bg-[#041223] p-4 transition-colors hover:bg-[#0F1F30]"
                            >
                              <div className="flex-1">
                                <div className="font-semibold text-[#BBEBFF]">
                                  {domain.domain}
                                </div>
                                <div className="mt-1 text-xs text-[#BBEBFF60]">
                                  {domain.count} calls • {domain.errors} errors
                                </div>
                              </div>
                              <Badge
                                variant={getLatencyBadgeVariant(
                                  domain.avgDuration,
                                )}
                                className={`ml-4 ${
                                  domain.avgDuration > 1000
                                    ? "border-red-500/30 bg-red-500/20 text-red-400"
                                    : domain.avgDuration > 500
                                      ? "border-orange-500/30 bg-orange-500/20 text-orange-400"
                                      : "border-[#0F1F30] bg-[#0F1F30] text-[#BBEBFF]"
                                }`}
                              >
                                {Math.round(domain.avgDuration)}ms
                              </Badge>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                    <div>
                      <h3 className="mb-3 font-semibold text-[#BBEBFF]">
                        Slowest URLs
                      </h3>
                      <div className="space-y-2">
                        {analysis.externalAPIAnalysis.slowestUrls.map(
                          (url, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between rounded-[9px] border border-[#0F1F30] bg-[#041223] p-4 transition-colors hover:bg-[#0F1F30]"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="font-mono text-xs break-all text-[#BBEBFF]">
                                  {url.url}
                                </div>
                                <div className="mt-1 text-xs text-[#BBEBFF60]">
                                  {url.count} calls
                                </div>
                              </div>
                              <Badge
                                variant={getLatencyBadgeVariant(
                                  url.avgDuration,
                                )}
                                className={`ml-4 shrink-0 ${
                                  url.avgDuration > 1000
                                    ? "border-red-500/30 bg-red-500/20 text-red-400"
                                    : url.avgDuration > 500
                                      ? "border-orange-500/30 bg-orange-500/20 text-orange-400"
                                      : "border-[#0F1F30] bg-[#0F1F30] text-[#BBEBFF]"
                                }`}
                              >
                                {Math.round(url.avgDuration)}ms
                              </Badge>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </MaxWidthWrapper>
    </CommonAppLayout>
  );
}
