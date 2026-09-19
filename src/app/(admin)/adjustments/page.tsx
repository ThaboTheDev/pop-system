import { requireUser, canEditParticipants } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { PageHead } from "@/components/PageHead";
import { requestAdjustment, decideAdjustment } from "./actions";

export const dynamic = "force-dynamic";

/** Signed corrections to a participant's account.
 *
 *  A positive adjustment credits the account, a negative one reverses credit,
 *  and a pending request changes nothing — income moves only when an
 *  administrator approves, which the database enforces. */
export default async function Adjustments() {
  const user = await requireUser();
  const edit = canEditParticipants(user);
  const sb = await supabaseServer();

  const { data: rows } = await sb
    .from("account_adjustments")
    .select("*,participants(participant_ref,full_name)")
    .order("created_at", { ascending: false })
    .limit(100);

  const pending = (rows ?? []).filter((r) => r.status === "pending");

  return (
    <>
      <PageHead
        eyebrow="Finance"
        title="Account adjustments"
        sub="Positive amounts credit the account, negative amounts reverse credit. A pending request does not change income."
      />

      {edit ? (
        <form action={requestAdjustment} className="card" style={{ marginBottom: 16 }}>
          <h2>Request an adjustment</h2>
          <div className="grid grid-3">
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="ref">Participant ID</label>
              <input id="ref" name="ref" required placeholder="MSRI-001284" />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="amount">Signed amount (R)</label>
              <input id="amount" name="amount" type="number" step="0.01" required placeholder="-250.00" />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="reason">Reason</label>
              <input id="reason" name="reason" required placeholder="Write-off approved by finance" />
            </div>
          </div>
          <div className="btn-row" style={{ marginTop: 16 }}>
            <button className="btn btn-gold">Request adjustment</button>
          </div>
          <p className="faint" style={{ marginTop: 10, marginBottom: 0 }}>
            A second administrator approves or rejects it, and the decision is audited.
          </p>
        </form>
      ) : null}

      {pending.length ? (
        <div className="notice notice-warn">
          {pending.length} {pending.length === 1 ? "adjustment is" : "adjustments are"} waiting
          for a decision.
        </div>
      ) : null}

      <div className="card card-flush">
        <h2>Adjustments, latest 100</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Participant</th><th className="num">Amount</th><th>Reason</th>
                <th>Status</th><th>Requested</th>
                {edit ? <th>Decision</th> : null}
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r) => {
                const person = r.participants as unknown as
                  { participant_ref: string; full_name: string } | null;
                return (
                  <tr key={r.id}>
                    <td>
                      {person?.full_name ?? "Unknown"}
                      <div className="faint">{person?.participant_ref}</div>
                    </td>
                    <td className="num">{Number(r.amount).toFixed(2)}</td>
                    <td>{r.reason}</td>
                    <td>
                      <span className={`badge ${
                        r.status === "approved" ? "badge-ok"
                          : r.status === "rejected" ? "badge-stop" : "badge-wait"
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="faint nowrap">{formatDate(r.created_at)}</td>
                    {edit ? (
                      <td>
                        {r.status === "pending" ? (
                          <form action={decideAdjustment} className="btn-row">
                            <input type="hidden" name="id" value={r.id} />
                            <button className="btn btn-sm btn-primary" name="status" value="approved">
                              Approve
                            </button>
                            <button className="btn btn-sm btn-danger" name="status" value="rejected">
                              Reject
                            </button>
                          </form>
                        ) : (
                          <span className="faint">Decided</span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
              {!rows?.length ? (
                <tr>
                  <td colSpan={edit ? 6 : 5}>
                    <div className="empty">
                      <strong>No adjustments on record</strong>
                      Corrections raised here are listed with their decision.
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
