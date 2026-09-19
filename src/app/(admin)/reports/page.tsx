import { requireUser, canExport } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { formatMoney, formatNumber, formatDate } from "@/lib/format";
import type { DashboardStats } from "@/lib/types";
import { humanise } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ReportsPage(
  { searchParams }: { searchParams: Promise<{ from?: string; to?: string }> },
) {
  const user = await requireUser();
  const { from, to } = await searchParams;
  const sb = await supabaseServer();

  const [{ data: programme }, { data: monthly }, { data: daily }, { data: stats }] =
    await Promise.all([
      sb.rpc("programme_report", { p_from: from ?? null, p_to: to ?? null }),
      sb.rpc("monthly_payment_report", { p_months: 12 }),
      sb.rpc("daily_payment_report", { p_days: 14 }),
      sb.rpc("dashboard_stats", { p_programme_id: null }),
    ]);

  const s = stats as DashboardStats | null;
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Reports</h1>
          <p>Figures reflect verified payments unless a column says otherwise.</p>
        </div>
      </div>

      <form className="filters" action="/reports">
        <div className="field"><label htmlFor="from">From</label>
          <input id="from" name="from" type="date" defaultValue={from ?? ""} /></div>
        <div className="field"><label htmlFor="to">To</label>
          <input id="to" name="to" type="date" defaultValue={to ?? ""} /></div>
        <button className="btn btn-primary" type="submit">Apply dates</button>
        {canExport(user) ? (
          <>
            <a className="btn" href={`/api/export?type=payments&${qs}`}>Payment report CSV</a>
            <a className="btn" href={`/api/export?type=programme&${qs}`}>Programme report CSV</a>
            <a className="btn" href={`/api/export?type=participants&${qs}`}>Participant report CSV</a>
          </>
        ) : null}
      </form>

      {s ? (
        <div className="card" style={{ marginBottom: 14 }}>
          <h2>Proof of payment verification</h2>
          <div className="grid grid-4">
            <div><div className="faint">Submitted</div><div className="num" style={{ fontSize: "1.25rem" }}>{formatNumber(s.pops_total)}</div></div>
            <div><div className="faint">Verified</div><div className="num" style={{ fontSize: "1.25rem" }}>{formatNumber(s.pops_verified)}</div></div>
            <div><div className="faint">Pending</div><div className="num" style={{ fontSize: "1.25rem" }}>{formatNumber(s.pops_pending)}</div></div>
            <div><div className="faint">Rejected</div><div className="num" style={{ fontSize: "1.25rem" }}>{formatNumber(s.pops_rejected)}</div></div>
          </div>
        </div>
      ) : null}

      <div className="card card-flush" style={{ marginBottom: 14 }}>
        <h2>Programme report</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Programme</th><th>Code</th><th className="num">Participants</th>
                <th className="num">PoPs</th><th className="num">Verified</th><th className="num">Pending</th>
                <th className="num">Amount verified</th><th className="num">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {(programme ?? []).map((r: Record<string, string | number>) => (
                <tr key={String(r.code)}>
                  <td>{r.programme}</td>
                  <td>{r.code}</td>
                  <td className="num">{formatNumber(Number(r.participants))}</td>
                  <td className="num">{formatNumber(Number(r.pops_submitted))}</td>
                  <td className="num">{formatNumber(Number(r.verified_payments))}</td>
                  <td className="num">{formatNumber(Number(r.pending_payments))}</td>
                  <td className="num">{formatMoney(r.total_verified)}</td>
                  <td className="num">{formatMoney(r.outstanding)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card card-flush">
          <h2>Monthly payments</h2>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Month</th><th className="num">Payments</th><th className="num">Total</th>
                    <th className="num">Verified</th><th className="num">Pending</th><th className="num">Rejected</th></tr>
              </thead>
              <tbody>
                {(monthly ?? []).map((r: Record<string, string | number>) => (
                  <tr key={String(r.month)}>
                    <td className="nowrap">{r.month}</td>
                    <td className="num">{formatNumber(Number(r.payments))}</td>
                    <td className="num">{formatMoney(r.total)}</td>
                    <td className="num">{formatMoney(r.verified)}</td>
                    <td className="num">{formatMoney(r.pending)}</td>
                    <td className="num">{formatMoney(r.rejected)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card card-flush">
          <h2>Daily payments, last 14 days</h2>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Day</th><th className="num">Submitted</th><th className="num">Verified</th>
                    <th className="num">Declared</th><th className="num">Verified value</th></tr>
              </thead>
              <tbody>
                {(daily ?? []).map((r: Record<string, string | number>) => (
                  <tr key={String(r.day)}>
                    <td className="nowrap">{formatDate(String(r.day))}</td>
                    <td className="num">{formatNumber(Number(r.submitted))}</td>
                    <td className="num">{formatNumber(Number(r.verified))}</td>
                    <td className="num">{formatMoney(r.total)}</td>
                    <td className="num">{formatMoney(r.verified_total)}</td>
                  </tr>
                ))}
                {!daily?.length ? (
                  <tr><td colSpan={5}><div className="empty">
                    <strong>No payments in this period</strong>
                    Nothing was recorded in the last 14 days.
                  </div></td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {s ? (
        <p className="faint" style={{ marginTop: 14 }}>
          Verification mix: {Object.entries(s.verification_breakdown)
            .map(([k, v]) => `${humanise(k)} ${formatNumber(v)}`).join(", ")}.
        </p>
      ) : null}
    </>
  );
}
