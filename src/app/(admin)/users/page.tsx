import { requireRole } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { formatDateTime, humanise } from "@/lib/format";

export const revalidate = 60;
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  await requireRole("super_admin");
  const sb = await supabaseServer();
  const { data } = await sb.from("app_users").select("*").order("created_at");

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Administrators</h1>
          <p>Accounts are created with the bootstrap script, which also sets the first password. Roles are changed here.</p>
        </div>
      </div>

      <div className="card card-flush" style={{ marginBottom: 14 }}>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th><th>Can verify</th><th>Active</th><th>Added</th></tr>
            </thead>
            <tbody>
              {(data ?? []).map((u) => (
                <tr key={u.id}>
                  <td>{u.full_name}</td>
                  <td>{u.email}</td>
                  <td>{humanise(u.role)}</td>
                  <td>{u.role === "course_admin" ? (u.can_verify ? "Yes" : "No") : "Yes"}</td>
                  <td>{u.is_active ? "Active" : "Suspended"}</td>
                  <td className="faint nowrap">{formatDateTime(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>What each role can do</h2>
        <dl className="facts">
          <div><dt>Super admin</dt><dd>Everything, including roles and programme setup</dd></div>
          <div><dt>Finance admin</dt><dd>Verify, reject, edit participants, export</dd></div>
          <div><dt>Course admin</dt><dd>Read their own programmes; verifies only if granted</dd></div>
          <div><dt>Viewer</dt><dd>Read only, no export</dd></div>
        </dl>
      </div>
    </>
  );
}
