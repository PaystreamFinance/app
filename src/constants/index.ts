import type { DiscoverAndPoolTableType } from "@/components/discover/types";

export const SOL_HEADER_INDEX = 0;
export const USDC_HEADER_INDEX = 1;

export const POSITIONS_REFRESH_INTERVAL = 10000; // 10 seconds

export const POOL_PAGE_ITEMS: DiscoverAndPoolTableType[] = Array.from(
  { length: 100 },
  (_, idx) => {
    const hasSubPools = true;

    const basePool: DiscoverAndPoolTableType = {
      id: idx.toString(),
      pools: {
        poolName: `Pays-Usdc`,
        poolUrl: `pool ${idx + 1}`,
        poolX: `pool ${idx + 1}`,
        poolImgUrl: `/discover/pool-img-url.svg`,
      },
      binStep: "10",
      baseFeePercentage: "20",
      tokenInfo: {
        type: `DLMM ${idx + 1}`,
        binStep: "30",
        baseFeePercentage: "20",
      },
      marketCap: `1.2M`,
      liquidity: `232k`,
      fees: `99k`,
      hasSubPools,
    };

    if (hasSubPools) {
      basePool.subPools = [
        {
          id: `${idx}-sub-1`,
          pools: {
            poolName: `Pays-Usdc sub-pool-1`,
            poolUrl: `sub-pool ${idx + 1}-1`,
            poolX: `sub-pool ${idx + 1}-1`,
            poolImgUrl: `/discover/pool-img-url.svg`,
          },
          tokenInfo: {
            type: `DLMM`,
            binStep: "30",
            baseFeePercentage: "20",
          },
          baseFeePercentage: "20",
          marketCap: `1.2M`,
          liquidity: `232k`,
          fees: `99k`,
          hasSubPools: false,
          binStep: "230",
        },
        {
          id: `${idx}-sub-2`,
          pools: {
            poolName: `Pays-Usdc sub-pool-2`,
            poolUrl: `sub-pool ${idx + 1}-2`,
            poolX: `sub-pool ${idx + 1}-2`,
            poolImgUrl: `/discover/pool-img-url.svg`,
          },
          binStep: "20",
          tokenInfo: {
            type: `DLMM`,
            binStep: "20",
            baseFeePercentage: "20",
          },
          baseFeePercentage: "20",
          marketCap: `1.2M`,
          liquidity: `232k`,
          fees: `99k`,
          hasSubPools: false,
        },
      ];
    }

    return basePool;
  },
);
