/* eslint-disable @next/next/no-img-element */
"use client";

import { CheckIcon } from "lucide-react";
import React from "react";

import { cn, shortAddress } from "@/lib/utils";

interface CopyIconProps {
  text: string;
  className?: string;
  isShortAddress?: boolean;
  hideText?: boolean;
}

const CopyIcon: React.FC<CopyIconProps> = ({
  text,
  className,
  isShortAddress = false,
  hideText = false,
}) => {
  const [isCopied, setIsCopied] = React.useState(false);

  const handleCopy = () => {
    if (text) {
      navigator.clipboard.writeText(text);
      setIsCopied(true);
    }

    setTimeout(() => {
      setIsCopied(false);
    }, 2000);
  };

  return (
    <span
      className={cn(
        "flex items-center gap-2 text-xs font-normal text-white",
        className,
      )}
    >
      {!hideText && (isShortAddress ? shortAddress(text) : text)}

      {isCopied ? (
        <CheckIcon className="size-3 text-[#BBEBFF] transition-all" />
      ) : (
        <img
          src="/copy.svg"
          alt="copy"
          className="size-3 cursor-pointer transition-all hover:brightness-150"
          onClick={handleCopy}
        />
      )}
    </span>
  );
};

export default CopyIcon;
