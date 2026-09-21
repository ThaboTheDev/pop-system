"use server";

import { requireRole } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { scheduleOutbox } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";

export type LookupResult = { error?: string; participant?: { participant_ref: string; full_name: string; programme: string } };
export type CaptureResult = { error?: string; reference?: string; status?: string; alreadyRecorded?: boolean };

export async function lookupParticipant(_previous: LookupResult, form: FormData): Promise<LookupResult> {
  const user = await requireRole("runner");
  if (!rateLimit(`runner-lookup:${user.id}`, 30, 60_000).allowed) return { error: "Please wait a minute before looking up another ID." };
  const ref = String(form.get("participant_ref") ?? "").trim().toUpperCase();
  if (!/^MSRI-\d{6,}$/.test(ref)) return { error: "Enter the Participant ID from the approval letter, for example MSRI-001284." };
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("runner_participant_lookup", { p_ref: ref });
  if (error) return { error: "The participant could not be looked up. Please try again." };
  if (!data?.length) return { error: "That enrolled participant was not found. An application must be approved before a payment can be recorded." };
  return { participant: data[0] };
}

export async function capturePayment(_previous: CaptureResult, form: FormData): Promise<CaptureResult> {
  const user = await requireRole("runner");
  if (!rateLimit(`runner-capture:${user.id}`, 30, 60_000).allowed) return { error: "Please wait a minute before recording another payment." };
  if (form.get("confirmed") !== "on") return { error: "Confirm that you received this money from the selected participant." };
  const amount = String(form.get("amount") ?? "").trim();
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) return { error: "Enter a positive amount with at most two decimal places." };
  const date = String(form.get("date") ?? "");
  const method = String(form.get("method") ?? "");
  const requestId = String(form.get("request_id") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !["cash", "card"].includes(method) || !/^[0-9a-f-]{36}$/i.test(requestId)) return { error: "Check the payment date and method, then try again." };
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("capture_runner_payment", {
    p_ref: String(form.get("participant_ref") ?? "").trim().toUpperCase(),
    p_amount: Number(amount), p_date: date, p_method: method,
    p_reference: String(form.get("reference") ?? "").trim(), p_request_id: requestId,
  });
  if (error) {
    const messages: Record<string, string> = {
      PARTICIPANT_NOT_FOUND: "This participant was not found. Check the approved Participant ID.",
      INVALID_AMOUNT: "Enter a valid amount with at most two decimal places.",
      INVALID_DATE: "The payment date must be valid and cannot be in the future.",
      REQUEST_ALREADY_USED: "This form already recorded another payment. Start a new payment instead.",
    };
    return { error: messages[error.message] ?? "The payment could not be recorded. Retry this form; it will not record the same request twice." };
  }
  scheduleOutbox();
  return { reference: data.payment_ref, status: data.status, alreadyRecorded: data.already_recorded };
}
