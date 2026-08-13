import { useState, useEffect, useCallback } from "react";
import { PublicKey } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getMint,
  unpackAccount,
} from "@solana/spl-token";
import { getConnection } from "@/lib/solana-connection";
import { useWallets } from "@privy-io/react-auth/solana";
import { fetchMultipleTokenMetadata } from "@/lib/token-metadata-cache";
import { BALANCE_REFRESH_EVENT } from "@/lib/balance-refresh";

const LAMPORTS_PER_SOL = 1_000_000_000;
const SOL_MINT_ADDRESS = "So11111111111111111111111111111111111111112";

export interface TokenBalance {
  mint: string;
  balance: number;
  /** Raw amount in base units (smallest unit) - use for swap quote to avoid residue */
  rawAmount?: string;
  decimals: number;
  price: number | null;
  usdValue: number | null;
  symbol?: string;
  name?: string;
  icon?: string;
}

export interface AllTokenBalancesData {
  tokens: TokenBalance[];
  totalUsdValue: number;
  isLoading: boolean;
  refetch: () => void;
}

async function fetchTokenPrices(
  mintAddresses: string[],
): Promise<Map<string, number>> {
  if (mintAddresses.length === 0) return new Map();

  try {
    const ids = mintAddresses.join(",");
    const response = await fetch(`https://lite-api.jup.ag/price/v3?ids=${ids}`);
    if (!response.ok) {
      throw new Error(`Jupiter API failed: ${response.status}`);
    }
    const data = await response.json();
    const priceMap = new Map<string, number>();

    for (const mint of mintAddresses) {
      const price = data?.[mint]?.usdPrice;
      if (typeof price === "number" && price > 0) {
        priceMap.set(mint, price);
      }
    }

    return priceMap;
  } catch (error) {
    console.error("Failed to fetch token prices:", error);
    return new Map();
  }
}

