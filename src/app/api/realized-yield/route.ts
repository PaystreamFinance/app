import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET() {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase is not configured" },
      { status: 503 },
    );
  }

  const { data, error } = await supabase
    .from("realized_yield")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "No data found" }, { status: 404 });
  }

  const realized_yield = Number(data.current_value) - Number(data.total_deposit);

  return NextResponse.json({
    total_deposit: Number(data.total_deposit),
    current_value: Number(data.current_value),
    realized_yield,
    updated_at: data.updated_at,
  });
}
