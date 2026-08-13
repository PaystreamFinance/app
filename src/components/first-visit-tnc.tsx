"use client";

import React from "react";
import TnCModal from "./tnc-modal";

const FIRST_VISIT_TNC_KEY = "paystream_tnc_accepted";
const SHOW_AFTER_TNC_KEY = "paystream_show_carousel_after_tnc";

/**
 * Component that shows TNC modal on first visit.
 * After TNC acceptance, triggers carousel with prefetched images.
 */
const FirstVisitTnC: React.FC = () => {
  const [isTnCOpen, setIsTnCOpen] = React.useState(false);
  const hasCheckedRef = React.useRef(false);

  React.useEffect(() => {
    // Only run this check once per session
    if (hasCheckedRef.current) return;
    hasCheckedRef.current = true;

    // Check if user has accepted TNC before
    if (typeof window !== "undefined") {
      const tncAccepted = localStorage.getItem(FIRST_VISIT_TNC_KEY);
      if (!tncAccepted) {
        // Show TNC modal on first visit
        // Small delay to ensure page is loaded
        const timer = setTimeout(() => {
          setIsTnCOpen(true);
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  const handleTnCAccept = () => {
    if (typeof window !== "undefined") {
      // Mark TNC as accepted
      localStorage.setItem(FIRST_VISIT_TNC_KEY, "true");
      localStorage.setItem(SHOW_AFTER_TNC_KEY, "true");

      // Dispatch event to trigger carousel
      // Images are already prefetched during TNC modal display
      window.dispatchEvent(new CustomEvent("paystream-tnc-accepted"));
    }

    setIsTnCOpen(false);
  };

  const handleTnCCancel = () => {
    // Don't allow canceling - user must accept TNC to proceed
    // Keep TNC modal open
  };

  return (
    <TnCModal
      open={isTnCOpen}
      onAccept={handleTnCAccept}
      onCancel={handleTnCCancel}
    />
  );
};

export default FirstVisitTnC;
