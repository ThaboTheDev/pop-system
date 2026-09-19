import { NextResponse } from "next/server";

/** Lightweight uptime probe. Hitting it should not hit the database; if this
 *  returns non-200 the platform is down regardless of Supabase health. */
export async function GET() {
  return NextResponse.json(
    { ok: true, service: "pop-system", time: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
