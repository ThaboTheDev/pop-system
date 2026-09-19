import { createHash, randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { queueParticipantMessage } from "@/lib/notify";
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export async function mintResubmit(paymentId: string, participantId: string) {
  const base = process.env.APP_URL;
  if (!base) throw new Error("APP_URL is required");
  const sb = supabaseAdmin();
  const { data: payment } = await sb.from("payments").select("payment_ref,status").eq("id", paymentId).eq("participant_id", participantId).single();
  if (!payment || !["rejected", "requires_clarification"].includes(payment.status)) throw new Error("Payment cannot be resubmitted");
  const token = randomBytes(32).toString("hex");
  const { error } = await sb.from("resubmit_tokens").insert({ payment_id: paymentId, token_hash: tokenHash(token), expires_at: new Date(Date.now() + 7 * 86400_000).toISOString() });
  if (error) throw new Error(error.message);
  const url = `${base.replace(/\/$/, "")}/clarify/${token}`;
  await queueParticipantMessage(participantId, "clarification_requested", { payment_ref: payment.payment_ref, url, reason: "Please upload replacement proof of payment." }, paymentId);
  return url;
}
