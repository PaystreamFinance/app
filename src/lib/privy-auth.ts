/**
 * Browser-side Privy token access helpers.
 *
 * Identity token is read from cookie first (shared path), then sessionStorage.
 */
export function getPrivyIdToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawCookieToken = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("privy-id-token="))
    ?.slice("privy-id-token=".length);

  if (rawCookieToken) {
    try {
      return decodeURIComponent(rawCookieToken);
    } catch {
      return rawCookieToken;
    }
  }

  return sessionStorage.getItem("privy-id-token");
}

export function getPrivyAccessToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return sessionStorage.getItem("privy-access-token");
}
