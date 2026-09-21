"use server";
import { requireRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { processOutbox, templates } from "@/lib/notify";
import { revalidatePath } from "next/cache";
export async function processNow() { await requireRole("super_admin"); await processOutbox(25); revalidatePath("/settings"); }
export async function requeue() {
 const user = await requireRole("super_admin"); const sb = supabaseAdmin();
 const { error } = await sb.from("notifications").update({ state: "queued", error: null, claimed_at: null }).in("state", ["failed", "skipped"]).eq("channel", "email").in("template", Object.keys(templates)).not("recipient", "is", null);
 if (error) throw new Error(error.message);
 await sb.from("audit_logs").insert({ actor_id: user.id, action: "notifications.requeued", entity_type: "notification", summary: "Failed and skipped emails requeued" });
 revalidatePath("/settings");
}
