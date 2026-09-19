import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in | Payments and PoP" };

export default function LoginPage() {
  return (
    <div className="login-wrap">
      <div className="login-card">
        <div style={{ marginBottom: 18 }}>
          <h1>Payments and proof of payment</h1>
          <p className="muted" style={{ fontSize: "0.875rem" }}>
            MSR Learning Institute administration
          </p>
        </div>
        <div className="card">
          <Suspense fallback={<p className="muted">Loading the sign in form.</p>}>
            <LoginForm />
          </Suspense>
        </div>
        <p className="faint" style={{ marginTop: 14 }}>
          Participants submitting a proof of payment do not sign in.
          Use the link the institute sent you.
        </p>
      </div>
    </div>
  );
}
