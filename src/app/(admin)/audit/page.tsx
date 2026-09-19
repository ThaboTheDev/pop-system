import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { formatDateTime, formatNumber, humanise } from "@/lib/format";
import { Pager } from "@/components/Pager";
import { PageHead } from "@/components/PageHead";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;

export default async function AuditPage(
  { searchParams }: { searchParams: Promise<Record<string, string | undefined>> },
) {
  await requireUser();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const sb = await supabaseServer();

  let q = sb.from("audit_logs").select("*", { count: "exact" });
  if (sp.action) q = q.eq("action", sp.action);
  if (sp.actor) q = q.ilike("actor_email", `%${sp.actor}%`);
  if (sp.entity) q = q.eq("entity_type", sp.entity);

  const { data, count } = await q
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  return (
    <>
      <PageHead
        eyebrow="Governance"
        title="Audit log"
        sub={`${formatNumber(count ?? 0)} entries. The log is append only and cannot be edited by anyone, including a super administrator.`}
      />

      <form className="filters" action="/audit">
        <div className="field grow">
          <label htmlFor="actor">Administrator</label>
          <input id="actor" name="actor" type="search" defaultValue={sp.actor ?? ""} placeholder="Email address" />
        </div>
        <div className="field">
          <label htmlFor="entity">Record type</label>
          <select id="entity" name="entity" defaultValue={sp.entity ?? ""}>
            <option value="">Anything</option>
            <option value="payment">Payment</option>
            <option value="participant">Participant</option>
            <option value="report">Report</option>
            <option value="user">User</option>
          </select>
        </div>
        <button className="btn btn-primary" type="submit">Apply</button>
        <Link className="btn" href="/audit">Clear</Link>
      </form>

      <div className="card card-flush">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>When</th><th>Administrator</th><th>Action</th><th>Record</th><th>Detail</th><th>IP address</th></tr>
            </thead>
            <tbody>
              {(data ?? []).map((row) => (
                <tr key={row.id}>
                  <td className="nowrap faint">{formatDateTime(row.created_at)}</td>
                  <td>{row.actor_email ?? "System"}</td>
                  <td className="nowrap">{humanise(row.action.replace(/\./g, " "))}</td>
                  <td className="nowrap">{humanise(row.entity_type)}</td>
                  <td>{row.summary}</td>
                  <td className="faint">{row.ip_address ?? "\u2014"}</td>
                </tr>
              ))}
              {!data?.length ? (
                <tr><td colSpan={6}><div className="empty">
                  <strong>No entries match those filters</strong>
                  Clear the filters to see the full history.
                </div></td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <Pager page={page} pageSize={PAGE_SIZE} total={count ?? 0} basePath="/audit" params={sp} />
      </div>
    </>
  );
}
