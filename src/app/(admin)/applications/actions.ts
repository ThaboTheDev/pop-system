"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { scheduleOutbox } from "@/lib/notify";

export type DecisionResult = { error?: string; message?: string };

export async function decideApplication(_previous: DecisionResult, form: FormData): Promise<DecisionResult> {
  const actor = await requireRole("super_admin", "finance_admin");
  const id = String(form.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Invalid application." };
  const sb = await supabaseServer();
  const decision = String(form.get("decision") ?? "");
  let result;
  if (decision === "approved") {
    const fee = String(form.get("fee") ?? "").trim();
    if (fee && !/^\d{1,10}(\.\d{1,2})?$/.test(fee)) return { error: "Enter a non-negative fee with at most two decimal places, or leave it blank for the programme fee." };
    result = await sb.rpc("approve_application", { p_application_id: id, p_actor: actor.id, p_fee_override: fee ? Number(fee) : null });
  } else if (decision === "declined") {
    const reason = String(form.get("reason") ?? "").trim();
    if (!reason || reason.length > 2000) return { error: "A decline reason of 1–2,000 characters is required." };
    result = await sb.rpc("decline_application", { p_application_id: id, p_actor: actor.id, p_reason: reason });
  } else return { error: "Choose approve or decline." };
  if (result.error) {
    const messages: Record<string, string> = {
      ALREADY_REVIEWED: "Another staff member has already reviewed this application. Refresh the queue.",
      CONSENT_REQUIRED: "This legacy application has no recorded consent. Ask the applicant to reapply with consent; do not approve it.",
      PARTICIPANT_ALREADY_EXISTS: "A participant already exists for this email. Resolve it with the registry before approving.",
      UNKNOWN_PROGRAMME: "This programme is no longer open for registration.",
      INVALID_FEE: "The fee must be non-negative and have at most two decimal places.",
      INVALID_EMAIL: "This application needs a valid email address. Contact the registry.",
    };
    return { error: messages[result.error.message] ?? "The decision could not be saved. Please try again." };
  }
  scheduleOutbox();
  revalidatePath("/applications");
  revalidatePath("/dashboard");
  revalidatePath("/participants", "layout");
  revalidatePath("/runner");
  return { message: decision === "approved" ? `Approved: ${result.data.participant_ref}. The email has been queued.` : "Application declined. The reason has been queued for email." };
}
