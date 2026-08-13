import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Proxy for Lighter account balance.
 * Browser can't call mainnet.zklighter.elliot.ai directly (CORS).
 * Usage: GET /api/arb/lighter-balance?address=0xAbCd...
 */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address) {
    return NextResponse.json({ error: "Missing address" }, { status: 400 });
  }

  const url = `https://mainnet.zklighter.elliot.ai/api/v1/account?by=l1_address&value=${encodeURIComponent(address)}`;

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Lighter API unreachable" },
      { status: 502 },
    );
  }

  if (res.status === 404) {
    return NextResponse.json({ notFound: true }, { status: 200 });
  }

  if (!res.ok) {
    return NextResponse.json(
      { error: `Lighter API error ${res.status}` },
      { status: 502 },
    );
  }

  const data: unknown = await res.json();
  return NextResponse.json(data);
}
