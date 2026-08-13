import React from "react";
import { InfoIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";

interface InfoTooltipProps {
  delayDuration?: number;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  icon?: React.ReactNode;
  trigger?: React.ReactElement; // Alternative to icon - when provided, used directly as trigger with asChild
  className?: string;
  iconClassName?: string;
  skipProvider?: boolean; // Allow skipping provider if parent already has one
}

const InfoTooltip: React.FC<InfoTooltipProps> = ({
  delayDuration = 0,
  children,
  side = "top",
  icon,
  trigger,
  className,
  iconClassName,
  skipProvider = false,
}) => {
  // If trigger is provided, use it directly with asChild to avoid nesting
  if (trigger) {
    const tooltipContent = (
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent
          side={side}
          className={cn(
            "z-[10002] border border-[#0F1F30] bg-[#041223] px-3 py-1 text-white",
            className,
          )}
        >
          {children}
        </TooltipContent>
      </Tooltip>
    );

    if (skipProvider) {
      return tooltipContent;
    }

    return (
      <TooltipProvider delayDuration={delayDuration}>
        {tooltipContent}
      </TooltipProvider>
    );
  }

  // Check if icon contains a Button component anywhere in its tree
  // This helps avoid nesting buttons
  const checkContainsButton = (element: React.ReactNode): boolean => {
    if (!React.isValidElement(element)) return false;

    // Check if element itself is a button
    if (element.type === "button") return true;

    // Check if element is a Button component
    if (typeof element.type === "function") {
      const compType = element.type as { displayName?: string; name?: string };
      if (compType.displayName === "Button" || compType.name === "Button") {
        return true;
      }
    }

    // Recursively check children
    const props = element.props as { children?: React.ReactNode };
    if (props?.children) {
      const children = React.Children.toArray(props.children);
      return children.some((child) =>
        checkContainsButton(child as React.ReactNode),
      );
    }

    return false;
  };

  const containsButton = checkContainsButton(icon);
  const isReactElement = React.isValidElement(icon);

  const tooltipContent = (
    <Tooltip>
      <TooltipTrigger asChild={isReactElement || containsButton}>
        {!icon ? (
          <InfoIcon
            className={cn("size-3 cursor-pointer opacity-80", iconClassName)}
          />
        ) : containsButton ? (
          // If icon contains a Button, wrap it in a div and use asChild
          // This way TooltipTrigger merges with div (not creating a button wrapper)
          // Result: div > Button (no nested buttons)
          <div className="inline-flex cursor-pointer">{icon}</div>
        ) : isReactElement ? (
          // If it's a React element without Button, use asChild to merge props
          icon
        ) : (
          <span className="inline-flex cursor-pointer">{icon}</span>
        )}
      </TooltipTrigger>
      <TooltipContent
        side={side}
        className={cn(
          "z-[10002] border border-[#0F1F30] bg-[#041223] px-3 py-1 text-white",
          className,
        )}
      >
        {children}
      </TooltipContent>
    </Tooltip>
  );

  if (skipProvider) {
    return tooltipContent;
  }

  return (
    <TooltipProvider delayDuration={delayDuration}>
      {tooltipContent}
    </TooltipProvider>
  );
};

export default InfoTooltip;
