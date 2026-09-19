import { headers } from "next/headers";
import { supabaseServer } from "./supabase/server";
import type { AppUser } from "./types";

/** Writes an audit entry for actions that leave no other trace, such as
 *  opening or exporting a document. Status changes are logged inside the
 *  database functions, so they cannot be skipped by a caller. */
export async function logAudit(
  actor: AppUser | null,
  action: string,
  entityType: string,
  entityId: string | null,
  summary: string,
  metadata: Record<string, unknown> = {},
) {
  try {
    const h = await headers();
    const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
    const sb = await supabaseServer();
    await sb.from("audit_logs").insert({
      actor_id: actor?.id ?? null,
      actor_email: actor?.email ?? null,
      action, entity_type: entityType, entity_id: entityId, summary,
      metadata, ip_address: ip, user_agent: h.get("user-agent"),
    });
  } catch {
    // Auditing must never take a request down; failures surface in logs.
  }
}
