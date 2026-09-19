"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { requireUser, canVerify } from "@/lib/auth";
import type { PaymentStatus } from "@/lib/types";

/** Records a verification decision. The database function owns the write, the
 *  history entry, the audit line and the queued notification, so a decision
 *  cannot be half-applied. */
export async function decidePayment(formData: FormData) {
  const user = await requireUser();
  if (!canVerify(user)) return { error: "Your role cannot change payment verification." };

  const paymentId = String(formData.get("payment_id") ?? "");
  const decision = String(formData.get("decision") ?? "") as PaymentStatus;
  const reasonChoice = String(formData.get("reason") ?? "").trim();
  const reasonOther = String(formData.get("reason_other") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const reason = reasonChoice === "Other" ? reasonOther : reasonChoice;

  if (!paymentId || !decision) return { error: "Choose a decision before saving." };
  if (decision === "rejected" && !reason)
    return { error: "A rejection needs a reason. Pick one from the list or write your own." };

  const sb = await supabaseServer();
  const { error } = await sb.rpc("decide_payment", {
    p_payment_id: paymentId,
    p_to_status: decision,
    p_actor_id: user.id,
    p_reason: reason || null,
    p_note: note || null,
  });

  if (error) {
    if (error.message.includes("REJECTION_REASON_REQUIRED"))
      return { error: "A rejection needs a reason." };
    return { error: error.message };
  }

  revalidatePath("/verification");
  revalidatePath("/dashboard");
  revalidatePath(`/verification/${paymentId}`);
  return { ok: true };
}

/** Saves a note without changing the payment's status. */
export async function addNote(formData: FormData) {
  const user = await requireUser();
  const paymentId = String(formData.get("payment_id") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!note) return { error: "Write the note before saving it." };

  const sb = await supabaseServer();
  const { error } = await sb.from("payments").update({ admin_notes: note }).eq("id", paymentId);
  if (error) return { error: error.message };

  await sb.from("audit_logs").insert({
    actor_id: user.id, actor_email: user.email, action: "payment.note_added",
    entity_type: "payment", entity_id: paymentId, summary: "Administrator note added",
  });
  revalidatePath(`/verification/${paymentId}`);
  return { ok: true };
}

/** Moves to the next waiting item so an administrator can work the queue
 *  without returning to the list between decisions. */
export async function goToNext() {
  await requireUser();
  const sb = await supabaseServer();
  const { data } = await sb
    .from("payments")
    .select("id")
    .in("status", ["pending_review", "under_review"])
    .order("submitted_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  redirect(data ? `/verification/${data.id}` : "/verification");
}
