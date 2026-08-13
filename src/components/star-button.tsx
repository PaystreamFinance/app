"use client";

import React from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth/solana";
import Image from "next/image";

import { api } from "@/trpc/react";
import { cn } from "@/lib/utils";
import { fetchMultipleTokenMetadata } from "@/lib/token-metadata-cache";

// Debounce ref to prevent multiple simultaneous getAllFavorites fetches
const getAllFavoritesFetchTimeoutRef: Record<string, NodeJS.Timeout | null> =
  {};

interface StarButtonProps {
  poolAddress: string;
  poolType: string; // 'dlmm', 'damm', 'raydium-standard', 'raydium-clmm', etc.
  className?: string;
  isFavorite?: boolean; // Optional: if provided, use this instead of querying
}

export const StarButton: React.FC<StarButtonProps> = ({
  poolAddress,
  poolType,
  className,
  isFavorite: isFavoriteProp,
}) => {
  const { authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const walletAddress = wallets[0]?.address || user?.wallet?.address || "";
  const utils: any = api.useUtils();

  // Only query if isFavorite prop is not provided (for backward compatibility)
  const { data: isFavoriteData } = (api as any).favorites.isFavorite.useQuery(
    {
      walletAddress,
      poolAddress,
    },
    {
      enabled: authenticated && !!walletAddress && isFavoriteProp === undefined,
      refetchOnWindowFocus: false,
    },
  );

  const toggleFavoriteMutation = (api as any).favorites.toggleFavorite.useMutation({
    // Optimistic update - update UI INSTANTLY when clicked
    onMutate: async () => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await utils.favorites.isFavorite.cancel({
        walletAddress,
        poolAddress,
      });
      await utils.favorites.getAllFavorites.cancel({ walletAddress });

      // Get current value and toggle it
      const previousData = utils.favorites.isFavorite.getData({
        walletAddress,
        poolAddress,
      });
      const newIsFavorite = !(previousData?.isFavorite ?? false);

      // Optimistically update isFavorite - this is INSTANT
      utils.favorites.isFavorite.setData(
        { walletAddress, poolAddress },
        {
          isFavorite: newIsFavorite,
          poolType: newIsFavorite ? poolType : null,
        },
      );

      // Optimistically update getAllFavorites list
      const currentFavorites = utils.favorites.getAllFavorites.getData({
        walletAddress,
      });

      if (currentFavorites) {
        if (newIsFavorite) {
          // Adding - check for duplicates first
          const alreadyExists = currentFavorites.some(
            (fav: any) => fav.poolAddress === poolAddress,
          );
          if (!alreadyExists) {
            utils.favorites.getAllFavorites.setData({ walletAddress }, [
              ...currentFavorites,
              {
                id: Date.now(),
                walletAddress,
                poolAddress,
                poolType,
                createdAt: new Date(),
              },
            ]);
          }
        } else {
          // Removing
          utils.favorites.getAllFavorites.setData(
            { walletAddress },
            currentFavorites.filter((fav: any) => fav.poolAddress !== poolAddress),
          );
        }
      }

      // Return the new state for reference (NOT for rollback)
      return { newIsFavorite };
    },

    // On error - DON'T rollback to previous state (causes race conditions)
    // Instead, just refetch to get the correct server state
    onError: () => {
      // Refetch to sync with server - this is safer than rollback
      void utils.favorites.isFavorite.invalidate({
        walletAddress,
        poolAddress,
      });
      void utils.favorites.getAllFavorites.invalidate({ walletAddress });
    },

    // On success - ensure cache matches server response
    onSuccess: (data: any) => {
      // Confirm the optimistic update with server data
      utils.favorites.isFavorite.setData(
        { walletAddress, poolAddress },
        {
          isFavorite: data.isFavorite,
          poolType: data.isFavorite ? poolType : null,
        },
      );

      // Update getAllFavorites to match
      const currentFavorites = utils.favorites.getAllFavorites.getData({
        walletAddress,
      });

      if (currentFavorites) {
        if (data.isFavorite) {
          const alreadyExists = currentFavorites.some(
            (fav: any) => fav.poolAddress === poolAddress,
          );
          if (!alreadyExists) {
            utils.favorites.getAllFavorites.setData({ walletAddress }, [
              ...currentFavorites,
              {
                id: Date.now(),
                walletAddress,
                poolAddress,
                poolType,
                createdAt: new Date(),
              },
            ]);
          }
        } else {
          utils.favorites.getAllFavorites.setData(
            { walletAddress },
            currentFavorites.filter((fav: any) => fav.poolAddress !== poolAddress),
          );
        }
      }

      // Debounced final sync to ensure eventual consistency
      if (getAllFavoritesFetchTimeoutRef[walletAddress]) {
        clearTimeout(getAllFavoritesFetchTimeoutRef[walletAddress]!);
      }
      getAllFavoritesFetchTimeoutRef[walletAddress] = setTimeout(() => {
        void utils.favorites.getAllFavorites.invalidate({ walletAddress });
        getAllFavoritesFetchTimeoutRef[walletAddress] = null;
      }, 500); // 500ms debounce for rapid clicks

      if (data.isFavorite) {
        void prefetchWatchlistData(poolAddress, poolType, utils);
      }
    },
  });

  // Use prop if provided, otherwise use query data
  const isFavorite = isFavoriteProp ?? isFavoriteData?.isFavorite ?? false;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!authenticated || !walletAddress) {
      return;
    }

    // Call mutate directly - onMutate fires INSTANTLY for optimistic UI
    toggleFavoriteMutation.mutate({
      walletAddress,
      poolAddress,
      poolType,
    });
  };

  if (!authenticated) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "flex cursor-pointer items-center justify-center transition-opacity hover:opacity-80",
        className,
      )}
    >
      {isFavorite ? (
        <Image
          src="/star-filled.svg"
          alt="Remove from favorites"
          width={20}
          height={20}
          className="size-5"
        />
      ) : (
        <Image
          src="/star.svg"
          alt="Add to favorites"
          width={20}
          height={20}
          className="size-5"
        />
      )}
    </button>
  );
};

/**
 * Prefetch watchlist data for a pool in the background
 * This ensures data is ready when user navigates to watchlist
 */
async function prefetchWatchlistData(
  poolAddress: string,
  poolType: string,
  utils: any,
) {
  try {
    const normalizedType = poolType.toLowerCase().replace(/-v2$/, "");
    const isRaydium = poolType.toLowerCase().includes("raydium");

    let tokenMints: string[] = [];

    if (normalizedType === "dlmm") {
      const poolData = await utils.pools.getDLMMPoolInfo.fetch({ poolAddress });
      if (poolData?.mint_x && poolData?.mint_y) {
        tokenMints = [poolData.mint_x, poolData.mint_y];
      }
    } else if (normalizedType === "damm") {
      const poolData = await utils.pools.getDammv2PoolInfo.fetch({
        poolAddress,
      });
      if (poolData?.token_a_mint && poolData?.token_b_mint) {
        tokenMints = [poolData.token_a_mint, poolData.token_b_mint];
      }
    } else if (isRaydium) {
      const poolData = await utils.pools.getRaydiumPoolInfo.fetch({
        poolAddress,
      });
      if (poolData?.mintA?.address && poolData?.mintB?.address) {
        tokenMints = [poolData.mintA.address, poolData.mintB.address];
      }
    }

    if (tokenMints.length > 0) {
      void fetchMultipleTokenMetadata(tokenMints).catch((error) => {
        console.error("Error prefetching token metadata:", error);
      });
    }
  } catch (error) {
    console.error("Error prefetching watchlist data:", error);
  }
}
