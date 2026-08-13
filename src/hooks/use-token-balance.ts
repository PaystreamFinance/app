import { useState, useEffect, useCallback, useRef } from "react";
import { PublicKey } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
  getMint,
} from "@solana/spl-token";
import { getConnection } from "@/lib/solana-connection";
import { BALANCE_REFRESH_EVENT } from "@/lib/balance-refresh";
import { useWallets } from "@privy-io/react-auth/solana";

const SOL_MINT_ADDRESS = "So11111111111111111111111111111111111111112";
const LAMPORTS_PER_SOL = 1_000_000_000;

export interface TokenBalanceData {
  balance: number | null;
  price: number | null;
  usdValue: number | null;
  decimals: number;
  isLoading: boolean;
  refetch: () => Promise<void>;
}

export function useTokenBalance(
  mintAddress: string | undefined,
): TokenBalanceData {
  const { wallets } = useWallets();
  const [balance, setBalance] = useState<number | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [decimals, setDecimals] = useState<number>(9);
  const [isLoading, setIsLoading] = useState(false);

  const embeddedWalletAddress = wallets[0]?.standardWallet.accounts[0]?.address;
  const fetchFnRef = useRef<(() => Promise<void>) | null>(null);

  const fetchBalanceAndPrice = useCallback(async () => {
    if (!mintAddress || !embeddedWalletAddress) {
      // Don't clear balance if we're just waiting for wallet to be ready
      return;
    }

    setIsLoading(true);
    try {
      const connection = getConnection();
      const walletPubkey = new PublicKey(embeddedWalletAddress);
      const mintPubkey = new PublicKey(mintAddress);
      const isSOL = mintAddress === SOL_MINT_ADDRESS;

      let balanceValue: number | null = null;
      let decimalsValue = 9;

      if (isSOL) {
        const solBalance = await connection.getBalance(walletPubkey);
        balanceValue = solBalance / LAMPORTS_PER_SOL;
        decimalsValue = 9;
      } else {
        try {
          const mintInfo = await getMint(connection, mintPubkey);
          decimalsValue = mintInfo.decimals;

          const ata = await getAssociatedTokenAddress(mintPubkey, walletPubkey);
          const tokenAccount = await getAccount(connection, ata);
          balanceValue =
            Number(tokenAccount.amount) / Math.pow(10, decimalsValue);
        } catch (error) {
          // Token account might not exist yet, set balance to 0
          // Only set to 0 if we successfully got mint info, otherwise keep null
          balanceValue = 0;
        }
      }

      let nextPrice: number | null = null;
      try {
        const tokenPrice = await fetchTokenPrice(mintAddress);
        nextPrice = tokenPrice;
      } catch (priceError) {
        console.error("Failed to fetch token price:", priceError);
      }

      setDecimals(decimalsValue);
      setBalance(balanceValue);
      if (nextPrice !== null) {
        setPrice(nextPrice);
      }
    } catch (error) {
      console.error("Failed to fetch balance or price:", error);
      // Don't reset balance on error, keep previous value
    } finally {
      setIsLoading(false);
    }
  }, [mintAddress, embeddedWalletAddress]);

  // Store the latest fetch function in ref
  useEffect(() => {
    fetchFnRef.current = fetchBalanceAndPrice;
  }, [fetchBalanceAndPrice]);

  useEffect(() => {
    // Only fetch if we have both mintAddress and wallet
    if (!mintAddress || !embeddedWalletAddress) {
      return;
    }

    // Initial fetch — ongoing updates come from useBalanceSubscription via
    // the BALANCE_REFRESH_EVENT listener below (WebSocket-driven, no polling).
    if (fetchFnRef.current) {
      fetchFnRef.current();
    }
  }, [mintAddress, embeddedWalletAddress]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleBalanceRefresh = () => {
      if (fetchFnRef.current) {
        void fetchFnRef.current();
      }
    };

    window.addEventListener(BALANCE_REFRESH_EVENT, handleBalanceRefresh);
    return () => {
      window.removeEventListener(BALANCE_REFRESH_EVENT, handleBalanceRefresh);
    };
  }, []);

  const usdValue = balance !== null && price !== null ? balance * price : null;

  return {
    balance,
    price,
    usdValue,
    decimals,
    isLoading,
    refetch: fetchBalanceAndPrice,
  };
}

async function fetchTokenPrice(mintAddress: string): Promise<number> {
  try {
    const response = await fetch(
      `https://lite-api.jup.ag/price/v3?ids=${mintAddress}`,
    );
    if (!response.ok) {
      return 0;
    }
    const data = await response.json();
    const price = data?.[mintAddress]?.usdPrice;
    if (typeof price === "number" && price > 0) {
      return price;
    }
    return 0;
  } catch (error) {
    console.error("Failed to fetch token price:", error);
    return 0;
  }
}
