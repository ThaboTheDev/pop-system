import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { formatMoney, formatNumber, formatDate } from "@/lib/format";
import type { DashboardStats } from "@/lib/types";
import { Stat } from "@/components/Stat";
import { BarChart } from "@/components/BarChart";
import { TrendChart } from "@/components/TrendChart";
import { StatusBadge } from "@/components/StatusBadge";

// Revalidate every 30 seconds. Dashboard stats don't need millisecond freshness
// and 30s is invisible to an administrator but dramatically cuts cache misses.
export const dynamic = "force-dynamic";

/** Figures such as R1 250 000.00 need a step down in size to stay on one line
 *  inside the band, the same rule the Stat card uses. */
function valueClass(value: string) {
  return value.length > 11 ? "value sm" : "value";
}

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

      {/* The band carries the four figures an administrator opens this screen
          for, in the institute's navy and gold. The money already banked and
          the money still owed sit below it as ordinary cards. */}
      <section className="hero-band">
        <p className="eyebrow">MSR Learning Institute</p>
        <h1>Payments and proof of payment</h1>
        <p className="hero-lede">
          Live position across every programme, as at {formatDate(new Date().toISOString())}.
          {" "}
          {formatNumber(s.pops_pending)} proofs of payment are waiting for a decision.
        </p>
        <div className="hero-actions">
          <Link className="btn btn-gold" href="/verification">
            Review {formatNumber(s.pops_pending)} waiting
          </Link>
          <Link className="btn btn-outline-light" href="/reports">Open reports</Link>
        </div>
        <div className="hero-figures">
          <div className="hero-figure">
            <div className="label">Registered participants</div>
            <div className={valueClass(formatNumber(s.participants_total))}>
              {formatNumber(s.participants_total)}
            </div>
          </div>
          <div className="hero-figure">
            <div className="label">Proofs submitted</div>
            <div className={valueClass(formatNumber(s.pops_total))}>{formatNumber(s.pops_total)}</div>
            <div className="foot">{formatNumber(s.submitted_today)} today</div>
          </div>
          <div className="hero-figure">
            <div className="label">Awaiting verification</div>
            <div className={valueClass(formatNumber(s.pops_pending))}>{formatNumber(s.pops_pending)}</div>
            <div className="foot">Oldest first in the queue</div>
          </div>
          <div className="hero-figure">
            <div className="label">Verified income</div>
            <div className={valueClass(formatMoney(s.amount_verified))}>
              {formatMoney(s.amount_verified)}
            </div>
            <div className="foot">{formatMoney(s.amount_declared)} declared</div>
          </div>
        </div>
      </section>

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label="Received today" value={formatMoney(s.received_today)} />
        <Stat label="Received this month" value={formatMoney(s.received_month)} />
        <Stat label="Outstanding" value={formatMoney(s.outstanding_total)}
              foot={`${formatNumber(s.participants_outstanding)} participants owe money`} />
        <Stat label="Needs attention" value={formatNumber(s.pops_attention)} variant="alert"
              foot="Duplicates and clarifications" />
      </div>

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
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

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
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
