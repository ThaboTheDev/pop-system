import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { Pager } from "@/components/Pager";

export default async function RunnerHome({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole("runner");
  const sp = await searchParams;
  const page = Math.max(1, Math.trunc(Number(sp.page)) || 1);
  const sb = await supabaseServer();
  // RLS, not a captured_by filter on this page, limits the result to this runner.
  const { data, count, error } = await sb.from("applications").select("id,first_name,surname,status,created_at,decision_reason,programmes(name)", { count: "exact" })
    .order("created_at", { ascending: false }).order("id").range((page - 1) * 20, page * 20 - 1);
  return (
    <>
      <div className="notice notice-info">You can register applicants and record money received from enrolled participants. Finance reviews applications and independently verifies payments. You cannot verify payments or access the audit log.</div>
      <div className="card card-flush">
        <h2>Applications you captured</h2>
        {error ? <p className="notice notice-error">Your applications could not be loaded. Please try again.</p> : null}
        <div className="table-wrap"><table className="data">
          <thead><tr><th>Applicant</th><th>Programme</th><th>Captured</th><th>Status</th></tr></thead>
          <tbody>{(data ?? []).map(row => <tr key={row.id}>
            <td>{row.first_name} {row.surname}</td><td>{(row.programmes as unknown as { name: string } | null)?.name}</td>
            <td>{formatDateTime(row.created_at)}</td><td><StatusBadge status={row.status} />{row.decision_reason ? <div className="faint">{row.decision_reason}</div> : null}</td>
          </tr>)}{!error && !data?.length ? <tr><td colSpan={4}><div className="empty">No applications yet. <Link href="/runner/register">Register an applicant</Link>.</div></td></tr> : null}</tbody>
        </table></div>
        <Pager page={page} total={count ?? 0} pageSize={20} basePath="/runner" params={sp} />
      </div>
    </>
  );
}
