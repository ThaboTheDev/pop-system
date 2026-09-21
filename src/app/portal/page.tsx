import Link from "next/link";
import { redirect } from "next/navigation";
import { participantSession } from "@/lib/portal";
import { supabaseServer } from "@/lib/supabase/server";
import { formatDate, formatMoney } from "@/lib/format";
import { Crest } from "@/components/Brand";
import { StatusBadge } from "@/components/StatusBadge";
import { Pager } from "@/components/Pager";
import { mintResubmit } from "@/lib/resubmit";
import { logoutPortal } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your participant record | MSR Learning Institute", robots: { index: false, follow: false } };
const PAGE_SIZE = 20;

async function resubmit(form: FormData) {
  "use server";
  const session = await participantSession();
  if (session.status !== "linked") redirect("/portal/login");
  const url = await mintResubmit(String(form.get("payment_id") ?? ""), session.participantId);
  redirect(new URL(url).pathname);
}

export default async function Portal({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await participantSession();
  if (session.status === "signed_out") redirect("/portal/login");
  if (session.status !== "linked") {
    return (
      <div className="portal">
        <header className="portal-head"><Crest className="brand-logo" size={58} /><h1>Participant portal</h1></header>
        <main className="portal-body"><div className="card">
          <h2>{session.status === "staff" ? "This is a staff account" : session.status === "unavailable" ? "Your record is temporarily unavailable" : "We couldn’t link your participant record"}</h2>
          <p>{session.status === "staff"
            ? "Staff and runner accounts cannot be linked to participant records. Use your staff workspace instead."
            : session.status === "unavailable"
              ? "Please try again later or contact the institute. No participant information has been shown."
              : "This email could not be matched safely to an enrolled participant. If you recently applied, wait for approval. Otherwise ask the registry to check the email on your record."}</p>
          <div className="btn-row">
            {session.status === "staff" ? <Link className="btn" href="/dashboard">Staff workspace</Link> : <Link className="btn" href="/register">Application form</Link>}
            <form action={logoutPortal}><button className="btn btn-primary">Sign out / use another email</button></form>
          </div>
        </div></main>
      </div>
    );
  }
  const sb = await supabaseServer(); // User JWT, never the service role.
  const sp = await searchParams;
  const page = Math.max(1, Math.trunc(Number(sp.page)) || 1);
  const id = session.participantId;
  const [{ data: person, error: personError }, { data: payments, count, error: paymentsError }, { data: plan, error: planError }] = await Promise.all([
    sb.from("participants").select("id,participant_ref,first_name,surname,full_name,email,mobile,amount_due,amount_paid,outstanding,registration_date,programmes(name)").eq("id", id).single(),
    sb.from("payments").select("id,payment_ref,payment_date,amount,status,rejection_reason,pops(id,file_name)", { count: "exact" }).eq("participant_id", id)
      .order("payment_date", { ascending: false }).order("id").range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    sb.from("payment_plans").select("id,instalment_no,due_date,amount,paid_at").eq("participant_id", id).order("instalment_no"),
  ]);
  if (personError || !person || paymentsError || planError) throw new Error("Your record could not be loaded. Please try again later.");
  const programme = person.programmes as unknown as { name: string } | null;
  const figures: [string, number][] = [["Amount due", person.amount_due], ["Verified paid + adjustments", person.amount_paid], ["Outstanding", Math.max(0, person.outstanding)], ["Credit", Math.max(0, -person.outstanding)]];
  return (
    <div className="portal" style={{ paddingBottom: 48 }}>
      <header className="portal-head">
        <Crest className="brand-logo" size={58} />
        <div className="crest">MSR Learning Institute</div>
        <h1>{person.full_name}</h1><p>{person.participant_ref} · {programme?.name}</p>
      </header>
      <main className="portal-body" style={{ maxWidth: 960 }}>
        {sp.resubmitted ? <div className="notice notice-ok">Your replacement proof was submitted for review.</div> : null}
        <div className="grid grid-4" style={{ marginBottom: 16 }}>
          {figures.map(([label, value]) => <div className="stat" key={label}><div className="label">{label}</div><div className="value sm">{formatMoney(value)}</div></div>)}
        </div>
        <div className="card" style={{ marginBottom: 16 }}>
          <h2>Your registration</h2>
          <dl className="facts"><div><dt>Email</dt><dd>{person.email}</dd></div><div><dt>Mobile</dt><dd>{person.mobile ?? "Not recorded"}</dd></div><div><dt>Registered</dt><dd>{formatDate(person.registration_date)}</dd></div></dl>
          <p className="faint">This is the institute’s register. Contact the registry if your details need correcting; they cannot be edited here.</p>
        </div>
        {plan?.length ? <div className="card" style={{ marginBottom: 16 }}>
          <h2>Payment plan</h2><div className="table-wrap"><table className="data">
            <thead><tr><th>Instalment</th><th>Due</th><th>Amount</th><th>State</th></tr></thead>
            <tbody>{plan.map(item => <tr key={item.id}><td>{item.instalment_no}</td><td>{formatDate(item.due_date)}</td><td>{formatMoney(item.amount)}</td><td>{item.paid_at ? "Paid" : "Unpaid"}</td></tr>)}</tbody>
          </table></div>
        </div> : null}
        <div className="card card-flush" style={{ marginBottom: 16 }}>
          <h2>Payment history</h2><div className="table-wrap"><table className="data">
            <thead><tr><th>Reference</th><th>Paid on</th><th className="num">Amount</th><th>Status</th><th>Documents</th></tr></thead>
            <tbody>{(payments ?? []).map(payment => <tr key={payment.id}>
              <td>{payment.payment_ref}</td><td>{formatDate(payment.payment_date)}</td><td className="num">{formatMoney(payment.amount)}</td>
              <td><StatusBadge status={payment.status} />{payment.rejection_reason ? <div className="faint">{payment.rejection_reason}</div> : null}</td>
              <td><div className="btn-row">
                {(payment.pops ?? []).map((pop: { id: string; file_name: string }) => <a className="btn btn-sm" key={pop.id} href={`/api/pop/${pop.id}`} target="_blank" rel="noreferrer">View proof</a>)}
                {payment.status === "verified" ? <a className="btn btn-sm" href={`/api/receipts/${payment.id}`}>Receipt</a> : null}
                {["rejected", "requires_clarification"].includes(payment.status) ? <form action={resubmit}><input type="hidden" name="payment_id" value={payment.id} /><button className="btn btn-sm">Resubmit proof</button></form> : null}
              </div></td>
            </tr>)}{!payments?.length ? <tr><td colSpan={5}><div className="empty">No payments recorded.</div></td></tr> : null}</tbody>
          </table></div>
          <Pager page={page} total={count ?? 0} pageSize={PAGE_SIZE} basePath="/portal" params={sp} />
        </div>
        <div className="btn-row">
          <a className="btn btn-gold" href={`/api/statements/${id}`}>Download statement</a>
          <Link className="btn" href="/submit">Submit proof of payment</Link>
          <form action={logoutPortal}><button className="btn">Sign out</button></form>
        </div>
        <p className="faint" style={{ marginTop: 16 }}>Payments under review do not reduce your outstanding balance until finance verifies them.</p>
      </main>
    </div>
  );
}
