import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware to detect mobile devices and redirect to mobile routes
 * Mobile routes are prefixed with /m (e.g., /m, /m/portfolio, /m/strategies)
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for API routes, static files, and _next routes
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname.match(/\.(ico|png|jpg|jpeg|svg|css|js|woff|woff2|ttf|eot)$/)
  ) {
    return NextResponse.next();
  }

  // Get user agent to detect mobile devices
  const userAgent = request.headers.get("user-agent") || "";
  const isMobile =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      userAgent,
    ) ||
    // Also check for mobile viewport width (common in mobile browsers)
    request.headers.get("sec-ch-ua-mobile") === "?1";

  // If user is on mobile device and not already on a mobile route, redirect to mobile
  if (isMobile && !pathname.startsWith("/m")) {
    // The new arb trade page is desktop-only; mobile keeps the older /m arb modal flow.
    const mobilePath =
      pathname.startsWith("/arb/trade")
        ? "/m/arb"
        : `/m${pathname === "/" ? "" : pathname}`;
    return NextResponse.redirect(new URL(mobilePath, request.url));
  }

  // Note: We don't redirect desktop users away from /m routes here
  // This allows client-side responsive redirects to work when users resize their browser window
  // The client-side ResponsiveRedirect component handles switching based on window width

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
