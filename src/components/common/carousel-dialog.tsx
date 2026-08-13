import React from "react";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface CarouselDialogProps {
  carouselItems: {
    title: string;
    description: React.ReactNode;
    image: string;
  }[];
  dialogTrigger?: React.ReactNode;
  noNumberPoints?: boolean;
  autoOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const CarouselDialogComponent: React.FC<CarouselDialogProps> = ({
  carouselItems,
  dialogTrigger,
  noNumberPoints = false,
  autoOpen = false,
  onOpenChange,
}) => {
  const [open, setOpen] = React.useState(autoOpen);
  const [api, setApi] = React.useState<CarouselApi>();
  const [current, setCurrent] = React.useState(0);
  const [count, setCount] = React.useState(0);
  const [loadingImages, setLoadingImages] = React.useState<Set<number>>(
    new Set(),
  );

  // Prefetch all carousel images so they're in browser cache before dialog opens
  const prefetchImages = React.useCallback(() => {
    carouselItems.forEach((item) => {
      const img = new window.Image();
      img.src = item.image;
    });
  }, [carouselItems]);

  // Prefetch on mount so images start loading as soon as component is in the tree
  React.useEffect(() => {
    prefetchImages();
  }, [prefetchImages]);

  // Handle auto-open prop changes
  React.useEffect(() => {
    if (autoOpen) {
      setOpen(true);
    }
  }, [autoOpen]);

  // Handle open state changes with callback
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (onOpenChange) {
      onOpenChange(newOpen);
    }
  };

  const canScrollPrev = api?.canScrollPrev() ?? false;
  const canScrollNext = api?.canScrollNext() ?? false;

  React.useEffect(() => {
    if (!api) return;

    setCount(api.scrollSnapList().length);
    setCurrent(api.selectedScrollSnap() + 1);

    api.on("select", () => {
      setCurrent(api.selectedScrollSnap() + 1);
    });
  }, [api]);

  const handleImageLoad = (index: number) => {
    setLoadingImages((prev) => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  };

  React.useEffect(() => {
    setLoadingImages(new Set(carouselItems.map((_, index) => index)));
  }, [carouselItems]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {dialogTrigger && (
        <DialogTrigger
          asChild
          onMouseEnter={prefetchImages}
          onFocus={prefetchImages}
        >
          {dialogTrigger}
        </DialogTrigger>
      )}

      <DialogContent className="max-w-[541px] bg-[#031B37] p-0" closeIcon>
        <DialogTitle></DialogTitle>
        <Carousel setApi={setApi}>
          <div className="relative flex w-full max-w-[541px] flex-col gap-2">
            <div className="absolute -bottom-16 left-0 flex w-full items-center gap-2.5">
              <Button
                onClick={() => api?.scrollPrev()}
                className="group h-10! w-full cursor-pointer border border-[#142234] bg-[#041223] text-[#BCEAFF]! transition-all hover:bg-[#04122380]"
                disabled={!canScrollPrev}
                type="button"
              >
                <ArrowLeft className="text-[#BCEAFF] transition-all group-hover:-translate-x-1" />
                Back
              </Button>
              <Button
                onClick={() => {
                  if (canScrollNext) {
                    api?.scrollNext();
                  } else {
                    setOpen(false);
                  }
                }}
                className="group h-10! w-full cursor-pointer border-0 bg-[#BCEAFF] text-[#041223] transition-all hover:bg-[#BCEAFF80]"
                type="button"
              >
                {canScrollNext ? "Next" : "Finish"}
                {canScrollNext && (
                  <ArrowRight className="text-[#041223] transition-all group-hover:translate-x-1" />
                )}
              </Button>
            </div>

            <div className="absolute -bottom-24 left-[44%] flex w-full items-center gap-1">
              {carouselItems.map((_, index) => (
                <div
                  key={index}
                  onClick={() => api?.scrollTo(index)}
                  className={cn(
                    "size-2 cursor-pointer rounded-full bg-[#5E7C8E] transition-all duration-250",
                    {
                      "w-7 bg-[#BCEAFF]": index === current - 1,
                    },
                  )}
                />
              ))}
            </div>

            <CarouselContent className="h-fit">
              {carouselItems.map((item, index) => (
                <CarouselItem key={index} className="flex flex-col gap-3">
                  <div className="w-fit rounded-t-xl">
                    <div className="relative">
                      {loadingImages.has(index) && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-t-xl bg-[#031B37]">
                          <Loader2 className="h-8 w-8 animate-spin text-[#BCEAFF]" />
                        </div>
                      )}
                      <Image
                        src={item.image}
                        alt={item.title}
                        className="rounded-t-xl border-b border-[#36495F] object-cover"
                        width={541}
                        height={100}
                        priority={index === 0}
                        unoptimized
                        onLoad={() => handleImageLoad(index)}
                        onError={() => handleImageLoad(index)}
                      />
                    </div>
                    <div className="flex h-fit max-w-[500px] flex-col items-start gap-2 px-10 py-3.5 pt-5">
                      <h3 className="text-lg font-light text-white">
                        {noNumberPoints ? "" : `${index + 1}. `} {item.title}
                      </h3>
                      {item.description}
                    </div>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
          </div>
        </Carousel>
      </DialogContent>
    </Dialog>
  );
};

export default CarouselDialogComponent;
