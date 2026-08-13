/* eslint-disable @next/next/no-img-element */
"use client";

import React from "react";
import {
  ChevronDown,
  ChevronDownIcon,
  ChevronUp,
  Search,
  Check,
} from "lucide-react";
import Image from "next/image";
import { usePrivy } from "@privy-io/react-auth";
import { DiscordLogoIcon } from "@radix-ui/react-icons";

import { cn, shortAddress, getErrorMessage } from "@/lib/utils";
import {
  useAllTokenBalances,
  type TokenBalance,
} from "@/hooks/use-all-token-balances";
import { api } from "@/trpc/react";
import { usePositionToast } from "@/hooks/use-position-toast";
import { toast } from "sonner";
import { PositionToast } from "./position-states";
import { SimpleToast } from "./simple-toast";
import { fetchTokenMetadataWithCache } from "@/lib/token-metadata-cache";

import MaxWidthWrapper from "./max-width-wrapper";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import InfoTooltip from "./info-tooltip";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { usePncRwaMode } from "@/hooks/use-pnc-rwa-mode";
import { usePathname } from "next/navigation";
import { Skeleton } from "./ui/skeleton";
import { Icons } from "./Icons";

const getTokenIcon = (token: string | TokenBalance | any): string => {
  if (typeof token === "string") {
    const tokenMap: Record<string, string> = {
      sol: "/icons/sol.svg",
      jup: "/icons/jup.svg",
      zec: "/icons/sol.svg",
    };
    return tokenMap[token.toLowerCase()] || "/icons/sol.svg";
  }
  return token?.icon || token?.logoURI || "/icons/sol.svg";
};

const getTokenSymbol = (token: string | TokenBalance | any): string => {
  if (typeof token === "string") {
    return token.toUpperCase();
  }
  // Try multiple sources for token symbol/name
  if (token?.symbol) return token.symbol;
  if (token?.name) return token.name;
  // For known mints, return their symbol
  if (token?.mint === "So11111111111111111111111111111111111111112")
    return "SOL";
  if (token?.mint === "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")
    return "USDC";
  if (token?.address === "So11111111111111111111111111111111111111112")
    return "SOL";
  if (token?.address === "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")
    return "USDC";
  // Last resort: show short address if we have a mint/address, otherwise show TOKEN
  const mint = token?.mint || token?.address;
  if (mint) {
    return shortAddress(mint);
  }
  return "TOKEN";
};

const getTokenMint = (token: string | TokenBalance | any): string => {
  if (typeof token === "string") {
    const tokenMap: Record<string, string> = {
      sol: "So11111111111111111111111111111111111111112",
      jup: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
      zec: "So11111111111111111111111111111111111111112",
    };
    return tokenMap[token.toLowerCase()] || token;
  }
  return token?.mint || token?.address || "";
};

const getTokenIsVerified = (
  token: string | TokenBalance | any,
  verificationMap?: Map<
    string,
    { isVerified: boolean; organicScore: number | null }
  >,
): boolean => {
  if (typeof token === "string") {
    // SOL and JUP are typically verified
    return token.toLowerCase() === "sol" || token.toLowerCase() === "jup";
  }
  // Check if we have verification data from map (for wallet tokens)
  if (verificationMap) {
    const mint = token?.mint || token?.address;
    if (mint && verificationMap.has(mint)) {
      return verificationMap.get(mint)?.isVerified || false;
    }
  }
  return token?.isVerified || false;
};

const getTokenOrganicScore = (
  token: string | TokenBalance | any,
  verificationMap?: Map<
    string,
    { isVerified: boolean; organicScore: number | null }
  >,
): number | null => {
  if (typeof token === "string") {
    return null;
  }
  // Check if we have verification data from map (for wallet tokens)
  if (verificationMap) {
    const mint = token?.mint || token?.address;
    if (mint && verificationMap.has(mint)) {
      return verificationMap.get(mint)?.organicScore ?? null;
    }
  }
  return token?.organicScore ?? null;
};

interface TokenSelectProps {
  tokens: (TokenBalance | any)[];
  value: string;
  onValueChange: (value: string) => void;
  excludeToken?: string;
  placeholder?: string;
  className?: string;
  isLoading?: boolean;
  walletTokens?: TokenBalance[];
  onOpenChange?: (open: boolean) => void;
  onTokenSelected?: (tokenData: any) => void; // Callback when a token is selected (especially from search)
  tokenVerificationData?: Map<
    string,
    { isVerified: boolean; organicScore: number | null }
  >;
  isFetchingVerificationData?: boolean;
  tokenIconsMap?: Map<string, string>; // Map of mint -> icon URL for fetched icons
  fetchingIcons?: Set<string>; // Set of mints currently being fetched
}

