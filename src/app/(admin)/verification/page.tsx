import { BulkVerification } from "@/components/BulkVerification";
import { canVerify } from "@/lib/auth";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { formatMoney, formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { StatusBadge, DuplicateBadge } from "@/components/StatusBadge";
import { Pager } from "@/components/Pager";
import { PageHead } from "@/components/PageHead";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 25;

/** The work queue: oldest submission first, so nobody waits indefinitely. */
export default async function VerificationQueue(
  { searchParams }: { searchParams: Promise<Record<string, string | undefined>> },
) {
  const user = await requireUser();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const sb = await supabaseServer();

  const statuses = sp.status
    ? [sp.status]
    : ["pending_review", "under_review", "requires_clarification"];

  let query = sb
    .from("payments")
    .select("id, payment_ref, amount, payment_date, submitted_at, status, duplicate_flag, duplicate_reason, reference, participants(id, full_name, participant_ref), programmes(name)",
            { count: "exact" })
    .in("status", statuses)
    .order("submitted_at", { ascending: true })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (sp.mine === "1") query = query.eq("claimed_by", user.id);
  const { data, count } = await query;

  return (
    <>
      <PageHead
        eyebrow="Finance"
        title="Verification queue"
        sub={`${formatNumber(count ?? 0)} proofs of payment waiting, oldest first.`}
      />

      <form className="filters" action="/verification">
        <div className="field">
          <label htmlFor="status">Show</label>
          <select id="status" name="status" defaultValue={sp.status ?? ""}>
            <option value="">Everything open</option>
            <option value="pending_review">Pending review</option>
            <option value="under_review">Under review</option>
            <option value="requires_clarification">Requires clarification</option>
            <option value="duplicate">Marked duplicate</option>
          </select>
        </div>
        <div className="consent" style={{ marginBottom: 0 }}>
          <input id="mine" type="checkbox" name="mine" value="1"
                 defaultChecked={sp.mine === "1"} />
          <label htmlFor="mine">Only payments I have claimed</label>
        </div>
        <button className="btn btn-primary" type="submit">Apply</button>
      </form>

      {canVerify(user) && <BulkVerification payments={(data ?? []).map(p => ({ id: p.id, reference: p.payment_ref }))} />}
      <div className="card card-flush">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Waiting since</th><th>Payment</th><th>Participant</th><th>Programme</th>
                <th className="num">Amount</th><th>Paid on</th><th>Reference</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((p) => {
                const person = p.participants as unknown as { id: string; full_name: string; participant_ref: string } | null;
                return (
                  <tr key={p.id} className={p.duplicate_flag ? "row-flagged" : undefined}>
                    <td className="nowrap faint">{formatDateTime(p.submitted_at)}</td>
                    <td className="nowrap">{p.payment_ref}</td>
                    <td>{person?.full_name} <div className="faint">{person?.participant_ref}</div></td>
                    <td>{(p.programmes as unknown as { name: string } | null)?.name}</td>
                    <td className="num">{formatMoney(p.amount)}</td>
                    <td className="nowrap">{formatDate(p.payment_date)}</td>
                    <td>{p.reference ?? "\u2014"}</td>
                    <td>
                      <StatusBadge status={p.status} />
                      {p.duplicate_flag ? <div style={{ marginTop: 4 }}><DuplicateBadge reason={p.duplicate_reason} /></div> : null}
                    </td>
                    <td className="right">
                      <Link className="btn btn-sm btn-primary" href={`/verification/${p.id}`}>Review</Link>
                    </td>
                  </tr>
                );
              })}
              {!data?.length ? (
                <tr><td colSpan={9}><div className="empty">
                  <strong>The queue is clear</strong>
                  Every submitted proof of payment has been dealt with.
                </div></td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <Pager page={page} pageSize={PAGE_SIZE} total={count ?? 0} basePath="/verification" params={sp} />
      </div>
    </>
  );
}
