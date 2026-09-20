"use server";

import { requireRole } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/** One decision endpoint for both buttons. The status change, the audit line
 *  and the applicant's email are written by the database function in a single
 *  transaction — the action only checks the caller, calls, and refreshes. */
export async function decideRegistration(form: FormData) {
  const user = await requireRole("super_admin", "finance_admin");
  const sb = await supabaseServer();
  const id = String(form.get("id") ?? "");
  const decision = String(form.get("decision") ?? "");
  const reason = String(form.get("reason") ?? "").trim();

  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid registration");
  let error;
  if (decision === "approved") {
    ({ error } = await sb.rpc("approve_registration", { p_id: id, p_actor: user.id }));
  } else if (decision === "rejected") {
    if (!reason) throw new Error("A rejection reason is required; it is sent to the applicant");
    ({ error } = await sb.rpc("reject_registration", { p_id: id, p_reason: reason, p_actor: user.id }));
  } else {
    throw new Error("Invalid decision");
  }
  if (error) throw new Error(error.message);

  // Refresh the queue and the sidebar badge (the layout streams it).
  revalidatePath("/registrations");
  revalidatePath("/participants", "layout");
}
