import React from "react";

import { cn } from "@/lib/utils";

interface ThunderIconProps {
  className?: string;
}

export const ThunderIcon: React.FC<ThunderIconProps> = ({ className }) => {
  return (
    <svg
      width="11"
      height="12"
      viewBox="0 0 11 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-4", className)}
    >
      <path
        d="M5.86178 0.414464C5.90732 0.0501866 5.44956 -0.148522 5.21454 0.133502L0.0860031 6.28775C-0.113546 6.5272 0.0567328 6.89075 0.368438 6.89075H4.95747C5.17861 6.89075 5.34971 7.08457 5.32228 7.304L4.88609 10.7935C4.84056 11.1578 5.29832 11.3565 5.53333 11.0745L10.6619 4.92023C10.8614 4.68078 10.6911 4.31722 10.3794 4.31722H5.7904C5.56926 4.31722 5.39816 4.12341 5.42559 3.90398L5.86178 0.414464Z"
        fill="currentColor"
      />
    </svg>
  );
};
