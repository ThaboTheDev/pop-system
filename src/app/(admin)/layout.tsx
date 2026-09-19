import Link from "next/link";
import { Suspense } from "react";
import { requireUser, canManageUsers } from "@/lib/auth";
import { GlobalSearch } from "@/components/GlobalSearch";
import { SignOut } from "@/components/SignOut";
import { humanise } from "@/lib/format";
import { NavLink } from "@/components/NavLink";
import { QueueCount } from "@/components/QueueCount";

// Sidebar queue count can be a few seconds stale without anyone noticing;
// 15 s cuts a DB round-trip on every navigation while staying responsive.
export const revalidate = 15;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Auth is the only thing the shell waits for: it decides the redirect, the
  // role-gated links and the footer, and React cache() shares its round-trip
  // with the page. The verification queue count streams in via Suspense so a
  // slow count query never holds the sidebar hostage on a tab switch.
  const user = await requireUser();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="mark">
          <strong>Payments and PoP</strong>
          <span>MSR Learning Institute</span>
        </div>
        <nav>
          <NavLink href="/dashboard">Dashboard</NavLink>
          <NavLink href="/participants">Participants</NavLink>
          <NavLink href="/payments">Payments</NavLink>
          <NavLink
            href="/verification"
            count={
              <Suspense fallback={null}>
                <QueueCount />
              </Suspense>
            }
          >
            Verification
          </NavLink>
          <NavLink href="/programmes">Programmes</NavLink>
          <NavLink href="/reports">Reports</NavLink>
          <NavLink href="/import">Bulk import</NavLink>
          {canManageUsers(user) ? <NavLink href="/users">Users</NavLink> : null}
          <NavLink href="/audit">Audit log</NavLink>
          <NavLink href="/settings">Settings</NavLink>
        </nav>
        <div className="foot">
          {user.full_name}
          <br />
          {humanise(user.role)}
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <GlobalSearch />
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <Link className="btn btn-sm" href="/submit" target="_blank">Participant form</Link>
            <SignOut />
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
