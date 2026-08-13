"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/trpc/react";

interface StatCardProps {
  label: string;
  value: string;
  valueColor?: string;
}

function StatCard({ label, value, valueColor = "text-white" }: StatCardProps) {
  return (
    <div className="flex h-full flex-col items-start justify-center gap-2 bg-[#000D1E] p-5 px-6">
      <p className="text-xs uppercase tracking-wider text-[#7092A5]">{label}</p>
      <p className={`text-2xl font-medium ${valueColor}`}>{value}</p>
    </div>
  );
}

function fmt(n: number, decimals = 2): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

const VAULT_SINCE = "2026-03-20T12:41:17.884Z";

export default function VaultStats() {
  const { data, isLoading } = api.vaults.getVaultMetrics.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  const { data: yieldData } = useQuery({
    queryKey: ["realized-yield"],
    queryFn: async () => {
      const res = await fetch("/api/realized-yield");
      if (!res.ok) throw new Error("Failed to fetch realized yield");
      const json = await res.json() as {
        total_deposit: number;
        current_value: number;
        realized_yield: number;
        updated_at: string;
      };
      return json;
    },
    refetchInterval: 60_000,
  });

  const { data: ageData } = useQuery({
    queryKey: ["vault-age"],
    queryFn: async () => {
      const res = await fetch(`/api/vault-age?since=${VAULT_SINCE}`);
      if (!res.ok) throw new Error("Failed to fetch vault age");
      return res.json() as Promise<{ label: string; total_days: number }>;
    },
    refetchInterval: 60_000,
  });

  const loading = isLoading || !data;

  const totalAssets = loading ? "—" : `$${fmt(data.totalAssets)}`;
  const lpPrice = loading ? "—" : data.lpPrice.toFixed(6);
  const expectedApy = loading
    ? "—"
    : `${data.performance >= 0 ? "+" : ""}${fmt(data.performance)}%`;
  const computedYield =
    yieldData != null
      ? (yieldData.realized_yield ?? yieldData.current_value - yieldData.total_deposit)
      : null;
  const allTimeYield = computedYield != null ? `$${fmt(computedYield)}` : "—";
  const strategyAge = ageData ? ageData.label : "—";

  return (
    <div className="flex flex-col gap-4">
      {/* Top: Total Assets */}
      <div className="bg-[#000D1E] p-6">
        <p className="text-xs uppercase tracking-wider text-[#7092A5]">
          Total Assets
        </p>
        <p className="mt-2 text-3xl font-medium text-white">{totalAssets}</p>
      </div>

      {/* Middle: LP Price + Expected APY */}
      <div className="grid grid-cols-2 gap-4">
        <StatCard label="LP Price" value={lpPrice} />
        <StatCard
          label="Expected APY"
          value={expectedApy}
          valueColor={
            !loading && data.performance >= 0
              ? "text-[#4ADE80]"
              : "text-[#FF6B6B]"
          }
        />
      </div>

      {/* Bottom: All Time Yield, Strategy Age */}
      <div className="grid grid-cols-2 gap-4">
        <StatCard label="All Time Yield" value={allTimeYield} />
        <StatCard label="Strategy Age" value={strategyAge} />
      </div>
    </div>
  );
}
