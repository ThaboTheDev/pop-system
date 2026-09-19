"use server";
import { requireRole } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { queueParticipantMessage } from "@/lib/notify";
import { revalidatePath } from "next/cache";
export async function generatePlan(form: FormData) {
 await requireRole("super_admin", "finance_admin"); const sb = await supabaseServer();
 const { error } = await sb.rpc("generate_payment_plan", { p_id: String(form.get("participant_id")), p_count: Number(form.get("count")), p_start: String(form.get("start")) });
 if (error) throw new Error(error.message); revalidatePath("/participants", "layout");
}
export async function markPlanPaid(form: FormData) {
 await requireRole("super_admin", "finance_admin"); const sb = await supabaseServer();
 const { error } = await sb.from("payment_plans").update({ paid_at: new Date().toISOString(), paid_payment_id: String(form.get("payment_id") ?? "").trim() || null }).eq("id", String(form.get("id"))).is("paid_at", null);
 if (error) throw new Error(error.message); revalidatePath("/participants", "layout");
}
export async function clearUnpaid(form: FormData) {
 await requireRole("super_admin"); const sb = await supabaseServer();
 const { error } = await sb.from("payment_plans").delete().eq("participant_id", String(form.get("participant_id"))).is("paid_at", null);
 if (error) throw new Error(error.message); revalidatePath("/participants", "layout");
}
export async function remindParticipant(form: FormData) {
 await requireRole("super_admin", "finance_admin"); const sb = await supabaseServer();
 const { data: p } = await sb.from("participants").select("id,participant_ref,outstanding").eq("id", String(form.get("participant_id"))).gt("outstanding", 0).single();
 if (!p) throw new Error("No outstanding balance");
 await queueParticipantMessage(p.id, "payment_reminder", { participant_ref: p.participant_ref, amount: p.outstanding, due_date: "Please contact the finance office" });
 revalidatePath("/participants", "layout");
}
export async function reminderSweep() {
 await requireRole("super_admin", "finance_admin"); const sb = await supabaseServer();
 const { data, error } = await sb.rpc("arrears_report").limit(50); if (error) throw new Error(error.message);
 for (const r of data ?? []) await queueParticipantMessage(r.participant_id, "payment_reminder", { participant_ref: r.participant_ref, amount: r.overdue, due_date: r.oldest_due });
 revalidatePath("/reports");
}
