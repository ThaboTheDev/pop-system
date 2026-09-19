"use server";
import { requireRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateUpload, sniffMime, sha256 } from "@/lib/upload";
import { validDate, money } from "@/lib/csv";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
export async function capturePayment(form: FormData) {
 const actor = await requireRole("super_admin", "finance_admin");
 const date=String(form.get("date")); if (!validDate(date) || date>new Date().toISOString().slice(0,10)) throw new Error("Invalid payment date");
 const amount=money(String(form.get("amount"))); const sb=supabaseAdmin();
 const files=form.getAll("proof").filter((f):f is File=>f instanceof File && f.size>0); if(files.length>3) throw new Error("Maximum three documents");
 const documents=await Promise.all(files.map(async f=>{const bytes=new Uint8Array(await f.arrayBuffer());const invalid=validateUpload(f,bytes);if(invalid)throw new Error(invalid);return { bytes,path:`staff/${crypto.randomUUID()}`,name:'Staff payment proof',mime:sniffMime(bytes)!,size:f.size,hash:sha256(bytes)};}));
 const bucket=sb.storage.from(process.env.POP_BUCKET ?? 'proof-of-payment'); const stored:string[]=[];
 let result: { payment_id:string; payment_ref:string; participant_id:string };
 try {
  for(const d of documents){const {error}=await bucket.upload(d.path,d.bytes,{contentType:d.mime});if(error)throw new Error(error.message);stored.push(d.path);}
  const {data,error}=await sb.rpc('capture_payment_documents',{p_ref:String(form.get('participant_ref')),p_amount:amount,p_date:date,p_reference:String(form.get('reference')??''),p_method:String(form.get('method')),p_bank:String(form.get('bank')??''),p_documents:documents.map(({bytes:_bytes,...d})=>d),p_actor:actor.id});
  if(error)throw new Error(error.message);result=data;
 }catch(e){if(stored.length)await bucket.remove(stored);throw e;}
 revalidatePath('/participants','layout'); revalidatePath('/verification');redirect(`/verification/${result.payment_id}`);
}
