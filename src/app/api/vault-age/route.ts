import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const since = req.nextUrl.searchParams.get("since");
  if (!since) {
    return NextResponse.json({ error: "Missing since param" }, { status: 400 });
  }

  const sinceMs = new Date(since).getTime();
  const nowMs = Date.now();
  const totalMs = nowMs - sinceMs;

  const total_days = totalMs / (1000 * 60 * 60 * 24);
  const days = Math.floor(total_days);
  const hours = Math.floor((total_days - days) * 24);
  const label = `${days}d ${hours}h`;

  return NextResponse.json({ label, total_days });
}
