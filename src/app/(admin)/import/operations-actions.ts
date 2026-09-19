"use server";
import { requireRole } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { parseCSV, validDate, money } from "@/lib/csv";
import { revalidatePath } from "next/cache";
export type OperationsImportResult = { messages: string[]; checked?: boolean };
export async function operationsImport(_state: OperationsImportResult, form: FormData): Promise<OperationsImportResult> {
 const actor=await requireRole("super_admin","finance_admin"); const sb=await supabaseServer(); const file=form.get('file');
 if(!(file instanceof File)||file.size>2*1024*1024)return {messages:['Choose a CSV up to 2 MB']};
 const mode=String(form.get('mode'));if(!['update','payments'].includes(mode))return {messages:['Invalid mode']};
 const commit=form.get('commit')==='yes'; const messages:string[]=[];
 try{
  const rows=parseCSV(await file.text());
  const [{data:programmes},{data:cohorts}]=await Promise.all([sb.from('programmes').select('id,code'),sb.from('cohorts').select('id,code,programme_id')]);
  // Revalidate all input at commit; no browser-supplied "validated" row is trusted.
  const prepared: {id:string;ref:string;patch:Record<string,unknown>;payment?:{amount:number;date:string;reference:string;method:string;bank:string}}[]=[];
  const seen=new Set<string>();
  for(let i=0;i<rows.length;i++){
   const r=rows[i];let query=sb.from('participants').select('id,participant_ref,programme_id,email');
   if(r.participant_id)query=query.eq('participant_ref',r.participant_id.toUpperCase());
   else if(r.email)query=query.eq('email',r.email);else throw new Error(`Row ${i+2}: participant_id or email required`);
   const {data:p,error}=await query.single();if(error||!p)throw new Error(`Row ${i+2}: participant match missing or ambiguous`);
   if(mode==='update'&&seen.has(p.id))throw new Error(`Row ${i+2}: repeated participant`);seen.add(p.id);
   const patch:Record<string,unknown>={};
   if(mode==='update'){
    for(const key of ['first_name','surname','email','mobile','notes'])if(r[key])patch[key]=r[key];
    if(r.registration_date){if(!validDate(r.registration_date))throw new Error(`Row ${i+2}: invalid registration date`);patch.registration_date=r.registration_date;}
    if(r.amount_due){const due=money(r.amount_due,false);if(due<0)throw new Error('Amount due cannot be negative');patch.amount_due=due;}
    let programmeId=p.programme_id;
    if(r.programme_code){const prog=programmes?.find(x=>x.code.toUpperCase()===r.programme_code.toUpperCase());if(!prog)throw new Error(`Row ${i+2}: unknown programme`);programmeId=prog.id;patch.programme_id=programmeId;if(programmeId!==p.programme_id)patch.cohort_id=null;}
    if(r.cohort_code){const cohort=cohorts?.find(x=>x.programme_id===programmeId&&x.code.toUpperCase()===r.cohort_code.toUpperCase());if(!cohort)throw new Error(`Row ${i+2}: cohort not in programme`);patch.cohort_id=cohort.id;}
    prepared.push({id:p.id,ref:p.participant_ref,patch});
   }else{
    if(!validDate(r.payment_date??'')||r.payment_date>new Date().toISOString().slice(0,10))throw new Error(`Row ${i+2}: invalid payment date`);
    const method=r.method||'eft';if(!['eft','cash_deposit','card','mobile_money','payroll_deduction','other'].includes(method))throw new Error(`Row ${i+2}: invalid method`);
    prepared.push({id:p.id,ref:p.participant_ref,patch,payment:{amount:money(r.amount??''),date:r.payment_date,reference:r.reference||'',method,bank:r.bank||''}});
   }
  }
  if(!commit)return {messages:[`${prepared.length} rows checked. Click Import to apply. Blank update cells retain existing values, except a programme change clears an incompatible cohort.`],checked:true};
  let done=0;
  for(const r of prepared){
   if(r.payment){const p=r.payment;const {error}=await supabaseAdmin().rpc('submit_payment',{p_participant_ref:r.ref,p_amount:p.amount,p_payment_date:p.date,p_reference:p.reference,p_method:p.method,p_bank:p.bank,p_storage_path:null,p_file_name:null,p_mime_type:null,p_file_size:null,p_file_hash:null,p_channel:'batch_import'});if(error)throw new Error(`${done} rows committed before failure: ${error.message}`);}
   else if(Object.keys(r.patch).length){const {error}=await sb.from('participants').update(r.patch).eq('id',r.id);if(error)throw new Error(`${done} rows committed before failure: ${error.message}`);}
   done++;
  }
  await sb.from('audit_logs').insert({actor_id:actor.id,action:`import.${mode}`,entity_type:'import',summary:`Imported ${done} rows`});
  revalidatePath('/participants','layout');revalidatePath('/verification');messages.push(`${done} rows imported. Do not re-import a payment batch: it would create new submissions (flagged for duplicate review).`);
 }catch(e){messages.push(e instanceof Error?e.message:'Import failed');}
 return {messages};
}
