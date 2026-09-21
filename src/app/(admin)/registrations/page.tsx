import Link from "next/link";
import { requireUser, canEditParticipants } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { formatDateTime, formatNumber, formatMoney } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { PageHead } from "@/components/PageHead";
import { decideRegistration } from "./actions";

export const dynamic = "force-dynamic";
const DECIDED_LIMIT = 25;

/** The self-registration approval queue. What is waiting is separate from
 *  what was decided: "Waiting" is the worklist (oldest application first), and
 *  "Recently decided" is the audit trail of the last decisions with their
 *  reasons. The decision itself is written by the database — status, audit
 *  line and the applicant's email commit in one transaction. */
export default async function RegistrationsPage(
  { searchParams }: { searchParams: Promise<Record<string, string | undefined>> },
) {
  const user = await requireUser();
  const sp = await searchParams;
  const decided = sp.view === "decided";
  const sb = await supabaseServer();
  const mayDecide = canEditParticipants(user);

  const { data: rows, count } = decided
    ? await sb
        .from("participants")
        .select("id, first_name, surname, email, registration_status, registration_note, reviewed_at, created_at, amount_due, programmes(name)",
                { count: "exact" })
        .eq("registration_source", "self")
        .in("registration_status", ["approved", "rejected"])
        .order("reviewed_at", { ascending: false })
        .limit(DECIDED_LIMIT)
    : await sb
        .from("participants")
        // Same columns as the decided view, so both branches share one row shape.
        .select("id, first_name, surname, email, registration_status, registration_note, reviewed_at, created_at, amount_due, programmes(name)",
                { count: "exact" })
        .eq("registration_status", "pending")
        .order("created_at", { ascending: true });

  return (
    <>
      <PageHead
        eyebrow="Participant registry"
        title="Registrations"
        sub={decided
          ? "The most recent decisions on self-registrations."
          : `${formatNumber(count ?? 0)} self-registrations waiting for a decision, oldest first.`}
      >
        <div className="btn-row">
          <Link className={`btn ${decided ? "" : "btn-primary"}`} href="/registrations">Waiting</Link>
          <Link className={`btn ${decided ? "btn-primary" : ""}`} href="/registrations?view=decided">Recently decided</Link>
        </div>
      </PageHead>

      <div className="card card-flush">
        <div className="table-wrap">
          <table className="data">
            <thead>
              {decided ? (
                <tr>
                  <th>Applicant</th><th>Programme</th><th>Decision</th>
                  <th>Reason / note</th><th>Decided</th>
                </tr>
              ) : (
                <tr>
                  <th>Applicant</th><th>Programme</th><th className="num">Fee</th>
                  <th>Applied</th><th className="right">Decision</th>
                </tr>
              )}
            </thead>
            <tbody>
              {(rows ?? []).map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.first_name} {r.surname}
                    <div className="faint">{r.email}</div>
                  </td>
                  <td>{(r.programmes as unknown as { name: string } | null)?.name}</td>
                  {decided ? (
                    <>
                      <td><StatusBadge status={r.registration_status} /></td>
                      <td className="faint">{r.registration_note ?? "\u2014"}</td>
                      <td className="nowrap">{formatDateTime(r.reviewed_at)}</td>
                    </>
                  ) : (
                    <>
                      <td className="num">{formatMoney(r.amount_due)}</td>
                      <td className="nowrap">{formatDateTime(r.created_at)}</td>
                      <td className="right">
                        {mayDecide ? (
                          <div className="btn-row" style={{ justifyContent: "flex-end" }}>
                            <form action={decideRegistration} style={{ display: "inline" }}>
                              <input type="hidden" name="id" value={r.id} />
                              <input type="hidden" name="decision" value="approved" />
                              <button className="btn btn-sm btn-primary">Approve</button>
                            </form>
                            <form action={decideRegistration} className="btn-row"
                                  style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                              <input type="hidden" name="id" value={r.id} />
                              <input type="hidden" name="decision" value="rejected" />
                              <input name="reason" required placeholder="Reason (sent to the applicant)"
                                     aria-label="Rejection reason" style={{ maxWidth: 220 }} />
                              <button className="btn btn-sm btn-danger">Reject</button>
                            </form>
                          </div>
                        ) : (
                          <span className="faint">Finance decides</span>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {!rows?.length ? (
                <tr><td colSpan={5}><div className="empty">
                  <strong>{decided ? "No decisions yet" : "Nothing waiting"}</strong>
                  {decided
                    ? "Approved and rejected self-registrations will be listed here."
                    : "New self-registrations from the public form appear here for review."}
                </div></td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
