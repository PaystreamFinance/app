/* eslint-disable @next/next/no-img-element */
import type { ColumnDef } from "@tanstack/react-table";

import type { PortoflioTableType } from "@/components/discover/types";

export const portfolioColumn: ColumnDef<PortoflioTableType>[] = [
  {
    accessorKey: "pools",
    header: () => (
      <p className="ml-10 text-xs font-normal tracking-[-1%] text-[#7092A5]">
        Pools
      </p>
    ),
    cell: ({ row }) => {
      const pools = row.original.pools;

      return (
        <div className="flex w-fit items-center gap-2">
          <div className="flex items-center -space-x-4">
            {pools?.poolImgUrl && (
              <img
                src={pools.poolImgUrl}
                alt={pools.poolName}
                className="h-10 w-10 shrink-0 rounded-full border-2 border-[#0F1F30]"
              />
            )}
            {pools?.poolY && (
              <img
                src={pools.poolY}
                alt={pools.poolName}
                className="h-10 w-10 shrink-0 rounded-full border-2 border-[#0F1F30]"
              />
            )}
          </div>

          <div className="flex flex-col items-start gap-0.5">
            <span className="text-base font-normal tracking-[-1%] text-white">
              {pools.poolName}
            </span>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "tokenInfo",
    header: () => (
      <p className="text-xs font-normal tracking-[-1%] text-[#7092A5]">
        Token info
      </p>
    ),
    cell: ({ getValue, row }) => {
      const tokenInfo = getValue() as PortoflioTableType["tokenInfo"];

      return (
        <div className="flex w-[200px] items-center gap-2">
          <span className="rounded-sm bg-[#211021] px-1.5 py-1 text-xs font-medium text-[#BD6CDD]">
            {tokenInfo.type}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "marketCap",
    header: () => (
      <p className="text-xs font-normal tracking-[-1%] text-[#7092A5]">
        Market cap
      </p>
    ),
    cell: ({ getValue }) => {
      const marketCap = getValue() as string;

      return (
        <div className="flex w-[100px] items-center gap-2">
          <span className="text-[14px] font-light text-white">{marketCap}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "liquidityHealth",
    header: () => (
      <p className="text-xs font-normal tracking-[-1%] text-[#7092A5]">
        Liq. Health
      </p>
    ),
    cell: ({ getValue }) => {
      const liquidity = getValue() as string;

      return (
        <div className="flex w-[100px] items-center gap-2">
          <span className="text-[14px] font-light text-[#7092A5]">
            {liquidity}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "feesEarned",
    header: () => (
      <p className="text-xs font-normal tracking-[-1%] text-[#7092A5]">
        Fees Earned
      </p>
    ),
    cell: ({ getValue }) => {
      const fees = getValue() as string;

      return (
        <div className="flex w-[100px] items-center gap-2">
          <span className="text-[14px] font-light text-[#7092A5]">{fees}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "PnL",
    header: () => (
      <p className="text-xs font-normal tracking-[-1%] text-[#7092A5]">PnL</p>
    ),
    cell: ({ getValue }) => {
      const fees = getValue() as string;

      return (
        <div className="flex w-[100px] items-center gap-2">
          <span className="text-[14px] font-light text-[#7092A5]">{fees}</span>
        </div>
      );
    },
  },
  {
    id: "action",
    header: () => (
      <p className="text-xs font-normal tracking-[-1%] text-[#7092A5]">
        Action
      </p>
    ),
    cell: ({ row }) => {
      return (
        <div className="flex w-[100px] items-center gap-2">
          <span className="text-[14px] font-light text-[#7092A5]">action</span>
        </div>
      );
    },
  },
];
