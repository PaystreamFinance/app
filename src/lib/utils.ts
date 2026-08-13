import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { tokenMetadataCache, type TokenMetadata } from "./token-metadata-cache";
import { getKnownMintAddress } from "./spotperp-utils";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Extract a clean, user-friendly error message from TRPC errors
 * Strips "TRPCClientError:" prefix and extracts backend message if available
 */
export function getErrorMessage(error: unknown, tokenName?: string): string {
  if (!error) return "An unexpected error occurred";

  // If it's a TRPCClientError, extract the message
  if (error && typeof error === "object" && "message" in error) {
    let message = String(error.message);

    // Strip "TRPCClientError:" prefix if present
    message = message.replace(/^TRPCClientError:\s*/i, "");

    // Check if there's a better message in error.data (backend response)
    if ("data" in error && error.data && typeof error.data === "object") {
      const data = error.data as any;

      // If backend returned a message field, use that
      if (data.message && typeof data.message === "string") {
        message = data.message;
      }

      // If backend returned an error field, use that as fallback
      if (data.error && typeof data.error === "string") {
        message = data.error;
      }
    }

    // Check for SOL balance errors (for rent fees)
    if (
      message.toLowerCase().includes("insufficient sol") ||
      message.toLowerCase().includes("not enough sol") ||
      message.toLowerCase().includes("insufficient funds") ||
      (message.toLowerCase().includes("rent") &&
        message.toLowerCase().includes("sol"))
    ) {
      // Keep SOL error messages as-is, they're already clear
      return message;
    }

    // Replace generic "token a" or "token b" with actual token name if provided
    if (tokenName) {
      message = message.replace(
        /not enough token [ab] balance/gi,
        `not enough ${tokenName} balance`,
      );
      message = message.replace(
        /insufficient token [ab] balance/gi,
        `insufficient ${tokenName} balance`,
      );
      message = message.replace(/token [ab] balance/gi, `${tokenName} balance`);
      // Also handle "token a" or "token b" without "balance"
      message = message.replace(/token [ab]/gi, tokenName);
    }

    return message;
  }

  // Fallback for other error types
  if (error instanceof Error) {
    let message = error.message.replace(/^TRPCClientError:\s*/i, "");

    // Check for SOL balance errors (for rent fees)
    if (
      message.toLowerCase().includes("insufficient sol") ||
      message.toLowerCase().includes("not enough sol") ||
      message.toLowerCase().includes("insufficient funds") ||
      (message.toLowerCase().includes("rent") &&
        message.toLowerCase().includes("sol"))
    ) {
      // Keep SOL error messages as-is, they're already clear
      return message;
    }

    if (tokenName) {
      message = message.replace(
        /not enough token [ab] balance/gi,
        `not enough ${tokenName} balance`,
      );
      message = message.replace(
        /insufficient token [ab] balance/gi,
        `insufficient ${tokenName} balance`,
      );
      message = message.replace(/token [ab] balance/gi, `${tokenName} balance`);
      // Also handle "token a" or "token b" without "balance"
      message = message.replace(/token [ab]/gi, tokenName);
    }
    return message;
  }

  return String(error);
}

export function shortAddress(addr: string) {
  return `${addr.slice(0, 4)}..${addr.slice(40, 44)}`;
}

/**
 * Parse a formatted currency string (e.g., "$2.4M", "$1.2K", "$500") to a number
 * @param value - Formatted string like "$2.4M", "$1.2K", "$500", or "—"
 * @returns Numeric value or 0 if unparseable
 */
export function parseFormattedCurrency(
  value: string | number | null | undefined,
): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;

  // Handle "—" or empty strings
  if (value.trim() === "—" || value.trim() === "" || value.trim() === "-")
    return 0;

  // Remove currency symbols and whitespace
  const cleaned = value.replace(/[$,\s]/g, "").toUpperCase();

  // Extract number and suffix (handles both "k" and "K", "m" and "M", etc.)
  const match = cleaned.match(/^([\d.]+)([KMBT]?)$/);
  if (!match) return 0;

  const num = parseFloat(match[1] || "0");
  if (isNaN(num)) return 0;

  const suffix = match[2] || "";

  // Multiply by suffix factor
  const multipliers: Record<string, number> = {
    K: 1_000,
    M: 1_000_000,
    B: 1_000_000_000,
    T: 1_000_000_000_000,
  };

  return num * (multipliers[suffix] || 1);
}

