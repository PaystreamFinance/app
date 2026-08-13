import { env } from "@/env";
import type { NextRequest } from "next/server";

const UNIBLOCK_COINGECKO = `${env.UNIBLOCK_API_URL}/direct/v1/CoinGecko`;

const handler = async (req: NextRequest) => {
  const symbol = req.nextUrl.pathname.split("/").pop();
  if (!symbol) {
    return new Response("Not found", { status: 404 });
  }

  try {
    // CoinGecko /search returns { coins: [{ id, name, symbol, thumb, large, ... }] }
    const res = await fetch(
      `${UNIBLOCK_COINGECKO}/search?query=${encodeURIComponent(symbol)}`,
      {
        headers: {
          accept: "application/json",
          "x-api-key": env.UNIBLOCK_API_KEY,
        },
        next: { revalidate: 86400 },
      },
    );

    if (!res.ok) {
      return new Response("Not found", { status: 404 });
    }

    const data = await res.json();
    const coins = data?.coins;
    if (!Array.isArray(coins) || coins.length === 0) {
      return new Response("Not found", { status: 404 });
    }

    // Prefer exact symbol match (case-insensitive)
    const match =
      coins.find(
        (c: any) => c.symbol?.toUpperCase() === symbol.toUpperCase(),
      ) || coins[0];

    // CoinGecko search returns thumb (small) and large image URLs
    const icon = match?.large || match?.thumb;
    if (!icon || icon === "missing_large.png" || icon === "missing_thumb.png") {
      return new Response("Not found", { status: 404 });
    }

    // Proxy the image to avoid CORS issues
    const imgRes = await fetch(icon);
    if (!imgRes.ok) {
      return new Response("Not found", { status: 404 });
    }

    return new Response(imgRes.body, {
      headers: {
        "Content-Type": imgRes.headers.get("Content-Type") || "image/png",
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
};

export { handler as GET };
