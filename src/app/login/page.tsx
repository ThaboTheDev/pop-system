import { Suspense } from "react";
import { LoginForm } from "./LoginForm";
import { Crest } from "@/components/Brand";

export const metadata = { title: "Sign in | Payments and PoP" };

export default function LoginPage() {
  return (
    <div className="auth">
      {/* The institute's own pages set copy on a navy panel beside the form;
          the same split is used here so signing in feels like part of MSRI
          rather than a generic admin login. */}
      <aside className="auth-aside">
        <div>
          <Crest className="brand-logo" size={64} />
          <p className="eyebrow" style={{ marginTop: 24 }}>MSR Learning Institute</p>
          <h2>Payments and proof of payment</h2>
          <p>
            Verify what participants have paid, keep every proof of payment
            against its record, and see the position across every programme.
          </p>
        </div>
        <div className="aside-foot">Mzuvukile Slabbert Radebe Institute · Est. 2015</div>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <p className="eyebrow">Administration</p>
          <h1>Sign in</h1>
          <p className="muted" style={{ fontSize: "0.875rem" }}>
            Finance, registry staff and runners.
          </p>
          <div className="card" style={{ marginTop: 18 }}>
            <Suspense fallback={<p className="muted">Loading the sign in form.</p>}>
              <LoginForm />
            </Suspense>
          </div>
          <p className="faint" style={{ marginTop: 14 }}>
            Participants: <a href="/portal/login">sign in by email link</a> or <a href="/register">apply for a programme</a>.
          </p>
        </div>
      </main>
    </div>
  );
}
