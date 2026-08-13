import type { TokenMetadata } from "@/lib/token-metadata-cache";

export interface DiscoverAndPoolTableType {
  id: string;
  pools: {
    poolName: string;
    poolUrl: string;
    poolX: string;
    poolY?: string;
    poolImgUrl: string;
  };
  tokenInfo: {
    type?: string;
    binStep?: number | string;
    rank?: string;
    priceChange24hPercent?: string;
    baseFeePercentage?: number | string;
    feeTvlRatio?: number | string;
    bondingCurveProgress?: number | string;
    aprPercent?: number;
    aprPeriodLabel?: string;
  };
  trend?: string;
  marketCap: string;
  liquidity: string;
  tvlRaw?: number;
  fees?: string;
  volume?: string;
  binStep?: number | string;
  baseFeePercentage?: string;
  tokenXMetadata?: TokenMetadata | null;
  tokenYMetadata?: TokenMetadata | null;
  tokenXMint?: string;
  tokenYMint?: string;
  subPools?: DiscoverAndPoolTableType[];
  subPoolsLengh?: number;
  pool_count?: number; // Pool count from API (DLMM/DAMM v2 groups)
  hasSubPools?: boolean;
  rawPairs?: any[]; // NEW: Store raw pairs data for lazy loading sub-pools
  // New fields for enhanced table columns
  feeTvl?: number | string; // Fee/TVL ratio
  feeVelocity?: number | string; // Fee Velocity percentage
  swapFreq?: number | string; // Swap Frequency (per hour)
  lincolnScore?: string | null; // Lincoln Score = Swap Frequency × Fee Rate
  gamma?: "Low" | "Medium" | "High"; // Volatility risk level (kept as gamma for backward compatibility)
  volatility?: string; // Formatted volatility percentage (e.g., "2.45%")
  exit?: "Low" | "Medium" | "High"; // Exit level
}

export interface PortoflioTableType {
  id: string;
  pools: {
    poolName: string;
    poolUrl: string;
    poolX: string;
    poolY?: string;
    poolImgUrl: string;
  };
  tokenInfo: {
    type: string;
  };
  trend?: string;
  marketCap: string;
  liquidityHealth: string;
  feesEarned: string;
  PnL: string;
  tokenXMetadata?: TokenMetadata | null;
  tokenYMetadata?: TokenMetadata | null;
}
