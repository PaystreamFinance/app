"use client";

import Image from "next/image";
import React from "react";
import { ChevronLeft } from "lucide-react";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const FIRST_VISIT_KEY = "paystream_onboarding_carousel_shown_v2";
const SHOW_AFTER_TNC_KEY = "paystream_show_carousel_after_tnc";

type OnboardingCard = {
  title: string;
  eyebrow: string;
  description: string;
  image?: string;
  imageClassName?: string;
  visual: "logo" | "funding" | "image";
};

const onboardingCards: OnboardingCard[] = [
  {
    title: "1. What is Paystream?",
    eyebrow: "Earn the funding spread between perp DEXs",
    description:
      "Long where funding is cheap, short where it's expensive. Price moves cancel you're market-neutral. The rate difference becomes your yield.",
    visual: "logo",
  },
  {
    title: "2. How funding rate works",
    eyebrow: "The crowded side pays the other side",
    description:
      "Positive funding longs pay shorts (price too high). Negative funding shorts pay longs (price too low). You collect whichever side gets paid.",
    visual: "funding",
  },
  {
    title: "3. Find an opportunity",
    eyebrow: "Live APR and capacity, ranked",
    description:
      "APR is your return. Max Assets is how much capital that arb can absorb before slippage kills the edge. Click any row to load the trade.",
    image: "/onboarding/opportunity.png",
    imageClassName: "scale-[1.08] object-left-top",
    visual: "image",
  },
  {
    title: "4. Your wallet is auto-created",
    eyebrow: "Privy creates a secure embedded wallet",
    description:
      "One click. No seed phrase to write down. Your wallet lives on Solana and is fully exportable whenever you want full custody.",
    image: "/onboarding/wallet.png",
    imageClassName: "scale-[1.02] object-top",
    visual: "image",
  },
  {
    title: "5. Deposit into your wallet",
    eyebrow: "Step 1: Fund your Privy wallet",
    description:
      "Send USDC or SOL from any exchange or wallet. Funds land here first this is your main treasury inside Paystream.",
    image: "/onboarding/deposit-wallet.png",
    imageClassName: "scale-[1.35] object-top",
    visual: "image",
  },
  {
    title: "6. Move funds to a DEX",
    eyebrow: "Step 2: Route margin to the DEX you'll trade on",
    description:
      "Each DEX holds its own margin separately. Pick how much goes to Hyperliquid, Drift, Pacifica, or Lighter both legs of your arb need collateral on their own venue.",
    image: "/onboarding/move-funds.png",
    imageClassName: "scale-[1.02] object-top",
    visual: "image",
  },
  {
    title: "7. Build your trade",
    eyebrow: "Pick two DEXs and set leverage",
    description:
      "Long one venue, short the other switch DEX from the dropdown anytime. Higher leverage = more funding but tighter liquidation. We recommend 2-3x.",
    image: "/onboarding/build-trade.png",
    imageClassName: "scale-[1.02] object-top",
    visual: "image",
  },
  {
    title: "8. Protected, then executed",
    eyebrow: "We watch every position so you don't have to",
    description:
      "Four safety checks monitor your position continuously. If anything goes wrong, both legs close together. Hit Execute both DEX orders fire at the same time.",
    image: "/onboarding/protected-executed.png",
    imageClassName: "scale-[1.02] object-top",
    visual: "image",
  },
  {
    title: "9. Monitor everything",
    eyebrow: "Portfolio, activity, and tools all live",
    description:
      "Watch funding accrue, every event logged. On close, balance returns to your DEX wallet. Verify positions natively on each DEX, and backtest any pair before deploying.",
    image: "/onboarding/monitor.png",
    imageClassName: "scale-[1.24] object-top",
    visual: "image",
  },
  {
    title: "10. Close a position",
    eyebrow: "Exit trades instantly with one click.",
    description:
      "Both legs close together automatically to reduce execution risk. Your remaining balance is safely returned back to your connected DEX wallet.",
    image: "/onboarding/close-position.png",
    imageClassName: "scale-[1.35] object-top",
    visual: "image",
  },
  {
    title: "11. Withdraw your funds",
    eyebrow: "Move funds back to your wallet anytime.",
    description:
      "Withdraw profits or unused balance directly from your DEX account with full transparency and on-chain visibility.",
    image: "/onboarding/withdraw.png",
    imageClassName: "scale-[1.05] object-top",
    visual: "image",
  },
];

const preloadableImages = onboardingCards
  .map((card) => card.image)
  .filter((image): image is string => Boolean(image));

function IntroVisual() {
  return (
    <div className="flex h-full items-center justify-center bg-[#000D1E]">
      <Image
        src="/onboarding/paystream-logo.png"
        alt=""
        width={300}
        height={169}
        className="h-[170px] w-[300px] object-contain opacity-95"
        priority
      />
    </div>
  );
}

