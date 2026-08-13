export interface JupiterAsset {
  id: string;
  name: string;
  symbol: string;
  icon: string;
  decimals: number;
  twitter?: string;
  website?: string;
  dev?: string;
  circSupply: number;
  totalSupply: number;
  tokenProgram: string;
  mintAuthority?: string;
  firstPool: {
    id: string;
    createdAt: string;
  };
  holderCount: number;
  audit: {
    mintAuthorityDisabled?: boolean;
    freezeAuthorityDisabled?: boolean;
    topHoldersPercentage: number;
    highSingleOwnership?: boolean;
  };
  apy?: {
    jupEarn?: number;
  };
  organicScore: number;
  organicScoreLabel: string;
  isVerified: boolean;
  tags: string[];
  createdAt: string;
  fdv: number;
  mcap: number;
  usdPrice: number;
  priceBlockId: number;
  liquidity: number;
  stats5m?: Stats;
  stats1h?: Stats;
  stats6h?: Stats;
  stats24h?: Stats;
  stats7d?: {
    priceChange: number;
  };
  stats30d?: {
    priceChange: number;
  };
  ctLikes: number;
  smartCtLikes: number;
  updatedAt: string;
}

export interface Stats {
  priceChange?: number;
  holderChange?: number;
  liquidityChange?: number;
  volumeChange?: number;
  buyVolume: number;
  sellVolume: number;
  buyOrganicVolume?: number;
  sellOrganicVolume?: number;
  numBuys: number;
  numSells: number;
  numTraders: number;
  numOrganicBuyers?: number;
  numNetBuyers?: number;
}

export interface SearchAssetsResponse {
  assets: JupiterAsset[];
  count: number;
}

export interface TPSLParams {
  // Take Profit PNL threshold (in USD)
  tp_pnl?: number;

  // Stop Loss PNL threshold (in USD)
  sl_pnl?: number;

  // TP/SL type: "price" or "pnl"
  type?: "price" | "pnl";
}
