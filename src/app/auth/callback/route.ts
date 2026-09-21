import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";
import { appOrigin } from "@/lib/app-url";

export async function GET(request: Request) {
  const origin = appOrigin();
  const code = new URL(request.url).searchParams.get("code");
  if (code) {
    const sb = await supabaseServer();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) {
      (await cookies()).delete("pop_portal");
      // /portal calls claim_participant_account() on this verified session.
      // There is intentionally no user-controlled next/return URL.
      return NextResponse.redirect(`${origin}/portal`);
    }
  }
  return NextResponse.redirect(`${origin}/portal/login?error=link`);
}