function FundingVisual() {
  return (
    <div className="flex h-full items-center justify-center bg-gradient-to-b from-[#000D1E] to-[#003984] px-6">
      <div className="w-full max-w-[350px]">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-gradient-to-b from-[#050B1900] to-[#0D1C3E] p-3.5">
            <div className="flex items-center gap-2 text-white/60">
              <Image
                src="/onboarding/hyperliquid.png"
                alt=""
                width={24}
                height={24}
              />
              <span className="text-base">Hyperliquid</span>
            </div>
            <div className="mt-4 text-[22px] text-[#23FFAA]">+0.025%</div>
            <div className="mt-3 text-sm text-white/60">Short Here</div>
          </div>
          <div className="rounded-2xl bg-gradient-to-b from-[#050B1900] to-[#0D1C3E] p-3.5">
            <div className="flex items-center gap-2 text-white/60">
              <Image
                src="/onboarding/pacifica.png"
                alt=""
                width={24}
                height={24}
              />
              <span className="text-base">Pacifica</span>
            </div>
            <div className="mt-4 text-[22px] text-[#E6B867]">+0.005%</div>
            <div className="mt-3 text-sm text-white/60">Long Here</div>
          </div>
        </div>
        <div className="mt-3 rounded-[10px] border border-dashed border-[#9CE0FF] bg-[#00214D] p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-white/60">
              <div>You keep the difference</div>
              <div className="mt-2">0.025% - 0.005% = 0.020%</div>
            </div>
            <div className="text-base whitespace-nowrap text-[#23FFAA]">
              ~ 21.9% APR
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CardVisual({ card, index }: { card: OnboardingCard; index: number }) {
  if (card.visual === "logo") return <IntroVisual />;
  if (card.visual === "funding") return <FundingVisual />;

  return (
    <div className="relative h-full bg-gradient-to-b from-[#000D1E] to-[#003984]">
      {card.image && (
        <Image
          src={card.image}
          alt=""
          fill
          sizes="399px"
          priority={index < 2}
          className={cn("object-cover", card.imageClassName)}
        />
      )}
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#000D1E] to-transparent" />
    </div>
  );
}

function prefetchOnboardingImages() {
  if (typeof window === "undefined") return;

  preloadableImages.forEach((src) => {
    const img = new window.Image();
    img.decoding = "async";
    img.src = src;
  });
}

const FirstVisitCarousel: React.FC = () => {
  const [open, setOpen] = React.useState(false);
  const [api, setApi] = React.useState<CarouselApi>();
  const [current, setCurrent] = React.useState(0);

  React.useEffect(() => {
    prefetchOnboardingImages();
  }, []);

  React.useEffect(() => {
    const maybeOpenCarousel = () => {
      if (typeof window === "undefined") return;

      const hasShownBefore = localStorage.getItem(FIRST_VISIT_KEY);
      const shouldShowAfterTnc = localStorage.getItem(SHOW_AFTER_TNC_KEY);

      if (!hasShownBefore && shouldShowAfterTnc === "true") {
        localStorage.setItem(FIRST_VISIT_KEY, "true");
        localStorage.removeItem(SHOW_AFTER_TNC_KEY);
        setOpen(true);
      }
    };

    maybeOpenCarousel();
    window.addEventListener("paystream-tnc-accepted", maybeOpenCarousel);

    return () => {
      window.removeEventListener("paystream-tnc-accepted", maybeOpenCarousel);
    };
  }, []);

  React.useEffect(() => {
    if (!api) return;

    setCurrent(api.selectedScrollSnap());

    const handleSelect = () => {
      setCurrent(api.selectedScrollSnap());
    };

    api.on("select", handleSelect);
    return () => {
      api.off("select", handleSelect);
    };
  }, [api]);

  const handleOpenChange = React.useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
  }, []);

  const isFirst = current === 0;
  const isLast = current === onboardingCards.length - 1;

  return (
    <>
      {preloadableImages.map((image) => (
        <link key={image} rel="preload" as="image" href={image} />
      ))}
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="!w-[calc(100vw-32px)] !max-w-[463px] gap-0 border-0 bg-transparent p-0 shadow-none">
          <DialogTitle className="sr-only">Paystream onboarding</DialogTitle>
          <Carousel
            setApi={setApi}
            opts={{ align: "start", containScroll: "trimSnaps" }}
            className="w-full overflow-hidden"
          >
            <CarouselContent className="ml-0 w-full">
              {onboardingCards.map((card, index) => (
                <CarouselItem
                  key={card.title}
                  className="w-full max-w-full pl-0"
                >
                  <div className="w-full overflow-hidden border border-[#0F1F30] bg-[#000D1E]">
                    <div className="flex h-[72px] items-center justify-between border-b border-[#0F1F30] px-8">
                      <h3 className="pr-8 text-[21px] leading-none font-normal break-words whitespace-nowrap text-white">
                        {card.title}
                      </h3>
                    </div>
                    <div className="p-8">
                      <div className="h-[226px] w-full overflow-hidden rounded-[14px]">
                        <CardVisual card={card} index={index} />
                      </div>
                      <div className="mt-6 flex min-h-[104px] flex-col gap-4">
                        <p className="text-lg leading-[1.42] font-normal text-white">
                          {card.eyebrow}
                        </p>
                        <p className="text-base leading-[1.42] font-normal break-words text-white/60">
                          {card.description}
                        </p>
                      </div>
                    </div>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>

          <div className="mt-2 flex h-10 gap-2">
            <button
              type="button"
              aria-label="Previous onboarding card"
              disabled={isFirst}
              onClick={() => api?.scrollPrev()}
              className="flex size-10 items-center justify-center border border-[#BCEBFF14] bg-[#041223] text-[#9CE0FF] transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="size-[22px]" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (isLast) {
                  setOpen(false);
                  return;
                }
                api?.scrollNext();
              }}
              className="flex h-10 flex-1 items-center justify-center border border-[#BCEBFF14] bg-[#BCEBFF] px-5 text-base font-medium text-[#000D1E]"
            >
              {isLast ? "Start Trading" : "Next"}
            </button>
          </div>

          <div className="mt-11 flex items-center justify-center gap-[9px]">
            {onboardingCards.map((card, index) => (
              <button
                key={card.title}
                type="button"
                aria-label={`Go to onboarding card ${index + 1}`}
                onClick={() => api?.scrollTo(index)}
                className={cn(
                  "h-[7.5px] w-[7.5px] rounded-full bg-[#89A3B0] transition-all",
                  current === index && "w-[25.8px] bg-[#BCEBFF]",
                )}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default FirstVisitCarousel;
