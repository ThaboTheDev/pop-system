"use server";
import { requireRole } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { parseCSV, validDate, money } from "@/lib/csv";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
export async function uploadStatement(form: FormData) {
 const actor = await requireRole("super_admin", "finance_admin"); const file = form.get("file");
 if (!(file instanceof File) || file.size > 2 * 1024 * 1024) throw new Error("Upload a CSV up to 2 MB");
 const batch = crypto.randomUUID();
 const rows = parseCSV(await file.text()).map((r,i) => {
  if (!validDate(r.date ?? "")) throw new Error(`Row ${i + 2}: date must be YYYY-MM-DD`);
  return { batch_id: batch, line_no: i + 1, tx_date: r.date, amount: money(r.amount ?? "", false), description: r.description || null, reference: r.reference || null };
 });
 if (!rows.length) throw new Error("No bank lines found");
 const sb = await supabaseServer(); const { error } = await sb.from("bank_statement_lines").insert(rows);
 if (error) throw new Error(error.message);
 const { error: matchError } = await sb.rpc("auto_match_statement", { p_batch: batch });
 if (matchError) throw new Error("Batch saved but auto-match failed; reopen the batch and match manually");
 await sb.from("audit_logs").insert({ actor_id: actor.id, action: "statement.imported", entity_type: "statement", entity_id: batch, summary: `Imported ${rows.length} bank lines` });
 revalidatePath("/reconciliation"); redirect(`/reconciliation?batch=${batch}`);
}
export async function updateLine(form: FormData) {
 const actor = await requireRole("super_admin", "finance_admin"); const sb = await supabaseServer();
 const status = String(form.get("status")); const id = String(form.get("id"));
 if (!["matched", "unmatched", "ignored"].includes(status)) throw new Error("Invalid line state");
 const payment = String(form.get("payment_id") ?? "").trim();
 if (status === "matched" && !payment) throw new Error("Payment UUID required");
 const { error } = await sb.from("bank_statement_lines").update({ status, matched_payment_id: status === "matched" ? payment : null }).eq("id", id);
 if (error) throw new Error(error.message);
 await sb.from("audit_logs").insert({ actor_id: actor.id, action: `statement.${status}`, entity_type: "statement_line", entity_id: id, summary: "Bank line reconciliation changed" }); revalidatePath("/reconciliation");
}