export function formatUSD(
  value: number | string | null | undefined,
  decimals: number = 1,
): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (num === null || num === undefined || isNaN(num)) {
    return "$0";
  }

  const absNum = Math.abs(num);
  if (absNum >= 1_000_000_000) {
    return `$${(num / 1_000_000_000).toFixed(decimals)}B`;
  } else if (absNum >= 1_000_000) {
    return `$${(num / 1_000_000).toFixed(decimals)}M`;
  } else if (absNum >= 1_000) {
    return `$${(num / 1_000).toFixed(decimals)}k`;
  } else {
    return `$${num.toFixed(decimals)}`;
  }
}

/**
 * Formats a number with subscript notation for trailing zeros after the decimal point.
 * Only shows subscript if there are 2 or more leading zeros after the decimal.
 * Example: 0.00056 → 0.0₃56, 0.0056 → 0.0056 (no subscript), 0 → 0
 *
 * @param value - The number to format
 * @param decimals - Number of decimal places to use (default: 6)
 * @returns Formatted string with subscript notation (only if 2+ leading zeros)
 */
export function formatNumberWithSubscript(
  value: number | string | null | undefined,
  decimals: number = 6,
): string {
  // Handle null/undefined/zero
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (num === null || num === undefined || isNaN(num) || num === 0) {
    return "0";
  }

  // Format to fixed decimal places
  const formatted = Math.abs(num).toFixed(decimals);
  const isNegative = num < 0;

  // Find the decimal point
  const decimalIndex = formatted.indexOf(".");
  if (decimalIndex === -1) {
    // No decimal point, return as is
    return isNegative ? `-${formatted}` : formatted;
  }

  // Extract the integer part and decimal part
  const integerPart = formatted.slice(0, decimalIndex);
  const decimalPart = formatted.slice(decimalIndex + 1);

  // Count consecutive zeros from the start of the decimal part
  let zeroCount = 0;
  let firstNonZeroIndex = -1;

  for (let i = 0; i < decimalPart.length; i++) {
    if (decimalPart[i] === "0") {
      zeroCount++;
    } else {
      firstNonZeroIndex = i;
      break;
    }
  }

  // If all zeros, return with the integer part and first zero
  if (firstNonZeroIndex === -1) {
    return isNegative ? `-${integerPart}.0` : `${integerPart}.0`;
  }

  // Only use subscript notation if there are 2 or more leading zeros
  if (zeroCount === 0 || zeroCount === 1) {
    // No leading zeros or only one zero, just remove trailing zeros and return normally
    const nonZeroPart = decimalPart.replace(/0+$/, "");
    const result = nonZeroPart ? `${integerPart}.${nonZeroPart}` : integerPart;
    return isNegative ? `-${result}` : result;
  }

  // Extract the non-zero part (remove trailing zeros)
  let nonZeroPart = decimalPart.slice(firstNonZeroIndex);
  nonZeroPart = nonZeroPart.replace(/0+$/, "");

  // Create subscript number string (Unicode subscript digits: ₀₁₂₃₄₅₆₇₈₉)
  const subscriptMap: Record<string, string> = {
    "0": "₀",
    "1": "₁",
    "2": "₂",
    "3": "₃",
    "4": "₄",
    "5": "₅",
    "6": "₆",
    "7": "₇",
    "8": "₈",
    "9": "₉",
  };

  const zeroCountStr = zeroCount
    .toString()
    .split("")
    .map((d) => subscriptMap[d] || d)
    .join("");

  // Format: integerPart.0ₙ[nonZeroPart] (only if zeroCount >= 2)
  const result = nonZeroPart
    ? `${integerPart}.0${zeroCountStr}${nonZeroPart}`
    : `${integerPart}.0${zeroCountStr}`;

  return isNegative ? `-${result}` : result;
}

/**
 * Formats a number with dollar sign and subscript notation for trailing zeros.
 * Only shows subscript if there are 2 or more leading zeros after the decimal.
 * Example: $0.00056 → $0.0₃56, $0.0056 → $0.0056 (no subscript), $0 → $0
 *
 * @param value - The number to format (can be a number or string with $ prefix)
 * @param decimals - Number of decimal places to use (default: 6)
 * @returns Formatted string with dollar sign and subscript notation (only if 2+ leading zeros)
 */
