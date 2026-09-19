"use server";
import { requireRole } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
export async function saveProgramme(form: FormData) {
 await requireRole("super_admin"); const sb = await supabaseServer(); const id = String(form.get("id") ?? "");
 const row = { code: String(form.get("code")).trim().toUpperCase(), name: String(form.get("name")).trim(), amount_due: Number(form.get("fee")), is_active: form.get("active") === "on" };
 if (!row.code || !row.name || !Number.isFinite(row.amount_due) || row.amount_due < 0) throw new Error("Invalid programme");
 const { error } = id ? await sb.from("programmes").update(row).eq("id", id) : await sb.from("programmes").insert(row);
 if (error) throw new Error(error.message); revalidatePath("/programmes");
}
export async function deleteProgramme(form: FormData) {
 await requireRole("super_admin"); const sb = await supabaseServer();
 const { error } = await sb.from("programmes").delete().eq("id", String(form.get("id")));
 if (error) throw new Error("Cannot delete a programme with participants or payments. Deactivate it instead."); revalidatePath("/programmes");
}
export async function saveCohort(form: FormData) {
 await requireRole("super_admin"); const sb = await supabaseServer(); const id = String(form.get("id") ?? "");
 const row = { programme_id: String(form.get("programme_id")), code: String(form.get("code")).trim(), name: String(form.get("name")).trim(), start_date: String(form.get("start") ?? "") || null, end_date: String(form.get("end") ?? "") || null };
 if (!row.code || !row.name || (row.start_date && row.end_date && row.start_date > row.end_date)) throw new Error("Invalid cohort");
 const { error } = id ? await sb.from("cohorts").update(row).eq("id", id).eq("programme_id", row.programme_id) : await sb.from("cohorts").insert(row);
 if (error) throw new Error(error.message); revalidatePath("/programmes");
}
export async function deleteCohort(form: FormData) {
 await requireRole("super_admin"); const sb = await supabaseServer();
 const { error } = await sb.from("cohorts").delete().eq("id", String(form.get("id")));
 if (error) throw new Error(error.message); revalidatePath("/programmes");
}
