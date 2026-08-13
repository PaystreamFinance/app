/**
 * Get pool route URL based on pool type and address
 */
export function getPoolRoute(poolType: string, poolAddress: string): string {
  const normalizedType = poolType?.toLowerCase() || "";

  if (normalizedType.includes("dlmm")) {
    return `/pool/meteora/dlmm/${poolAddress}`;
  }
  if (normalizedType.includes("damm")) {
    return `/pool/meteora/damm/${poolAddress}`;
  }
  if (
    normalizedType.includes("concentrated") ||
    normalizedType.includes("clmm") ||
    normalizedType.includes("cpmm")
  ) {
    return `/pool/raydium/concentrated/${poolAddress}`;
  }
  if (normalizedType.includes("standard") || normalizedType.includes("amm")) {
    return `/pool/raydium/standard/${poolAddress}`;
  }
  return "#";
}

/**
 * Extract pool address from poolUrl
 */
export function extractPoolAddress(
  poolUrl: string,
  fallbackId?: string,
): string {
  const poolUrlParts = poolUrl.split("/").filter(Boolean);
  return poolUrlParts.length > 0
    ? (poolUrlParts[poolUrlParts.length - 1] ?? fallbackId ?? "")
    : (fallbackId ?? "");
}

/**
 * Check if pool matches selected filter
 */
export function matchesPoolFilter(
  poolType: string | undefined,
  selectedFilter: string,
): boolean {
  if (selectedFilter === "all") return true;

  const normalizedType = poolType?.toLowerCase() || "";

  if (selectedFilter === "dlmm") {
    return normalizedType.includes("dlmm");
  }
  if (selectedFilter === "damm-v2") {
    return normalizedType.includes("damm");
  }
  if (selectedFilter === "raydium-concentrated") {
    return (
      normalizedType.includes("concentrated") ||
      normalizedType.includes("clmm") ||
      normalizedType.includes("cpmm")
    );
  }
  if (selectedFilter === "raydium-standard") {
    return (
      normalizedType.includes("standard") || normalizedType.includes("amm")
    );
  }
  return false;
}

/**
 * Format pool type for display
 */
export function formatPoolType(type: string | undefined): string {
  if (type === "Raydium Concentrated") return "Concentrated";
  if (type === "Raydium Standard") return "Standard";
  return type || "Pool";
}
