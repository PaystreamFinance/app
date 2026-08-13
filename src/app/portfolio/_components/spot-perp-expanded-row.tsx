"use client";

import { formatUSD } from "@/lib/utils";
import type { SpotPerpPositionRowType } from "./spot-perp-positions-columns";

const PROTOCOL_ICONS: Record<string, string> = {
  drift: "/images/markets-logo/drift.webp",
  flash: "/images/markets-logo/drift.webp",
  pacifica: "/images/markets-logo/pacifica.webp",
  hyperliquid: "/images/markets-logo/hype.webp",
  aster: "/images/markets-logo/aster.webp",
  lighter: "/images/markets-logo/lighter.webp",
  "01": "/images/markets-logo/01.webp",
};

interface SpotPerpExpandedRowProps {
  row: SpotPerpPositionRowType;
}

const SpotPerpExpandedRow: React.FC<SpotPerpExpandedRowProps> = ({ row }) => {
  const createdDate = row.createdAt ? new Date(row.createdAt) : null;
  const daysHeld = createdDate
    ? Math.max(
        1,
        Math.floor(
          (Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24),
        ),
      )
    : null;

  const gainLoss = row.spotUsd - row.perpMarginUsd;
  const rawAmt = parseFloat(row.spotAmount || "0");
  const spotAmt = rawAmt / Math.pow(10, row.spotDecimals);
  const currentPrice = spotAmt > 0 ? row.spotUsd / spotAmt : null;

  return (
    <div className="bg-[#0D1E31]">
      <div
        className="mx-8 h-px opacity-20"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to right, #7192A5 0, #7192A5 6px, transparent 6px, transparent 14px)",
        }}
      />
      <div className="grid grid-cols-2 gap-8 bg-[#0D1E31] px-8 py-5">
        {/* SPOT section */}
        <div>
          <div className="mb-3 flex h-8 items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-block size-2 rounded-full bg-[#4ADE80]" />
              <span className="text-sm font-medium text-[#4ADE80]">SPOT</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                {PROTOCOL_ICONS[row.perpProtocol] && (
                  <img
                    src={PROTOCOL_ICONS[row.perpProtocol]}
                    alt={row.perpProtocol}
                    className="size-4"
                  />
                )}
                <span className="text-sm font-medium text-white capitalize">
                  {row.perpProtocol}
                </span>
              </div>
            </div>
          </div>
          <div className="mb-4 h-px bg-[#7192A5] opacity-20" />
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#7192A5]">Entry price</span>
              <span className="text-white">
                {row.perpEntryPrice !== 0
                  ? `$${row.perpEntryPrice}`
                  : "N/A"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#7192A5]">Current price</span>
              <span className="text-white">
                {currentPrice !== null ? `$${currentPrice}` : "N/A"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#7192A5]">Holdings</span>
              <span className="text-white">
                {spotAmt > 0
                  ? `${spotAmt < 0.01 ? spotAmt.toPrecision(3) : spotAmt.toFixed(2)} ${row.asset.replace("-PERP", "")}`
                  : "N/A"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#7192A5]">Position Value</span>
              <span className="text-white">{formatUSD(row.spotUsd)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#7192A5]">Gain/Loss</span>
              <span
                className={gainLoss >= 0 ? "text-[#4ADE80]" : "text-[#FF6B6B]"}
              >
                {gainLoss >= 0 ? "" : "-"}
                {formatUSD(Math.abs(gainLoss))}
              </span>
            </div>
          </div>
        </div>

        {/* Details section */}
        <div>
          <div className="mb-3 flex h-8 items-center justify-start">
            <span className="text-base font-light text-[#7192A5]">Details</span>
          </div>
          <div className="mb-4 h-px bg-[#7192A5] opacity-20" />
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#7192A5]">Entry date</span>
              <span className="text-white">
                {createdDate
                  ? createdDate.toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "numeric",
                      year: "numeric",
                    })
                  : "N/A"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#7192A5]">Days held</span>
              <span className="text-white">
                {daysHeld !== null ? `${daysHeld} days` : "N/A"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#7192A5]">Duration</span>
              <span className="text-white">Active</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#7192A5]">Margin used</span>
              <span className="text-white">{formatUSD(row.perpMarginUsd)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SpotPerpExpandedRow;
