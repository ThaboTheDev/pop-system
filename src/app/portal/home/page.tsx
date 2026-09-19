import { redirect } from "next/navigation";
import { formatMoney, humanise } from "@/lib/format";
import { portalParticipant } from "@/lib/portal";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { mintResubmit } from "@/lib/resubmit";
import { Crest } from "@/components/Brand";
import { StatusBadge } from "@/components/StatusBadge";
import { logoutPortal } from "../actions";

export const metadata = {
  title: "Your payments | MSR Learning Institute",
  robots: { index: false, follow: false },
};

async function resubmit(form: FormData) {
  "use server";
  const id = await portalParticipant(); if (!id) redirect("/portal");
  const url = await mintResubmit(String(form.get("payment_id")), id);
  redirect(new URL(url).pathname);
}

/** A participant's own record: what is owed, what has been verified, the
 *  instalment plan and the last forty payments. Read only except for
 *  resubmitting a document the finance office queried. */
export default async function PortalHome() {
  const id = await portalParticipant(); if (!id) redirect("/portal");
  const sb = supabaseAdmin();
  const { data: p } = await sb.from("participants").select("*").eq("id", id).single();
  if (!p) redirect("/portal");

  const [{ data: payments }, { data: plan }] = await Promise.all([
    sb.from("payments").select("*").eq("participant_id", id).order("payment_date", { ascending: false }).limit(40),
    sb.from("payment_plans").select("*").eq("participant_id", id).order("instalment_no"),
  ]);

  const outstanding = Number(p.outstanding);
  const figures: [string, number][] = [
    ["Amount due", Number(p.amount_due)],
    ["Verified paid", Number(p.amount_paid)],
    ["Outstanding", Math.max(0, outstanding)],
    ["Credit", Math.max(0, -outstanding)],
  ];

  return (
    <div className="portal" style={{ paddingBottom: 48 }}>
      <header className="portal-head">
        <Crest className="brand-logo" size={58} />
        <div className="crest">MSR Learning Institute</div>
        <h1>{p.full_name}</h1>
        <p>{p.participant_ref}</p>
      </header>

      <main className="portal-body" style={{ maxWidth: 900 }}>
        <div className="grid grid-4" style={{ marginBottom: 16 }}>
          {figures.map(([label, value]) => (
            <div className="stat" key={label}>
              <div className="label">{label}</div>
              <div className="value sm">{formatMoney(value)}</div>
            </div>
          ))}
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <h2>Payment plan</h2>
          {plan?.length ? (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th className="num">Instalment</th><th>Due</th><th className="num">Amount</th><th>State</th></tr>
                </thead>
                <tbody>
                  {plan.map((r: { id: string; instalment_no: number; amount: number; due_date: string; paid_at: string | null }) => (
                    <tr key={r.id}>
                      <td className="num">{r.instalment_no}</td>
                      <td className="nowrap">{r.due_date}</td>
                      <td className="num">{formatMoney(r.amount)}</td>
                      <td>
                        <span className={`badge ${r.paid_at ? "badge-ok" : "badge-idle"}`}>
                          {r.paid_at ? "Paid" : "Unpaid"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="faint" style={{ marginBottom: 0 }}>No instalment plan is recorded for you.</p>
          )}
        </div>

        <div className="card card-flush" style={{ marginBottom: 16 }}>
          <h2>Payments, latest 40</h2>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Reference</th><th>Paid on</th><th className="num">Amount</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {(payments ?? []).map((r: {
                  id: string; payment_ref: string; amount: number; payment_date: string;
                  status: string; rejection_reason: string | null;
                }) => (
                  <tr key={r.id}>
                    <td className="nowrap">{r.payment_ref}</td>
                    <td className="nowrap">{r.payment_date}</td>
                    <td className="num">{formatMoney(r.amount)}</td>
                    <td>
                      <StatusBadge status={r.status} />
                      {r.rejection_reason ? (
                        <div className="faint" style={{ marginTop: 4 }}>{r.rejection_reason}</div>
                      ) : null}
                    </td>
                    <td className="right">
                      {r.status === "verified" ? (
                        <a className="btn btn-sm" href={`/api/receipts/${r.id}`}>Receipt</a>
                      ) : null}
                      {["rejected", "requires_clarification"].includes(r.status) ? (
                        <form action={resubmit}>
                          <input type="hidden" name="payment_id" value={r.id} />
                          <button className="btn btn-sm btn-primary">Resubmit proof</button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {!payments?.length ? (
                  <tr>
                    <td colSpan={5}>
                      <div className="empty">
                        <strong>No payments recorded yet</strong>
                        Submit a proof of payment and it will appear here.
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="btn-row">
          <a className="btn btn-gold" href={`/api/statements/${id}`}>Download my statement</a>
          <a className="btn" href="/submit">Submit another payment</a>
          <form action={logoutPortal}>
            <button className="btn">Sign out</button>
          </form>
        </div>
        <p className="faint" style={{ marginTop: 14 }}>
          Amounts shown as verified are the ones the finance office has confirmed.
          A payment under review does not count towards your total yet.
        </p>
      </main>
    </div>
  );
}