export function formatUSDWithSubscript(
  value: number | string | null | undefined,
  decimals: number = 6,
): string {
  // Parse number from string (removing $ and other non-numeric chars except minus and decimal)
  let num: number;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    num = parseFloat(cleaned);
  } else {
    num = value ?? 0;
  }

  if (num === null || num === undefined || isNaN(num) || num === 0) {
    return "$0";
  }

  const formatted = formatNumberWithSubscript(Math.abs(num), decimals);
  const sign = num < 0 ? "-" : "";
  return `${sign}$${formatted}`;
}

/**
 * Formats a string that may already contain formatting (like dollar signs, slashes, etc.)
 * and applies subscript notation to numeric values.
 * Example: "$0.00056 / $0.00123" → "$0.0₃56 / $0.0₁23"
 *
 * @param value - The string to format (e.g., "$1.23 / $4.56" or "0.00056")
 * @param decimals - Number of decimal places to use (default: 6)
 * @returns Formatted string with subscript notation applied to numbers
 */
export function formatStringWithSubscript(
  value: string,
  decimals: number = 6,
): string {
  if (!value || value === "N/A" || value === "-") {
    return value;
  }

  // Match patterns like: $number, number (with optional minus sign)
  // This regex matches: optional $, optional whitespace, optional -, then a number (digits and decimal point)
  // Uses word boundaries to ensure we match complete numbers
  return value.replace(
    /(\$?)\s*(-?)(\d+\.?\d*|\d*\.\d+)/g,
    (match, dollarSign, minusSign, numStr) => {
      // Skip if numStr is empty or just a dot
      if (!numStr || numStr === ".") return match;

      const num = parseFloat(minusSign + numStr);
      if (isNaN(num)) return match;

      if (num === 0) {
        return dollarSign ? "$0" : "0";
      }

      const formatted = formatNumberWithSubscript(Math.abs(num), decimals);
      const sign = num < 0 ? "-" : "";
      return dollarSign
        ? `${sign}$${formatted}`
        : num < 0
          ? `-${formatted}`
          : formatted;
    },
  );
}

export async function fetchTokenMetadata(
  mintAddress: string | undefined,
): Promise<TokenMetadata | null> {
  if (!mintAddress) return null;

  // If the input looks like a symbol, resolve to known mint address
  const knownMint = getKnownMintAddress(mintAddress);
  const resolvedAddress = knownMint || mintAddress;
  const originalInput = mintAddress;

  // Check cache first (check both the original input and resolved address)
  const cached =
    tokenMetadataCache.get(originalInput) ??
    (knownMint ? tokenMetadataCache.get(resolvedAddress) : undefined);
  if (cached !== undefined) {
    return cached;
  }

  // Fetch from API if not in cache
  try {
    const response = await fetch(
      `https://datapi.jup.ag/v1/assets/search?query=${resolvedAddress}`,
    );

    if (!response.ok) {
      tokenMetadataCache.set(originalInput, null);
      return null;
    }

    const data = await response.json();

    // Jupiter API returns an array directly: [{ id, name, symbol, icon, ... }]
    if (!Array.isArray(data) || data.length === 0) {
      tokenMetadataCache.set(originalInput, null);
      return null;
    }

    // Get the first result that matches the resolved address (exact match preferred)
    // Then try exact symbol match (for when called with a symbol instead of a mint address)
    // Only fall back to data[0] as last resort
    const tokenData =
      data.find(
        (token: any) =>
          token.id?.toLowerCase() === resolvedAddress.toLowerCase(),
      ) ||
      data.find(
        (token: any) =>
          token.symbol?.toLowerCase() === resolvedAddress.toLowerCase(),
      ) ||
      data[0];

    const metadata: TokenMetadata = {
      icon: tokenData.icon || tokenData.image_uri || tokenData.logoURI,
      name: tokenData.name,
      symbol: tokenData.symbol,
    };

    // Cache under both the original input and the resolved mint address
    tokenMetadataCache.set(originalInput, metadata);
    if (knownMint && originalInput !== resolvedAddress) {
      tokenMetadataCache.set(resolvedAddress, metadata);
    }
    return metadata;
  } catch (error) {
    console.error(`Failed to fetch metadata for ${resolvedAddress}:`, error);
    tokenMetadataCache.set(originalInput, null);
    return null;
  }
}
