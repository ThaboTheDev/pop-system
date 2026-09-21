import { cache } from "react";
import { supabaseServer } from "@/lib/supabase/server";

type PortalSession =
  | { status: "linked"; participantId: string; authUserId: string }
  | { status: "signed_out" | "staff" | "unmatched" | "unavailable" };

/** Supabase verifies the session, Postgres binds the verified email, and all
 * subsequent reads use this same user's JWT and participant RLS policies.
 * The old pop_portal cookie is never read or trusted. */
export const participantSession = cache(async (): Promise<PortalSession> => {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { status: "signed_out" };
  const { data: id, error } = await sb.rpc("claim_participant_account");
  if (error) {
    if (error.message === "STAFF_ACCOUNT") return { status: "staff" };
    if (["EMAIL_NOT_VERIFIED", "AMBIGUOUS_EMAIL", "ACCOUNT_ALREADY_CLAIMED"].includes(error.message)) return { status: "unmatched" };
    return { status: "unavailable" };
  }
  return id ? { status: "linked", participantId: id, authUserId: user.id } : { status: "unmatched" };
});
