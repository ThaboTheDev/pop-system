"use client";
import { useActionState } from "react";
import { bulkVerify } from "@/app/(admin)/verification/actions";
export function BulkVerification({ payments }: { payments: { id: string; reference: string }[] }) {
 const [state, action, pending] = useActionState(bulkVerify, { results: [] });
 return <details className="card"><summary>Bulk verification (review each proof first)</summary><form action={action}>{payments.map(p => <label key={p.id} style={{ display: "inline-block", margin: 8 }}><input type="checkbox" name="payment_id" value={p.id}/>{p.reference}</label>)}<button className="btn" disabled={pending}>Verify selected</button></form><ul aria-live="polite">{state.results.map((r,i) => <li key={i}>{r}</li>)}</ul></details>;
}
