export const BALANCE_REFRESH_EVENT = "paystream-balance-refresh";

export interface BalanceRefreshOptions {
  reason?: string;
  retriesMs?: number[];
}

interface BalanceRefreshDetail {
  reason: string;
  at: number;
}

const DEFAULT_RETRIES_MS = [1200, 3000];

function dispatchBalanceRefresh(detail: BalanceRefreshDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<BalanceRefreshDetail>(BALANCE_REFRESH_EVENT, { detail }),
  );
}

export function triggerBalanceRefresh(options?: BalanceRefreshOptions) {
  if (typeof window === "undefined") return;

  const reason = options?.reason ?? "unknown";
  const retriesMs = options?.retriesMs ?? DEFAULT_RETRIES_MS;

  dispatchBalanceRefresh({ reason, at: Date.now() });

  for (const delayMs of retriesMs) {
    if (!Number.isFinite(delayMs) || delayMs <= 0) continue;
    window.setTimeout(() => {
      dispatchBalanceRefresh({ reason, at: Date.now() });
    }, delayMs);
  }
}
