import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { formatMoney, formatNumber } from "@/lib/format";

export const revalidate = 60;
export const dynamic = "force-dynamic";

export default async function ProgrammesPage() {
  await requireUser();
  const sb = await supabaseServer();
  const { data } = await sb.rpc("programme_report", { p_from: null, p_to: null });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Programmes</h1>
          <p>Each programme carries its own fee, which becomes the amount due for participants imported against it.</p>
        </div>
      </div>
      <div className="card card-flush">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Programme</th><th>Code</th><th className="num">Participants</th>
                <th className="num">PoPs submitted</th><th className="num">Verified</th>
                <th className="num">Amount verified</th><th className="num">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {((data ?? []) as Record<string, string | number>[]).map((r) => (
                <tr key={String(r.code)}>
                  <td>{r.programme}</td>
                  <td>{r.code}</td>
                  <td className="num">{formatNumber(Number(r.participants))}</td>
                  <td className="num">{formatNumber(Number(r.pops_submitted))}</td>
                  <td className="num">{formatNumber(Number(r.verified_payments))}</td>
                  <td className="num">{formatMoney(r.total_verified)}</td>
                  <td className="num">{formatMoney(r.outstanding)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
