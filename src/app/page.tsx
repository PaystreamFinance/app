"use client";

import type { NextPage } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import MaxWidthWrapper from "@/components/max-width-wrapper";
import { useBetaMode } from "@/hooks/use-beta-mode";

import CommonAppLayout from "./_components/common-app-layout";
import QuicklinkCards from "./_components/quicklink-cards";
import Image from "next/image";

const HomePage: NextPage = () => {
  const { betaMode } = useBetaMode();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (mounted && !betaMode) {
      router.replace("/arb");
    }
  }, [mounted, betaMode, router]);

  if (!mounted || !betaMode) return null;

  return (
    <CommonAppLayout className="flex min-h-dvh flex-col">
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
      <MaxWidthWrapper className="relative flex min-h-0 w-[min(99vw,100%-2rem)] flex-1 flex-col overflow-y-auto">
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center px-4 py-8 xl:px-8">
          <div className="flex shrink-0 flex-col items-center justify-center gap-2 py-2 xl:mb-6 2xl:mb-10">
            <h1 className="text-center text-3xl font-medium whitespace-nowrap text-white md:text-4xl xl:text-5xl 2xl:text-7xl">
              Choose Your Profit Machine
            </h1>
            <p className="font-ibm-plex-serif mt-1 max-w-[60%] text-center text-base text-gray-500 italic md:text-lg xl:mt-2 xl:max-w-[45%] xl:text-xl 2xl:max-w-[40%] 2xl:text-2xl">
              Maximize your returns
            </p>
          </div>
          <div className="flex min-h-0 items-center justify-center py-4">
            <QuicklinkCards />
          </div>
        </div>
      </MaxWidthWrapper>
    </CommonAppLayout>
  );
};

export default HomePage;
