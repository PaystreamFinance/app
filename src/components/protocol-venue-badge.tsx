/**
 * ProtocolVenueBadge — tiny visual atom for rendering "the venue".
 * Returns the protocol's logo image. Used in pair-row subtitles, trade-modal
 * leg subtitles, and venue pickers.
 */

import * as React from "react";

import { cn } from "@/lib/utils";
import { getProtocolLabel, getProtocolLogo } from "@/lib/protocol-registry";

interface Props {
  protocol: string;
  /** Tailwind sizing for the logo (e.g. "size-3", "size-4"). */
  className?: string;
}

export function ProtocolVenueBadge({ protocol, className }: Props) {
  return (
    <img
      src={getProtocolLogo(protocol)}
      alt={getProtocolLabel(protocol)}
      className={cn("rounded-full", className ?? "size-3")}
      loading="lazy"
      decoding="async"
    />
  );
}
