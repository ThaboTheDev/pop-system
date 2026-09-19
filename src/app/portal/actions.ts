"use server";
import { randomInt, randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createPortalSession, clearPortalSession, portalHash, safeEqual } from "@/lib/portal";
import { queueParticipantMessage } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
export type OTPResult = { message?: string; id?: string; devCode?: string; error?: string };
export async function requestOTP(_previous: OTPResult, form: FormData): Promise<OTPResult> {
  const ip = (await headers()).get("x-forwarded-for") ?? "unknown";
  if (!rateLimit(`portal:${ip}`, 10, 3600_000).allowed) return { error: "Please wait before requesting another code." };
  const sb = supabaseAdmin();
  const { data: p } = await sb.from("participants").select("id").eq("participant_ref", String(form.get("ref") ?? "").trim().toUpperCase())
    .eq("email", String(form.get("email") ?? "").trim()).maybeSingle();
  const code = String(randomInt(100000, 1000000));
  let id = randomUUID();
  let issued = false;
  if (p) {
    const { data, error } = await sb.rpc("issue_portal_otp", { p_participant_id: p.id, p_code_hash: portalHash(code) });
    if (error) throw new Error("Unable to request a code");
    if (data) {
      id = data; issued = true;
      await queueParticipantMessage(p.id, "portal_otp", { code });
    }
  }
  return { message: "If those details match our records, a code will be emailed. It expires after 10 minutes.", id,
    ...(process.env.NODE_ENV !== "production" && issued ? { devCode: code } : {}) };
}
export async function verifyOTP(form: FormData) {
  const id = String(form.get("id") ?? "");
  const code = String(form.get("code") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^\d{6}$/.test(code)) redirect("/portal?invalid=1");
  const sb = supabaseAdmin();
  const { data: hash } = await sb.rpc("attempt_portal_otp", { p_id: id });
  if (!hash || !safeEqual(hash, portalHash(code))) redirect(`/portal/verify?id=${encodeURIComponent(id)}&invalid=1`);
  const { data: otp } = await sb.from("portal_otps").update({ consumed_at: new Date().toISOString() })
    .eq("id", id).is("consumed_at", null).gt("expires_at", new Date().toISOString()).select("participant_id").maybeSingle();
  if (!otp) redirect("/portal?invalid=1");
  await createPortalSession(otp.participant_id);
  redirect("/portal/home");
}
export async function logoutPortal() { await clearPortalSession(); redirect("/portal"); }
