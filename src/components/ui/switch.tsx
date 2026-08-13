"use client";

import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> & {
    switchThumbClassName?: string;
  }
>(({ className, switchThumbClassName, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer focus-visible:ring-ring focus-visible:ring-offset-background inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-[#BBEBFF] data-[state=unchecked]:bg-[#0F1F30]",
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-[14px] w-[14px] rounded-full bg-[#BBEBFF] shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=checked]:bg-[#0F1F30] data-[state=unchecked]:translate-x-0.5",
        switchThumbClassName,
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
