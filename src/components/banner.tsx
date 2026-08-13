"use client";

import Image from "next/image";
import React from "react";
import Link from "next/link";

import CarouselDialog from "./common/carousel-dialog";

const FIRST_VISIT_KEY = "paystream_first_visit_banner_shown";

const carouselItems = [
  {
    title: "Choose Your Liquidity Pool",
    description: (
      <p className="text-xs leading-[18px] font-light text-[#9CA3AF]">
        Browse available pools from{" "}
        <Link
          href="https://meteora.xyz"
          className="text-[#BCEAFF] underline"
          target="_blank"
        >
          meteora
        </Link>{" "}
        and{" "}
        <Link
          href="https://raydium.io"
          className="text-[#BCEAFF] underline"
          target="_blank"
        >
          raydium
        </Link>{" "}
        to begin your liquidity journey. Select the pool that best fits your
        strategy and proceed to set your investment parameters.
      </p>
    ),
    image: "/discover/carousel/1.svg",
  },
  {
    title: "Set Your Deposit Amount",
    description: (
      <p className="text-xs leading-[18px] font-light text-[#9CA3AF]">
        Specify the amount of tokens to provide. Ensure your inputs match your
        risk and yield preferences before proceeding.
      </p>
    ),
    image: "/discover/carousel/2.svg",
  },
  {
    title: "Optimize Your Strategy",
    description: (
      <p className="text-xs leading-[18px] font-light text-[#9CA3AF]">
        Select a strategy type spot, curve, or bidask and customize
        auto-rebalancing, profit-taking, and liquidity presets.
      </p>
    ),
    image: "/discover/carousel/3.svg",
  },
  {
    title: "Monitor Pool Performance",
    description: (
      <p className="text-xs leading-[18px] font-light text-[#9CA3AF]">
        Track real-time price movements, liquidity distribution. Use interactive
        charts and analytics to make informed decisions and optimize your
        position.
      </p>
    ),
    image: "/discover/carousel/4.svg",
  },
  {
    title: "Position Opened Successfully",
    description: (
      <p className="text-xs leading-[18px] font-light text-[#9CA3AF]">
        Your position is live and begins generating yield. Track progress and
        manage your strategy anytime through your portfolio.
      </p>
    ),
    image: "/discover/carousel/5.svg",
  },
];

const Banner: React.FC = () => {
  const [autoOpen, setAutoOpen] = React.useState(false);
  const hasShownRef = React.useRef(false);

  React.useEffect(() => {
    // Check if this is the first visit
    if (typeof window !== "undefined" && !hasShownRef.current) {
      const hasShownBefore = localStorage.getItem(FIRST_VISIT_KEY);
      if (!hasShownBefore) {
        // Small delay to ensure the page is fully loaded
        const timer = setTimeout(() => {
          setAutoOpen(true);
          hasShownRef.current = true;
        }, 500);
        return () => clearTimeout(timer);
      }
      hasShownRef.current = true;
    }
  }, []);

  const handleDialogChange = React.useCallback((open: boolean) => {
    // Mark as shown when dialog closes (whether auto-opened or manually opened)
    if (!open && typeof window !== "undefined") {
      localStorage.setItem(FIRST_VISIT_KEY, "true");
      setAutoOpen(false);
    }
  }, []);

  return (
    <div>
      <div className="relative mx-auto mt-10 h-[240px] w-[98%] rounded-xl">
        <Image
          src="/banner-bg.svg"
          alt="banner"
          className="h-full w-full rounded-xl object-cover"
          fill
        />
        <h1 className="absolute top-7 left-12 flex items-center justify-center gap-2 text-3xl font-medium text-white">
          <span className="font-ibm-plex-serif italic">Liquidity</span>
          that works for you
        </h1>

        <p className="absolute top-[5.2rem] left-12 text-base font-normal text-[#C7AFAE]">
          Earn fees passively by adding liquidity to top pools. <br /> Safe,
          simple, always earning.
        </p>

        <CarouselDialog
          {...({
            carouselItems,
            autoOpen,
            onOpenChange: handleDialogChange,
            dialogTrigger: (
              <button className="font-ibm-plex-serif absolute bottom-[38px] left-16 cursor-pointer text-lg font-medium text-[#BBEBFF] italic">
                Learn more
              </button>
            ),
          } as React.ComponentProps<typeof CarouselDialog>)}
        />
      </div>
    </div>
  );
};

export default Banner;
