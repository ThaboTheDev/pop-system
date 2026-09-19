import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { formatMoney, formatNumber, formatDate } from "@/lib/format";
import type { DashboardStats } from "@/lib/types";
import { Stat } from "@/components/Stat";
import { BarChart } from "@/components/BarChart";
import { TrendChart } from "@/components/TrendChart";
import { StatusBadge } from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

export default async function DashboardPage(
  { searchParams }: { searchParams: Promise<{ denied?: string }> },
) {
  await requireUser();
  const { denied } = await searchParams;
  const sb = await supabaseServer();

  const [{ data: stats }, { data: recent }] = await Promise.all([
    sb.rpc("dashboard_stats", { p_programme_id: null }),
    sb.from("payments")
      .select("id, payment_ref, amount, payment_date, status, duplicate_flag, participants(full_name, participant_ref)")
      .order("submitted_at", { ascending: false })
      .limit(8),
  ]);

  const s = stats as DashboardStats | null;
  if (!s) return <div className="notice notice-error">The dashboard figures could not be loaded.</div>;

  const statusData = Object.entries(s.status_breakdown).map(([key, value]) => ({ key, value }));
  const verifyData = Object.entries(s.verification_breakdown).map(([key, value]) => ({ key, value }));

  return (
    <>
      {denied ? (
        <div className="notice notice-warn">
          Your role does not give you access to that page.
        </div>
      ) : null}

      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>Live position across every programme, as at {formatDate(new Date().toISOString())}.</p>
        </div>
        <Link className="btn btn-primary" href="/verification">
          Review {formatNumber(s.pops_pending)} waiting
        </Link>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 14 }}>
        <Stat label="Registered participants" value={formatNumber(s.participants_total)} />
        <Stat label="Proofs of payment submitted" value={formatNumber(s.pops_total)}
              foot={`${formatNumber(s.submitted_today)} today`} />
        <Stat label="Awaiting verification" value={formatNumber(s.pops_pending)} variant="flag" />
        <Stat label="Needs attention" value={formatNumber(s.pops_attention)} variant="alert"
              foot="Duplicates and clarifications" />
      </div>

      <div className="grid grid-4" style={{ marginBottom: 14 }}>
        <Stat label="Verified income" value={formatMoney(s.amount_verified)}
              foot={`${formatMoney(s.amount_declared)} declared in total`} />
        <Stat label="Received today" value={formatMoney(s.received_today)} />
        <Stat label="Received this month" value={formatMoney(s.received_month)} />
        <Stat label="Outstanding" value={formatMoney(s.outstanding_total)}
              foot={`${formatNumber(s.participants_outstanding)} participants owe money`} />
      </div>

      <div className="grid grid-2" style={{ marginBottom: 14 }}>
        <div className="card">
          <h2>Verified receipts, last 30 days</h2>
          <TrendChart data={s.payments_over_time} />
        </div>
        <div className="card">
          <h2>Participant payment status</h2>
          <BarChart data={statusData} total={s.participants_total} />
          <p className="faint" style={{ marginTop: 12 }}>
            {formatNumber(s.participants_fully_paid)} participants have settled in full.
          </p>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 14 }}>
        <div className="card">
          <h2>Proof of payment verification</h2>
          <BarChart data={verifyData} total={s.pops_total} />
        </div>
        <div className="card">
          <h2>Outstanding by programme</h2>
          <BarChart
            data={s.by_programme.map((p) => ({ key: p.name, value: Number(p.outstanding) }))}
            formatValue={(v) => formatMoney(v)}
          />
        </div>
      </div>

      <div className="card card-flush">
        <h2>Latest submissions</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Payment</th><th>Participant</th><th className="num">Amount</th>
                <th>Paid on</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {(recent ?? []).map((p) => {
                const person = p.participants as unknown as { full_name: string; participant_ref: string } | null;
                return (
                  <tr key={p.id} className={p.duplicate_flag ? "row-flagged" : undefined}>
                    <td className="nowrap">{p.payment_ref}</td>
                    <td>{person?.full_name ?? "Unknown"} <span className="faint">{person?.participant_ref}</span></td>
                    <td className="num">{formatMoney(p.amount)}</td>
                    <td className="nowrap">{formatDate(p.payment_date)}</td>
                    <td><StatusBadge status={p.status} /></td>
                    <td className="right">
                      <Link className="btn btn-sm" href={`/verification/${p.id}`}>Open</Link>
                    </td>
                  </tr>
                );
              })}
              {!recent?.length ? (
                <tr><td colSpan={6}><div className="empty">
                  <strong>No proofs of payment yet</strong>
                  Submissions appear here the moment a participant sends one.
                </div></td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
