"use client";

import { useEffect } from "react";

export function DisableDevTools() {
  useEffect(() => {
    // Only disable in production
    if (process.env.NODE_ENV !== "production") {
      return;
    }

    // Disable right-click
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };

    // Disable common DevTools keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      // F12
      if (e.key === "F12") {
        e.preventDefault();
        return false;
      }

      // Ctrl+Shift+I (DevTools)
      if (e.ctrlKey && e.shiftKey && e.key === "I") {
        e.preventDefault();
        return false;
      }

      // Ctrl+Shift+J (Console)
      if (e.ctrlKey && e.shiftKey && e.key === "J") {
        e.preventDefault();
        return false;
      }

      // Ctrl+U (View Source)
      if (e.ctrlKey && e.key === "u") {
        e.preventDefault();
        return false;
      }

      // Ctrl+Shift+C (Inspect Element)
      if (e.ctrlKey && e.shiftKey && e.key === "C") {
        e.preventDefault();
        return false;
      }

      // Cmd+Option+I (Mac DevTools)
      if (e.metaKey && e.altKey && e.key === "i") {
        e.preventDefault();
        return false;
      }

      // Cmd+Option+J (Mac Console)
      if (e.metaKey && e.altKey && e.key === "j") {
        e.preventDefault();
        return false;
      }

      // Cmd+Option+C (Mac Inspect)
      if (e.metaKey && e.altKey && e.key === "c") {
        e.preventDefault();
        return false;
      }

      // Cmd+Option+U (Mac View Source)
      if (e.metaKey && e.key === "u") {
        e.preventDefault();
        return false;
      }
    };

    // Disable text selection (optional - uncomment if needed)
    // const handleSelectStart = (e: Event) => {
    //   e.preventDefault();
    //   return false;
    // };

    // Disable copy (optional - uncomment if needed)
    // const handleCopy = (e: ClipboardEvent) => {
    //   e.preventDefault();
    //   return false;
    // };

    // Add event listeners
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("keydown", handleKeyDown);
    // document.addEventListener("selectstart", handleSelectStart);
    // document.addEventListener("copy", handleCopy);

    // Cleanup
    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("keydown", handleKeyDown);
      // document.removeEventListener("selectstart", handleSelectStart);
      // document.removeEventListener("copy", handleCopy);
    };
  }, []);

  return null; // This component doesn't render anything
}