export function useAllTokenBalances(): AllTokenBalancesData {
  const { wallets } = useWallets();
  const [tokens, setTokens] = useState<TokenBalance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  const embeddedWalletAddress = wallets[0]?.standardWallet.accounts[0]?.address;

  useEffect(() => {
    let isCancelled = false;

    const fetchAllBalances = async () => {
      if (!embeddedWalletAddress) {
        setTokens([]);
        return;
      }

      setIsLoading(true);
      try {
        const connection = getConnection();
        const walletPubkey = new PublicKey(embeddedWalletAddress);

        // Fetch SOL balance
        const solBalance = await connection.getBalance(walletPubkey);
        const solBalanceValue = solBalance / LAMPORTS_PER_SOL;

        // Fetch all token accounts (both Token Program and Token-2022)
        const [tokenAccounts, token2022Accounts] = await Promise.all([
          connection.getTokenAccountsByOwner(walletPubkey, {
            programId: TOKEN_PROGRAM_ID,
          }),
          connection.getTokenAccountsByOwner(walletPubkey, {
            programId: TOKEN_2022_PROGRAM_ID,
          }),
        ]);

        // Combine all token accounts with their program IDs
        const allTokenAccounts = [
          ...tokenAccounts.value.map((acc) => ({
            account: acc,
            programId: TOKEN_PROGRAM_ID,
          })),
          ...token2022Accounts.value.map((acc) => ({
            account: acc,
            programId: TOKEN_2022_PROGRAM_ID,
          })),
        ];

        // Process token accounts to get balances and decimals
        const tokenDataPromises = allTokenAccounts.map(
          async ({ account, programId }) => {
            try {
              let mintAddress: string;
              let amount: string;
              let decimals: number;

              // Try to get parsed data first
              const parsed =
                account.account.data && "parsed" in account.account.data
                  ? (
                      account.account.data as {
                        parsed: {
                          info: {
                            mint: string;
                            tokenAmount: { amount: string; decimals: number };
                          };
                        };
                      }
                    ).parsed
                  : null;

              if (parsed) {
                mintAddress = parsed.info.mint;
                amount = parsed.info.tokenAmount.amount;
                decimals = parsed.info.tokenAmount.decimals;
              } else {
                // If not parsed, unpack the account data manually
                try {
                  const unpacked = unpackAccount(
                    account.pubkey,
                    account.account,
                    programId,
                  );
                  mintAddress = unpacked.mint.toString();
                  amount = unpacked.amount.toString();
                  // We'll need to fetch decimals from the mint
                  decimals = 9; // Temporary, will be updated below
                } catch (unpackError) {
                  console.warn(
                    "️[useAllTokenBalances] Failed to unpack token account:",
                    account.pubkey.toString(),
                    unpackError,
                  );
                  return null;
                }
              }

              // Get mint info to verify decimals
              let mintDecimals = decimals;
              try {
                const mintPubkey = new PublicKey(mintAddress);
                const mintInfo = await getMint(
                  connection,
                  mintPubkey,
                  undefined,
                  programId,
                );
                mintDecimals = mintInfo.decimals;
              } catch (error) {
                // Use decimals from account if mint fetch fails
              }

              const balance = Number(amount) / Math.pow(10, mintDecimals);

              return {
                mint: mintAddress,
                balance,
                rawAmount: amount,
                decimals: mintDecimals,
              };
            } catch (error) {
              console.error("Error processing token account:", error);
              return null;
            }
          },
        );

        const tokenData = (await Promise.all(tokenDataPromises)).filter(
          (
            data,
          ): data is {
            mint: string;
            balance: number;
            rawAmount: string;
            decimals: number;
          } => data !== null && data.balance > 0,
        );

        // Add SOL if balance > 0
        const allMints =
          solBalanceValue > 0
            ? [SOL_MINT_ADDRESS, ...tokenData.map((t) => t.mint)]
            : tokenData.map((t) => t.mint);

        // Fetch prices and metadata for all tokens
        const [priceMap, metadataMap] = await Promise.all([
          fetchTokenPrices(allMints),
          fetchMultipleTokenMetadata(allMints),
        ]);

        // Build token balances array
        const tokenBalances: TokenBalance[] = [];

        // Add SOL
        if (solBalanceValue > 0) {
          const solPrice = priceMap.get(SOL_MINT_ADDRESS) || null;
          const solMetadata = metadataMap.get(SOL_MINT_ADDRESS);
          tokenBalances.push({
            mint: SOL_MINT_ADDRESS,
            balance: solBalanceValue,
            rawAmount: String(solBalance),
            decimals: 9,
            price: solPrice,
            usdValue: solPrice !== null ? solBalanceValue * solPrice : null,
            symbol: solMetadata?.symbol || "SOL",
            name: solMetadata?.name || "Solana",
            icon: solMetadata?.icon,
          });
        }

        // Add other tokens
        for (const token of tokenData) {
          const price = priceMap.get(token.mint) || null;
          const metadata = metadataMap.get(token.mint);
          tokenBalances.push({
            mint: token.mint,
            balance: token.balance,
            rawAmount: token.rawAmount,
            decimals: token.decimals,
            price,
            usdValue: price !== null ? token.balance * price : null,
            symbol: metadata?.symbol,
            name: metadata?.name,
            icon: metadata?.icon,
          });
        }

        // Sort by USD value (descending), then by balance
        tokenBalances.sort((a, b) => {
          const aValue = a.usdValue ?? 0;
          const bValue = b.usdValue ?? 0;
          if (aValue !== bValue) {
            return bValue - aValue;
          }
          return b.balance - a.balance;
        });

        if (!isCancelled) {
          setTokens(tokenBalances);
        }
      } catch (error) {
        if (!isCancelled) {
          console.error("Failed to fetch token balances:", error);
          setTokens([]);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchAllBalances();

    return () => {
      isCancelled = true;
    };
  }, [embeddedWalletAddress, refetchTrigger]);

  const refetch = useCallback(() => {
    setRefetchTrigger((prev: number) => prev + 1);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleBalanceRefresh = () => {
      refetch();
    };

    window.addEventListener(BALANCE_REFRESH_EVENT, handleBalanceRefresh);
    return () => {
      window.removeEventListener(BALANCE_REFRESH_EVENT, handleBalanceRefresh);
    };
  }, [refetch]);

  const totalUsdValue = tokens.reduce(
    (sum: number, token: TokenBalance) => sum + (token.usdValue ?? 0),
    0,
  );

  return {
    tokens,
    totalUsdValue,
    isLoading,
    refetch,
  };
}
