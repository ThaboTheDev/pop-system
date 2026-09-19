import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { MFASettings } from "@/components/MFASettings";
import { processNow, requeue } from "./actions";
export const dynamic = "force-dynamic";
export default async function Settings() {
 const user = await requireUser(); const sb = await supabaseServer();
 const states = await Promise.all(["queued", "processing", "failed", "skipped", "sent"].map(async state => {
  const { count } = await sb.from("notifications").select("id", { count: "exact", head: true }).eq("state", state); return { state, count };
 }));
 const { data: last } = await sb.from("notifications").select("sent_at").eq("state", "sent").order("sent_at", { ascending: false }).limit(1).maybeSingle();
 return <><h1>Settings</h1><div className="grid grid-2"><div className="card"><h2>{user.full_name}</h2><p>{user.email} — {user.role}</p><p><a href="/submit">Public submission</a> · <a href="/portal">Participant portal</a></p></div>
 <div className="card"><h2>Notification delivery</h2><p>Resend: {process.env.RESEND_API_KEY && process.env.RESEND_FROM ? "Configured" : "Not configured"}</p><p>Email delivery only.</p>
 {states.map(s => <p key={s.state}>{s.state}: {s.count ?? 0}</p>)}<p>Last sent: {last?.sent_at ?? "Never"}</p>
 {user.role === "super_admin" && <><form action={processNow}><button className="btn">Process now (up to 25)</button></form><form action={requeue}><p>Requeue retries failed/skipped emails only. Review provider errors first.</p><button className="btn">Requeue failed and skipped emails</button></form></>}
 <p>Processing rows after a worker crash require investigation before manual retry.</p></div><MFASettings/>
 <div className="card"><h2>Document storage</h2><p>Private bucket: {process.env.POP_BUCKET ?? "proof-of-payment"}</p><p>PDF, JPG and PNG, 10 MB per document.</p></div></div></>;
}
