import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
export default function QuicklinkCards({
  isMobile = false,
  className,
}: {
  isMobile?: boolean;
  className?: string;
}) {
  const cards = [
    {
      title: "Perp-Perp Arb",
      description:
        "Farm funding rate gaps across perp DEXs. Each venue settles at different intervals. Market-neutral. Automated.",
      icon: "/home/cards/card-1.svg",
      link: isMobile ? "/m/arb" : "/arb",
    },
    {
      title: "Spot-Perp Neutral",
      description:
        "Long spot + short perp. Collect funding at each settlement. Collateral earns yield while deployed.",
      icon: "/home/cards/card-2.svg",
      link: isMobile ? "/m/spot-perp" : "/spot-perp",
    },
  ];

  if (isMobile) {
    return (
      <div className="flex w-full max-w-[2024px] flex-col items-center justify-center">
        <div className="grid w-fit max-w-full grid-cols-2 gap-4 px-2 sm:gap-5 md:px-0">
          {cards.map((card) => (
            <Link
              key={card.title}
              href={card.link as Route}
              className="group relative flex aspect-[3/4] w-full max-w-[280px] flex-col justify-between gap-4 bg-[#000D1E] p-4 transition-colors hover:bg-white/10 sm:max-w-[360px] xl:max-w-[500px] xl:p-6"
            >
              <Image
                src={card.icon}
                alt={card.title}
                width={32}
                height={32}
                className="pointer-events-none absolute right-0 bottom-0 h-full w-full object-contain"
              />
              <div className="relative z-10 mt-auto flex min-h-[120px] flex-col justify-end gap-3 sm:min-h-[140px] xl:min-h-[200px]">
                <h3 className="text-[15px] leading-tight font-light text-white sm:text-base xl:text-2xl">
                  {card.title}
                </h3>
                <p className="pr-6 text-[10px] leading-snug font-light text-[#82A8BD] sm:pr-8 sm:text-xs md:text-sm xl:text-lg">
                  {card.description}
                </p>
              </div>
              <ArrowUpRight className="absolute right-4 bottom-4 h-6 w-6 text-[#23C0FF] opacity-0 transition-all duration-300 ease-out group-hover:scale-100 group-hover:opacity-100 xl:h-8 xl:w-8" />
            </Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex w-full flex-col items-center justify-center",
        className,
      )}
    >
      <div className="grid w-full max-w-[1000px] grid-cols-1 place-items-center gap-4 px-2 sm:grid-cols-2 sm:gap-5 md:px-0">
        {cards.map((card) => (
          <Link
            key={card.title}
            href={card.link as Route}
            className="group relative flex aspect-[3/4] w-full max-w-[320px] flex-col justify-between gap-4 bg-[#000D1E] p-4 transition-colors hover:bg-white/10 sm:max-w-[400px] lg:max-w-[460px] xl:p-6"
            style={{ maxHeight: "min(60dvh, 580px)" }}
          >
            <Image
              src={card.icon}
              alt={card.title}
              width={32}
              height={32}
              className="pointer-events-none absolute right-0 bottom-0 h-full w-full object-contain"
            />
            <div className="relative z-10 mt-auto flex flex-col justify-end gap-3">
              <h3 className="text-[15px] leading-tight font-light text-white sm:text-base xl:text-2xl">
                {card.title}
              </h3>
              <p className="pr-6 text-[10px] leading-snug font-light text-[#82A8BD] sm:pr-8 sm:text-xs md:text-sm xl:text-lg">
                {card.description}
              </p>
            </div>
            <ArrowUpRight className="absolute right-4 bottom-4 h-6 w-6 text-[#23C0FF] opacity-0 transition-all duration-300 ease-out group-hover:scale-100 group-hover:opacity-100 xl:h-8 xl:w-8" />
          </Link>
        ))}
      </div>
    </div>
  );
}
