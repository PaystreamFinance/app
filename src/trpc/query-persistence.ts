/**
 * Lightweight localStorage cache for whitelisted React Query queries.
 *
 * What this fixes: portfolio data (positions, activity, markets) was lost on
 * every page reload / new tab because React Query's in-memory cache doesn't
 * survive a navigation event. After this runs, those queries hydrate from
 * localStorage immediately on mount and the page renders without a skeleton.
 *
 * Scope: only the whitelist below. Trades / mutations / per-render UI state
 * are intentionally excluded — we never want a stale cached "trade success"
 * to look like a fresh result. Auth tokens are NEVER part of the cached
 * payload (they aren't in queryKey, only used inside queryFn).
 *
 * Storage budget: 4 MB total, ~1 MB per entry. We drop oldest first if we
 * overshoot. localStorage write is debounced 500 ms to coalesce rapid
 * cache updates.
 */

import { type QueryClient, type QueryKey } from "@tanstack/react-query";
import SuperJSON from "superjson";

const STORAGE_KEY = "paystream-rq-cache-v1";
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
const MAX_ENTRY_BYTES = 1 * 1024 * 1024;
const DEBOUNCE_MS = 500;
/** Treat anything older than this as cold — discard rather than hydrate.
 *  Trading data older than 30 min is more misleading than helpful. */
const MAX_AGE_MS = 30 * 60 * 1000;

/** Top-level queryKey prefixes we persist. The portfolio's three sections
 *  (Total Portfolio, Perp-Perp Arb, Activity) all read from this set. */
const WHITELIST: ReadonlySet<string> = new Set([
  "arbitrage-positions",
  "spotperp-positions",
  "arbitrage-markets",
  "unified-transfers",
  "unified-activity",
  "funding-rate-history-all",
]);

interface PersistedEntry {
  /** Stable, JSON-stringifiable form of the queryKey. */
  key: string;
  /** Raw queryKey for restoration. */
  queryKey: QueryKey;
  /** SuperJSON-serialized data payload. */
  data: unknown;
  /** Wall-clock ms of when this entry was last written. */
  updatedAt: number;
}

interface PersistedShape {
  version: 1;
  entries: PersistedEntry[];
}

function isWhitelisted(key: QueryKey): boolean {
  const head = Array.isArray(key) ? key[0] : key;
  return typeof head === "string" && WHITELIST.has(head);
}

function safeStringify(value: unknown): string | null {
  try {
    return JSON.stringify(SuperJSON.serialize(value));
  } catch {
    return null;
  }
}

function safeParse<T>(raw: string): T | null {
  try {
    return SuperJSON.deserialize(JSON.parse(raw)) as T;
  } catch {
    return null;
  }
}

/** Hydrate persisted entries into the QueryClient cache. Stale entries
 *  (> MAX_AGE_MS) are dropped. Errors are swallowed — a corrupt blob just
 *  means we start cold, not that the app crashes. */
function hydrate(qc: QueryClient): void {
  if (typeof window === "undefined") return;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  const blob = safeParse<PersistedShape>(raw);
  if (!blob || blob.version !== 1 || !Array.isArray(blob.entries)) return;
  const now = Date.now();
  for (const entry of blob.entries) {
    if (!entry || typeof entry !== "object") continue;
    if (!isWhitelisted(entry.queryKey)) continue;
    if (now - entry.updatedAt > MAX_AGE_MS) continue;
    qc.setQueryData(entry.queryKey, entry.data, {
      // Mark hydrated entries with the original write time so React Query's
      // staleTime evaluates correctly — a 5-min-old entry should still be
      // treated as stale and trigger a background refetch.
      updatedAt: entry.updatedAt,
    });
  }
}

/** Snapshot the current cache for whitelisted entries, then write to
 *  localStorage. Honors the per-entry and total-byte budgets. */
function persist(qc: QueryClient): void {
  if (typeof window === "undefined") return;
  const all = qc.getQueryCache().getAll();
  const snapshot: PersistedEntry[] = [];
  for (const query of all) {
    if (!isWhitelisted(query.queryKey)) continue;
    if (query.state.status !== "success") continue; // skip pending/error
    if (query.state.data === undefined) continue;
    const serialized = safeStringify(query.state.data);
    if (!serialized) continue;
    if (serialized.length > MAX_ENTRY_BYTES) continue;
    snapshot.push({
      key: JSON.stringify(query.queryKey),
      queryKey: query.queryKey,
      data: query.state.data,
      updatedAt: query.state.dataUpdatedAt || Date.now(),
    });
  }
  // Newest first; drop the tail until under budget.
  snapshot.sort((a, b) => b.updatedAt - a.updatedAt);
  const trimmed: PersistedEntry[] = [];
  let bytes = 0;
  for (const e of snapshot) {
    const entrySize = safeStringify(e)?.length ?? 0;
    if (bytes + entrySize > MAX_TOTAL_BYTES) break;
    bytes += entrySize;
    trimmed.push(e);
  }
  const payload: PersistedShape = { version: 1, entries: trimmed };
  const out = safeStringify(payload);
  if (!out) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, out);
  } catch {
    // Quota exceeded / storage disabled (Safari private mode). Silent.
  }
}

/** Hook the persister into a QueryClient. Idempotent — safe to call
 *  multiple times; only the first install attaches a subscription. */
export function installQueryPersister(qc: QueryClient): void {
  if (typeof window === "undefined") return;
  const flag = qc as QueryClient & { __paystreamPersisterInstalled?: boolean };
  if (flag.__paystreamPersisterInstalled) return;
  flag.__paystreamPersisterInstalled = true;

  hydrate(qc);

  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      persist(qc);
    }, DEBOUNCE_MS);
  };

  qc.getQueryCache().subscribe((event) => {
    // Only persist on resolved updates; ignore in-flight `fetch` events
    // and observer churn.
    if (event.type === "updated" && event.action.type === "success") {
      if (isWhitelisted(event.query.queryKey)) schedule();
    } else if (event.type === "removed") {
      if (isWhitelisted(event.query.queryKey)) schedule();
    }
  });
}
