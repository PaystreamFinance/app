const configuredApiUrl =
  process.env.NEXT_PUBLIC_PERP_HEDGE_API_URL ?? "http://localhost:9090/api";

export const PERP_HEDGE_API_URL = configuredApiUrl.replace(/\/+$/, "");
