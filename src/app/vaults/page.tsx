"use client";

import type { NextPage } from "next";
import React from "react";
import Image from "next/image";

import MaxWidthWrapper from "@/components/max-width-wrapper";
import { PositionsTable } from "@/components/pool-positions/positions-table";
import { api } from "@/trpc/react";

import CommonAppLayout from "../_components/common-app-layout";
import VaultStats from "./_components/vault-stats";
import VaultDepositPanel from "./_components/vault-deposit-panel";
import { getVaultActivityColumns } from "./_components/vault-activity-columns";
import { MOCK_VAULT_ACTIVITY, type VaultActivityRow } from "./_components/vault-activity-data";

const VaultsPage: NextPage = () => {
  const activityColumns = React.useMemo(() => getVaultActivityColumns(), []);

  const {
    data: activityData,
    isLoading,
    refetch,
  } = api.vaults.getActivityLogs.useQuery(
    { limit: 50, offset: 0 },
    { refetchInterval: 30_000 },
  );

  const logs: VaultActivityRow[] =
    ((activityData?.logs as VaultActivityRow[])?.length ?? 0) > 0
      ? (activityData?.logs as VaultActivityRow[])
      : MOCK_VAULT_ACTIVITY;

  return (
    <CommonAppLayout className="flex min-h-dvh flex-col">
      <div className="absolute inset-0 -z-10">
        <Image
          src="/home/lines.svg"
          alt="bg-gradient"
          fill
          className="object-cover object-center opacity-60"
        />
      </div>

      <MaxWidthWrapper className="relative w-[min(99vw,100%-2rem)] flex-1 px-4 py-8 xl:px-8">
        {/* Page title */}
        <div className="mb-8">
          <h1 className="text-3xl font-medium text-white md:text-4xl">
            USDC Vault
          </h1>
          <p className="font-ibm-plex-serif mt-1 text-base text-gray-500 italic">
            Transparency & control over your deposits
          </p>
        </div>

        {/* Top section: Stats (left) + Deposit panel (right) */}
        <div className="mb-10 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_400px]">
          <VaultStats />
          <VaultDepositPanel />
        </div>

        {/* Activity Log section */}
        <div className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-medium text-white">Activity Log</h2>
            <button
              onClick={() => refetch()}
              className="rounded-lg border border-[#1A3A52] bg-[#000D1E] px-4 py-1.5 text-sm text-[#7092A5] transition-colors hover:bg-[#0D1929] hover:text-white"
            >
              Refresh
            </button>
          </div>

          {isLoading ? (
            <div className="flex h-[200px] items-center justify-center border border-[#0F1F30] bg-[#000D1E]">
              <p className="text-sm text-[#7092A5]">Loading activity...</p>
            </div>
          ) : (
            <PositionsTable columns={activityColumns} data={logs} />
          )}
        </div>
      </MaxWidthWrapper>
    </CommonAppLayout>
  );
};

export default VaultsPage;
