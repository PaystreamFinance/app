/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import type { NextConfig } from "next";
import "./src/env.js";

const config: NextConfig = {
  // Hide the red "N" dev indicator overlay so it doesn't block UI in screenshots
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
  typedRoutes: true,
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 86400,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ipfs.io",
        pathname: "/ipfs/**",
      },
      {
        protocol: "https",
        hostname: "**.ipfs.io",
      },
      {
        protocol: "https",
        hostname: "gateway.pinata.cloud",
        pathname: "/ipfs/**",
      },
      {
        protocol: "https",
        hostname: "**.ipfs.dweb.link",
      },
      {
        protocol: "https",
        hostname: "**.ipfs.nftstorage.link",
      },
      // Allow any other common IPFS gateways
      {
        protocol: "https",
        hostname: "**.ipfs.**",
      },
      // GitHub raw content
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
        pathname: "/**",
      },
      // GitHub user content
      {
        protocol: "https",
        hostname: "**.githubusercontent.com",
        pathname: "/**",
      },
      // Solana Tracker image proxy
      {
        protocol: "https",
        hostname: "image.solanatracker.io",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**.solanatracker.io",
        pathname: "/**",
      },
    ],
  },
};

export default config;
