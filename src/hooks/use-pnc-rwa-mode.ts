"use client";

import * as React from "react";

export const PNC_RWA_STORAGE_KEY = "paystream:pnc-rwa-enabled";
export const PNC_RWA_EVENT = "paystream:pnc-rwa-toggle";

const readPncRwaEnabled = () => {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(PNC_RWA_STORAGE_KEY) === "true";
};

export function usePncRwaMode() {
  const [pncRwaEnabled, setPncRwaEnabledState] = React.useState(false);

  React.useEffect(() => {
    const syncFromStorage = () => {
      setPncRwaEnabledState(readPncRwaEnabled());
    };
    const syncFromEvent = (event: Event) => {
      const enabled = (event as CustomEvent<boolean>).detail;
      if (typeof enabled === "boolean") {
        setPncRwaEnabledState(enabled);
        return;
      }
      syncFromStorage();
    };

    syncFromStorage();
    window.addEventListener("storage", syncFromStorage);
    window.addEventListener(PNC_RWA_EVENT, syncFromEvent);
    return () => {
      window.removeEventListener("storage", syncFromStorage);
      window.removeEventListener(PNC_RWA_EVENT, syncFromEvent);
    };
  }, []);

  const setPncRwaEnabled = React.useCallback((enabled: boolean) => {
    setPncRwaEnabledState(enabled);
    window.localStorage.setItem(PNC_RWA_STORAGE_KEY, String(enabled));
    window.dispatchEvent(new CustomEvent(PNC_RWA_EVENT, { detail: enabled }));
  }, []);

  const togglePncRwa = React.useCallback(() => {
    setPncRwaEnabled(!readPncRwaEnabled());
  }, [setPncRwaEnabled]);

  return { pncRwaEnabled, setPncRwaEnabled, togglePncRwa };
}
