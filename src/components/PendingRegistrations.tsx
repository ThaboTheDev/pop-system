import { supabaseServer } from "@/lib/supabase/server";

/** Pending-registration badge for the admin sidebar — the same pattern as
 *  QueueCount: rendered inside <Suspense> by the admin layout so the shell
 *  paints immediately on a tab switch and the badge streams in a moment
 *  later. While it loads there is simply no badge, which stays conservative. */
export async function PendingRegistrations() {
  const sb = await supabaseServer();
  const { count } = await sb
    .from("participants")
    .select("id", { count: "exact", head: true })
    .eq("registration_status", "pending");

  if (!count) return null;
  return (
    <span className="count" aria-label={`${count} registrations awaiting a decision`}>
      {count > 999 ? "999+" : count}
    </span>
  );
}
