"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-[10000] bg-black/80 backdrop-blur-[2px]",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

function BottomSheetDragHandle({ onClose }: { onClose: () => void }) {
  const dragRef = React.useRef<{ startY: number; currentY: number } | null>(null);
  const containerRef = React.useRef<HTMLElement | null>(null);

  const onTouchStart = React.useCallback((e: React.TouchEvent) => {
    dragRef.current = { startY: e.touches[0]!.clientY, currentY: 0 };
    containerRef.current = (e.currentTarget as HTMLElement).closest("[data-slot='dialog-content']") as HTMLElement;
  }, []);

  const onTouchMove = React.useCallback((e: React.TouchEvent) => {
    if (!dragRef.current || !containerRef.current) return;
    const dy = Math.max(0, e.touches[0]!.clientY - dragRef.current.startY);
    dragRef.current.currentY = dy;
    containerRef.current.style.transform = `translateY(${dy}px)`;
    containerRef.current.style.transition = "none";
  }, []);

  const onTouchEnd = React.useCallback(() => {
    if (!dragRef.current || !containerRef.current) return;
    const dy = dragRef.current.currentY;
    if (dy > 100) {
      containerRef.current.style.transition = "transform 200ms ease-out";
      containerRef.current.style.transform = "translateY(100%)";
      setTimeout(onClose, 200);
    } else {
      containerRef.current.style.transition = "transform 200ms ease-out";
      containerRef.current.style.transform = "translateY(0)";
      // Clean up inline styles after snap-back animation
      setTimeout(() => {
        if (containerRef.current) {
          containerRef.current.style.transform = "";
          containerRef.current.style.transition = "";
        }
      }, 200);
    }
    dragRef.current = null;
  }, [onClose]);

  return (
    <div
      className="mx-auto -mt-2 mb-1 flex w-full cursor-grab touch-none items-center justify-center py-3 active:cursor-grabbing"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      aria-label="Drag down to close"
    >
      <div className="h-1.5 w-12 rounded-full bg-[#7192A5]/40" />
    </div>
  );
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    closeIcon?: React.ReactNode;
    variant?: "default" | "bottom-sheet";
    onDismiss?: () => void;
  }
>(({ className, children, closeIcon, variant = "default", onDismiss, ...props }, ref) => {
  const closeRef = React.useRef<HTMLButtonElement>(null);

  const handleDragClose = React.useCallback(() => {
    if (onDismiss) {
      onDismiss();
    } else {
      closeRef.current?.click();
    }
  }, [onDismiss]);

  return (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      data-slot="dialog-content"
      className={cn(
        "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed z-[10001] grid w-full gap-4 border p-6 shadow-lg duration-300",
        variant === "bottom-sheet"
          ? "data-[state=open]:slide-in-from-bottom-full data-[state=closed]:slide-out-to-bottom-full inset-x-0 bottom-0 max-w-full rounded-t-2xl"
          : "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 top-[50%] left-[50%] max-w-lg translate-x-[-50%] translate-y-[-50%]",
        className,
      )}
      {...props}
    >
      <DialogPrimitive.Title className="hidden"></DialogPrimitive.Title>
      {variant === "bottom-sheet" && (
        <BottomSheetDragHandle onClose={handleDragClose} />
      )}
      {children}
      {!closeIcon && variant !== "bottom-sheet" && (
        <DialogPrimitive.Close ref={closeRef} className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:pointer-events-none">
          <X className="h-4 w-4 text-[#9CE0FF]" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
      {closeIcon && variant !== "bottom-sheet" && (
        <DialogPrimitive.Close ref={closeRef}>{closeIcon}</DialogPrimitive.Close>
      )}
      {variant === "bottom-sheet" && (
        <DialogPrimitive.Close ref={closeRef} className="sr-only">Close</DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className,
    )}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className,
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg leading-none font-semibold tracking-tight",
      className,
    )}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-muted-foreground text-sm", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
