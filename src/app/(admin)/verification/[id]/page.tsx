import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, canVerify } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { formatMoney, formatDate, formatDateTime, humanise, fileSize } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { logAudit } from "@/lib/audit";
import { DecisionPanel } from "./DecisionPanel";

export const dynamic = "force-dynamic";

export default async function VerifyPayment({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const sb = await supabaseServer();

  const { data: payment } = await sb
    .from("payments")
    .select("*, participants(*, programmes(name, code)), pops(*), app_users(full_name)")
    .eq("id", id)
    .maybeSingle();

  if (!payment) notFound();

  const { data: history } = await sb
    .from("payment_verifications")
    .select("*")
    .eq("payment_id", id)
    .order("created_at", { ascending: false });

  const person = payment.participants as unknown as {
    id: string; full_name: string; participant_ref: string; email: string | null;
    mobile: string | null; amount_due: number; amount_paid: number; outstanding: number;
    payment_status: string; programmes: { name: string; code: string } | null;
  };
  const pops = (payment.pops ?? []) as unknown as
    { id: string; file_name: string; mime_type: string; file_size: number }[];
  const doc = pops[0];

  // Opening a proof of payment is itself an auditable event.
  await logAudit(user, "pop.viewed", "payment", id,
    `Opened ${payment.payment_ref} for ${person?.participant_ref}`);

  return (
    <>
      <div className="page-head">
        <div>
          <p className="faint" style={{ margin: 0 }}>
            <Link href="/verification">Verification queue</Link>
          </p>
          <h1>{payment.payment_ref}</h1>
          <p>Submitted {formatDateTime(payment.submitted_at)} · {humanise(payment.submitted_channel)}</p>
        </div>
        <StatusBadge status={payment.status} />
      </div>

      {payment.duplicate_flag ? (
        <div className="notice notice-warn">
          <strong>Duplicate, review required.</strong> {payment.duplicate_reason}.
          Nothing has been deleted. Confirm against the bank statement before deciding.
        </div>
      ) : null}
      {!canVerify(user) ? (
        <div className="notice notice-info">
          You have read access to this proof of payment. Verification is restricted to finance administrators.
        </div>
      ) : null}

      <div className="verify-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card">
            <h2>Participant</h2>
            <p style={{ margin: "0 0 10px" }}>
              <Link href={`/participants/${person.id}`}>{person.full_name}</Link>
              <br />
              <span className="faint">{person.participant_ref}</span>
            </p>
            <dl className="facts">
              <div><dt>Programme</dt><dd>{person.programmes?.name}</dd></div>
              <div><dt>Email</dt><dd>{person.email ?? "Not recorded"}</dd></div>
              <div><dt>Mobile</dt><dd>{person.mobile ?? "Not recorded"}</dd></div>
              <div><dt>Amount due</dt><dd>{formatMoney(person.amount_due)}</dd></div>
              <div><dt>Verified to date</dt><dd>{formatMoney(person.amount_paid)}</dd></div>
              <div><dt>Outstanding</dt><dd>{formatMoney(person.outstanding)}</dd></div>
              <div><dt>Status</dt><dd><StatusBadge status={person.payment_status} /></dd></div>
            </dl>
          </div>

          <div className="card">
            <h2>Payment as declared</h2>
            <dl className="facts">
              <div><dt>Amount</dt><dd><strong>{formatMoney(payment.amount)}</strong></dd></div>
              <div><dt>Payment date</dt><dd>{formatDate(payment.payment_date)}</dd></div>
              <div><dt>Reference</dt><dd>{payment.reference ?? "None given"}</dd></div>
              <div><dt>Method</dt><dd>{humanise(payment.method)}</dd></div>
              <div><dt>Bank</dt><dd>{payment.bank ?? "Not stated"}</dd></div>
              {payment.verified_at ? (
                <div><dt>Verified</dt><dd>{formatDateTime(payment.verified_at)}</dd></div>
              ) : null}
              {payment.rejection_reason ? (
                <div><dt>Rejected because</dt><dd>{payment.rejection_reason}</dd></div>
              ) : null}
            </dl>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card">
            <h2>Proof of payment</h2>
            {doc ? (
              <>
                <div className="doc-frame">
                  {doc.mime_type === "application/pdf" ? (
                    <iframe src={`/api/pop/${doc.id}`} title={doc.file_name} />
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={`/api/pop/${doc.id}`} alt={`Proof of payment ${payment.payment_ref}`} />
                  )}
                </div>
                <div className="btn-row" style={{ marginTop: 10, alignItems: "center" }}>
                  <a className="btn btn-sm" href={`/api/pop/${doc.id}`} target="_blank" rel="noreferrer">
                    Open in new tab
                  </a>
                  <a className="btn btn-sm" href={`/api/pop/${doc.id}?download=1`}>Download</a>
                  <span className="faint">{doc.file_name} · {fileSize(doc.file_size)}</span>
                </div>
                {pops.length > 1 ? (
                  <p className="faint" style={{ marginTop: 8 }}>
                    {pops.length} documents attached to this payment.
                  </p>
                ) : null}
              </>
            ) : (
              <div className="empty">
                <strong>No document attached</strong>
                This payment was captured without a proof of payment file.
              </div>
            )}
          </div>

          <DecisionPanel
            paymentId={payment.id}
            currentStatus={payment.status}
            notes={payment.admin_notes}
            readOnly={!canVerify(user)}
          />

          <div className="card card-flush">
            <h2>Decision history</h2>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>When</th><th>Administrator</th><th>Change</th><th>Reason or note</th></tr>
                </thead>
                <tbody>
                  {(history ?? []).map((h) => (
                    <tr key={h.id}>
                      <td className="nowrap faint">{formatDateTime(h.created_at)}</td>
                      <td>{h.actor_email ?? "System"}</td>
                      <td className="nowrap">
                        {humanise(h.from_status)} to {humanise(h.to_status)}
                      </td>
                      <td>{h.reason ?? h.note ?? "\u2014"}</td>
                    </tr>
                  ))}
                  {!history?.length ? (
                    <tr><td colSpan={4}><div className="empty">
                      <strong>No decision recorded yet</strong>
                      This proof of payment is waiting for a first review.
                    </div></td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
