"use server";

import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { queueParticipantMessage } from "@/lib/notify";

export interface RegisterResult {
  ok?: boolean;
  error?: string;
}

/** Public self-registration. Runs with the service role because the applicant
 *  has no account, so every field is treated as untrusted. What is written is
 *  inert until finance approves it: no payment can be recorded against it
 *  (the database trigger refuses), no portal code can be issued for it, and
 *  the participant ID is not revealed — database enforcement, not wording. */
export async function registerParticipant(formData: FormData): Promise<RegisterResult> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();

  // Origin / host check, mirroring the PoP form: reject requests that did not
  // come through our own page.
  const origin = h.get("origin");
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) {
        return { error: "Request origin was not recognised." };
      }
    } catch {
      return { error: "Request origin was not recognised." };
    }
  }

  if (!rateLimit(`register:${ip}`, 5, 60_000).allowed)
    return { error: "Too many attempts from this device. Wait a minute and try again." };

  const firstName = String(formData.get("first_name") ?? "").trim();
  const surname = String(formData.get("surname") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const mobile = String(formData.get("mobile") ?? "").trim() || null;
  const programmeId = String(formData.get("programme_id") ?? "");
  if (formData.get("consent") !== "on")
    return { error: "Your POPIA consent is required." };

  if (!firstName || !surname) return { error: "Enter your first name and surname." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    return { error: "Enter a valid email address. The decision is sent there." };
  if (!/^[0-9a-f-]{36}$/i.test(programmeId))
    return { error: "Choose the programme you are registering for." };

  const sb = supabaseAdmin();

  const { data: programme } = await sb
    .from("programmes")
    .select("id, name, amount_due")
    .eq("id", programmeId)
    .eq("is_active", true)
    .maybeSingle();
  if (!programme) return { error: "That programme is not open for registration." };

  // Duplicate handling. A second WAITING application on the same email is
  // told plainly (the partial unique index catches the same thing when two
  // submissions race): the applicant knows their own email, so this reveals
  // nothing new. An email already on the approved register is told nothing —
  // the form's success wording is returned with no write and no email, so the
  // register cannot be probed and no double record is created; the audit of
  // existing accounts stays with the staff workflow.
  const { data: existing } = await sb
    .from("participants")
    .select("id, registration_status")
    .eq("email", email);
  if ((existing ?? []).some((r: { registration_status: string }) => r.registration_status === "pending"))
    return { error: "A registration for this email address is already waiting for review. We will email the decision." };
  if ((existing ?? []).length > 0) return { ok: true };

  const { data: inserted, error } = await sb
    .from("participants")
    .insert({
      first_name: firstName, surname, email, mobile,
      programme_id: programme.id, amount_due: programme.amount_due,
      registration_status: "pending", registration_source: "self",
      consent_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    // The unique index converted a racing double submit into an error; answer
    // as if the first submission had just landed.
    if (error.code === "23505")
      return { error: "A registration for this email address is already waiting for review. We will email the decision." };
    return { error: "The registration could not be recorded. Please try again." };
  }

  // Queues registration_received; delivery runs after the response flushes.
  await queueParticipantMessage(inserted.id, "registration_received", {
    name: firstName, programme: programme.name,
  });
  return { ok: true };
}
