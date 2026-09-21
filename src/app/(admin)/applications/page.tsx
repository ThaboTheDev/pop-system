import Link from "next/link";
import { requireUser, canEditParticipants } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { describePaymentOption, formatDateTime, formatMoney, formatNumber, humanise } from "@/lib/format";
import { PageHead } from "@/components/PageHead";
import { Pager } from "@/components/Pager";
import { StatusBadge } from "@/components/StatusBadge";
import { ApplicationDecision } from "./ApplicationDecision";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 30;

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const decided = sp.view === "decided";
  const page = Math.max(1, Math.trunc(Number(sp.page)) || 1);
  const sb = await supabaseServer();
  let query = sb.from("applications")
    .select("id,first_name,surname,email,mobile,status,source,consent_given,consent_at,privacy_notice_version,consent_method,decision_reason,reviewed_at,created_at,participant_id,approved_fee,payment_option,quoted_fee,programmes(name,amount_due,once_off_amount,pricing_model)", { count: "exact" });
  query = decided
    ? query.in("status", ["approved", "declined"]).order("reviewed_at", { ascending: false, nullsFirst: false })
    : query.eq("status", "pending").order("created_at", { ascending: true });
  const { data: rows, count, error } = await query.order("id").range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  return (
    <>
      <PageHead eyebrow="Admissions" title="Applications" sub={decided ? "Decisions, consent records and approved fees." : `${formatNumber(count ?? 0)} applications awaiting review, oldest first. None are included in the participant register or financial totals.`}>
        <Link className={`btn ${decided ? "" : "btn-primary"}`} href="/applications">Waiting</Link>
        <Link className={`btn ${decided ? "btn-primary" : ""}`} href="/applications?view=decided">Decided</Link>
      </PageHead>
      {error ? <div className="notice notice-error" role="alert">Applications could not be loaded. Check the database migrations and try again.</div> : null}
      <div className="card card-flush">
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Applicant</th><th>Programme</th><th>Consent</th><th>{decided ? "Decision" : "Review"}</th></tr></thead>
            <tbody>
              {(rows ?? []).map(row => {
                const programme = row.programmes as unknown as { name: string; amount_due: number; once_off_amount: number | null; pricing_model: string } | null;
                const quoted = row.quoted_fee ?? programme?.amount_due ?? 0;
                return (
                  <tr key={row.id}>
                    <td><strong>{row.first_name} {row.surname}</strong><div>{row.email ?? "Email not recorded"}</div><div className="faint">{row.mobile}</div><div className="faint">{formatDateTime(row.created_at)} · {humanise(row.source)}</div></td>
                    <td>
                      {programme?.name}
                      {programme?.pricing_model === "dual"
                        ? <div className="faint">Once-off {formatMoney(programme.once_off_amount)} · Monthly {formatMoney(programme.amount_due)}</div>
                        : <div className="faint">Programme fee: {formatMoney(programme?.amount_due ?? 0)}</div>}
                      {row.payment_option || row.quoted_fee != null
                        ? <div className="faint">{describePaymentOption(row.payment_option, row.quoted_fee)}</div>
                        : null}
                    </td>
                    <td>
                      <div>{row.consent_given ? "Consent recorded" : "Consent missing"}</div>
                      <div className="faint">{row.consent_at ? formatDateTime(row.consent_at) : "No timestamp"}</div>
                      <div className="faint">Notice: {row.privacy_notice_version}</div>
                      <div className="faint">{humanise(row.consent_method)}</div>
                    </td>
                    <td>{decided ? (
                      <><StatusBadge status={row.status} /><div>{row.decision_reason}</div><div className="faint">{row.reviewed_at ? formatDateTime(row.reviewed_at) : "Legacy decision"}</div>
                        {row.status === "approved" ? <div>Approved fee: {formatMoney(row.approved_fee ?? 0)}{row.participant_id ? <> · <Link href={`/participants/${row.participant_id}`}>Participant record</Link></> : null}</div> : null}
                      </>
                    ) : canEditParticipants(user) ? <ApplicationDecision id={row.id} fee={quoted} consent={row.consent_given && !!row.consent_at} /> : <span className="faint">Finance reviews applications</span>}</td>
                  </tr>
                );
              })}
              {!error && !rows?.length ? <tr><td colSpan={4}><div className="empty"><strong>{decided ? "No decisions yet" : "Nothing waiting"}</strong>Applications from the public and runner forms appear here.</div></td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
      <Pager page={page} total={count ?? 0} pageSize={PAGE_SIZE} basePath="/applications" params={sp} />
    </>
  );
}
