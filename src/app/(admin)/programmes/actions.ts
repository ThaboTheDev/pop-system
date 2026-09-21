"use server";

import { requireRole } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

function money(value: FormDataEntryValue | null, label: string) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 9_999_999_999.99) throw new Error(`Enter a valid ${label}.`);
  return Math.round(n * 100) / 100;
}

function refreshProgrammePages() {
  revalidatePath("/programmes");
  revalidatePath("/register");
  revalidatePath("/runner/register");
  revalidatePath("/applications");
}

export async function saveProgramme(form: FormData) {
  await requireRole("super_admin");
  const sb = await supabaseServer();
  const id = String(form.get("id") ?? "");
  const pricing = String(form.get("pricing_model") ?? "single");
  if (pricing !== "single" && pricing !== "dual") throw new Error("Choose one price or two prices.");
  const monthly = money(form.get("fee"), pricing === "dual" ? "monthly (original) price" : "programme fee");
  const onceOffRaw = String(form.get("once_off") ?? "").trim();
  const onceOff = pricing === "dual" ? money(form.get("once_off"), "once-off (discounted) price") : null;
  if (pricing === "dual") {
    if (!onceOffRaw) throw new Error("Enter the discounted once-off price, or switch to a single price.");
    if (onceOff != null && onceOff > monthly) {
      throw new Error("The once-off price is the discounted amount, so it cannot be higher than the monthly price.");
    }
  }
  const row = {
    code: String(form.get("code")).trim().toUpperCase(),
    name: String(form.get("name")).trim(),
    amount_due: monthly,
    once_off_amount: onceOff,
    pricing_model: pricing,
    is_active: form.get("active") === "on",
  };
  if (!row.code || !row.name) throw new Error("Enter a programme code and name.");
  const { error } = id
    ? await sb.from("programmes").update(row).eq("id", id)
    : await sb.from("programmes").insert(row);
  if (error) throw new Error(error.message);
  refreshProgrammePages();
}

export async function deleteProgramme(form: FormData) {
  await requireRole("super_admin");
  const sb = await supabaseServer();
  const { error } = await sb.from("programmes").delete().eq("id", String(form.get("id")));
  if (error) throw new Error("Cannot delete a programme with participants or payments. Deactivate it instead.");
  refreshProgrammePages();
}

export async function saveCohort(form: FormData) {
  await requireRole("super_admin");
  const sb = await supabaseServer();
  const id = String(form.get("id") ?? "");
  const row = {
    programme_id: String(form.get("programme_id")),
    code: String(form.get("code")).trim(),
    name: String(form.get("name")).trim(),
    start_date: String(form.get("start") ?? "") || null,
    end_date: String(form.get("end") ?? "") || null,
  };
  if (!row.code || !row.name || (row.start_date && row.end_date && row.start_date > row.end_date)) {
    throw new Error("Invalid cohort");
  }
  const { error } = id
    ? await sb.from("cohorts").update(row).eq("id", id).eq("programme_id", row.programme_id)
    : await sb.from("cohorts").insert(row);
  if (error) throw new Error(error.message);
  revalidatePath("/programmes");
}

export async function deleteCohort(form: FormData) {
  await requireRole("super_admin");
  const sb = await supabaseServer();
  const { error } = await sb.from("cohorts").delete().eq("id", String(form.get("id")));
  if (error) throw new Error(error.message);
  revalidatePath("/programmes");
}
