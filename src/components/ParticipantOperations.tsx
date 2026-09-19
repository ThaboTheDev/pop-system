import { supabaseServer } from "@/lib/supabase/server";
import type { AppUser } from "@/lib/types";
import { canEditParticipants } from "@/lib/auth";
import { generatePlan, markPlanPaid, clearUnpaid, remindParticipant } from "@/app/(admin)/participants/[id]/plan-actions";
export async function ParticipantOperations({ id, user, outstanding }: { id: string; user: AppUser; outstanding: number }) {
 const sb = await supabaseServer();
 const [{ data: plans }, { data: adjustments }] = await Promise.all([
  sb.from("payment_plans").select("*").eq("participant_id", id).order("instalment_no"),
  sb.from("account_adjustments").select("*").eq("participant_id", id).order("created_at", { ascending: false }),
 ]);
 const manage = canEditParticipants(user);
 return <section className="card"><h2>Account operations</h2>{outstanding < 0 && <p className="notice notice-ok">Credit balance: R {(-outstanding).toFixed(2)}</p>}
 <p><a href={`/api/statements/${id}`}>Download statement</a></p>
 <h3>Adjustments</h3>{(adjustments ?? []).map(r => <p key={r.id}>R {r.amount} — {r.reason} ({r.status})</p>)}
 <h3>Payment plan</h3>{(plans ?? []).map(r => <div key={r.id}><p>#{r.instalment_no}: R {r.amount} due {r.due_date} — {r.paid_at ? "Paid" : "Unpaid"}</p>{manage && !r.paid_at && <form action={markPlanPaid}><input type="hidden" name="id" value={r.id} /><input name="payment_id" placeholder="Optional verified payment UUID" /><button className="btn">Mark paid</button></form>}</div>)}
 {manage && !plans?.length && outstanding > 0 && <form action={generatePlan}><input type="hidden" name="participant_id" value={id}/><label>Monthly instalments<input type="number" name="count" min="1" max="120" required/></label><label>First due date<input type="date" name="start" required/></label><button className="btn">Generate plan</button></form>}
 {manage && outstanding > 0 && <form action={remindParticipant}><input type="hidden" name="participant_id" value={id}/><button className="btn">Send reminder</button></form>}
 {user.role === "super_admin" && <form action={clearUnpaid}><input type="hidden" name="participant_id" value={id}/><button className="btn">Clear unpaid instalments</button></form>}</section>;
}
