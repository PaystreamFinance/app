import Image from "next/image";
import React from "react";

import { cn } from "@/lib/utils";

interface FullLogoProps {
  className?: string;
}

const FullLogo: React.FC<FullLogoProps> = ({ className }) => {
  return (
    <Image
      className={cn("h-32 w-32 shrink-0 rounded-full select-none", className)}
      src="/full-logo.svg"
      width={620}
      height={620}
      alt="logo"
      priority
    />
  );
};

export default FullLogo;
