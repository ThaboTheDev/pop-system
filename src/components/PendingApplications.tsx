import { supabaseServer } from "@/lib/supabase/server";

export async function PendingApplications() {
  const sb = await supabaseServer();
  const { count } = await sb.from("applications").select("id", { count: "exact", head: true }).eq("status", "pending");
  if (!count) return null;
  return <span className="count" aria-label={`${count} applications awaiting review`}>{count > 999 ? "999+" : count}</span>;
}
