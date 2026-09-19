import { supabaseServer } from "@/lib/supabase/server";

/** Verification queue badge for the admin sidebar.
 *
 *  Rendered inside <Suspense> by the admin layout so the shell paints
 *  immediately on every tab switch instead of waiting for this count query.
 *  The badge streams in a moment later; while it loads there is simply no
 *  badge, which is the correct conservative state. */
export async function QueueCount() {
  const sb = await supabaseServer();
  const { count } = await sb
    .from("payments")
    .select("id", { count: "exact", head: true })
    .in("status", ["pending_review", "under_review", "requires_clarification"]);

  if (!count) return null;
  return (
    <span className="count" aria-label={`${count} payments awaiting verification`}>
      {count > 999 ? "999+" : count}
    </span>
  );
}