const TokenSelect: React.FC<TokenSelectProps> = ({
  tokens,
  value,
  onValueChange,
  excludeToken,
  placeholder = "Select token",
  className,
  isLoading = false,
  walletTokens = [],
  onOpenChange,
  onTokenSelected,
  tokenVerificationData,
  isFetchingVerificationData = false,
  tokenIconsMap,
  fetchingIcons,
}) => {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<any[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const [selectedTokenData, setSelectedTokenData] = React.useState<any>(null);

  // Combine all possible token sources to find the selected token
  const allTokens = React.useMemo(() => {
    const walletMints = new Set(walletTokens.map((t) => t.mint));
    const tokenMints = new Set(tokens.map((t) => getTokenMint(t)));
    const combined = [
      ...walletTokens,
      ...tokens.filter((t) => !walletMints.has(getTokenMint(t))),
    ];
    const searchFiltered = searchResults.filter(
      (t: any) =>
        !walletMints.has(getTokenMint(t)) && !tokenMints.has(getTokenMint(t)),
    );
    const all = [...combined, ...searchFiltered];

    // If we have a selected token data that's not in the list, add it
    if (
      selectedTokenData &&
      !all.find((t) => getTokenMint(t) === getTokenMint(selectedTokenData))
    ) {
      all.unshift(selectedTokenData);
    }

    return all;
  }, [walletTokens, tokens, searchResults, selectedTokenData]);

  // Use selectedTokenData if available, otherwise find by value
  // This ensures we use the exact token object that was clicked, not a different one with the same mint
  const selectedToken =
    selectedTokenData || allTokens.find((t) => getTokenMint(t) === value);

  // Helper function to check if token has "/" in name or symbol (should be filtered out)
  const hasSlashInName = React.useCallback((token: any): boolean => {
    const tokenName = token?.name || "";
    const tokenSymbol = getTokenSymbol(token) || "";
    return tokenName.includes("/") || tokenSymbol.includes("/");
  }, []);

  // Sync selectedTokenData when value changes - but prefer to keep the existing selectedTokenData
  // if it matches the value (this ensures the exact token clicked is preserved)
  React.useEffect(() => {
    if (value) {
      // First check if current selectedTokenData matches value (to avoid unnecessary updates)
      if (selectedTokenData && getTokenMint(selectedTokenData) === value) {
        // Token data already matches, keep it - this preserves the exact token that was clicked
        // Never override the clicked token even if other tokens with same mint exist
        return;
      }

      // Find the token in all sources, but prioritize tokens WITHOUT "/" in their names
      // This ensures we don't accidentally select "TERRA / SOL" when looking for "SOL"
      const findTokenWithoutSlash = (tokenList: any[]) =>
        tokenList.find(
          (t) => getTokenMint(t) === value && !hasSlashInName(t), // Prefer tokens without "/" in name
        );

      const findTokenWithSlash = (tokenList: any[]) =>
        tokenList.find(
          (t) => getTokenMint(t) === value && hasSlashInName(t), // Fallback to tokens with "/" if no match without
        );

      // First try to find tokens without "/" in their names (preferred)
      let found =
        findTokenWithoutSlash(walletTokens) ||
        findTokenWithoutSlash(tokens) ||
        findTokenWithoutSlash(searchResults) ||
        findTokenWithoutSlash(allTokens);

      // Only fall back to tokens with "/" if we didn't find any without "/"
      if (!found) {
        found =
          findTokenWithSlash(walletTokens) ||
          findTokenWithSlash(tokens) ||
          findTokenWithSlash(searchResults) ||
          allTokens.find((t) => getTokenMint(t) === value);
      }

      if (found) {
        // Only update if we found a different token (different object reference)
        // and it's not the same as what we already have
        if (!selectedTokenData || getTokenMint(selectedTokenData) !== value) {
          setSelectedTokenData(found);
        }
      } else {
        // Don't clear if value still matches selectedTokenData mint
        // This can happen when tokens list updates but value is still valid
        if (!selectedTokenData || getTokenMint(selectedTokenData) !== value) {
          setSelectedTokenData(null);
        }
      }
    } else {
      // Clear selectedTokenData when value is empty
      setSelectedTokenData(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, allTokens, walletTokens, tokens, searchResults, hasSlashInName]);

  // Debounced search using Jupiter API
  React.useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const query = searchQuery.trim();
    // Require at least 2 characters to reduce API calls
    if (query.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timeoutId = setTimeout(async () => {
      try {
        const response = await fetch(
          `https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(query)}`,
        );

        // Handle rate limiting
        if (response.status === 429) {
          console.warn("Rate limited, please wait before searching again");
          setSearchResults([]);
          setIsSearching(false);
          return;
        }

        if (!response.ok) {
          console.error("Error searching tokens:", response.status);
          setSearchResults([]);
          setIsSearching(false);
          return;
        }

        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          console.error("Invalid response type from search API");
          setSearchResults([]);
          setIsSearching(false);
          return;
        }

        const data = await response.json();

        if (Array.isArray(data)) {
          const formattedResults = data.map((token: any) => ({
            address: token.id || token.address,
            mint: token.id || token.address,
            symbol: token.symbol || token.name || "TOKEN",
            name: token.name || token.symbol || "TOKEN",
            logoURI: token.icon,
            icon: token.icon,
            price: token.usdPrice || null,
            decimals: token.decimals || 9,
            isVerified: token.isVerified || false,
            organicScore: token.organicScore ?? null,
          }));
          setSearchResults(formattedResults);
        } else {
          setSearchResults([]);
        }
      } catch (error) {
        console.error("Error searching tokens:", error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 500); // Increased debounce from 300ms to 500ms

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const filteredTokens = React.useMemo(() => {
    const walletMints = new Set(walletTokens.map((t) => t.mint));
    const tokenMints = new Set(tokens.map((t) => getTokenMint(t)));

    // Helper function to check if token has verification data (known token)
    const isKnownToken = (token: any): boolean => {
      const mint = getTokenMint(token);
      if (token?.isVerified === true || token?.organicScore !== null) {
        return true;
      }
      if (tokenVerificationData && tokenVerificationData.has(mint)) {
        const verification = tokenVerificationData.get(mint);
        return (
          verification?.isVerified === true ||
          verification?.organicScore !== null
        );
      }
      return false;
    };

    // Helper function to check if token is unknown (has no valid symbol/name)
    const isUnknownToken = (token: any): boolean => {
      const symbol = getTokenSymbol(token);
      // Check if symbol is TOKEN, Unknown, UNKNOWN, or is a short address (starts with short address pattern)
      const mint = getTokenMint(token);
      // If symbol equals short address of mint, it means the token has no real symbol
      if (mint && symbol === shortAddress(mint)) {
        return true;
      }
      // Also check for explicit unknown markers
      return (
        symbol === "TOKEN" ||
        symbol === "Unknown" ||
        symbol === "UNKNOWN" ||
        (!token?.symbol && !token?.name && !!mint)
      );
    };

    // Sort function to prioritize known tokens and push unknown tokens to end
    const sortByKnown = (a: any, b: any) => {
      const aKnown = isKnownToken(a);
      const bKnown = isKnownToken(b);
      const aUnknown = isUnknownToken(a);
      const bUnknown = isUnknownToken(b);

      // Unknown tokens go to the end
      if (aUnknown && !bUnknown) return 1;
      if (!aUnknown && bUnknown) return -1;

      // Among non-unknown tokens, prioritize known tokens
      if (aKnown && !bKnown) return -1;
      if (!aKnown && bKnown) return 1;

      return 0;
    };

    if (!searchQuery.trim()) {
      // Filter wallet tokens: only show those with balance > 0
      // Also exclude tokens with "/" in their name or symbol by default
      const walletFiltered = walletTokens.filter((t) => {
        const mint = getTokenMint(t);
        if (mint === excludeToken) return false;

        // Only show tokens with balance > 0
        const balance = t?.balance ?? 0;
        if (balance <= 0) return false;

        // Filter out tokens with "/" in their name or symbol
        const tokenName = t?.name || "";
        const tokenSymbol = getTokenSymbol(t) || "";
        if (tokenName.includes("/") || tokenSymbol.includes("/")) return false;

        return true;
      });

      // Separate wallet tokens into known and unknown
      const walletKnown: any[] = [];
      const walletUnknown: any[] = [];

      walletFiltered.forEach((t) => {
        if (isUnknownToken(t)) {
          walletUnknown.push(t);
        } else {
          walletKnown.push(t);
        }
      });

      // Don't show other tokens by default (only wallet tokens)
      // Combine: known wallet tokens first, then unknown wallet tokens at the end
      const combined = [...walletKnown, ...walletUnknown];
      return combined;
    }

    const query = searchQuery.toLowerCase();

    // When searching, allow tokens with "/" in name and all tokens
    const walletMatches = walletTokens.filter(
      (t) =>
        getTokenMint(t) !== excludeToken &&
        (getTokenSymbol(t).toLowerCase().includes(query) ||
          (t.name && t.name.toLowerCase().includes(query)) ||
          getTokenMint(t).toLowerCase().includes(query)),
    );

    const tokenMatches = tokens.filter(
      (t) =>
        getTokenMint(t) !== excludeToken &&
        !walletMints.has(getTokenMint(t)) &&
        (getTokenSymbol(t).toLowerCase().includes(query) ||
          (t.name && t.name.toLowerCase().includes(query)) ||
          getTokenMint(t).toLowerCase().includes(query)),
    );

    const searchMatches = searchResults.filter(
      (t: any) =>
        getTokenMint(t) !== excludeToken &&
        !walletMints.has(getTokenMint(t)) &&
        !tokenMints.has(getTokenMint(t)) &&
        (getTokenSymbol(t).toLowerCase().includes(query) ||
          (t.name && t.name.toLowerCase().includes(query)) ||
          getTokenMint(t).toLowerCase().includes(query)),
    );

    // Separate wallet matches into known and unknown
    const walletKnown: any[] = [];
    const walletUnknown: any[] = [];

    walletMatches.forEach((t) => {
      if (isUnknownToken(t)) {
        walletUnknown.push(t);
      } else {
        walletKnown.push(t);
      }
    });

    // Combine: known wallet tokens, then other tokens, then unknown wallet tokens at the end
    const allMatches = [
      ...walletKnown,
      ...tokenMatches,
      ...searchMatches,
      ...walletUnknown,
    ];
    return allMatches;
  }, [
    tokens,
    excludeToken,
    searchQuery,
    walletTokens,
    searchResults,
    tokenVerificationData,
  ]);

  const displayToken = selectedToken || selectedTokenData;
  let displayIcon = displayToken ? getTokenIcon(displayToken) : "";

  // Use fetched icon if available (for TokenSelect component)
  if (displayToken && tokenIconsMap) {
    const mint = getTokenMint(displayToken);
    const fetchedIcon = tokenIconsMap.get(mint);
    if (fetchedIcon && (!displayIcon || displayIcon === "/icons/sol.svg")) {
      displayIcon = fetchedIcon;
    }
  }

  // Only show placeholder if no token is selected, otherwise show the token symbol/name
  // Don't show "Unknown" or "TOKEN" - show actual symbol or short address
  let displaySymbol = placeholder;
  if (displayToken) {
    const symbol = getTokenSymbol(displayToken);
    // Use symbol if it's valid, otherwise use short address
    if (
      symbol &&
      symbol !== "TOKEN" &&
      symbol !== "Unknown" &&
      symbol !== "UNKNOWN"
    ) {
      displaySymbol = symbol;
    } else {
      const mint = getTokenMint(displayToken);
      displaySymbol = mint ? shortAddress(mint) : placeholder;
    }
  }

  // Check if display token is SOL - if so, allow /icons/sol.svg
  // Note: SOL_MINT is defined in Footer component, so we can't use it here
  // We'll check the actual mint string
  const displayTokenMint = displayToken ? getTokenMint(displayToken) : "";
  const isDisplayTokenSOL =
    displayTokenMint === "So11111111111111111111111111111111111111112";
  // Show icon if we have one, but only exclude /icons/sol.svg if it's NOT the actual SOL token
  const hasValidIcon =
    displayIcon &&
    displayIcon !== "" &&
    (isDisplayTokenSOL || displayIcon !== "/icons/sol.svg");

  // Check if fetching icon for display token
  const isFetchingDisplayIcon =
    displayToken && fetchingIcons
      ? fetchingIcons.has(getTokenMint(displayToken))
      : false;

  React.useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setSearchResults([]);
      setIsSearching(false);
    }
  }, [open]);

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (onOpenChange) {
      onOpenChange(newOpen);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-11 w-fit items-center gap-2 rounded-full border-0 bg-[#172945] px-3 pr-9 text-xl text-white",
            className,
          )}
        >
          {isFetchingDisplayIcon && !hasValidIcon ? (
            <Skeleton className="size-7 shrink-0 rounded-full border border-[#1A1A1A] bg-[#1A2A3A]" />
          ) : hasValidIcon ? (
            <img
              src={displayIcon}
              className="size-7 shrink-0 rounded-full border border-[#1A1A1A]"
              alt="token"
              onError={(e) => {
                e.currentTarget.style.display = "none";
                e.currentTarget.nextElementSibling?.classList.remove("hidden");
              }}
            />
          ) : (
            <div
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border border-[#1A1A1A] bg-[#1A2A3A] text-xs text-[#7192A5]",
              )}
            >
              ?
            </div>
          )}
          <span
            className={cn(
              "shrink-0 truncate text-nowrap",
              !selectedToken && "text-sm",
            )}
          >
            {displaySymbol}
          </span>
          <ChevronDown className="ml-auto size-4 shrink-0 text-[#BBEBFF]" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[400px] border border-[#172945] bg-[#021935] p-0"
        align="start"
      >
        <TooltipProvider>
          <div className="flex flex-col">
            <div className="border-b border-[#172945] p-2">
              <div className="relative">
                <Search className="absolute top-1/2 left-2 size-4 -translate-y-1/2 text-[#9BA2AE]" />
                <Input
                  placeholder="Search tokens..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="border-[#172945] bg-[#0A1A2A] pl-8 text-white placeholder:text-[#9BA2AE]"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
            <div
              className="max-h-[400px] overflow-y-auto overscroll-contain"
              style={{
                WebkitOverflowScrolling: "touch",
                scrollbarWidth: "thin",
                touchAction: "pan-y",
              }}
              onWheel={(e) => {
                e.stopPropagation();
              }}
            >
              {isLoading ? (
                <div className="p-4 text-center text-sm text-[#9BA2AE]">
                  Loading tokens...
                </div>
              ) : isSearching ? (
                <div className="p-4 text-center text-sm text-[#9BA2AE]">
                  Searching...
                </div>
              ) : filteredTokens.length === 0 ? (
                <div className="p-4 text-center text-sm text-[#9BA2AE]">
                  No tokens found
                </div>
              ) : (
                filteredTokens.map((token, index) => {
                  const mint = getTokenMint(token);
                  let symbol = getTokenSymbol(token);
                  let icon = getTokenIcon(token);

                  // Check if this token is unknown - if so, show short address as symbol
                  const isUnknown =
                    symbol === "TOKEN" ||
                    symbol === "Unknown" ||
                    symbol === "UNKNOWN" ||
                    (mint && symbol === shortAddress(mint));
                  if (isUnknown && mint) {
                    // Use short address as the display symbol for unknown tokens
                    symbol = shortAddress(mint);
                  }

                  // Use fetched icon if available
                  const fetchedIcon = tokenIconsMap?.get(mint);
                  if (fetchedIcon && (!icon || icon === "/icons/sol.svg")) {
                    icon = fetchedIcon;
                  }

                  // Check if this is the selected token - must match mint exactly
                  const isSelected = mint === value && mint !== "";
                  const tokenName = token.name || token.symbol;
                  // For unknown tokens, don't show tokenName if it's the same as symbol (short address)
                  const displayName =
                    tokenName &&
                    tokenName !== symbol &&
                    tokenName !== "TOKEN" &&
                    tokenName !== "Unknown" &&
                    tokenName !== "UNKNOWN"
                      ? tokenName
                      : mint
                        ? shortAddress(mint)
                        : symbol;
                  // Check if this is SOL token - if so, allow /icons/sol.svg
                  // SOL_MINT is "So11111111111111111111111111111111111111112"
                  const isSOL =
                    mint === "So11111111111111111111111111111111111111112";
                  // Show icon if we have one, but only exclude /icons/sol.svg if it's NOT the actual SOL token
                  // For SOL, we want to show /icons/sol.svg, for other tokens we don't want the fallback
                  const hasValidTokenIcon =
                    icon && icon !== "" && (isSOL || icon !== "/icons/sol.svg");
                  const isFetchingIcon = fetchingIcons?.has(mint) ?? false;

                  const walletToken = walletTokens.find((t) => t.mint === mint);
                  const balance = walletToken?.balance ?? null;
                  const displayBalance =
                    balance !== null ? balance.toFixed(4) : null;

                  // Use a unique key that includes mint + symbol + index to avoid conflicts
                  // This ensures tokens with same mint/symbol in different contexts are unique
                  const uniqueKey = `${mint}-${symbol}-${index}`;

                  return (
                    <button
                      key={uniqueKey}
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();

                        // Store the full token object to preserve all data
                        setSelectedTokenData(token);

                        // Call onTokenSelected callback FIRST to preserve exact token before onValueChange
                        if (onTokenSelected) {
                          onTokenSelected(token);
                        }

                        // Update value with the mint address
                        onValueChange(mint);
                        setOpen(false);
                        setSearchQuery("");
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2 transition-colors hover:bg-[#0A1A2A]",
                        isSelected && "bg-[#0A1A2A]",
                      )}
                    >
                      {isFetchingIcon && !hasValidTokenIcon ? (
                        <Skeleton className="size-8 shrink-0 rounded-full border border-[#1A1A1A] bg-[#1A2A3A]" />
                      ) : hasValidTokenIcon ? (
                        <img
                          src={icon}
                          className="size-8 shrink-0 rounded-full border border-[#1A1A1A]"
                          alt={symbol}
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                            e.currentTarget.nextElementSibling?.classList.remove(
                              "hidden",
                            );
                          }}
                        />
                      ) : (
                        <div
                          className={cn(
                            "flex size-8 shrink-0 items-center justify-center rounded-full border border-[#1A1A1A] bg-[#1A2A3A] text-xs text-[#7192A5]",
                          )}
                        >
                          ?
                        </div>
                      )}
                      <div className="flex-1 text-left">
                        <div className="flex items-center gap-1.5">
                          <div
                            className="text-sm font-medium text-white"
                            title={mint} // Show full mint address on hover
                          >
                            {symbol}
                          </div>
                          {isFetchingVerificationData &&
                          tokenVerificationData &&
                          !tokenVerificationData.has(mint) ? (
                            <>
                              <Skeleton className="size-3.5 shrink-0 rounded-full bg-[#1A2A3A]" />
                              <Skeleton className="h-3 w-6 shrink-0 bg-[#1A2A3A]" />
                            </>
                          ) : (
                            <>
                              {getTokenIsVerified(
                                token,
                                tokenVerificationData,
                              ) && (
                                <InfoTooltip
                                  side="top"
                                  skipProvider={true}
                                  icon={
                                    <Icons.verifiedIcon className="size-3.5 shrink-0 text-[#62e2ee]" />
                                  }
                                >
                                  Verified
                                </InfoTooltip>
                              )}
                              {getTokenOrganicScore(
                                token,
                                tokenVerificationData,
                              ) !== null &&
                                Number(
                                  getTokenOrganicScore(
                                    token,
                                    tokenVerificationData,
                                  ),
                                ) !== 0 && (
                                  <InfoTooltip
                                    side="top"
                                    skipProvider={true}
                                    icon={
                                      <p className="flex cursor-pointer items-center gap-0.5 text-xs font-medium text-[#3DE3AB]">
                                        <Icons.leafIcon className="size-3.5 shrink-0 text-[#3DE3AB]" />

                                        {Number(
                                          getTokenOrganicScore(
                                            token,
                                            tokenVerificationData,
                                          ),
                                        ).toFixed(0)}
                                      </p>
                                    }
                                  >
                                    Organic Score:{" "}
                                    {getTokenOrganicScore(
                                      token,
                                      tokenVerificationData,
                                    )}
                                  </InfoTooltip>
                                )}
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="truncate text-xs text-[#9BA2AE]">
                            {displayName}
                          </div>
                          {displayBalance && (
                            <div className="text-xs text-[#9BA2AE]">
                              • {displayBalance} {symbol}
                            </div>
                          )}
                        </div>
                      </div>
                      {isSelected && (
                        <Check className="size-4 shrink-0 text-[#BCEAFF]" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </TooltipProvider>
      </PopoverContent>
    </Popover>
  );
};

const Footer: React.FC = () => {
  const SOL_MINT = "So11111111111111111111111111111111111111112";
  const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

  const [sellAmount, setSellAmount] = React.useState("");
  const [buyAmount, setBuyAmount] = React.useState("");
  const [sellToken, setSellToken] = React.useState(SOL_MINT);
  const [buyToken, setBuyToken] = React.useState(USDC_MINT);
  const [isSwapButtonClicked, setIsSwapButtonClicked] = React.useState(false);
  // Track if we just swapped to prevent useEffect from interfering with valid swapped tokens
  const justSwappedRef = React.useRef(false);
  // Shared state to preserve searched/selected tokens so both TokenSelect components can access them
  // Using array instead of Map for better React reactivity
  const [preservedTokens, setPreservedTokens] = React.useState<any[]>([]);
  // Store the last selected token from search for each position (sell/buy)
  // Using state instead of refs so changes trigger re-renders
  const [lastSelectedSellToken, setLastSelectedSellToken] =
    React.useState<any>(null);
  const [lastSelectedBuyToken, setLastSelectedBuyToken] =
    React.useState<any>(null);

  const {
    tokens: walletTokens,
    isLoading: isLoadingWalletTokens,
    refetch: refetchWalletTokens,
  } = useAllTokenBalances();

  // Clean up any tokens with "/" from preservedTokens on mount
  React.useEffect(() => {
    setPreservedTokens((prev) => {
      const cleaned = prev.filter((t) => {
        const tokenName = t?.name || "";
        const tokenSymbol = getTokenSymbol(t) || "";
        return !tokenName.includes("/") && !tokenSymbol.includes("/");
      });
      return cleaned;
    });
  }, []); // Run once on mount

  // Fetch token verification data for wallet tokens
  const [tokenVerificationData, setTokenVerificationData] = React.useState<
    Map<string, { isVerified: boolean; organicScore: number | null }>
  >(new Map());

  const [hasFetchedVerificationData, setHasFetchedVerificationData] =
    React.useState(false);

  const [isFetchingVerificationData, setIsFetchingVerificationData] =
    React.useState(false);

  const fetchVerificationData = React.useCallback(async () => {
    // Only fetch once
    if (hasFetchedVerificationData || walletTokens.length === 0) return;

    setHasFetchedVerificationData(true);
    setIsFetchingVerificationData(true);

    try {
      const mints = walletTokens.map((t) => t.mint).filter(Boolean);
      if (mints.length === 0) {
        setIsFetchingVerificationData(false);
        return;
      }

      const verificationMap = new Map<
        string,
        { isVerified: boolean; organicScore: number | null }
      >();

      // Use search endpoint directly for all wallet tokens
      // Process in larger batches with shorter delays for faster fetching
      const BATCH_SIZE = 5; // Increased batch size for faster fetching
      for (let i = 0; i < mints.length; i += BATCH_SIZE) {
        const batch = mints.slice(i, i + BATCH_SIZE);
        const fetchPromises = batch.map(async (mint) => {
          try {
            const response = await fetch(
              `https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(mint)}`,
            );

            // Handle rate limiting - stop immediately if rate limited
            if (response.status === 429) {
              console.warn(
                "Rate limited, stopping wallet token verification fetch",
              );
              return;
            }

            if (!response.ok) {
              return;
            }

            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
              return;
            }

            const data = await response.json();
            if (Array.isArray(data) && data.length > 0) {
              // Find exact match by mint address (case-insensitive)
              const token = data.find((t: any) => {
                const tokenMint = (
                  t.id ||
                  t.address ||
                  t.mint ||
                  ""
                ).toLowerCase();
                return tokenMint === mint.toLowerCase();
              });
              if (token) {
                verificationMap.set(mint, {
                  isVerified: token.isVerified || false,
                  organicScore: token.organicScore ?? null,
                });
                // Update state incrementally for better UX
                setTokenVerificationData(new Map(verificationMap));
              }
            }
          } catch (error) {
            // Silently fail for individual tokens
          }
        });

        await Promise.all(fetchPromises);
        // Reduced delay between batches for faster fetching
        if (i + BATCH_SIZE < mints.length) {
          await new Promise((resolve) => setTimeout(resolve, 300)); // Reduced from 800ms to 300ms
        }
      }

      setTokenVerificationData(verificationMap);
    } catch (error) {
      console.error("Error fetching token verification data:", error);
    } finally {
      setIsFetchingVerificationData(false);
    }
  }, [walletTokens, hasFetchedVerificationData]);

  // Server-cached SOL price (Jupiter then Coingecko fallback) - avoids Coingecko rate limits
  const { data: solPriceData, isPending: loadingPrice } =
    api.price.getSolPrice.useQuery(undefined, {
      staleTime: 10 * 1000,
      refetchInterval: 10_000,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    });
  const solPrice =
    solPriceData != null ? Number(solPriceData).toFixed(2) : null;

  const { data: ethPriceData, isPending: loadingEthPrice } =
    api.price.getEthPrice.useQuery(undefined, {
      staleTime: 10 * 1000,
      refetchInterval: 10_000,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    });
  const ethPrice =
    ethPriceData != null ? Number(ethPriceData).toFixed(2) : null;

  const { data: btcPriceData, isPending: loadingBtcPrice } =
    api.price.getBtcPrice.useQuery(undefined, {
      staleTime: 10 * 1000,
      refetchInterval: 10_000,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    });
  const btcPrice =
    btcPriceData != null ? Number(btcPriceData).toFixed(2) : null;

  const { data: hypePriceData, isPending: loadingHypePrice } =
    api.price.getHypePrice.useQuery(undefined, {
      staleTime: 10 * 1000,
      refetchInterval: 10_000,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    });
  const hypePrice =
    hypePriceData != null ? Number(hypePriceData).toFixed(2) : null;

  // Same input as discover default so we share server/cache and avoid extra API calls
  // getTrendingPools route removed — disabled
  const trendingPoolsData: any = undefined;
  const isLoadingTrending = false;
  const isErrorTrending = false;

  const trendingTokens = React.useMemo(() => {
    if (!trendingPoolsData?.tokens) return [];
    return (trendingPoolsData.tokens as any[]).map((token: any) => ({
      address: token.address || token.mint,
      mint: token.address || token.mint,
      symbol: token.symbol || token.name || "TOKEN",
      name: token.name || token.symbol || "TOKEN",
      logoURI: token.logoURI || token.icon,
      icon: token.logoURI || token.icon,
      price: token.usdPrice || token.price || null,
      decimals: token.decimals || 9,
      isVerified: token.isVerified || false,
      organicScore: token.organicScore ?? null,
    }));
  }, [trendingPoolsData]);

  const sellTokens = React.useMemo(() => {
    const walletMints = new Set(walletTokens.map((t) => t.mint));
    const combined: (TokenBalance | any)[] = [...walletTokens];
    trendingTokens.forEach((token: any) => {
      if (!walletMints.has(getTokenMint(token))) {
        combined.push(token);
      }
    });

    // Add preserved tokens (searched tokens) that aren't already in the list
    preservedTokens.forEach((tokenData: any) => {
      const mint = getTokenMint(tokenData);
      if (
        !walletMints.has(mint) &&
        !combined.some((t) => getTokenMint(t) === mint)
      ) {
        combined.push(tokenData);
      }
    });

    const hasSOL = combined.some((t) => getTokenMint(t) === SOL_MINT);
    if (!hasSOL) {
      combined.unshift({
        mint: SOL_MINT,
        address: SOL_MINT,
        symbol: "SOL",
        name: "Solana",
        icon: "/icons/sol.svg",
        balance: 0,
        price: solPrice ? parseFloat(solPrice) : null,
        isVerified: true, // SOL is always verified
        organicScore: null,
      });
    }

    // Add USDC if not present
    const hasUSDC = combined.some((t) => getTokenMint(t) === USDC_MINT);
    if (!hasUSDC) {
      combined.push({
        mint: USDC_MINT,
        address: USDC_MINT,
        symbol: "USDC",
        name: "USD Coin",
        icon: "/icons/usdc.svg",
        balance: 0,
        price: 1, // USDC is typically $1
        isVerified: true, // USDC is always verified
        organicScore: null,
      });
    }

    return combined;
  }, [
    walletTokens,
    trendingTokens,
    SOL_MINT,
    USDC_MINT,
    solPrice,
    preservedTokens,
  ]);

  // State to track fetched token icons (mint -> icon URL)
  const [tokenIconsMap, setTokenIconsMap] = React.useState<Map<string, string>>(
    new Map(),
  );

  // State to track which tokens are currently being fetched
  const [fetchingIcons, setFetchingIcons] = React.useState<Set<string>>(
    new Set(),
  );

  // Ref to track what we've already fetched to prevent duplicates
  const fetchedMintsRef = React.useRef<Set<string>>(new Set());

  // Fetch missing token icons
  React.useEffect(() => {
    const fetchMissingIcons = async () => {
      const tokensToFetch: Array<{ mint: string; token: any }> = [];

      // Find tokens that need icons
      sellTokens.forEach((token) => {
        const mint = getTokenMint(token);
        if (
          !mint ||
          mint === SOL_MINT ||
          mint === USDC_MINT ||
          fetchedMintsRef.current.has(mint)
        ) {
          return;
        }

        const hasIcon = token?.icon || token?.logoURI;
        const hasFetchedIcon = tokenIconsMap.has(mint);
        const isCurrentlyFetching = fetchingIcons.has(mint);

        if (!hasIcon && !hasFetchedIcon && !isCurrentlyFetching) {
          tokensToFetch.push({ mint, token });
        }
      });

      if (tokensToFetch.length === 0) return;

      // Mark as fetching
      const mintsToFetch = tokensToFetch.map((t) => t.mint);
      setFetchingIcons((prev) => {
        const next = new Set(prev);
        mintsToFetch.forEach((mint) => next.add(mint));
        return next;
      });

      // Mark as fetched in ref to prevent duplicates
      mintsToFetch.forEach((mint) => fetchedMintsRef.current.add(mint));

      // Fetch icons for all tokens that need them
      const fetchPromises = tokensToFetch.map(async ({ mint }) => {
        try {
          const metadata = await fetchTokenMetadataWithCache(mint);
          if (metadata?.icon) {
            return { mint, icon: metadata.icon };
          }
          return null;
        } catch (error) {
          console.error(`Failed to fetch icon for ${mint}:`, error);
          return null;
        }
      });

      const results = await Promise.all(fetchPromises);

      // Update token icons map
      setTokenIconsMap((prev) => {
        const next = new Map(prev);
        results.forEach((result) => {
          if (result?.icon) {
            next.set(result.mint, result.icon);
          }
        });
        return next;
      });

      // Update preservedTokens with fetched icons
      setPreservedTokens((prev) => {
        let hasChanges = false;
        const updated = prev.map((token) => {
          const mint = getTokenMint(token);
          const fetchedIcon = results.find((r) => r?.mint === mint)?.icon;
          if (fetchedIcon && mint && !token.icon && !token.logoURI) {
            hasChanges = true;
            return {
              ...token,
              icon: fetchedIcon,
              logoURI: fetchedIcon,
            };
          }
          return token;
        });
        return hasChanges ? updated : prev;
      });

      // Remove from fetching set
      setFetchingIcons((prev) => {
        const next = new Set(prev);
        mintsToFetch.forEach((mint) => next.delete(mint));
        return next;
      });
    };

    // Debounce to avoid too many requests
    const timeoutId = setTimeout(() => {
      fetchMissingIcons();
    }, 100);

    return () => clearTimeout(timeoutId);
    // Only depend on sellTokens to avoid loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellTokens]);

  React.useEffect(() => {
    // Don't auto-correct if we just swapped tokens (to preserve searched tokens)
    if (justSwappedRef.current) {
      return;
    }

    // Check if tokens exist in any source (including preservedTokens)
    const sellTokenExists =
      preservedTokens.some((t) => getTokenMint(t) === sellToken) ||
      sellTokens.some((t) => getTokenMint(t) === sellToken) ||
      walletTokens.some((t) => t.mint === sellToken) ||
      trendingTokens.some((t: any) => getTokenMint(t) === sellToken);

    const buyTokenExists =
      preservedTokens.some((t) => getTokenMint(t) === buyToken) ||
      sellTokens.some((t) => getTokenMint(t) === buyToken) ||
      walletTokens.some((t) => t.mint === buyToken) ||
      trendingTokens.some((t: any) => getTokenMint(t) === buyToken);

    // REMOVED: This was auto-switching SOL to TERRA / SOL
    // If buyToken is SOL_MINT and we have trending tokens, set a different one
    // if (
    //   trendingTokens.length > 0 &&
    //   buyToken === SOL_MINT &&
    //   sellToken !== SOL_MINT
    // ) {
    //   const firstToken = trendingTokens[0];
    //   if (firstToken && getTokenMint(firstToken) !== sellToken) {
    //     console.log(`[Auto-correct] Changing buyToken from SOL to:`, getTokenMint(firstToken));
    //     setBuyToken(getTokenMint(firstToken));
    //   }
    // }

    // Only auto-correct if both tokens are the same AND both tokens exist
    if (
      buyToken === sellToken &&
      sellTokenExists &&
      buyTokenExists &&
      sellToken !== SOL_MINT // Don't auto-correct if both are SOL
    ) {
      // Search in all sources to find an available token that's different from sellToken
      const allTokens = [
        ...preservedTokens,
        ...sellTokens,
        ...walletTokens,
        ...trendingTokens,
      ];
      const availableToken = allTokens.find(
        (t: any) => getTokenMint(t) !== sellToken,
      );
      if (availableToken) {
        setBuyToken(getTokenMint(availableToken));
      }
    }
    // If tokens are different, don't interfere (they might be valid searched tokens)
  }, [
    trendingTokens,
    sellTokens,
    walletTokens,
    preservedTokens,
    buyToken,
    sellToken,
    SOL_MINT,
  ]);

  // Clear buyAmount, transaction, and price impact when tokens change
  React.useEffect(() => {
    setBuyAmount("");
    setStoredTransaction(null);
    setPriceImpactPct(null);
  }, [sellToken, buyToken]);

  const [sellUsdValue, setSellUsdValue] = React.useState<string | null>(null);
  const [buyUsdValue, setBuyUsdValue] = React.useState<string | null>(null);
  const [priceImpactPct, setPriceImpactPct] = React.useState<string | null>(
    null,
  );
  const [sellBalance, setSellBalance] = React.useState<string | null>(null);
  const [buyBalance, setBuyBalance] = React.useState<string | null>(null);
  const [storedTransaction, setStoredTransaction] = React.useState<
    string | null
  >(null);

  const { getAccessToken, authenticated } = usePrivy();
  const positionToast = usePositionToast();

  // Periodic balance refresh - refetch wallet tokens every 10 seconds when authenticated
  React.useEffect(() => {
    if (!authenticated) return;

    const intervalId = setInterval(() => {
      refetchWalletTokens();
    }, 10000); // Refresh every 10 seconds

    return () => clearInterval(intervalId);
  }, [authenticated, refetchWalletTokens]);

  // Get and store Privy access token (refresh periodically)
  React.useEffect(() => {
    (async () => {
      if (authenticated) {
        try {
          const accessToken = await getAccessToken();
          if (accessToken) {
            sessionStorage.setItem("privy-access-token", accessToken);
          }
        } catch (error) {
          console.error("Error getting access token:", error);
        }
      }
    })();
  }, [authenticated, getAccessToken]);

  // Helper function to convert human-readable amount to base units
  const convertToBaseUnits = (amount: string, decimals: number): string => {
    if (!amount || amount === "") return "0";
    const [intPart = "0", decPart = ""] = amount.split(".");
    const paddedDec = decPart.padEnd(decimals, "0").slice(0, decimals);
    // Use BigInt(10) ** BigInt(decimals) to avoid precision loss
    const multiplier = BigInt(10) ** BigInt(decimals);
    return (BigInt(intPart) * multiplier + BigInt(paddedDec || "0")).toString();
  };

  const getTokenDecimals = React.useCallback(
    (mint: string): number => {
      if (mint === SOL_MINT) return 9;
      const walletToken = walletTokens.find((t) => t.mint === mint);
      if (walletToken) return walletToken.decimals;
      const trendingToken = trendingTokens.find(
        (t: any) => getTokenMint(t) === mint,
      );
      if (trendingToken?.decimals) return trendingToken.decimals;
      // Check preserved tokens (includes searched/selected tokens)
      const preservedToken = preservedTokens.find(
        (t: any) => getTokenMint(t) === mint,
      );
      if (preservedToken?.decimals) return preservedToken.decimals;
      return 9;
    },
    [walletTokens, trendingTokens, preservedTokens],
  );

  // Fetch and cache decimals for currently selected tokens
  React.useEffect(() => {
    const fetchDecimals = async () => {
      const tokensToFetch: Array<{ mint: string; token: any }> = [];

      // Check if sellToken needs decimals fetching
      if (sellToken && sellToken !== SOL_MINT) {
        const hasDecimals =
          walletTokens.find((t) => t.mint === sellToken)?.decimals ||
          trendingTokens.find((t: any) => getTokenMint(t) === sellToken)
            ?.decimals ||
          preservedTokens.find((t: any) => getTokenMint(t) === sellToken)
            ?.decimals;

        if (!hasDecimals) {
          tokensToFetch.push({ mint: sellToken, token: null });
        }
      }

      // Check if buyToken needs decimals fetching
      if (buyToken && buyToken !== SOL_MINT) {
        const hasDecimals =
          walletTokens.find((t) => t.mint === buyToken)?.decimals ||
          trendingTokens.find((t: any) => getTokenMint(t) === buyToken)
            ?.decimals ||
          preservedTokens.find((t: any) => getTokenMint(t) === buyToken)
            ?.decimals;

        if (!hasDecimals) {
          tokensToFetch.push({ mint: buyToken, token: null });
        }
      }

      if (tokensToFetch.length === 0) return;

      console.log(`🔍 Fetching decimals for ${tokensToFetch.length} tokens...`);

      // Fetch metadata for tokens
      const fetchPromises = tokensToFetch.map(async ({ mint }) => {
        try {
          const metadata = await fetchTokenMetadataWithCache(mint);
          if (metadata?.decimals) {
            console.log(
              `✅ Got decimals ${metadata.decimals} for ${mint.slice(0, 8)}...`,
            );
            return { mint, metadata };
          }
          return null;
        } catch (error) {
          console.error(`Failed to fetch decimals for ${mint}:`, error);
          return null;
        }
      });

      const results = await Promise.all(fetchPromises);

      // Update tokenIconsMap with fetched icons and mark as fetched
      setTokenIconsMap((prev) => {
        const next = new Map(prev);
        results.forEach((result) => {
          if (result?.metadata?.icon) {
            next.set(result.mint, result.metadata.icon);
            // Mark as fetched to prevent duplicate fetches
            fetchedMintsRef.current.add(result.mint);
          }
        });
        return next;
      });

      // Update preservedTokens with fetched decimals and icons
      setPreservedTokens((prev: any[]) => {
        let hasChanges = false;
        const updated = prev.map((token) => {
          const mint = getTokenMint(token);
          const result = results.find((r) => r?.mint === mint);
          if (result?.metadata) {
            const needsUpdate =
              (!token.decimals && result.metadata.decimals) ||
              (!token.icon && !token.logoURI && result.metadata.icon);

            if (needsUpdate) {
              hasChanges = true;
              return {
                ...token,
                decimals: result.metadata.decimals || token.decimals,
                icon: result.metadata.icon || token.icon,
                logoURI: result.metadata.icon || token.logoURI,
                name: result.metadata.name || token.name,
                symbol: result.metadata.symbol || token.symbol,
              };
            }
          }
          return token;
        });

        // Add new tokens if they're not in preservedTokens yet
        results.forEach((result) => {
          if (
            result?.metadata?.decimals &&
            !updated.find((t) => getTokenMint(t) === result.mint)
          ) {
            hasChanges = true;
            updated.push({
              mint: result.mint,
              address: result.mint,
              decimals: result.metadata.decimals,
              symbol: result.metadata.symbol || "TOKEN",
              name: result.metadata.name || "TOKEN",
              icon: result.metadata.icon,
              logoURI: result.metadata.icon,
            });
          }
        });

        return hasChanges ? updated : prev;
      });
    };

    void fetchDecimals();
  }, [sellToken, buyToken, walletTokens, trendingTokens, preservedTokens]);

  // Amount sent to /quote: use exact raw balance when user selected Max to avoid residue
  const amountForQuote = React.useMemo(() => {
    if (!sellAmount || parseFloat(sellAmount) <= 0) return "0";
    const decimals = getTokenDecimals(sellToken);
    const walletToken = walletTokens.find((t) => t.mint === sellToken);
    if (walletToken?.rawAmount) {
      const maxDisplay = (
        Math.floor(walletToken.balance * 10000) / 10000
      ).toFixed(4);
      if (sellAmount === maxDisplay) return walletToken.rawAmount;
    }
    return convertToBaseUnits(sellAmount, decimals);
  }, [sellAmount, sellToken, getTokenDecimals, walletTokens]);

  // Swap quote query - called when sellAmount or tokens change
  const {
    data: quoteData,
    isLoading: isLoadingQuote,
    error: quoteError,
  } = api.swap.quote.useQuery(
    {
      inputMint: sellToken,
      outputMint: buyToken,
      amount: amountForQuote,
    },
    {
      enabled:
        authenticated && !!sellToken && !!buyToken && amountForQuote !== "0",
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: 2_000,
      refetchInterval: 2_000,
    },
  );

  // Debug logging for quote errors
  React.useEffect(() => {
    if (quoteError) {
      const decimals = getTokenDecimals(sellToken);
      const inputAmount = sellAmount
        ? convertToBaseUnits(sellAmount, decimals)
        : "0";
      console.error("❌ Quote Error Details:", {
        error: quoteError,
        message: getErrorMessage(quoteError),
        sellToken,
        buyToken,
        sellAmount,
        authenticated,
        decimals,
        inputAmount,
      });
    }
    if (quoteData) {
      console.log("✅ Quote Success:", quoteData);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteError, quoteData, sellToken, buyToken, sellAmount, authenticated]);

  // Swap execute mutation
  const executeSwapMutation = api.swap.execute.useMutation({
    onSuccess: (data: any) => {
      try {
        if (toastIdRef.current && data?.transaction_hash) {
          const explorerUrl = `https://solscan.io/tx/${data.transaction_hash}`;
          // Use stored swap details to ensure correct token info
          const swapDetails = swapDetailsRef.current;
          if (swapDetails) {
            // Debug log to verify stored values
            console.log("✅ Swap success - using stored details:", {
              sellSymbol: swapDetails.sellTokenSymbol,
              buySymbol: swapDetails.buyTokenSymbol,
              sellMint: swapDetails.sellTokenMint,
              buyMint: swapDetails.buyTokenMint,
              sellAmount: swapDetails.sellAmount,
              buyAmount: swapDetails.buyAmount,
            });

            // Format amounts to 2 decimal places
            const formattedSellAmount = parseFloat(
              swapDetails.sellAmount,
            ).toFixed(2);
            const formattedBuyAmount = parseFloat(
              swapDetails.buyAmount,
            ).toFixed(2);

            positionToast.success(toastIdRef.current, explorerUrl, {
              title: "Swap successful",
              description: `Swapped ${formattedSellAmount} ${swapDetails.sellTokenSymbol} for ${formattedBuyAmount} ${swapDetails.buyTokenSymbol}`,
              amount: formattedSellAmount,
              symbol: swapDetails.sellTokenIcon,
              pair: "", // Not used for swap toasts
              isSwapToast: true,
              swapSellAmount: formattedSellAmount,
              swapSellIcon: swapDetails.sellTokenIcon,
              swapBuyAmount: formattedBuyAmount,
              swapBuyIcon: swapDetails.buyTokenIcon,
            });

            // Refetch wallet token balances to update balances after successful swap
            // Immediate refetch for instant UI feedback
            refetchWalletTokens();
            // Additional refetches with delays to ensure the transaction is confirmed on-chain
            // Multiple refetches ensure balance is updated even if blockchain confirmation takes time
            setTimeout(() => {
              refetchWalletTokens();
            }, 1000);
            setTimeout(() => {
              refetchWalletTokens();
            }, 3000);
            setTimeout(() => {
              refetchWalletTokens();
            }, 5000);
            setTimeout(() => {
              refetchWalletTokens();
            }, 10000);
          } else {
            // Fallback if ref is not set (shouldn't happen, but just in case)
            const sellTokenSymbol = selectedSellToken
              ? getTokenSymbol(selectedSellToken)
              : "SOL";
            const buyTokenSymbol = selectedBuyToken
              ? getTokenSymbol(selectedBuyToken)
              : "USDC";
            const sellTokenIcon = selectedSellToken
              ? selectedSellToken.icon ||
                getTokenIcon(selectedSellToken) ||
                "/icons/sol.svg"
              : "/icons/sol.svg";
            const buyTokenIcon = selectedBuyToken
              ? selectedBuyToken.icon ||
                getTokenIcon(selectedBuyToken) ||
                "/icons/sol.svg"
              : "/icons/sol.svg";

            // Format amounts to 2 decimal places
            const formattedSellAmount = parseFloat(sellAmount).toFixed(2);
            const formattedBuyAmount = parseFloat(buyAmount).toFixed(2);

            positionToast.success(toastIdRef.current, explorerUrl, {
              title: "Swap successful",
              description: `Swapped ${formattedSellAmount} ${sellTokenSymbol} for ${formattedBuyAmount} ${buyTokenSymbol}`,
              amount: formattedSellAmount,
              symbol: sellTokenIcon,
              pair: "", // Not used for swap toasts
              isSwapToast: true,
              swapSellAmount: formattedSellAmount,
              swapSellIcon: sellTokenIcon,
              swapBuyAmount: formattedBuyAmount,
              swapBuyIcon: buyTokenIcon,
            });

            // Refetch wallet token balances to update balances after successful swap
            // Immediate refetch for instant UI feedback
            refetchWalletTokens();
            // Additional refetches with delays to ensure the transaction is confirmed on-chain
            // Multiple refetches ensure balance is updated even if blockchain confirmation takes time
            setTimeout(() => {
              refetchWalletTokens();
            }, 1000);
            setTimeout(() => {
              refetchWalletTokens();
            }, 3000);
            setTimeout(() => {
              refetchWalletTokens();
            }, 5000);
            setTimeout(() => {
              refetchWalletTokens();
            }, 10000);
          }
        } else {
          console.error("Missing transaction_hash in response:", data);
          if (toastIdRef.current) {
            positionToast.failed(
              toastIdRef.current,
              "Swap completed but transaction hash is missing.",
            );
          }
        }
      } catch (error) {
        console.error("Error in onSuccess callback:", error);
        if (toastIdRef.current) {
          positionToast.failed(
            toastIdRef.current,
            "Error processing swap result.",
          );
        }
      } finally {
        // Reset form after successful execution
        // This will also disable the quote query (since enabled requires sellAmount > 0)
        // ensuring a fresh quote is fetched on the next swap
        setSellAmount("");
        setBuyAmount("");
        setStoredTransaction(null);
        toastIdRef.current = null;
        isExecutingRef.current = false;
        swapDetailsRef.current = null; // Clear swap details
      }
    },
    onError: (error: any) => {
      console.error("Swap execution error:", error);
      try {
        // Get user-friendly error message
        const errorMessage =
          getErrorMessage(error) || "Swap execution failed. Please try again.";

        if (toastIdRef.current) {
          // Update existing toast with error
          positionToast.failed(toastIdRef.current, errorMessage);
          // Don't clear toastIdRef immediately - let the error toast display
          // It will be cleared when user dismisses it or on next swap attempt
        } else {
          // Fallback: Create a new error toast if no toast ID exists
          // This handles cases where the mutation fails before toast is created
          const swapDetails = swapDetailsRef.current;
          const sellTokenSymbol =
            swapDetails?.sellTokenSymbol || getSellTokenSymbol();
          const buyTokenSymbol =
            swapDetails?.buyTokenSymbol || getBuyTokenSymbol();
          const sellAmountForDisplay =
            swapDetails?.sellAmount || sellAmount || "0";
          const buyAmountForDisplay =
            swapDetails?.buyAmount || buyAmount || "0";
          const sellIcon = swapDetails?.sellTokenIcon || "/icons/sol.svg";
          const buyIcon = swapDetails?.buyTokenIcon || "/icons/sol.svg";

          toast.custom(() => (
            <PositionToast
              status="failed"
              amount={sellAmountForDisplay}
              symbol={sellIcon}
              pair="" // Not used for swap toasts
              title="Swap failed"
              description={errorMessage}
              isSwapToast={true}
              swapSellAmount={sellAmountForDisplay}
              swapSellIcon={sellIcon}
              swapBuyAmount={buyAmountForDisplay}
              swapBuyIcon={buyIcon}
            />
          ));
        }
      } catch (toastError) {
        console.error("Error showing error toast:", toastError);
        // Fallback: Show a basic error toast
        toast.error("Swap failed. Please try again.");
      } finally {
        // Reset transaction on error since it's now stale
        // Keep sellAmount and buyAmount so user can retry
        setStoredTransaction(null);
        // Don't clear toastIdRef here - let the error toast stay visible
        // It will be cleared on next swap attempt or when user dismisses it
        isExecutingRef.current = false;
        // Keep swapDetailsRef so we can use it for error toast if needed
      }
    },
  });

  const toastIdRef = React.useRef<string | null>(null);
  const isExecutingRef = React.useRef<boolean>(false);
  // Track current query parameters to avoid stale errors
  const currentQueryRef = React.useRef<string>("");
  // Store swap details for toast success message
  const swapDetailsRef = React.useRef<{
    sellAmount: string;
    buyAmount: string;
    sellTokenSymbol: string;
    buyTokenSymbol: string;
    sellTokenIcon: string;
    buyTokenIcon: string;
    sellTokenMint?: string; // For debugging
    buyTokenMint?: string; // For debugging
  } | null>(null);

  const handleSwapInputs = () => {
    setIsSwapButtonClicked(!isSwapButtonClicked);

    const tempAmount = sellAmount;
    const tempToken = sellToken;
    const tempUsdValue = sellUsdValue;
    const tempBalance = sellBalance;
    const tempSellTokenState = lastSelectedSellToken;
    const tempBuyTokenState = lastSelectedBuyToken;

    // Helper to check if token has "/" in name or symbol
    const hasSlashInNameOrSymbol = (token: any): boolean => {
      const tokenName = token?.name || "";
      const tokenSymbol = getTokenSymbol(token) || "";
      return tokenName.includes("/") || tokenSymbol.includes("/");
    };

    // Helper to find token data from all sources (including current preservedTokens)
    // Prioritize tokens WITHOUT "/" in their names (e.g., prefer SOL over TERRA / SOL)
    const findTokenDataNow = (mint: string) => {
      // First, try to find tokens WITHOUT "/" in their names (preferred)
      const findTokenWithoutSlash = (tokenList: any[]) =>
        tokenList.find(
          (t) => getTokenMint(t) === mint && !hasSlashInTokenNameOrSymbol(t),
        );

      // Fallback: find any token with matching mint
      const findTokenAny = (tokenList: any[]) =>
        tokenList.find((t) => getTokenMint(t) === mint);

      // Prioritize tokens without "/" in all sources
      return (
        findTokenWithoutSlash(preservedTokens) ||
        findTokenWithoutSlash(sellTokens) ||
        findTokenWithoutSlash(walletTokens) ||
        findTokenWithoutSlash(trendingTokens) ||
        // Fallback to any match if no token without "/" found
        findTokenAny(preservedTokens) ||
        findTokenAny(sellTokens) ||
        findTokenAny(walletTokens) ||
        findTokenAny(trendingTokens)
      );
    };

    // Find token data for both tokens before swapping to preserve them
    const sellTokenData =
      tempSellTokenState && getTokenMint(tempSellTokenState) === sellToken
        ? tempSellTokenState
        : findTokenDataNow(sellToken);

    const buyTokenData =
      tempBuyTokenState && getTokenMint(tempBuyTokenState) === buyToken
        ? tempBuyTokenState
        : findTokenDataNow(buyToken);

    // Preserve both tokens synchronously before swapping
    const newPreservedTokens = [...preservedTokens];
    let tokensUpdated = false;

    if (sellTokenData) {
      const sellMint = getTokenMint(sellTokenData);
      if (!newPreservedTokens.some((t) => getTokenMint(t) === sellMint)) {
        newPreservedTokens.push(sellTokenData);
        tokensUpdated = true;
      }
    }

    if (buyTokenData) {
      const buyMint = getTokenMint(buyTokenData);
      if (!newPreservedTokens.some((t) => getTokenMint(t) === buyMint)) {
        newPreservedTokens.push(buyTokenData);
        tokensUpdated = true;
      }
    }

    // Update preservedTokens FIRST before swapping (this ensures tokens are available)
    if (tokensUpdated) {
      setPreservedTokens(newPreservedTokens);
    }

    // Mark that we're swapping to prevent useEffect from interfering
    justSwappedRef.current = true;

    // Swap the values - swap everything including balances
    setSellAmount(buyAmount);
    setBuyAmount(tempAmount);
    setSellToken(buyToken);
    // Always set buyToken to the previous sellToken (tempToken)
    setBuyToken(tempToken);
    setSellUsdValue(buyUsdValue);
    setBuyUsdValue(tempUsdValue);
    // Swap balances too
    setSellBalance(buyBalance);
    setBuyBalance(tempBalance);

    // Swap the last selected token states to preserve token data during swap
    // After swap: sellToken = old buyToken, buyToken = old sellToken (tempToken)

    // New sellToken is the old buyToken (current buyToken before swap)
    // Use buyTokenData if available, otherwise try tempBuyTokenState, then search in newPreservedTokens
    if (buyTokenData && getTokenMint(buyTokenData) === buyToken) {
      setLastSelectedSellToken(buyTokenData);
    } else if (
      tempBuyTokenState &&
      getTokenMint(tempBuyTokenState) === buyToken
    ) {
      setLastSelectedSellToken(tempBuyTokenState);
    } else {
      // Search in newPreservedTokens (which includes newly preserved tokens)
      const found = newPreservedTokens.find(
        (t) => getTokenMint(t) === buyToken,
      );
      setLastSelectedSellToken(found || null);
    }

    // New buyToken is the old sellToken (tempToken)
    // Use sellTokenData if available, otherwise try tempSellTokenState, then search in newPreservedTokens
    if (sellTokenData && getTokenMint(sellTokenData) === tempToken) {
      setLastSelectedBuyToken(sellTokenData);
    } else if (
      tempSellTokenState &&
      getTokenMint(tempSellTokenState) === tempToken
    ) {
      setLastSelectedBuyToken(tempSellTokenState);
    } else {
      // Search in newPreservedTokens (which includes newly preserved tokens)
      const found = newPreservedTokens.find(
        (t) => getTokenMint(t) === tempToken,
      );
      setLastSelectedBuyToken(found || null);
    }

    // Reset the flag after a longer delay to allow state updates to complete
    setTimeout(() => {
      justSwappedRef.current = false;
    }, 500);
  };

  // Helper to check if token has "/" in name or symbol (should be filtered out)
  const hasSlashInTokenNameOrSymbol = React.useCallback(
    (token: any): boolean => {
      const tokenName = token?.name || "";
      const tokenSymbol = getTokenSymbol(token) || "";
      return tokenName.includes("/") || tokenSymbol.includes("/");
    },
    [],
  );

  // Helper function to find token data from any source
  // Prioritizes tokens WITHOUT "/" in their names (e.g., prefer SOL over TERRA / SOL)
  const findTokenData = React.useCallback(
    (mint: string) => {
      // First, try to find tokens WITHOUT "/" in their names (preferred)
      const findTokenWithoutSlash = (tokenList: any[]) =>
        tokenList.find(
          (t) => getTokenMint(t) === mint && !hasSlashInTokenNameOrSymbol(t),
        );

      // Fallback: find any token with matching mint
      const findTokenAny = (tokenList: any[]) =>
        tokenList.find((t) => getTokenMint(t) === mint);

      // Prioritize tokens without "/" in all sources
      return (
        findTokenWithoutSlash(preservedTokens) ||
        findTokenWithoutSlash(sellTokens) ||
        findTokenWithoutSlash(walletTokens) ||
        findTokenWithoutSlash(trendingTokens) ||
        // Fallback to any match if no token without "/" found
        findTokenAny(preservedTokens) ||
        findTokenAny(sellTokens) ||
        findTokenAny(walletTokens) ||
        findTokenAny(trendingTokens)
      );
    },
    [
      preservedTokens,
      sellTokens,
      walletTokens,
      trendingTokens,
      hasSlashInTokenNameOrSymbol,
    ],
  );

  // Search for sell token - check preservedTokens first (searched tokens), then sellTokens, walletTokens, trendingTokens
  // Prioritize lastSelectedSellToken if it matches the mint (this is the exact token that was clicked)
  const selectedSellToken = React.useMemo(() => {
    // First check if lastSelectedSellToken matches and doesn't have "/" in its name
    if (
      lastSelectedSellToken &&
      getTokenMint(lastSelectedSellToken) === sellToken
    ) {
      const tokenName = lastSelectedSellToken?.name || "";
      const tokenSymbol = getTokenSymbol(lastSelectedSellToken) || "";
      // If it doesn't have "/", use it directly (this is the clicked token)
      if (!tokenName.includes("/") && !tokenSymbol.includes("/")) {
        return lastSelectedSellToken;
      }
      // If it has "/" but mint is SOL, try to find SOL without "/"
      if (
        sellToken === SOL_MINT &&
        (tokenName.includes("/") || tokenSymbol.includes("/"))
      ) {
        const solToken = findTokenData(SOL_MINT);
        if (
          solToken &&
          !(
            solToken?.name?.includes("/") ||
            getTokenSymbol(solToken)?.includes("/")
          )
        ) {
          return solToken;
        }
      }
    }
    // Otherwise use findTokenData which prioritizes tokens without "/"
    return findTokenData(sellToken);
  }, [findTokenData, sellToken, lastSelectedSellToken, SOL_MINT]);

  // Search for buy token - check preservedTokens first (searched tokens), then sellTokens, walletTokens, trendingTokens
  // Prioritize lastSelectedBuyToken if it matches the mint (this is the exact token that was clicked)
  const selectedBuyToken = React.useMemo(() => {
    // First check if lastSelectedBuyToken matches and doesn't have "/" in its name
    if (
      lastSelectedBuyToken &&
      getTokenMint(lastSelectedBuyToken) === buyToken
    ) {
      const tokenName = lastSelectedBuyToken?.name || "";
      const tokenSymbol = getTokenSymbol(lastSelectedBuyToken) || "";
      // If it doesn't have "/", use it directly (this is the clicked token)
      if (!tokenName.includes("/") && !tokenSymbol.includes("/")) {
        return lastSelectedBuyToken;
      }
      // If it has "/" but mint is SOL, try to find SOL without "/"
      if (
        buyToken === SOL_MINT &&
        (tokenName.includes("/") || tokenSymbol.includes("/"))
      ) {
        const solToken = findTokenData(SOL_MINT);
        if (
          solToken &&
          !(
            solToken?.name?.includes("/") ||
            getTokenSymbol(solToken)?.includes("/")
          )
        ) {
          return solToken;
        }
      }
    }
    // Otherwise use findTokenData which prioritizes tokens without "/"
    return findTokenData(buyToken);
  }, [findTokenData, buyToken, lastSelectedBuyToken, SOL_MINT]);

  // Initialize USDC token data if buyToken is USDC and we don't have it yet
  React.useEffect(() => {
    if (buyToken === USDC_MINT && !selectedBuyToken) {
      const usdcToken = {
        mint: USDC_MINT,
        address: USDC_MINT,
        symbol: "USDC",
        name: "USD Coin",
        icon: "/icons/usdc.svg",
        balance: 0,
        price: 1,
        isVerified: true,
        organicScore: null,
      };
      setPreservedTokens((prev) => {
        if (!prev.some((t) => getTokenMint(t) === USDC_MINT)) {
          return [...prev, usdcToken];
        }
        return prev;
      });
      setLastSelectedBuyToken(usdcToken);
    }
  }, [buyToken, USDC_MINT, selectedBuyToken]);

  // Helper to get token symbol - always returns the correct symbol
  // Use a function instead of useMemo to always check current ref values
  const getSellTokenSymbol = React.useCallback(() => {
    // First try selectedSellToken (which already checks all sources)
    if (selectedSellToken) {
      const symbol = getTokenSymbol(selectedSellToken);
      // Don't return "Unknown" or "TOKEN", return actual symbol/name or short address
      if (
        symbol &&
        symbol !== "TOKEN" &&
        symbol !== "Unknown" &&
        symbol !== "UNKNOWN"
      ) {
        return symbol;
      }
    }
    // Fallback: try to get from preservedTokens directly
    const preserved = preservedTokens.find(
      (t) => getTokenMint(t) === sellToken,
    );
    if (preserved) {
      const symbol = getTokenSymbol(preserved);
      if (
        symbol &&
        symbol !== "TOKEN" &&
        symbol !== "Unknown" &&
        symbol !== "UNKNOWN"
      ) {
        return symbol;
      }
    }
    // Check walletTokens directly
    const walletToken = walletTokens.find((t) => t.mint === sellToken);
    if (walletToken) {
      const symbol = getTokenSymbol(walletToken);
      if (
        symbol &&
        symbol !== "TOKEN" &&
        symbol !== "Unknown" &&
        symbol !== "UNKNOWN"
      ) {
        return symbol;
      }
    }
    // Check trendingTokens directly
    const trendingToken = trendingTokens.find(
      (t: any) => getTokenMint(t) === sellToken,
    );
    if (trendingToken) {
      const symbol = getTokenSymbol(trendingToken);
      if (
        symbol &&
        symbol !== "TOKEN" &&
        symbol !== "Unknown" &&
        symbol !== "UNKNOWN"
      ) {
        return symbol;
      }
    }
    // Use last selected token from search if available
    if (
      lastSelectedSellToken &&
      getTokenMint(lastSelectedSellToken) === sellToken
    ) {
      const symbol = getTokenSymbol(lastSelectedSellToken);
      if (
        symbol &&
        symbol !== "TOKEN" &&
        symbol !== "Unknown" &&
        symbol !== "UNKNOWN"
      ) {
        return symbol;
      }
    }
    // Last resort: return known token symbols or short address
    if (sellToken === SOL_MINT) return "SOL";
    if (sellToken === USDC_MINT) return "USDC";
    return shortAddress(sellToken);
  }, [
    selectedSellToken,
    preservedTokens,
    walletTokens,
    trendingTokens,
    sellToken,
    lastSelectedSellToken,
    SOL_MINT,
    USDC_MINT,
  ]);

  const getBuyTokenSymbol = React.useCallback(() => {
    // First try selectedBuyToken (which already checks all sources)
    if (selectedBuyToken) {
      const symbol = getTokenSymbol(selectedBuyToken);
      // Don't return "Unknown" or "TOKEN", return actual symbol/name or short address
      if (
        symbol &&
        symbol !== "TOKEN" &&
        symbol !== "Unknown" &&
        symbol !== "UNKNOWN"
      ) {
        return symbol;
      }
    }
    // Fallback: try to get from preservedTokens directly
    const preserved = preservedTokens.find((t) => getTokenMint(t) === buyToken);
    if (preserved) {
      const symbol = getTokenSymbol(preserved);
      if (
        symbol &&
        symbol !== "TOKEN" &&
        symbol !== "Unknown" &&
        symbol !== "UNKNOWN"
      ) {
        return symbol;
      }
    }
    // Check walletTokens directly
    const walletToken = walletTokens.find((t) => t.mint === buyToken);
    if (walletToken) {
      const symbol = getTokenSymbol(walletToken);
      if (
        symbol &&
        symbol !== "TOKEN" &&
        symbol !== "Unknown" &&
        symbol !== "UNKNOWN"
      ) {
        return symbol;
      }
    }
    // Check trendingTokens directly
    const trendingToken = trendingTokens.find(
      (t: any) => getTokenMint(t) === buyToken,
    );
    if (trendingToken) {
      const symbol = getTokenSymbol(trendingToken);
      if (
        symbol &&
        symbol !== "TOKEN" &&
        symbol !== "Unknown" &&
        symbol !== "UNKNOWN"
      ) {
        return symbol;
      }
    }
    // Use last selected token from search if available
    if (
      lastSelectedBuyToken &&
      getTokenMint(lastSelectedBuyToken) === buyToken
    ) {
      const symbol = getTokenSymbol(lastSelectedBuyToken);
      if (
        symbol &&
        symbol !== "TOKEN" &&
        symbol !== "Unknown" &&
        symbol !== "UNKNOWN"
      ) {
        return symbol;
      }
    }
    // Last resort: return known token symbols or short address
    if (buyToken === SOL_MINT) return "SOL";
    if (buyToken === USDC_MINT) return "USDC";
    return shortAddress(buyToken);
  }, [
    selectedBuyToken,
    preservedTokens,
    walletTokens,
    trendingTokens,
    buyToken,
    lastSelectedBuyToken,
    SOL_MINT,
    USDC_MINT,
  ]);

  React.useEffect(() => {
    // Don't update balance if we just swapped (balances are swapped directly in handleSwapInputs)
    if (justSwappedRef.current) {
      justSwappedRef.current = false; // Reset the flag after one use
      return;
    }

    if (sellToken) {
      // Check wallet balance directly by mint first
      const walletToken = walletTokens.find((t) => t.mint === sellToken);
      if (walletToken && walletToken.balance !== undefined) {
        setSellBalance(walletToken.balance.toFixed(4));
      } else if (selectedSellToken) {
        // Fallback: try to find by selectedSellToken's mint
        const tokenMint = getTokenMint(selectedSellToken);
        const walletTokenByMint = walletTokens.find(
          (t) => t.mint === tokenMint,
        );
        if (walletTokenByMint && walletTokenByMint.balance !== undefined) {
          setSellBalance(walletTokenByMint.balance.toFixed(4));
        } else {
          // Token not in wallet - show 0.00
          setSellBalance("0.00");
        }
      } else {
        // Token not found at all - show 0.00
        setSellBalance("0.00");
      }
    } else {
      setSellBalance(null);
    }
  }, [selectedSellToken, walletTokens, sellToken]);

  React.useEffect(() => {
    // Don't update balance if we just swapped (balances are swapped directly in handleSwapInputs)
    if (justSwappedRef.current) {
      justSwappedRef.current = false; // Reset the flag after one use
      return;
    }

    if (buyToken) {
      // Check wallet balance for buy token - search directly by mint first
      const walletToken = walletTokens.find((t) => t.mint === buyToken);
      if (walletToken && walletToken.balance !== undefined) {
        setBuyBalance(walletToken.balance.toFixed(4));
      } else if (selectedBuyToken) {
        // Fallback: try to find by selectedBuyToken's mint
        const tokenMint = getTokenMint(selectedBuyToken);
        const walletTokenByMint = walletTokens.find(
          (t) => t.mint === tokenMint,
        );
        if (walletTokenByMint && walletTokenByMint.balance !== undefined) {
          setBuyBalance(walletTokenByMint.balance.toFixed(4));
        } else {
          // Token not in wallet - show 0.00
          setBuyBalance("0.00");
        }
      } else {
        // Token not found at all - show 0.00
        setBuyBalance("0.00");
      }
    } else {
      setBuyBalance("0.00");
    }
  }, [selectedBuyToken, walletTokens, buyToken]);

  const isInsufficientBalance = React.useMemo(() => {
    if (!sellAmount || !selectedSellToken) return false;
    const walletToken = walletTokens.find(
      (t) => t.mint === getTokenMint(selectedSellToken),
    );
    if (!walletToken || walletToken.balance === undefined) return false;
    const sellAmountNum = parseFloat(sellAmount);
    if (isNaN(sellAmountNum) || sellAmountNum <= 0) return false;
    // Use the same rounding logic as the Max button to ensure consistency
    // Round both values to 4 decimal places using Math.floor to prevent rounding up
    const roundedSellAmount = Math.floor(sellAmountNum * 10000) / 10000;
    const roundedBalance = Math.floor(walletToken.balance * 10000) / 10000;
    // Use a small epsilon (0.00001) to account for floating point precision, but ensure
    // we don't allow amounts that exceed the balance
    return roundedSellAmount > roundedBalance + 0.00001;
  }, [sellAmount, selectedSellToken, walletTokens]);

  React.useEffect(() => {
    if (sellAmount && selectedSellToken) {
      const amount = parseFloat(sellAmount);
      if (!isNaN(amount)) {
        const price =
          selectedSellToken.price ||
          (sellToken === SOL_MINT && solPrice ? parseFloat(solPrice) : null);
        if (price) {
          setSellUsdValue((amount * price).toFixed(2));
        } else {
          setSellUsdValue(null);
        }
      } else {
        setSellUsdValue(null);
      }
    } else if (sellAmount && sellToken === SOL_MINT && solPrice) {
      const amount = parseFloat(sellAmount);
      if (!isNaN(amount)) {
        setSellUsdValue((amount * parseFloat(solPrice)).toFixed(2));
      } else {
        setSellUsdValue(null);
      }
    } else {
      setSellUsdValue(null);
    }
  }, [sellAmount, sellToken, selectedSellToken, solPrice, SOL_MINT]);

  // Track current query parameters to avoid stale errors
  React.useEffect(() => {
    if (sellAmount && sellToken && buyToken && sellToken !== buyToken) {
      const queryKey = `${sellToken}-${buyToken}-${sellAmount}`;
      currentQueryRef.current = queryKey;
    } else {
      currentQueryRef.current = "";
    }
  }, [sellToken, buyToken, sellAmount]);

  // Update buyAmount when quote is received
  React.useEffect(() => {
    if (quoteData?.data) {
      const transaction = quoteData.data.transaction;
      if (!transaction) {
        setBuyAmount("");
        setStoredTransaction(null);
        setPriceImpactPct(null);
        return;
      }

      const outAmount = quoteData.data.outAmount;
      if (outAmount) {
        const buyDecimals = getTokenDecimals(buyToken);
        const buyAmountValue = Number(outAmount) / Math.pow(10, buyDecimals);
        setBuyAmount(buyAmountValue.toFixed(6));
      } else {
        setBuyAmount("");
        setStoredTransaction(null);
        setPriceImpactPct(null);
        return;
      }

      // Store price impact percentage if available
      if (quoteData.data.priceImpactPct) {
        setPriceImpactPct(quoteData.data.priceImpactPct);
        console.log("💹 Price Impact %:", quoteData.data.priceImpactPct);
      } else {
        setPriceImpactPct(null);
      }

      console.log(
        "✅ Storing transaction from quote:",
        transaction.substring(0, 50) + "...",
      );
      setStoredTransaction(transaction);
    } else if (!isLoadingQuote && sellAmount) {
      // Only handle errors if they're for the current query parameters
      // This prevents stale errors from previous queries affecting the UI
      const queryKey = `${sellToken}-${buyToken}-${sellAmount}`;
      const isErrorForCurrentQuery =
        quoteError && currentQueryRef.current === queryKey;

      if (isErrorForCurrentQuery && !quoteData?.data) {
        // Only clear if we don't have a stored transaction for the current query
        // This prevents clearing valid transactions due to transient errors
        if (!storedTransaction) {
          setBuyAmount("");
          setStoredTransaction(null);
          setPriceImpactPct(null);
        }
      } else if (!sellAmount) {
        setBuyAmount("");
        setStoredTransaction(null);
        setPriceImpactPct(null);
      }
    }
  }, [
    quoteData,
    buyToken,
    sellToken,
    isLoadingQuote,
    sellAmount,
    quoteError,
    getTokenDecimals,
    storedTransaction,
  ]);

  React.useEffect(() => {
    if (buyAmount && selectedBuyToken) {
      const amount = parseFloat(buyAmount);
      if (!isNaN(amount)) {
        const price =
          selectedBuyToken.price ||
          (buyToken === SOL_MINT && solPrice ? parseFloat(solPrice) : null);
        if (price) {
          setBuyUsdValue((amount * price).toFixed(2));
        } else {
          setBuyUsdValue(null);
        }
      } else {
        setBuyUsdValue(null);
      }
    } else if (buyAmount && buyToken === SOL_MINT && solPrice) {
      const amount = parseFloat(buyAmount);
      if (!isNaN(amount)) {
        setBuyUsdValue((amount * parseFloat(solPrice)).toFixed(2));
      } else {
        setBuyUsdValue(null);
      }
    } else {
      setBuyUsdValue(null);
    }
  }, [buyAmount, buyToken, selectedBuyToken, solPrice, SOL_MINT]);

  const pathname = usePathname();

  const toastTestIndex = React.useRef(0);
  const TOAST_TEST_COUNT = 8;
  const [toastTestLabel, setToastTestLabel] = React.useState(1);

  const handleTest = React.useCallback(() => {
    const i = toastTestIndex.current % TOAST_TEST_COUNT;
    switch (i) {
      case 0:
        toast.success("Success toast test", {
          description: "This is a success message",
        });
        break;
      case 1:
        toast.error("Error toast test", {
          description: "This is an error message",
        });
        break;
      case 2:
        toast.info("Info toast test");
        break;
      case 3:
        toast.custom(() => (
          <PositionToast
            status="opening"
            amount="100"
            symbol="USDC"
            pair="SOL-USDC"
            description="Opening position..."
            progress={45}
          />
        ));
        break;
      case 4:
        toast.custom(() => (
          <PositionToast
            status="success"
            amount="100"
            symbol="USDC"
            pair="SOL-USDC"
            description="Position opened successfully!"
            explorerUrl="https://solscan.io"
            progress={100}
          />
        ));
        break;
      case 5:
        toast.custom(() => (
          <PositionToast
            status="failed"
            amount="100"
            symbol="USDC"
            pair="SOL-USDC"
            description="Transaction failed. Please try again."
            showRetry
          />
        ));
        break;
      case 6:
        toast.custom(() => (
          <SimpleToast
            type="success"
            title="Simple Success"
            description="This is a simple success toast"
          />
        ));
        break;
      case 7:
        toast.custom(() => (
          <SimpleToast
            type="error"
            title="Simple Error"
            description="This is a simple error toast"
          />
        ));
        break;
    }
    toastTestIndex.current = i + 1;
    setToastTestLabel(((i + 1) % TOAST_TEST_COUNT) + 1);
  }, []);

  // Check if we're on the discover page (root route)
  const isDiscoverPage = pathname === "/";
  const { pncRwaEnabled, togglePncRwa } = usePncRwaMode();

  return (
    <footer className="absolute bottom-0 left-0 z-50 h-14 w-full border-t border-[#0F1F30] bg-[#000D1E]">
      <MaxWidthWrapper
        className={cn(
          "flex h-14 w-[min(99vw,100%-2rem)] items-center justify-between",
          {
            // "": isDiscoverPage,
          },
        )}
      >
        <div className="flex items-center gap-2">
          <a
            href="https://paystream-finance.betteruptime.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button className="flex h-8 cursor-pointer items-center gap-2 rounded-md bg-[#102120] px-3 text-sm text-[#63E2B1] hover:bg-[#102120]">
              <div className="size-2 rounded-full bg-[#63E2B1]" />
              Connection is stable
            </Button>
          </a>
          {/* <Button
            onClick={handleTest}
            className="flex h-8 cursor-pointer items-center gap-2 rounded-md bg-[#c11111] px-3 text-sm text-[#e2cb63] hover:bg-[#102120]"
          >
            <div className="size-2 rounded-full bg-[#e26363]" />
            test {toastTestLabel}/{TOAST_TEST_COUNT}
          </Button> */}

          <div className="">
            <Dialog>
              <DialogTrigger className="flex h-8 cursor-pointer items-center gap-2 rounded-md border border-[#0F1F30] px-2 text-sm text-white">
                <Image
                  src="/icons/jup.svg"
                  className="3"
                  alt="jup.svg"
                  width={16}
                  height={16}
                />
                Swap
              </DialogTrigger>
              <DialogContent className="p-0" closeIcon>
                <DialogTitle></DialogTitle>
                <div className="relative w-full">
                  <p className="absolute -top-9 left-0 font-light text-white">
                    Swap Tokens
                  </p>

                  <div className="absolute -top-[41px] right-0 flex items-center gap-1 rounded-xl bg-[#111D2D] px-3 py-1 text-sm font-light text-white">
                    <span className="text-[#9FA5AB]">Powered by </span>
                    <Image
                      src="/icons/jup.svg"
                      className="shrink-0"
                      alt="jup.svg"
                      width={20}
                      height={20}
                    />
                    Jupiter
                  </div>

                  <div className="relative flex w-full flex-col rounded-2xl border-b-2 border-[#000E1E] bg-[#021935] p-5">
                    <button
                      onClick={handleSwapInputs}
                      className="absolute -bottom-6 left-1/2 flex size-11 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full border-[3.5px] border-[#000E1E] bg-[#021935] transition-colors hover:bg-[#041223]"
                    >
                      {isSwapButtonClicked ? (
                        <ChevronUp className="text-[#BCEAFF]" />
                      ) : (
                        <ChevronDown className="text-[#BCEAFF]" />
                      )}
                    </button>

                    <p className="text-sm text-[#9AA3AE]">Sell</p>

                    <div className="mt-5 flex w-full items-center justify-between">
                      <Input
                        className="w-full border-0 bg-transparent pl-0 text-3xl! font-medium text-white shadow-none ring-0 outline-none placeholder:text-white/60"
                        placeholder="0.2"
                        value={sellAmount}
                        onChange={(e) => {
                          const value = e.target.value;
                          const filteredValue = value.replace(/[^0-9.]/g, "");
                          setSellAmount(filteredValue);
                        }}
                        onKeyDown={(e) => {
                          if (
                            !/[0-9]/.test(e.key) &&
                            e.key !== "Backspace" &&
                            e.key !== "Delete" &&
                            e.key !== "ArrowLeft" &&
                            e.key !== "ArrowRight" &&
                            e.key !== "Tab" &&
                            e.key !== "." &&
                            !(e.ctrlKey || e.metaKey)
                          ) {
                            e.preventDefault();
                          }
                          if (e.key === "." && sellAmount.includes(".")) {
                            e.preventDefault();
                          }
                        }}
                        type="text"
                      />

                      <TokenSelect
                        tokens={sellTokens}
                        value={sellToken}
                        onValueChange={(mint) => {
                          setSellToken(mint);
                          // onValueChange is called first, but onTokenSelected will be called next
                          // with the exact token that was clicked, so we don't need to find it here
                          // The onTokenSelected callback will handle preserving the correct token
                        }}
                        excludeToken={buyToken}
                        placeholder="Select token"
                        isLoading={isLoadingWalletTokens || isLoadingTrending}
                        walletTokens={walletTokens}
                        tokenVerificationData={tokenVerificationData}
                        isFetchingVerificationData={isFetchingVerificationData}
                        tokenIconsMap={tokenIconsMap}
                        fetchingIcons={fetchingIcons}
                        onTokenSelected={(tokenData: any) => {
                          // This is called with the EXACT token that was clicked
                          const mint = getTokenMint(tokenData);

                          // Check if the token has "/" in its name - this should NEVER happen since we filter them out
                          const tokenName = tokenData?.name || "";
                          const tokenSymbol = getTokenSymbol(tokenData) || "";
                          const hasSlash =
                            tokenName.includes("/") ||
                            tokenSymbol.includes("/");

                          // CRITICAL: If somehow a token with "/" was clicked, reject it completely
                          if (hasSlash) {
                            console.error(
                              `[Sell Token] ERROR: Token with "/" was clicked! This should never happen.`,
                              tokenData,
                            );
                            // Try to find a clean version
                            const cleanToken = findTokenData(mint);
                            if (
                              cleanToken &&
                              !hasSlashInTokenNameOrSymbol(cleanToken)
                            ) {
                              setLastSelectedSellToken(cleanToken);
                              setPreservedTokens((prev: any[]) => {
                                // Remove ALL tokens with "/" that have this mint
                                const cleaned = prev.filter((t) => {
                                  if (getTokenMint(t) === mint) {
                                    return !hasSlashInTokenNameOrSymbol(t);
                                  }
                                  return true;
                                });
                                // Add clean token if it doesn't exist
                                if (
                                  !cleaned.some((t) => getTokenMint(t) === mint)
                                ) {
                                  return [...cleaned, cleanToken];
                                }
                                return cleaned;
                              });
                              refetchWalletTokens();
                              return;
                            }
                            refetchWalletTokens();
                            return;
                          }

                          setLastSelectedSellToken(tokenData);
                          setPreservedTokens((prev: any[]) => {
                            // Remove ALL tokens with "/" that have the same mint
                            const cleaned = prev.filter((t) => {
                              const tMint = getTokenMint(t);
                              if (tMint === mint) {
                                return !hasSlashInTokenNameOrSymbol(t);
                              }
                              return true;
                            });
                            // Add the clicked token if it doesn't exist
                            if (
                              !cleaned.some((t) => getTokenMint(t) === mint)
                            ) {
                              return [...cleaned, tokenData];
                            }
                            return cleaned;
                          });
                          // Refetch wallet tokens to get balance for the selected token
                          refetchWalletTokens();
                        }}
                        onOpenChange={(open: boolean) => {
                          if (open) {
                            refetchWalletTokens();
                            // Fetch verification data when popover opens (lazy loading)
                            fetchVerificationData();
                          }
                        }}
                      />
                    </div>

                    <div className="mt-6 flex w-full items-center justify-between">
                      <p className="w-full text-sm! font-normal text-[#9BA2AE]">
                        {sellUsdValue ? `$${sellUsdValue}` : "$0.00"}
                      </p>

                      <div className="flex items-center gap-1.5 text-sm! font-normal text-nowrap text-[#9BA2AE]">
                        {isInsufficientBalance ? (
                          <span className="text-red-400">
                            Insufficient Balance
                          </span>
                        ) : (
                          <>
                            {sellBalance ?? "0.00"} {getSellTokenSymbol()}
                          </>
                        )}
                        <Button
                          onClick={() => {
                            if (selectedSellToken) {
                              const walletToken = walletTokens.find(
                                (t) =>
                                  t.mint === getTokenMint(selectedSellToken),
                              );
                              if (
                                walletToken &&
                                walletToken.balance !== undefined
                              ) {
                                // Use Math.floor to ensure we never exceed the balance
                                // Multiply by 10000, floor it, then divide by 10000 to get 4 decimal places
                                // This ensures the amount will never trigger "Insufficient Balance"
                                const maxAmount =
                                  Math.floor(walletToken.balance * 10000) /
                                  10000;
                                // Use toFixed(4) to format to exactly 4 decimal places
                                // This matches the format used in the insufficient balance check
                                setSellAmount(maxAmount.toFixed(4));
                              }
                            }
                          }}
                          className="h-5! cursor-pointer rounded-2xl bg-[#112641] px-2! text-xs text-[#9FA8B3] hover:bg-[#172945]"
                        >
                          Max
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="flex w-full flex-col rounded-2xl border-t-2 border-[#000E1E] bg-[#021935] p-5">
                    <p className="text-sm text-[#9AA3AE]">Buy</p>

                    <div className="mt-5 flex w-full items-center justify-between">
                      {isLoadingQuote && sellAmount ? (
                        <Skeleton className="h-10 w-40 rounded bg-[#0F1F30]" />
                      ) : (
                        <Input
                          className="w-full border-0 bg-transparent pl-0 text-3xl! font-medium text-white shadow-none ring-0 outline-none placeholder:text-white/60"
                          placeholder="145"
                          value={buyAmount}
                          onChange={(e) => {
                            const value = e.target.value;
                            const filteredValue = value.replace(/[^0-9.]/g, "");
                            setBuyAmount(filteredValue);
                          }}
                          onKeyDown={(e) => {
                            if (
                              !/[0-9]/.test(e.key) &&
                              e.key !== "Backspace" &&
                              e.key !== "Delete" &&
                              e.key !== "ArrowLeft" &&
                              e.key !== "ArrowRight" &&
                              e.key !== "Tab" &&
                              e.key !== "." &&
                              !(e.ctrlKey || e.metaKey)
                            ) {
                              e.preventDefault();
                            }
                            if (e.key === "." && buyAmount.includes(".")) {
                              e.preventDefault();
                            }
                          }}
                          type="text"
                        />
                      )}

                      <TokenSelect
                        tokens={sellTokens}
                        value={buyToken}
                        onValueChange={(mint) => {
                          setBuyToken(mint);
                          // onValueChange is called first, but onTokenSelected will be called next
                          // with the exact token that was clicked, so we don't need to find it here
                          // The onTokenSelected callback will handle preserving the correct token
                        }}
                        excludeToken={sellToken}
                        placeholder="Select token"
                        isLoading={isLoadingWalletTokens || isLoadingTrending}
                        walletTokens={walletTokens}
                        tokenVerificationData={tokenVerificationData}
                        isFetchingVerificationData={isFetchingVerificationData}
                        tokenIconsMap={tokenIconsMap}
                        fetchingIcons={fetchingIcons}
                        onTokenSelected={(tokenData: any) => {
                          // This is called with the EXACT token that was clicked
                          const mint = getTokenMint(tokenData);

                          // Check if the token has "/" in its name - this should NEVER happen since we filter them out
                          const tokenName = tokenData?.name || "";
                          const tokenSymbol = getTokenSymbol(tokenData) || "";
                          const hasSlash =
                            tokenName.includes("/") ||
                            tokenSymbol.includes("/");

                          // CRITICAL: If somehow a token with "/" was clicked, reject it completely
                          if (hasSlash) {
                            // Try to find a clean version
                            const cleanToken = findTokenData(mint);
                            if (
                              cleanToken &&
                              !hasSlashInTokenNameOrSymbol(cleanToken)
                            ) {
                              setLastSelectedBuyToken(cleanToken);
                              setPreservedTokens((prev: any[]) => {
                                // Remove ALL tokens with "/" that have this mint
                                const cleaned = prev.filter((t) => {
                                  if (getTokenMint(t) === mint) {
                                    return !hasSlashInTokenNameOrSymbol(t);
                                  }
                                  return true;
                                });
                                // Add clean token if it doesn't exist
                                if (
                                  !cleaned.some((t) => getTokenMint(t) === mint)
                                ) {
                                  return [...cleaned, cleanToken];
                                }
                                return cleaned;
                              });
                              refetchWalletTokens();
                              return;
                            }
                            refetchWalletTokens();
                            return;
                          }

                          // Token is clean, store it
                          setLastSelectedBuyToken(tokenData);
                          setPreservedTokens((prev: any[]) => {
                            // Remove ALL tokens with "/" that have the same mint
                            const cleaned = prev.filter((t) => {
                              const tMint = getTokenMint(t);
                              if (tMint === mint) {
                                return !hasSlashInTokenNameOrSymbol(t);
                              }
                              return true;
                            });
                            // Add the clicked token if it doesn't exist
                            if (
                              !cleaned.some((t) => getTokenMint(t) === mint)
                            ) {
                              return [...cleaned, tokenData];
                            }
                            return cleaned;
                          });
                          // Refetch wallet tokens to get balance for the selected token
                          refetchWalletTokens();
                        }}
                        onOpenChange={(open: boolean) => {
                          if (open) {
                            refetchWalletTokens();
                            // Fetch verification data when popover opens (lazy loading)
                            fetchVerificationData();
                          }
                        }}
                      />
                    </div>

                    <div className="mt-4 flex w-full items-start justify-between">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <p className="w-full text-sm! font-normal text-[#9BA2AE]">
                            {buyUsdValue ? `$${buyUsdValue}` : "$0.00"}
                          </p>
                          {priceImpactPct !== null && buyUsdValue && (
                            <p
                              className={cn(
                                "text-xs font-medium",
                                parseFloat(priceImpactPct) >= 0
                                  ? "text-green-400"
                                  : "text-red-400",
                              )}
                            >
                              ({parseFloat(priceImpactPct) >= 0 ? "+" : ""}
                              {(parseFloat(priceImpactPct) * 100).toFixed(2)}%)
                            </p>
                          )}
                        </div>

                        {isLoadingQuote && sellAmount && (
                          <p className="text-xs text-[#9BA2AE]">
                            Getting quote...
                          </p>
                        )}

                        {/* Show error if there's an error field in quote data */}
                        {quoteData?.data &&
                          (quoteData.data as any).error &&
                          !isLoadingQuote && (
                            <p className="text-xs text-red-400">
                              {(quoteData.data as any).error}
                            </p>
                          )}

                        {!quoteData?.data &&
                          !storedTransaction &&
                          sellAmount &&
                          quoteError &&
                          !isLoadingQuote &&
                          currentQueryRef.current ===
                            `${sellToken}-${buyToken}-${sellAmount}` && (
                            <p className="text-xs text-red-400">
                              {getErrorMessage(quoteError) || "Quote not found"}
                            </p>
                          )}
                      </div>

                      <div className="flex items-center gap-1.5 text-sm! font-normal text-nowrap text-[#9BA2AE]">
                        {buyBalance ?? "0.00"} {getBuyTokenSymbol()}
                      </div>
                    </div>
                  </div>

                  <Button
                    variant="primary"
                    className="font-ibm-plex-serif mt-3 h-10! w-full cursor-pointer rounded-lg bg-[#BCEBFF] py-3 text-lg font-medium tracking-[-1%] text-black italic transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={
                      !sellAmount ||
                      !buyAmount ||
                      parseFloat(sellAmount) <= 0 ||
                      parseFloat(buyAmount) <= 0 ||
                      (!storedTransaction && !quoteData?.data?.transaction) ||
                      // Disable if transaction is empty string
                      storedTransaction === "" ||
                      quoteData?.data?.transaction === "" ||
                      // Disable if there's an error field in quote response
                      Boolean(
                        quoteData?.data && (quoteData.data as any).error,
                      ) ||
                      !!quoteError ||
                      isLoadingQuote ||
                      executeSwapMutation.isPending ||
                      !authenticated
                    }
                    onClick={async () => {
                      // Prevent multiple simultaneous executions
                      if (isExecutingRef.current) {
                        console.warn("Swap already in progress");
                        return;
                      }

                      if (!authenticated) {
                        return;
                      }

                      // Capture transaction before resetting (to prevent using stale data after)
                      const transactionToUse =
                        storedTransaction || quoteData?.data?.transaction;

                      // Reset transaction and outAmount immediately when execute is called
                      // This prevents using stale transaction data in the UI
                      setBuyAmount("");
                      setStoredTransaction(null);

                      if (!transactionToUse) {
                        console.error("❌ No transaction available");
                        console.log("storedTransaction:", storedTransaction);
                        console.log("quoteData:", quoteData);
                        if (toastIdRef.current) {
                          positionToast.failed(
                            toastIdRef.current,
                            "No transaction available. Please try again.",
                          );
                          toastIdRef.current = null;
                        }
                        return;
                      }

                      console.log(
                        "🚀 Executing swap with transaction:",
                        transactionToUse.substring(0, 50) + "...",
                      );

                      if (!sellAmount || parseFloat(sellAmount) <= 0) {
                        console.error("Invalid sell amount");
                        return;
                      }

                      isExecutingRef.current = true;

                      // Get token symbols and icons - search more thoroughly to ensure we find the tokens
                      // First try selected tokens, then search in all available token lists
                      const sellTokenObj =
                        selectedSellToken ||
                        sellTokens.find((t) => getTokenMint(t) === sellToken) ||
                        walletTokens.find((t) => t.mint === sellToken) ||
                        trendingTokens.find(
                          (t: any) => getTokenMint(t) === sellToken,
                        );

                      const buyTokenObj =
                        selectedBuyToken ||
                        trendingTokens.find(
                          (t: any) => getTokenMint(t) === buyToken,
                        ) ||
                        walletTokens.find((t) => t.mint === buyToken) ||
                        sellTokens.find((t) => getTokenMint(t) === buyToken);

                      // Get symbols - use token object if found, otherwise try to get from mint
                      const sellTokenSymbol = sellTokenObj
                        ? getTokenSymbol(sellTokenObj)
                        : sellToken === SOL_MINT
                          ? "SOL"
                          : sellToken === USDC_MINT
                            ? "USDC"
                            : "TOKEN";
                      const buyTokenSymbol = buyTokenObj
                        ? getTokenSymbol(buyTokenObj)
                        : buyToken === SOL_MINT
                          ? "SOL"
                          : buyToken === USDC_MINT
                            ? "USDC"
                            : "TOKEN";

                      const sellTokenIcon = sellTokenObj
                        ? getTokenIcon(sellTokenObj)
                        : "/icons/sol.svg";

                      const buyTokenIcon = buyTokenObj
                        ? getTokenIcon(buyTokenObj)
                        : "/icons/sol.svg";

                      // Store swap details for success toast (including icons and mints for debugging)
                      swapDetailsRef.current = {
                        sellAmount,
                        buyAmount,
                        sellTokenSymbol,
                        buyTokenSymbol,
                        sellTokenIcon,
                        buyTokenIcon,
                        sellTokenMint: sellToken, // Store mint for debugging
                        buyTokenMint: buyToken, // Store mint for debugging
                      };

                      // Step 1: Open toast at 0% when button is clicked
                      // Clear any existing toast ID first (in case of previous failed swap)
                      if (toastIdRef.current) {
                        // Dismiss any existing toast before creating a new one
                        toastIdRef.current = null;
                      }

                      const newToastId = positionToast.open({
                        amount: sellAmount,
                        symbol: sellTokenIcon,
                        pair: "", // Not used for swap toasts
                        description: "Initializing swap...",
                        title: "Processing swap",
                        isSwapToast: true,
                        swapSellAmount: sellAmount,
                        swapSellIcon: sellTokenIcon,
                        swapBuyAmount: buyAmount,
                        swapBuyIcon: buyTokenIcon,
                      });
                      toastIdRef.current = newToastId;

                      try {
                        // Step 2: Update progress as we prepare
                        positionToast.updateProgress(
                          newToastId,
                          10,
                          "Preparing swap...",
                        );

                        // Refresh access token before making the API call
                        const accessToken = await getAccessToken();
                        if (accessToken) {
                          sessionStorage.setItem(
                            "privy-access-token",
                            accessToken,
                          );
                        }

                        // Step 3: Update to 50% when executing swap
                        positionToast.reachSwapIntegration(
                          newToastId,
                          "Executing swap through Jupiter...",
                        );

                        // Step 4: Call the mutation and await it
                        // The mutation will handle success/error via callbacks
                        console.log(
                          "📤 Sending transaction to execute API:",
                          transactionToUse.substring(0, 50) + "...",
                        );
                        await executeSwapMutation.mutateAsync({
                          transaction: transactionToUse,
                        });
                        console.log("✅ Execute mutation completed");

                        // Note: Progress will be updated to 100% in onSuccess callback
                      } catch (error) {
                        console.error("Failed to execute swap:", error);
                        // Get user-friendly error message
                        const errorMessage =
                          getErrorMessage(error) ||
                          "Swap execution failed. Please try again.";

                        // Handle error if toastIdRef is still set
                        if (toastIdRef.current) {
                          positionToast.failed(
                            toastIdRef.current,
                            errorMessage,
                          );
                          // Don't clear toastIdRef immediately - let the error toast display
                        } else {
                          // Fallback: Create a new error toast if no toast ID exists
                          const swapDetails = swapDetailsRef.current;
                          const sellTokenSymbol =
                            swapDetails?.sellTokenSymbol ||
                            getSellTokenSymbol();
                          const buyTokenSymbol =
                            swapDetails?.buyTokenSymbol || getBuyTokenSymbol();
                          const sellAmountForDisplay =
                            swapDetails?.sellAmount || sellAmount || "0";
                          const buyAmountForDisplay =
                            swapDetails?.buyAmount || buyAmount || "0";
                          const sellIcon =
                            swapDetails?.sellTokenIcon || "/icons/sol.svg";
                          const buyIcon =
                            swapDetails?.buyTokenIcon || "/icons/sol.svg";

                          toast.custom(() => (
                            <PositionToast
                              status="failed"
                              amount={sellAmountForDisplay}
                              symbol={sellIcon}
                              pair="" // Not used for swap toasts
                              title="Swap failed"
                              description={errorMessage}
                              isSwapToast={true}
                              swapSellAmount={sellAmountForDisplay}
                              swapSellIcon={sellIcon}
                              swapBuyAmount={buyAmountForDisplay}
                              swapBuyIcon={buyIcon}
                            />
                          ));
                        }
                      } finally {
                        isExecutingRef.current = false;
                      }
                    }}
                  >
                    {executeSwapMutation.isPending
                      ? "Swapping..."
                      : isLoadingQuote
                        ? "Loading quote..."
                        : "Swap"}
                  </Button>

                  {/* <Accordion
                    type="single"
                    collapsible
                    className="absolute -bottom-[200px] left-0 h-full max-h-[200px] w-full"
                    defaultValue="item-1"
                  >
                    <AccordionItem value="1" className="border-0">
                      <AccordionTrigger
                        className="flex w-full items-center justify-between py-2 text-sm font-normal text-[#999EA5] hover:no-underline"
                        customIcon={
                          <div className="flex items-center gap-2">
                            <span>Fees: $0.14</span>
                            <ChevronDownIcon
                              width={16}
                              height={16}
                              strokeWidth={2}
                              className={cn(
                                "shrink-0 text-[#999EA5] transition-transform duration-200",
                              )}
                              aria-hidden="true"
                            />
                          </div>
                        }
                      >
                        1 SOL = $180
                      </AccordionTrigger>
                      <AccordionContent className="flex flex-col gap-3 rounded-md border border-[#172945] p-3 px-4 shadow-none">
                        <div className="flex items-center justify-between text-[#BBEBFF] transition group-hover:pointer-events-none group-hover:blur-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-normal tracking-[-1%] text-[#7699AD]">
                              Position Cost
                            </span>
                          </div>
                          N/A
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion> */}
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="flex h-8 cursor-pointer items-center gap-2 rounded-md border border-[#0F1F30] px-2 py-1 text-sm text-white">
            <img src="/icons/sol.svg" className="size-4" alt="sol.svg" />$
            {loadingPrice ? "..." : (solPrice ?? "N/A")}
          </div>

          <div className="flex h-8 cursor-pointer items-center gap-2 rounded-md border border-[#0F1F30] px-2 py-1 text-sm text-white">
            <img src="/icons/eth.svg" className="size-4" alt="eth.svg" />$
            {loadingEthPrice ? "..." : (ethPrice ?? "N/A")}
          </div>

          <div className="flex h-8 cursor-pointer items-center gap-2 rounded-md border border-[#0F1F30] px-2 py-1 text-sm text-white">
            <img src="/icons/btc.svg" className="size-4" alt="btc.svg" />$
            {loadingBtcPrice ? "..." : (btcPrice ?? "N/A")}
          </div>

          <div className="flex h-8 cursor-pointer items-center gap-2 rounded-md border border-[#0F1F30] px-2 py-1 text-sm text-white">
            <img src="/icons/hype.svg" className="size-4" alt="hype.svg" />$
            {loadingHypePrice ? "..." : (hypePrice ?? "N/A")}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={togglePncRwa}
                  className={cn(
                    "flex h-8 items-center gap-2 rounded-md border px-2 py-1 text-xs transition-colors",
                    pncRwaEnabled
                      ? "border-[#9CE0FF]/30 bg-[#0D1E31] text-[#9CE0FF]"
                      : "border-[#0F1F30] text-[#7192A5] hover:text-white",
                  )}
                >
                  <div
                    className={cn(
                      "relative h-4 w-7 rounded-full transition-colors",
                      pncRwaEnabled ? "bg-[#9CE0FF]" : "bg-[#0F1F30]",
                    )}
                  >
                    <div
                      className={cn(
                        "absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform",
                        pncRwaEnabled ? "translate-x-3.5" : "translate-x-0.5",
                      )}
                    />
                  </div>
                  PnC Rwa
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                className="max-w-[260px] border border-[#0F1F30] bg-[#041223] text-xs leading-5 text-[#BCEBFF]"
              >
                Shows all PnC/RWA cross-ticker pairs, like XAU/GOLD/PAXG. When
                off, only the best pair per asset is shown.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <a
            href="https://docs.paystream.finance"
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-8 cursor-pointer items-center gap-2 rounded-md border border-[#0F1F30] px-2 py-1 text-sm text-white hover:opacity-80"
          >
            <img src="/icons/docs.svg" className="size-4" alt="docs.svg" />
            Docs
          </a>

          <a
            href="https://x.com/Paystreamlabs"
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-8 cursor-pointer items-center gap-2 rounded-md border border-[#0F1F30] px-2 py-1 text-sm text-white hover:opacity-80"
          >
            <img src="/icons/x.svg" className="size-3" alt="x.svg" />
          </a>
        </div>
      </MaxWidthWrapper>
    </footer>
  );
};

export default Footer;
