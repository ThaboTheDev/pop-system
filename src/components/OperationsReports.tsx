import { supabaseServer } from "@/lib/supabase/server";
import { requireUser, canEditParticipants, canExport } from "@/lib/auth";
import { reminderSweep } from "@/app/(admin)/participants/[id]/plan-actions";
export async function OperationsReports() {
 const user = await requireUser(); const sb = await supabaseServer();
 const sections = await Promise.all([['arrears','arrears_report'],['throughput','admin_throughput'],['duplicates','duplicate_report']].map(async ([name,rpc]) => {
  const { data, error } = await sb.rpc(rpc).limit(50); if (error) throw new Error(error.message); return { name, rows: (data ?? []) as Record<string, unknown>[] };
 }));
 return <>{sections.map(s => <section className="card" key={s.name}><h2>{s.name} (top 50)</h2>{canExport(user) && <a href={`/api/export?type=${s.name}`}>Download CSV</a>}
 {s.name === "arrears" && canEditParticipants(user) && <form action={reminderSweep}><button className="btn">Send reminders to top 50 overdue accounts</button></form>}
 <div className="table-wrap"><table className="data"><thead><tr>{Object.keys(s.rows[0] ?? {}).map(k => <th key={k}>{k.replaceAll("_", " ")}</th>)}</tr></thead><tbody>{s.rows.map((r,i) => <tr key={i}>{Object.entries(r).map(([k,v]) => <td key={k}>{String(v ?? "—")}</td>)}</tr>)}</tbody></table></div>{!s.rows.length && <p>No records</p>}</section>)}</>;
}
