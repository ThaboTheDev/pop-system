"use client";
import { useActionState, useState } from "react";
import { operationsImport } from "./operations-actions";
export function OperationsImport() {
 const [state,action,pending]=useActionState(operationsImport,{messages:[]}); const [changed,setChanged]=useState(false);
 return <details className="card"><summary>Update existing participants / import payment batches</summary><p>CSV up to 1,000 rows. Match by participant_id (MSRI reference), or email when no ID is supplied. Ambiguous email matches are rejected.</p><p>Updates: first_name, surname, email, mobile, programme_code, cohort_code, registration_date, amount_due, notes. Blank cells keep values. Payment batches: participant_id/email, amount, payment_date (YYYY-MM-DD), reference, method, bank.</p><form action={action} onChange={()=>setChanged(true)}><label>Mode<select name="mode"><option value="update">Update existing</option><option value="payments">Payment batch (pending review)</option></select></label><input name="file" type="file" accept=".csv,text/csv" required/><button className="btn" disabled={pending} name="commit" value="no" onClick={()=>setChanged(false)}>Check file</button><button className="btn" disabled={pending||!state.checked||changed} name="commit" value="yes">Import checked file</button></form><ul aria-live="polite">{state.messages.map((m,i)=><li key={i}>{m}</li>)}</ul></details>;
}
