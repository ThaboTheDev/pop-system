import Link from "next/link";
import { requireUser, canExport } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { formatMoney, formatDate, formatNumber } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { Pager } from "@/components/Pager";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 25;

export default async function ParticipantsPage(
  { searchParams }: { searchParams: Promise<Record<string, string | undefined>> },
) {
  const user = await requireUser();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const sb = await supabaseServer();

  const { data: programmes } = await sb.from("programmes").select("id, name").order("name");

  // Server-side filtering, sorting and a bounded range. The browser never
  // receives more than one page of rows.
  let query = sb
    .from("participants")
    .select("id, participant_ref, full_name, email, mobile, payment_status, amount_due, amount_paid, outstanding, pop_count, last_payment_date, programmes(name)",
            { count: "exact" });

  if (sp.q) {
    const term = sp.q.trim();
    query = query.or(
      `participant_ref.ilike.${term}%,full_name.ilike.%${term}%,email.ilike.${term}%,mobile.ilike.%${term}%`,
    );
  }
  if (sp.programme) query = query.eq("programme_id", sp.programme);
  if (sp.status) query = query.eq("payment_status", sp.status);

  const sort = sp.sort ?? "registration_date";
  const ascending = sp.dir === "asc";
  query = query.order(sort, { ascending }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const { data, count, error } = await query;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Participants</h1>
          <p>{formatNumber(count ?? 0)} records match the current filters.</p>
        </div>
        {canExport(user) ? (
          <a className="btn" href={`/api/export?type=participants&${new URLSearchParams(
            Object.entries(sp).filter(([, v]) => v) as [string, string][],
          )}`}>Export CSV</a>
        ) : null}
      </div>

      <form className="filters" action="/participants">
        <div className="field grow">
          <label htmlFor="q">Search</label>
          <input id="q" name="q" type="search" defaultValue={sp.q ?? ""}
                 placeholder="Name, participant ID, email or mobile" />
        </div>
        <div className="field">
          <label htmlFor="programme">Programme</label>
          <select id="programme" name="programme" defaultValue={sp.programme ?? ""}>
            <option value="">All programmes</option>
            {(programmes ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="status">Payment status</label>
          <select id="status" name="status" defaultValue={sp.status ?? ""}>
            <option value="">Any status</option>
            <option value="not_paid">Not paid</option>
            <option value="partially_paid">Partially paid</option>
            <option value="fully_paid">Fully paid</option>
            <option value="verification_pending">Verification pending</option>
            <option value="payment_issue">Payment issue</option>
          </select>
        </div>
        <button className="btn btn-primary" type="submit">Apply</button>
        <Link className="btn" href="/participants">Clear</Link>
      </form>

      {error ? <div className="notice notice-error">{error.message}</div> : null}

      <div className="card card-flush">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Participant ID</th><th>Name</th><th>Programme</th>
                <th className="num">Due</th><th className="num">Paid</th><th className="num">Outstanding</th>
                <th className="num">PoPs</th><th>Last payment</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((p) => (
                <tr key={p.id}>
                  <td className="nowrap num">{p.participant_ref}</td>
                  <td>
                    <Link href={`/participants/${p.id}`}>{p.full_name}</Link>
                    <div className="faint">{p.email}</div>
                  </td>
                  <td>{(p.programmes as unknown as { name: string } | null)?.name}</td>
                  <td className="num">{formatMoney(p.amount_due)}</td>
                  <td className="num">{formatMoney(p.amount_paid)}</td>
                  <td className="num">{formatMoney(p.outstanding)}</td>
                  <td className="num">{p.pop_count}</td>
                  <td className="nowrap">{formatDate(p.last_payment_date)}</td>
                  <td><StatusBadge status={p.payment_status} /></td>
                  <td className="right">
                    <Link className="btn btn-sm" href={`/participants/${p.id}`}>Open</Link>
                  </td>
                </tr>
              ))}
              {!data?.length ? (
                <tr><td colSpan={10}><div className="empty">
                  <strong>No participants match those filters</strong>
                  Clear the filters, or import a participant list to get started.
                </div></td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <Pager page={page} pageSize={PAGE_SIZE} total={count ?? 0}
               basePath="/participants" params={sp} />
      </div>
    </>
  );
}
