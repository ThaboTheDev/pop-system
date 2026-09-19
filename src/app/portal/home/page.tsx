import { redirect } from "next/navigation";
import { portalParticipant } from "@/lib/portal";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { mintResubmit } from "@/lib/resubmit";
import { logoutPortal } from "../actions";
async function resubmit(form: FormData) {
  "use server";
  const id = await portalParticipant(); if (!id) redirect("/portal");
  const url = await mintResubmit(String(form.get("payment_id")), id);
  redirect(new URL(url).pathname);
}
export default async function PortalHome() {
  const id = await portalParticipant(); if (!id) redirect("/portal");
  const sb = supabaseAdmin();
  const { data: p } = await sb.from("participants").select("*").eq("id", id).single();
  if (!p) redirect("/portal");
  const [{ data: payments }, { data: plan }] = await Promise.all([
    sb.from("payments").select("*").eq("participant_id", id).order("payment_date", { ascending: false }).limit(40),
    sb.from("payment_plans").select("*").eq("participant_id", id).order("instalment_no"),
  ]);
  return <main className="content"><h1>{p.full_name}</h1><p>{p.participant_ref}</p><div className="grid grid-4">
    {[["Amount due", p.amount_due], ["Paid", p.amount_paid], ["Outstanding", Math.max(0, p.outstanding)], ["Credit", Math.max(0, -p.outstanding)]].map(([label, value]) => <div className="stat" key={label}><h3>{label}</h3>R {Number(value).toFixed(2)}</div>)}
    </div><p><a href={`/api/statements/${id}`}>Download statement</a></p><h2>Payment plan</h2>
    <ul>{(plan ?? []).map((r: { id: string; amount: number; due_date: string; paid_at: string | null }) => <li key={r.id}>{r.due_date}: R {Number(r.amount).toFixed(2)} — {r.paid_at ? "Paid" : "Unpaid"}</li>)}</ul>
    <h2>Payments (latest 40)</h2>{(payments ?? []).map((r: { id: string; payment_ref: string; amount: number; status: string; rejection_reason: string | null }) => <div className="card" key={r.id}><strong>{r.payment_ref}</strong> R {Number(r.amount).toFixed(2)} — {r.status}<p>{r.rejection_reason}</p>
      {r.status === "verified" && <a href={`/api/receipts/${r.id}`}>Receipt</a>}{["rejected", "requires_clarification"].includes(r.status) && <form action={resubmit}><input type="hidden" name="payment_id" value={r.id} /><button className="btn">Resubmit proof</button></form>}</div>)}
    <form action={logoutPortal}><button className="btn">Sign out</button></form></main>;
}
