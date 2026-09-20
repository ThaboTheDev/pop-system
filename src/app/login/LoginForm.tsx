"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

/** Sign-in is work email and password only. There is no second factor: the
 *  TOTP challenge was removed together with the aal2 gate in currentUser() —
 *  removing only the form would have locked administrators out of the admin
 *  area while the screen looked like it wanted a password alone. The
 *  trade-off and the compensating controls are recorded in README §7. */
export function LoginForm() {
  const router = useRouter();
  const requestedNext = useSearchParams().get("next") ?? "/dashboard";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") && !requestedNext.includes("\\") ? requestedNext : "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const sb = supabaseBrowser();
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      // Deliberately does not say which of the two was wrong.
      setError("That email and password combination was not recognised.");
      setBusy(false);
      return;
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
      <button className="btn btn-gold btn-lg" style={{ width: "100%" }} onClick={submit} disabled={busy}>
        {busy ? "Signing in" : "Sign in"}
      </button>
      <p className="faint" style={{ marginTop: 12, marginBottom: 0 }}>
        <a href="/login/forgot">Forgot password?</a>
      </p>
    </div>
  );
}
