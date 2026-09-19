import { ParticipantOperations } from "@/components/ParticipantOperations";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, canEditParticipants } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { formatMoney, formatDate, formatDateTime, humanise } from "@/lib/format";
import { StatusBadge, DuplicateBadge } from "@/components/StatusBadge";
import { Stat } from "@/components/Stat";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export default async function ParticipantProfile(
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await params;
  const sb = await supabaseServer();

  const { data: person } = await sb
    .from("participants")
    .select("*, programmes(name, code), cohorts(name)")
    .eq("id", id)
    .maybeSingle();

  if (!person) notFound();

  const { data: payments } = await sb
    .from("payments")
    .select("id, payment_ref, amount, payment_date, reference, method, bank, status, duplicate_flag, duplicate_reason, rejection_reason, verified_at, submitted_at, pops(id, file_name, mime_type, file_size)")
    .eq("participant_id", id)
    .order("payment_date", { ascending: false });

  logAudit(user, "participant.viewed", "participant", id,
    `Opened profile ${person.participant_ref}`);

  const programme = person.programmes as unknown as { name: string; code: string } | null;
  const cohort = person.cohorts as unknown as { name: string } | null;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="faint" style={{ margin: 0 }}>
            <Link href="/participants">Participants</Link>
          </p>
          <h1>{person.full_name}</h1>
          <p>
            {person.participant_ref} · {programme?.name}
            {cohort ? ` · ${cohort.name}` : ""}
          </p>
        </div>
        <div className="btn-row">
          <StatusBadge status={person.payment_status} />
          {canEditParticipants(user) && <><Link className="btn" href={`/participants/${id}/edit`}>Edit</Link><Link className="btn" href={`/participants/${id}/record-payment`}>Record payment</Link></>}
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 14 }}>
        <Stat label="Amount due" value={formatMoney(person.amount_due)} />
        <Stat label="Verified payments" value={formatMoney(person.amount_paid)}
              foot="Verified payments + approved adjustments" />
        <Stat label="Outstanding" value={formatMoney(person.outstanding)}
              variant={Number(person.outstanding) > 0 ? "flag" : undefined} />
        <Stat label="Proofs submitted" value={person.pop_count}
              foot={`Last payment ${formatDate(person.last_payment_date)}`} />
      </div>

      <div className="grid grid-2" style={{ marginBottom: 14 }}>
        <div className="card">
          <h2>Contact and registration</h2>
          <dl className="facts">
            <div><dt>Email</dt><dd>{person.email ?? "Not recorded"}</dd></div>
            <div><dt>Mobile</dt><dd>{person.mobile ?? "Not recorded"}</dd></div>
            <div><dt>Programme code</dt><dd>{programme?.code}</dd></div>
            <div><dt>Registered</dt><dd>{formatDate(person.registration_date)}</dd></div>
            <div><dt>Record created</dt><dd>{formatDateTime(person.created_at)}</dd></div>
            <div><dt>Last updated</dt><dd>{formatDateTime(person.updated_at)}</dd></div>
          </dl>
        </div>
        <div className="card">
          <h2>Administrator notes</h2>
          {person.notes
            ? <p>{person.notes}</p>
            : <p className="faint">No notes recorded against this participant.</p>}
        </div>
      </div>

      <ParticipantOperations id={id} user={user} outstanding={Number(person.outstanding)} />
      <div className="card card-flush">
        <h2>Payment history</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Payment</th><th className="num">Amount</th><th>Paid on</th>
                <th>Reference</th><th>Method</th><th>Proof</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {(payments ?? []).map((p) => {
                const pops = (p.pops ?? []) as unknown as { id: string; file_name: string }[];
                return (
                  <tr key={p.id} className={p.duplicate_flag ? "row-flagged" : undefined}>
                    <td className="nowrap">{p.payment_ref}</td>
                    <td className="num">{formatMoney(p.amount)}</td>
                    <td className="nowrap">{formatDate(p.payment_date)}</td>
                    <td>{p.reference ?? "\u2014"}</td>
                    <td>{humanise(p.method)}{p.bank ? `, ${p.bank}` : ""}</td>
                    <td>
                      {pops.length
                        ? pops.map((f) => (
                            <a key={f.id} href={`/api/pop/${f.id}`} target="_blank" rel="noreferrer">
                              View proof
                            </a>
                          ))
                        : <span className="faint">None attached</span>}
                    </td>
                    <td>
                      <StatusBadge status={p.status} />
                      {p.duplicate_flag ? <div style={{ marginTop: 4 }}><DuplicateBadge reason={p.duplicate_reason} /></div> : null}
                      {p.rejection_reason ? <div className="faint">{p.rejection_reason}</div> : null}
                    </td>
                    <td className="right">
                      <Link className="btn btn-sm" href={`/verification/${p.id}`}>Open</Link>
                    </td>
                  </tr>
                );
              })}
              {!payments?.length ? (
                <tr><td colSpan={8}><div className="empty">
                  <strong>No payments recorded</strong>
                  Nothing has been submitted against this participant yet.
                </div></td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
