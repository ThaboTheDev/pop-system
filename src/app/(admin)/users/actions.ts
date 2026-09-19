"use server";
import { requireRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
const roles = ["super_admin", "finance_admin", "course_admin", "viewer"];
export async function inviteUser(form: FormData) {
 const actor = await requireRole("super_admin"); const sb = supabaseAdmin();
 const email = String(form.get("email")).trim(); const name = String(form.get("name")).trim(); const role = String(form.get("role"));
 if (!name || !roles.includes(role)) throw new Error("Name and valid role required");
 const { data, error } = await sb.auth.admin.inviteUserByEmail(email, { redirectTo: `${process.env.APP_URL}/login/reset` });
 if (error || !data.user) throw new Error(error?.message ?? "Invitation failed");
 const { error: insertError } = await sb.from("app_users").insert({ id: data.user.id, email, full_name: name, role });
 if (insertError) throw new Error("Invitation sent but role assignment failed; contact your administrator before retrying");
 await sb.from("audit_logs").insert({ actor_id: actor.id, action: "user.invited", entity_type: "user", entity_id: data.user.id, summary: "Administrator invited" });
 revalidatePath("/users");
}
export async function editUser(form: FormData) {
 const actor = await requireRole("super_admin"); const sb = await supabaseServer();
 const id = String(form.get("id")); const role = String(form.get("role")); const active = form.get("active") === "on";
 if (!roles.includes(role) || (id === actor.id && (role !== "super_admin" || !active))) throw new Error("Cannot demote or suspend yourself");
 const programmes = form.getAll("programmes").map(String);
 if (programmes.length) {
  const { data } = await sb.from("programmes").select("id").in("id", programmes);
  if (data?.length !== programmes.length) throw new Error("Invalid programme scope");
 }
 const { error } = await sb.from("app_users").update({ role, is_active: active, can_verify: form.get("verify") === "on", programme_ids: programmes }).eq("id", id);
 if (error) throw new Error(error.message);
 await sb.from("audit_logs").insert({ actor_id: actor.id, action: "user.updated", entity_type: "user", entity_id: id, summary: "Role, status or scope updated" }); revalidatePath("/users");
}
export async function resetUserPassword(form: FormData) {
 const actor = await requireRole("super_admin"); const sb = await supabaseServer();
 const { data: user } = await sb.from("app_users").select("id,email").eq("id", String(form.get("id"))).single();
 if (!user) throw new Error("User not found");
 const { error } = await supabaseAdmin().auth.resetPasswordForEmail(user.email, { redirectTo: `${process.env.APP_URL}/login/reset` });
 if (error) throw new Error(error.message);
 await sb.from("audit_logs").insert({ actor_id: actor.id, action: "user.reset_requested", entity_type: "user", entity_id: user.id, summary: "One-time password reset email requested" });
}
