"use server";

import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { appOrigin } from "@/lib/app-url";

export type LinkResult = { message?: string; error?: string };
const MESSAGE = "If this email matches an enrolled participant, a sign-in link will arrive shortly. Use the newest link in this browser. If you have only applied, please wait for approval; otherwise contact the registry for help.";

export async function requestPortalLink(_previous: LinkResult, form: FormData): Promise<LinkResult> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };
  const ip = ((await headers()).get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const addressKey = createHash("sha256").update(email).digest("hex");
  if (!rateLimit(`portal-link:${ip}`, 10, 3600_000).allowed || !rateLimit(`portal-address:${addressKey}`, 3, 3600_000).allowed)
    return { error: "Please wait before requesting another sign-in link." };
  let origin: string;
  try { origin = appOrigin(); } catch { return { error: "Portal sign-in is not available right now. Please contact the institute." }; }

  try {
    // Admission lookup only. This client is NOT used to read portal records.
    // Pre-provision eligible accounts so public Auth signups can remain disabled.
    const admin = supabaseAdmin();
    const [{ data: participants, error: participantsError }, { data: staff, error: staffError }] = await Promise.all([
      admin.from("participants").select("id,auth_user_id").eq("email", email).limit(2),
      admin.from("app_users").select("id").eq("email", email).limit(1),
    ]);
    if (participantsError || staffError) throw new Error("Portal admission lookup failed");
    if (participants?.length !== 1 || staff?.length) return { message: MESSAGE };
    if (!participants[0].auth_user_id) {
      // No password is created. Even this pre-provisioned identity must prove
      // mailbox possession via Supabase's email link before it obtains a session.
      const { error } = await admin.auth.admin.createUser({ email, email_confirm: true });
      if (error && !["email_exists", "user_already_exists"].includes(error.code ?? ""))
        throw new Error("Portal account provisioning failed");
    }
    const sb = await supabaseServer();
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/callback` },
    });
    if (error) throw new Error("Supabase could not send the portal link");
  } catch {
    // Same response for unknown addresses, ambiguous records and provider errors;
    // do not expose enrolment, staff membership, or provider response bodies.
    console.error("Participant email-link request could not be completed. Check Auth, SMTP and migration configuration.");
  }
  return { message: MESSAGE };
}

export async function logoutPortal() {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  (await cookies()).delete("pop_portal"); // discard the retired cookie if present
  redirect("/portal/login");
}
