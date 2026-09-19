"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const requestedNext = useSearchParams().get("next") ?? "/dashboard";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") && !requestedNext.includes("\\") ? requestedNext : "/dashboard";
  const [factor, setFactor] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const sb = supabaseBrowser();
    if (factor) {
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: factor, code });
      if (error) { setError(error.message); setBusy(false); return; }
      router.push(next); router.refresh(); return;
    }
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      // Deliberately does not say which of the two was wrong.
      setError("That email and password combination was not recognised.");
      setBusy(false);
      return;
    }
    const { data: assurance, error: assuranceError } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError) { setError(assuranceError.message); setBusy(false); return; }
    if (assurance?.nextLevel === "aal2" && assurance.currentLevel !== "aal2") {
      const { data } = await sb.auth.mfa.listFactors();
      if (data?.totp[0]) setFactor(data.totp[0].id);
      else setError("No usable authenticator was found.");
      setBusy(false); return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <div>
      {error ? <div className="notice notice-error">{error}</div> : null}
      <div className="field">
        <label htmlFor="email">Work email</label>
        <input id="email" type="email" autoComplete="username" value={email}
               onChange={(e) => setEmail(e.target.value)}
               onKeyDown={(e) => e.key === "Enter" && submit()} />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" type="password" autoComplete="current-password" value={password}
               onChange={(e) => setPassword(e.target.value)}
               onKeyDown={(e) => e.key === "Enter" && submit()} />
      </div>
      {factor ? (
        <div className="field">
          <label htmlFor="code">Authenticator code</label>
          <input id="code" value={code} onChange={(e) => setCode(e.target.value)}
                 inputMode="numeric" autoComplete="one-time-code" />
        </div>
      ) : null}
      <button className="btn btn-gold btn-lg" style={{ width: "100%" }} onClick={submit} disabled={busy}>
        {busy ? "Signing in" : "Sign in"}
      </button>
      <p className="faint" style={{ marginTop: 12, marginBottom: 0 }}>
        <a href="/login/forgot">Forgot password?</a>
      </p>
    </div>
  );
}
