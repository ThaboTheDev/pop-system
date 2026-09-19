import Link from "next/link";
import { requireUser, canExport } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { formatMoney, formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { StatusBadge, DuplicateBadge } from "@/components/StatusBadge";
import { Pager } from "@/components/Pager";
import { PageHead } from "@/components/PageHead";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 25;

export default async function PaymentsPage(
  { searchParams }: { searchParams: Promise<Record<string, string | undefined>> },
) {
  const user = await requireUser();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const sb = await supabaseServer();

  const { data: programmes } = await sb.from("programmes").select("id, name").order("name");

  let query = sb
    .from("payments")
    .select("id, payment_ref, amount, payment_date, submitted_at, status, duplicate_flag, duplicate_reason, reference, verified_by, participants(id, full_name, participant_ref), programmes(name), app_users!payments_verified_by_fkey(full_name)",
            { count: "exact" });

  if (sp.q) {
    const t = sp.q.trim();
    query = query.or(`payment_ref.ilike.${t}%,reference.ilike.%${t}%`);
  }
  if (sp.status) query = query.eq("status", sp.status);
  if (sp.programme) query = query.eq("programme_id", sp.programme);
  if (sp.from) query = query.gte("payment_date", sp.from);
  if (sp.to) query = query.lte("payment_date", sp.to);
  if (sp.min) query = query.gte("amount", Number(sp.min));
  if (sp.max) query = query.lte("amount", Number(sp.max));
  if (sp.flagged === "1") query = query.eq("duplicate_flag", true);

  const sort = sp.sort ?? "submitted_at";
  query = query.order(sort, { ascending: sp.dir === "asc" })
               .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const { data, count, error } = await query;
  const exportQs = new URLSearchParams(
    Object.entries(sp).filter(([, v]) => v) as [string, string][],
  );

  return (
    <>
      <PageHead
        eyebrow="Finance"
        title="Payments"
        sub={`${formatNumber(count ?? 0)} payment records match the current filters.`}
      >
        {canExport(user) ? (
          <a className="btn" href={`/api/export?type=payments&${exportQs}`}>Export CSV</a>
        ) : null}
      </PageHead>

      <form className="filters" action="/payments">
        <div className="field grow">
          <label htmlFor="q">Payment or bank reference</label>
          <input id="q" name="q" type="search" defaultValue={sp.q ?? ""} placeholder="PAY-0001234 or TRX123456" />
        </div>
        <div className="field">
          <label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={sp.status ?? ""}>
            <option value="">Any status</option>
            <option value="pending_review">Pending review</option>
            <option value="under_review">Under review</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
            <option value="duplicate">Duplicate</option>
            <option value="requires_clarification">Requires clarification</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="programme">Programme</label>
          <select id="programme" name="programme" defaultValue={sp.programme ?? ""}>
            <option value="">All programmes</option>
            {(programmes ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor="from">Paid from</label>
          <input id="from" name="from" type="date" defaultValue={sp.from ?? ""} /></div>
        <div className="field"><label htmlFor="to">Paid to</label>
          <input id="to" name="to" type="date" defaultValue={sp.to ?? ""} /></div>
        <div className="field"><label htmlFor="min">Min amount</label>
          <input id="min" name="min" type="number" step="0.01" defaultValue={sp.min ?? ""} /></div>
        <div className="field"><label htmlFor="max">Max amount</label>
          <input id="max" name="max" type="number" step="0.01" defaultValue={sp.max ?? ""} /></div>
        <button className="btn btn-primary" type="submit">Apply</button>
        <Link className="btn" href="/payments">Clear</Link>
      </form>

      {error ? <div className="notice notice-error">{error.message}</div> : null}

      <div className="card card-flush">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Payment ID</th><th>Participant ID</th><th>Participant</th><th>Programme</th>
                <th className="num">Amount</th><th>Paid on</th><th>Submitted</th>
                <th>Status</th><th>Verified by</th><th></th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((p) => {
                const person = p.participants as unknown as { id: string; full_name: string; participant_ref: string } | null;
                const verifier = p.app_users as unknown as { full_name: string } | null;
                return (
                  <tr key={p.id} className={p.duplicate_flag ? "row-flagged" : undefined}>
                    <td className="nowrap">{p.payment_ref}</td>
                    <td className="nowrap num">{person?.participant_ref}</td>
                    <td>
                      {person ? <Link href={`/participants/${person.id}`}>{person.full_name}</Link> : "Unknown"}
                    </td>
                    <td>{(p.programmes as unknown as { name: string } | null)?.name}</td>
                    <td className="num">{formatMoney(p.amount)}</td>
                    <td className="nowrap">{formatDate(p.payment_date)}</td>
                    <td className="nowrap faint">{formatDateTime(p.submitted_at)}</td>
                    <td>
                      <StatusBadge status={p.status} />
                      {p.duplicate_flag ? <div style={{ marginTop: 4 }}><DuplicateBadge reason={p.duplicate_reason} /></div> : null}
                    </td>
                    <td>{verifier?.full_name ?? <span className="faint">Not verified</span>}</td>
                    <td className="right nowrap">
                      <Link className="btn btn-sm" href={`/verification/${p.id}`}>Open</Link>
                    </td>
                  </tr>
                );
              })}
              {!data?.length ? (
                <tr><td colSpan={10}><div className="empty">
                  <strong>No payments match those filters</strong>
                  Widen the date range or clear the filters.
                </div></td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <Pager page={page} pageSize={PAGE_SIZE} total={count ?? 0} basePath="/payments" params={sp} />
      </div>
    </>
  );
}
