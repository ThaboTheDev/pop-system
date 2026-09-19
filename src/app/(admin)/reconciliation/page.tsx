import { requireUser, canEditParticipants } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { uploadStatement, updateLine } from "./actions";
export const dynamic = "force-dynamic";
export default async function Reconciliation({ searchParams }: { searchParams: Promise<{ batch?: string }> }) {
 const user = await requireUser(); const manage = canEditParticipants(user); const sb = await supabaseServer(); const { batch } = await searchParams;
 const { data: history } = await sb.from("bank_statement_lines").select("batch_id,created_at").eq("line_no", 1).order("created_at", { ascending: false }).limit(50);
 let query = sb.from("bank_statement_lines").select("*").order("created_at", { ascending: false }).order("line_no").limit(1000);
 if (batch) query = query.eq("batch_id", batch); const { data: lines } = await query;
 return <><h1>Bank reconciliation</h1><p>Matching does not verify payments or change income. Auto-match requires a unique normalized reference, exact amount, and date within three days.</p>
 {manage && <form action={uploadStatement} className="card"><label>Bank CSV (date, amount, description, reference)<input name="file" type="file" accept=".csv,text/csv" required/></label><p>Dates: YYYY-MM-DD. Maximum 1,000 lines.</p><button className="btn">Import and auto-match</button></form>}
 <details className="card"><summary>Batch history (latest 50)</summary>{(history ?? []).map(r => <p key={r.batch_id}><a href={`/reconciliation?batch=${r.batch_id}`}>{r.created_at} — {r.batch_id}</a></p>)}</details>
 {(lines ?? []).map(r => <div className="card" key={r.id}><p>#{r.line_no} {r.tx_date} R {r.amount} — {r.reference} {r.description}</p><p>{r.status} {r.matched_payment_id}</p>
 {manage && <form action={updateLine}><input type="hidden" name="id" value={r.id}/><input name="payment_id" placeholder="Payment UUID for manual match" defaultValue={r.matched_payment_id ?? ""}/><button className="btn" name="status" value="matched">Match</button> <button className="btn" name="status" value="unmatched">Unmatch / reopen</button> <button className="btn" name="status" value="ignored">Ignore</button></form>}</div>)}</>;
}
