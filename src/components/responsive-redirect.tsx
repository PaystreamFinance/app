"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Route } from "next";

/**
 * Redirects between /m/* (mobile) and /* (desktop) routes based on viewport width.
 * Uses xl breakpoint (1280px) to match Tailwind.
 *
 * - Initial check runs immediately (no debounce) so the correct route loads fast.
 * - Resize events are debounced to avoid thrashing during drag-resize.
 * - Uses router.replace (not push) so the wrong route never lands in history.
 */
export default function ResponsiveRedirect() {
  const pathname = usePathname();
  const router = useRouter();
  const redirectedRef = useRef(false);

  useEffect(() => {
    // Reset flag when pathname changes (redirect completed)
    redirectedRef.current = false;
  }, [pathname]);

  useEffect(() => {
    const check = () => {
      // Don't fire multiple redirects before the first one completes
      if (redirectedRef.current) return;

      if (
        pathname.startsWith("/api") ||
        pathname.startsWith("/_next") ||
        pathname.startsWith("/static")
      ) {
        return;
      }

      const isMobileView = window.innerWidth < 1280;
      const isOnMobileRoute = pathname.startsWith("/m");

      if (isMobileView && !isOnMobileRoute) {
        redirectedRef.current = true;
        const mobilePath = pathname.startsWith("/arb/trade")
          ? "/m/arb"
          : `/m${pathname === "/" ? "" : pathname}`;
        router.replace(mobilePath as Route, { scroll: false });
      } else if (!isMobileView && isOnMobileRoute) {
        redirectedRef.current = true;
        const desktopPath = pathname.replace(/^\/m/, "") || "/";
        router.replace(desktopPath as Route, { scroll: false });
      }
    };

    // Run immediately on mount — no debounce for first paint
    check();

    // Debounce resize events (only matters for manual browser resizing)
    let timeout: NodeJS.Timeout;
    const onResize = () => {
      clearTimeout(timeout);
      timeout = setTimeout(check, 100);
    };

    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(timeout);
    };
  }, [pathname, router]);

  return null;
}
