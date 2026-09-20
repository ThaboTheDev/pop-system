import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const templates = {
  pop_received: ["Payment proof received", "payment_ref", "amount"],
  payment_verified: ["Payment verified", "payment_ref"],
  payment_rejected: ["Payment rejected", "payment_ref", "reason"],
  clarification_requested: ["Please resubmit your payment proof", "payment_ref", "reason", "url"],
  payment_reminder: ["Payment reminder", "participant_ref", "amount", "due_date"],
  portal_otp: ["Your portal verification code", "code"],
  adjustment_decided: ["Account adjustment decision", "amount", "status", "reason"],
  registration_received: ["Registration received", "name", "programme"],
  registration_approved: ["Registration approved", "name", "participant_ref", "programme"],
  registration_rejected: ["Registration not approved", "name", "reason"],
} as const;
export type Template = keyof typeof templates;
type Payload = Record<string, unknown>;
export function renderTemplate(name: Template, payload: Payload) {
  const [subject, ...keys] = templates[name];
  const params = keys.map(k => String(payload[k] ?? ""));
  return { subject, params, text: `${process.env.ORG_NAME ?? "Payments and PoP"}\n\n${subject}\n${keys.map((k, i) => `${k.replaceAll("_", " ")}: ${params[i]}`).join("\n")}` };
}
export async function queueParticipantMessage(participantId: string, template: Template, payload: Payload,
  paymentId: string | null = null) {
  const sb = supabaseAdmin();
  const { data: p, error } = await sb.from("participants").select("email").eq("id", participantId).single();
  if (error) throw new Error(error.message);
  const { error: insertError } = await sb.from("notifications").insert({
    participant_id: participantId, payment_id: paymentId, template, payload,
    channel: "email", recipient: p.email,
  });
  if (insertError) throw new Error(insertError.message);
  // Deliver once the response is flushed rather than waiting for the daily
  // sweep: the cron runs once a day (the hosting plan allows no more), and a
  // portal sign-in code lives for only ten minutes, so scheduling alone would
  // strand it. after() is registration-only — if the process dies before the
  // callback runs, the row stays queued and the sweep picks it up.
  try {
    after(async () => {
      await processOutbox(25);
    });
  } catch {
    // Not inside Next's request scope (a script or a test). Queueing must
    // never fail because delivery could not be scheduled; the sweep catches up.
  }
}
async function send(row: { id: number; template: string; payload: Payload; channel: string; recipient: string | null }) {
  if (row.channel !== "email") return "Unsupported channel: email delivery only";
  if (!Object.hasOwn(templates, row.template)) return "Unknown template";
  if (!row.recipient) return "No recipient";
  const name = row.template as Template;
  const message = renderTemplate(name, row.payload);
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM) return "Resend not configured";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `pop-notification-${row.id}` },
    body: JSON.stringify({ from: process.env.RESEND_FROM, to: [row.recipient], subject: message.subject, text: message.text }),
  });
  // Never persist provider response bodies: these can echo PII or credentials.
  if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);
  return null;
}
export async function processOutbox(limit = 25) {
  const sb = supabaseAdmin();
  const { data: rows, error } = await sb.from("notifications").select("id").eq("state", "queued")
    .order("created_at").limit(Math.max(1, Math.min(100, Math.trunc(limit) || 25)));
  if (error) throw new Error(error.message);
  const totals = { sent: 0, failed: 0, skipped: 0 };
  const pending = rows ?? [];
  for (let offset = 0; offset < pending.length; offset += 10) {
    await Promise.all(pending.slice(offset, offset + 10).map(async ({ id }: { id: number }) => {
    const { data: row, error: claimError } = await sb.from("notifications").update({ state: "processing", claimed_at: new Date().toISOString() })
      .eq("id", id).eq("state", "queued").select("*").maybeSingle();
    if (claimError) throw new Error(claimError.message);
    if (!row) return;
    let state: keyof typeof totals = "sent";
    let reason: string | null = null;
    try { reason = await send(row); if (reason) state = "skipped"; }
    catch (e) { state = "failed"; reason = e instanceof Error ? e.message : "Delivery failed"; }
    const { error: finishError } = await sb.from("notifications").update({ state, error: reason, sent_at: state === "sent" ? new Date().toISOString() : null })
      .eq("id", id).eq("state", "processing");
    if (finishError) throw new Error(finishError.message);
    totals[state]++;
    }));
  }
  return totals;
}
