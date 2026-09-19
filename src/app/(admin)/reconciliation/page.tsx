import { requireUser, canEditParticipants } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHead } from "@/components/PageHead";
import { uploadStatement, updateLine } from "./actions";

export const dynamic = "force-dynamic";

/** Bank statement lines set against declared payments.
 *
 *  Matching is advisory: it never verifies a payment and never changes income.
 *  A line matches automatically only when the normalised reference is unique,
 *  the amount is exact and the date is within three days. Everything else is an
 *  administrator's judgement, so the manual controls stay on every row. */
export default async function Reconciliation({
  searchParams,
}: {
  searchParams: Promise<{ batch?: string }>;
}) {
  const user = await requireUser();
  const manage = canEditParticipants(user);
  const sb = await supabaseServer();
  const { batch } = await searchParams;

  const { data: history } = await sb
    .from("bank_statement_lines")
    .select("batch_id,created_at")
    .eq("line_no", 1)
    .order("created_at", { ascending: false })
    .limit(50);

  let query = sb
    .from("bank_statement_lines")
    .select("*")
    .order("created_at", { ascending: false })
    .order("line_no")
    .limit(1000);
  if (batch) query = query.eq("batch_id", batch);
  const { data: lines } = await query;

  return (
    <>
      <PageHead
        eyebrow="Finance"
        title="Bank reconciliation"
        sub="Set bank statement lines against declared payments. Matching does not verify a payment or change income."
      />

      <div className="notice notice-info">
        A line is matched automatically only when the reference is unique, the
        amount is exact and the date is within three days of the declaration.
        Decide the payment itself in the verification queue.
      </div>

      {manage ? (
        <form action={uploadStatement} className="card" style={{ marginBottom: 16 }}>
          <h2>Import a bank CSV</h2>
          <div className="field">
            <label htmlFor="file">Statement file</label>
            <input id="file" name="file" type="file" accept=".csv,text/csv" required />
            <p className="faint" style={{ margin: "6px 0 0" }}>
              Columns: date, amount, description, reference. Dates as YYYY-MM-DD.
              Up to 1 000 lines.
            </p>
          </div>
          <button className="btn btn-primary">Import and auto-match</button>
        </form>
      ) : null}

      <div className="card card-flush" style={{ marginBottom: 16 }}>
        <h2>Statement lines{batch ? " in this batch" : ""}</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Line</th><th>Date</th><th className="num">Amount</th>
                <th>Reference</th><th>Description</th><th>Status</th>
                {manage ? <th>Manual match</th> : null}
              </tr>
            </thead>
            <tbody>
              {(lines ?? []).map((r) => (
                <tr key={r.id}>
                  <td className="num nowrap">#{r.line_no}</td>
                  <td className="nowrap">{r.tx_date}</td>
                  <td className="num">R {Number(r.amount).toFixed(2)}</td>
                  <td>{r.reference ?? "—"}</td>
                  <td className="faint">{r.description}</td>
                  <td>
                    <span className={`badge ${r.matched_payment_id ? "badge-ok" : "badge-idle"}`}>
                      {r.status}
                    </span>
                  </td>
                  {manage ? (
                    <td>
                      <form action={updateLine} className="btn-row">
                        <input type="hidden" name="id" value={r.id} />
                        <input name="payment_id" placeholder="Payment UUID"
                               defaultValue={r.matched_payment_id ?? ""}
                               style={{ minWidth: 220 }} />
                        <button className="btn btn-sm" name="status" value="matched">Match</button>
                        <button className="btn btn-sm" name="status" value="unmatched">Unmatch</button>
                        <button className="btn btn-sm" name="status" value="ignored">Ignore</button>
                      </form>
                    </td>
                  ) : null}
                </tr>
              ))}
              {!lines?.length ? (
                <tr>
                  <td colSpan={manage ? 7 : 6}>
                    <div className="empty">
                      <strong>No statement lines yet</strong>
                      Import a bank CSV to start reconciling.
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Batch history</h2>
        {(history ?? []).length ? (
          <div className="btn-row">
            {(history ?? []).map((r) => (
              <a className={`btn btn-sm ${batch === r.batch_id ? "btn-primary" : ""}`}
                 key={r.batch_id} href={`/reconciliation?batch=${r.batch_id}`}>
                {String(r.created_at).slice(0, 10)} · {String(r.batch_id).slice(0, 8)}
              </a>
            ))}
          </div>
        ) : (
          <p className="faint" style={{ marginBottom: 0 }}>No batches imported yet.</p>
        )}
        {batch ? (
          <p className="faint" style={{ marginTop: 12, marginBottom: 0 }}>
            <a href="/reconciliation">Show every batch</a>
          </p>
        ) : null}
      </div>
    </>
  );
}
