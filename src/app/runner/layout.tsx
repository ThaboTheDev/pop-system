import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { Crest } from "@/components/Brand";
import { SignOut } from "@/components/SignOut";

export const dynamic = "force-dynamic";
export const metadata = { title: "Runner workspace | MSR Learning Institute", robots: { index: false, follow: false } };

export default async function RunnerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("runner");
  return (
    <div className="portal" style={{ paddingBottom: 40 }}>
      <header className="portal-head">
        <Crest className="brand-logo" size={48} />
        <div className="crest">MSR Learning Institute</div>
        <h1>Runner workspace</h1><p>{user.full_name} · Capture only, never verification</p>
      </header>
      <main className="portal-body" style={{ maxWidth: 850 }}>
        <nav aria-label="Runner navigation" className="btn-row" style={{ marginBottom: 20 }}>
          <Link className="btn" href="/runner">My applications</Link>
          <Link className="btn" href="/runner/register">Register someone</Link>
          <Link className="btn" href="/runner/capture">Record money received</Link>
          <SignOut />
        </nav>
        {children}
      </main>
    </div>
  );
}
