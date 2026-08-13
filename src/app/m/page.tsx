"use client";

import type { NextPage } from "next";
import * as React from "react";
import MobileStrategiesPage from "./_components/mobile-strategies-page";
import CommonAppLayout from "../_components/common-app-layout";
import MaxWidthWrapper from "@/components/max-width-wrapper";
import Image from "next/image";
import QuicklinkCards from "../_components/quicklink-cards";
import { Button } from "@/components/ui/button";
import { useAllTokenBalances } from "@/hooks/use-all-token-balances";
import { formatUSD } from "@/lib/utils";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets, useFundWallet } from "@privy-io/react-auth/solana";
import { ArrowDownLeft } from "lucide-react";

const MobileHomePage: NextPage = () => {
  const { tokens, totalUsdValue, isLoading } = useAllTokenBalances();
  const totalUsdValueFormatted = formatUSD(totalUsdValue);
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const { fundWallet } = useFundWallet();
  const embeddedWalletAddress = wallets[0]?.standardWallet.accounts[0]?.address;
  return (
    <>
      <div className="absolute inset-0 bottom-0 -z-10">
        <div className="flex h-full w-full items-end justify-end">
          <Image
            src="/home/lines.svg"
            alt="bg-gradient"
            width={2000}
            height={2000}
            className="mt-auto w-full object-contain"
          />
        </div>
      </div>
      <MaxWidthWrapper className="relative flex min-h-0 w-[min(99vw,100%-2rem)] flex-1 flex-col justify-center overflow-y-auto py-6 md:py-8">
        <div className="flex flex-col items-center gap-6 px-4 xl:gap-8 xl:px-8">
          <div className="flex w-full flex-col items-center justify-center gap-2">
            <h1 className="max-w-[60%] text-center text-3xl font-medium text-white md:text-4xl xl:max-w-[45%] xl:text-5xl 2xl:max-w-[40%] 2xl:text-7xl">
              Choose Your Profit Machine
            </h1>
            <p className="font-ibm-plex-serif mt-1 max-w-[60%] text-center text-base text-gray-500 italic md:text-lg xl:mt-2 xl:max-w-[45%] xl:text-xl 2xl:max-w-[40%] 2xl:text-2xl">
              Maximize your returns
            </p>
          </div>

          {/* Deposit Button */}
          {user && embeddedWalletAddress && (
            <button
              onClick={() =>
                fundWallet({
                  address: embeddedWalletAddress,
                  options: {
                    chain: "solana:mainnet",
                    asset: "USDC",
                  },
                })
              }
              className="flex h-[35px] cursor-pointer items-center justify-between gap-2 border border-[#9CE0FF]/30 bg-[radial-gradient(circle_at_center,#142131_0%,#334D60_100%)] px-3 py-2 text-sm text-[#9CE0FF] transition-opacity hover:opacity-90"
            >
              <span className="text-[#9CE0FF]">Deposit</span>
              <ArrowDownLeft className="size-4 text-[#9CE0FF]" />
            </button>
          )}

          <div className="flex w-full items-center justify-center pb-20 md:pb-24">
            <QuicklinkCards isMobile />
          </div>
          {/* <div className="flex w-full flex-col items-start justify-center gap-4 pb-4">
            <p className="text-lg font-light text-[#7192A5]">Total Balance</p>
            <p className="text-6xl font-medium text-white">
              {isLoading ? "..." : totalUsdValueFormatted}
            </p>
            <div className="flex items-center gap-4">
              <p className="text-lg font-light text-[#BCEBFF]">+12.350</p>
              <p className="bg-linear-to-r from-[#23FFAA00] via-[#23FFAA]/30 to-[#23FFAA00] px-3 text-lg font-light text-[#23FFAA]">
                +2.4%
              </p>
            </div>
            <div className="mt-4 flex w-full items-center gap-4">
              <Button
                variant="primary"
                className="h-[50px]! w-1/2 rounded-none!"
                size="lg"
              >
                <span className="font-ibm-plex-serif text-lg italic">
                  Deposit
                </span>
              </Button>
              <Button
                variant="primary"
                className="h-[50px]! w-1/2 rounded-none! border border-[white]/10 bg-[#132335]"
                size="lg"
              >
                <span className="text-lg text-white">Withdraw</span>
              </Button>
            </div>
          </div> */}
        </div>
      </MaxWidthWrapper>
    </>
  );
};

export default MobileHomePage;
