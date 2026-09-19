import { cache } from "react";
import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase/server";
import type { AppUser, UserRole } from "./types";

/** The signed-in administrator, or null.
 *
 *  Wrapped in React `cache()` so all calls within a single request share one
 *  `auth.getUser()` round-trip and one `app_users` lookup. Without this the
 *  middleware, layout and page each fire their own trip to Supabase for the
 *  same user record, which is the single biggest contributor to perceived
 *  latency on every admin page. */
export const currentUser = cache(async (): Promise<AppUser | null> => {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: assurance, error: assuranceError } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError || (assurance?.nextLevel === "aal2" && assurance.currentLevel !== "aal2")) return null;
  const { data } = await sb.from("app_users").select("*").eq("id", user.id).single();
  if (!data || !data.is_active) return null;
  return data as AppUser;
});

/** Guards a page. Sends anyone without an active administrator record to the
 *  sign-in screen rather than showing an empty dashboard. */
export async function requireUser(): Promise<AppUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(...roles: UserRole[]): Promise<AppUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/dashboard?denied=1");
  return user;
}

/** Mirrors can_verify_payments() in the database. The database policy is what
 *  actually enforces this; the check here only keeps controls off the screen
 *  when they would fail. */
export const canVerify = (u: AppUser) =>
  u.role === "super_admin" || u.role === "finance_admin" ||
  (u.role === "course_admin" && u.can_verify);

export const canExport = (u: AppUser) => u.role !== "viewer";
export const canManageUsers = (u: AppUser) => u.role === "super_admin";
export const canEditParticipants = (u: AppUser) =>
  u.role === "super_admin" || u.role === "finance_admin";
