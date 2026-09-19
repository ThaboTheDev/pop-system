import { requireRole } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { capturePayment } from "./actions";
import { PAYMENT_METHODS } from "@/lib/types";
export default async function Capture({ params }: { params: Promise<{ id: string }> }) {
 await requireRole("super_admin", "finance_admin"); const { id } = await params;
 const { data: p } = await (await supabaseServer()).from("participants").select("participant_ref,full_name").eq("id",id).single(); if (!p) notFound();
 return <><h1>Record payment — {p.full_name}</h1><p>Staff-captured payments enter the verification queue; they are not income until verified.</p><form action={capturePayment} className="card"><input type="hidden" name="participant_ref" value={p.participant_ref}/><label>Amount<input type="number" name="amount" min="0.01" step="0.01" required/></label><label>Date<input type="date" name="date" required/></label><label>Reference<input name="reference"/></label><label>Method<select name="method">{PAYMENT_METHODS.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}</select></label><label>Bank<input name="bank"/></label><label>Optional proof (up to 3 files)<input type="file" name="proof" multiple accept="application/pdf,image/jpeg,image/png"/></label><button className="btn">Record payment</button></form></>;
}
