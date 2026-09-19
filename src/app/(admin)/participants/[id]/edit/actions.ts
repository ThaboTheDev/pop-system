"use server";
import { requireRole } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validDate, money } from "@/lib/csv";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
export async function editParticipant(form: FormData) {
 const actor = await requireRole("super_admin", "finance_admin"); const sb = await supabaseServer(); const id = String(form.get("id"));
 const get = (key: string) => String(form.get(key) ?? "").trim();
 if (!get("first_name") || !get("surname") || !validDate(get("registration_date"))) throw new Error("Name and valid registration date required");
 const due = money(get("amount_due"), false); if (due < 0) throw new Error("Amount due cannot be negative");
 const { error } = await sb.from("participants").update({ first_name: get("first_name"), surname: get("surname"), email: get("email") || null, mobile: get("mobile") || null, programme_id: get("programme_id"), cohort_id: get("cohort_id") || null, registration_date: get("registration_date"), amount_due: due, notes: get("notes") || null, status_override: get("status_override") || null }).eq("id", id);
 if (error) throw new Error(error.message);
 await sb.from("audit_logs").insert({ actor_id: actor.id, action: "participant.edited", entity_type: "participant", entity_id: id, summary: "Participant registration and contact updated" });
 revalidatePath("/participants", "layout"); redirect(`/participants/${id}`);
}
export async function mergeParticipant(form: FormData) {
 const actor = await requireRole("super_admin", "finance_admin"); const sb = await supabaseServer();
 const source = String(form.get("id"));
 const { data: target } = await sb.from("participants").select("id").eq("participant_ref", String(form.get("target_ref")).trim().toUpperCase()).single();
 if (!target) throw new Error("Target participant not found");
 const { error } = await supabaseAdmin().rpc("merge_participants", { p_source: source, p_target: target.id, p_actor_id: actor.id });
 if (error) throw new Error(error.message); revalidatePath("/participants", "layout"); redirect(`/participants/${target.id}`);
}
export async function anonymizeParticipant(form: FormData) {
 const actor = await requireRole("super_admin"); const sb = supabaseAdmin(); const id = String(form.get("id"));
 const { data: p } = await sb.from("participants").select("participant_ref").eq("id", id).single();
 if (!p || String(form.get("confirm")) !== p.participant_ref) throw new Error("Type the participant reference exactly to confirm");
 // Delete bytes first. If deletion fails, leave metadata intact for a retry.
 const { data: payments, error: readError } = await sb.from("payments").select("pops(storage_path)").eq("participant_id", id);
 if (readError) throw new Error(readError.message);
 const paths = (payments ?? []).flatMap((r: { pops: { storage_path: string }[] }) => r.pops.map(d => d.storage_path));
 for (let i=0;i<paths.length;i+=100) {
  const { error } = await sb.storage.from(process.env.POP_BUCKET ?? "proof-of-payment").remove(paths.slice(i,i+100));
  if (error) throw new Error("Storage deletion failed. Personal data was not yet redacted; retry.");
 }
 const { error } = await sb.rpc("anonymize_participant", { p_participant_id: id, p_actor_id: actor.id });
 if (error) throw new Error(error.message); revalidatePath("/participants", "layout"); redirect(`/participants/${id}`);
}
