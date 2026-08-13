"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "paystream-beta-mode";

function getSnapshot(): boolean {
  try {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Non-hook accessor for code paths outside React (lib fetchers, route guards).
 * Returns the same value as the hook but without subscribing to changes.
 */
export function isBetaModeOn(): boolean {
  return getSnapshot();
}

function getServerSnapshot(): boolean {
  return false;
}

const listeners = new Set<() => void>();

function subscribe(callback: () => void): () => void {
  listeners.add(callback);

  // Cross-tab sync
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) callback();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

function notify() {
  listeners.forEach((l) => l());
}

export function useBetaMode() {
  const enabled = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    try {
      const next = !getSnapshot();
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch { /* Safari private mode */ }
    notify();
  }, []);

  return { betaMode: enabled, toggleBetaMode: toggle };
}
