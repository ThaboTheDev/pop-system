import { requireRole } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { editParticipant, mergeParticipant, anonymizeParticipant } from "./actions";
export default async function Edit({ params }: { params: Promise<{ id: string }> }) {
 const user = await requireRole("super_admin", "finance_admin"); const { id } = await params; const sb = await supabaseServer();
 const [{ data: p }, { data: programmes }, { data: cohorts }] = await Promise.all([sb.from("participants").select("*").eq("id",id).single(), sb.from("programmes").select("id,name"), sb.from("cohorts").select("id,name,programme_id")]);
 if (!p) notFound();
 return <><h1>Edit {p.participant_ref}</h1><form action={editParticipant} className="card"><input type="hidden" name="id" value={id}/>
 {['first_name','surname','email','mobile','registration_date','amount_due','notes'].map(k => <label key={k}>{k.replaceAll('_',' ')}<input name={k} defaultValue={String(p[k] ?? '')} type={k==='registration_date'?'date':k==='email'?'email':'text'}/></label>)}
 <label>Programme<select name="programme_id" defaultValue={p.programme_id}>{(programmes ?? []).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
 <label>Cohort (must belong to selected programme)<select name="cohort_id" defaultValue={p.cohort_id ?? ''}><option value="">None</option>{(cohorts ?? []).map(r => <option key={r.id} value={r.id}>{r.name} — {programmes?.find(x => x.id===r.programme_id)?.name}</option>)}</select></label>
 <label>Status override<select name="status_override" defaultValue={p.status_override ?? ''}><option value="">Automatic</option>{['not_paid','partially_paid','fully_paid','verification_pending','payment_issue','refund_adjustment'].map(s => <option key={s}>{s}</option>)}</select></label><button className="btn">Save participant</button></form>
 <form action={mergeParticipant} className="card"><h2>Merge this record into another participant</h2><p>Transfers payments, adjustments and plans. The target registration and amount due are retained. This source record is deleted.</p><input type="hidden" name="id" value={id}/><label>Target participant reference<input name="target_ref" required/></label><button className="btn">Merge into target</button></form>
 {user.role==='super_admin' && <form action={anonymizeParticipant} className="card"><h2>Anonymize participant</h2><p>Irreversible: deletes document bytes and redacts contact information. Accounting and audit history remain under the retention policy.</p><input type="hidden" name="id" value={id}/><label>Type {p.participant_ref} to confirm<input name="confirm" required/></label><button className="btn">Anonymize</button></form>}</>;
}
