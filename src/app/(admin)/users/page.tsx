import { requireRole } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { inviteUser, editUser, resetUserPassword } from "./actions";
export const dynamic = "force-dynamic";
const roles = ["super_admin", "finance_admin", "course_admin", "viewer"];
export default async function Users() {
 await requireRole("super_admin"); const sb = await supabaseServer();
 const [{ data: users }, { data: programmes }] = await Promise.all([sb.from("app_users").select("*").order("created_at"), sb.from("programmes").select("id,name")]);
 return <><h1>Administrators</h1><p>Invite administrators, change roles and programme scope, or send one-time password reset emails here. Empty programme scope means unrestricted access.</p>
 <form action={inviteUser} className="card"><h2>Invite administrator</h2><label>Name<input name="name" required/></label><label>Email<input type="email" name="email" required/></label><label>Role<select name="role" defaultValue="viewer">{roles.map(r => <option key={r}>{r}</option>)}</select></label><button className="btn">Send invitation</button></form>
 {(users ?? []).map(u => <div className="card" key={u.id}><h2>{u.full_name}</h2><p>{u.email}</p><form action={editUser}><input type="hidden" name="id" value={u.id}/><label>Role<select name="role" defaultValue={u.role}>{roles.map(r => <option key={r}>{r}</option>)}</select></label><label><input type="checkbox" name="active" defaultChecked={u.is_active}/>Active</label><label><input type="checkbox" name="verify" defaultChecked={u.can_verify}/>Course admin can verify</label><fieldset><legend>Programme scope</legend>{(programmes ?? []).map(p => <label key={p.id}><input type="checkbox" name="programmes" value={p.id} defaultChecked={u.programme_ids.includes(p.id)}/>{p.name}</label>)}</fieldset><button className="btn">Save user</button></form><form action={resetUserPassword}><input type="hidden" name="id" value={u.id}/><button className="btn">Send password reset</button></form></div>)}</>;
}
