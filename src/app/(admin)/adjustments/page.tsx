import { requireUser, canEditParticipants } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { requestAdjustment, decideAdjustment } from "./actions";
export const dynamic = "force-dynamic";
export default async function Adjustments() {
 const user = await requireUser(); const sb = await supabaseServer();
 const { data: rows } = await sb.from("account_adjustments").select("*,participants(participant_ref,full_name)").order("created_at", { ascending: false }).limit(100);
 return <><h1>Account adjustments</h1><p>Positive adjustments credit the account; negative adjustments reverse credit. Pending requests do not change income.</p>
 {canEditParticipants(user) && <form className="card" action={requestAdjustment}><label>Participant ID<input name="ref" required /></label><label>Signed amount<input type="number" step="0.01" name="amount" required /></label><label>Reason<input name="reason" required /></label><button className="btn btn-primary">Request adjustment</button></form>}
 {(rows ?? []).map(r => <div className="card" key={r.id}><h2>{r.participants?.participant_ref} — R {r.amount}</h2><p>{r.reason} — {r.status}</p>{r.status === "pending" && canEditParticipants(user) && <form action={decideAdjustment}><input type="hidden" name="id" value={r.id}/><button className="btn" name="status" value="approved">Approve</button> <button className="btn" name="status" value="rejected">Reject</button></form>}</div>)}</>;
}
