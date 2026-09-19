import { requireRole } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { formatDateTime, humanise } from "@/lib/format";
import { PageHead } from "@/components/PageHead";
import { inviteUser, editUser, resetUserPassword } from "./actions";

export const dynamic = "force-dynamic";

const ROLES = ["super_admin", "finance_admin", "course_admin", "viewer"] as const;

/** Administrators: who may sign in, what they may do, and which programmes they
 *  are scoped to. Only a super administrator can reach this page. */
export default async function UsersPage() {
  await requireRole("super_admin");
  const sb = await supabaseServer();

  const [{ data: users }, { data: programmes }] = await Promise.all([
    sb.from("app_users").select("*").order("created_at"),
    sb.from("programmes").select("id, name").order("name"),
  ]);

  return (
    <>
      <PageHead
        eyebrow="Administration"
        title="Administrators"
        sub="Invite administrators, change roles and programme scope, or send a one-time password reset. An empty programme scope means unrestricted access."
      />

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Invite an administrator</h2>
        <form action={inviteUser}>
          <div className="grid grid-3">
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="invite_name">Full name</label>
              <input id="invite_name" name="name" type="text" required autoComplete="off" />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="invite_email">Work email</label>
              <input id="invite_email" name="email" type="email" required autoComplete="off" />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="invite_role">Role</label>
              <select id="invite_role" name="role" defaultValue="viewer">
                {ROLES.map((r) => <option key={r} value={r}>{humanise(r)}</option>)}
              </select>
            </div>
          </div>
          <div className="btn-row" style={{ marginTop: 16 }}>
            <button className="btn btn-gold">Send invitation</button>
          </div>
          <p className="faint" style={{ marginTop: 10, marginBottom: 0 }}>
            The invitation email carries a link to set a first password.
          </p>
        </form>
      </div>

      <div className="grid grid-2">
        {(users ?? []).map((u) => {
          const scoped = (u.programme_ids ?? []) as string[];
          return (
            <div className="card" key={u.id}>
              <h2>{u.full_name}</h2>
              <p className="faint" style={{ marginTop: -6 }}>
                {u.email} · added {formatDateTime(u.created_at)}
              </p>

              <div className="btn-row" style={{ marginBottom: 14 }}>
                <span className="badge badge-note">{humanise(u.role)}</span>
                <span className={`badge ${u.is_active ? "badge-ok" : "badge-stop"}`}>
                  {u.is_active ? "Active" : "Suspended"}
                </span>
                {u.can_verify ? <span className="badge badge-idle">Can verify</span> : null}
                <span className="badge badge-idle">
                  {scoped.length ? `${scoped.length} programmes` : "Unrestricted"}
                </span>
              </div>

              <form action={editUser}>
                <input type="hidden" name="id" value={u.id} />

                <div className="field">
                  <label htmlFor={`role_${u.id}`}>Role</label>
                  <select id={`role_${u.id}`} name="role" defaultValue={u.role}>
                    {ROLES.map((r) => <option key={r} value={r}>{humanise(r)}</option>)}
                  </select>
                </div>

                <div className="consent">
                  <input id={`active_${u.id}`} type="checkbox" name="active"
                         defaultChecked={u.is_active} />
                  <label htmlFor={`active_${u.id}`}>Account is active</label>
                </div>
                <div className="consent">
                  <input id={`verify_${u.id}`} type="checkbox" name="verify"
                         defaultChecked={u.can_verify} />
                  <label htmlFor={`verify_${u.id}`}>
                    A course administrator may verify payments
                  </label>
                </div>

                <fieldset>
                  <legend>Programme scope</legend>
                  <p className="faint" style={{ marginBottom: 8 }}>
                    Tick the programmes this administrator may see. Nothing ticked
                    means every programme.
                  </p>
                  {(programmes ?? []).map((p) => (
                    <div className="consent" key={p.id}>
                      <input id={`prog_${u.id}_${p.id}`} type="checkbox" name="programmes"
                             value={p.id} defaultChecked={scoped.includes(p.id)} />
                      <label htmlFor={`prog_${u.id}_${p.id}`}>{p.name}</label>
                    </div>
                  ))}
                </fieldset>

                <div className="btn-row">
                  <button className="btn btn-primary">Save user</button>
                </div>
              </form>

              <form action={resetUserPassword} style={{ marginTop: 10 }}>
                <input type="hidden" name="id" value={u.id} />
                <button className="btn btn-sm">Send password reset</button>
              </form>
            </div>
          );
        })}
      </div>
    </>
  );
}
