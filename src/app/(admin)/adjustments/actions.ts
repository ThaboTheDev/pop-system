"use server";
import { requireRole } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
export async function requestAdjustment(form: FormData) {
  const user = await requireRole("super_admin", "finance_admin");
  const sb = await supabaseServer();
  const amount = Number(form.get("amount")); const reason = String(form.get("reason") ?? "").trim();
  if (!Number.isFinite(amount) || !amount || !reason) throw new Error("A nonzero signed amount and reason are required");
  const { data: p } = await sb.from("participants").select("id").eq("participant_ref", String(form.get("ref")).trim().toUpperCase()).single();
  if (!p) throw new Error("Participant not found");
  const { error } = await sb.from("account_adjustments").insert({ participant_id: p.id, amount, reason, requested_by: user.id });
  if (error) throw new Error(error.message); revalidatePath("/adjustments");
}
export async function decideAdjustment(form: FormData) {
  const user = await requireRole("super_admin", "finance_admin");
  const sb = await supabaseServer();
  const status = String(form.get("status"));
  if (!["approved", "rejected"].includes(status)) throw new Error("Invalid decision");
  const { error } = await sb.rpc("decide_adjustment", { p_id: String(form.get("id")), p_status: status, p_actor: user.id });
  if (error) throw new Error(error.message);
  revalidatePath("/adjustments"); revalidatePath("/participants", "layout"); revalidatePath("/dashboard");
}
