"use client";

import { useActionState } from "react";
import { requestPortalLink } from "../actions";

export function PortalLoginForm() {
  const [state, action, pending] = useActionState(requestPortalLink, {});
  return (
    <form action={action} className="card">
      {state.error ? <div className="notice notice-error" role="alert">{state.error}</div> : null}
      {state.message ? <div className="notice notice-ok" role="status">{state.message}</div> : null}
      <div className="field">
        <label htmlFor="email">Email held by the institute</label>
        <input id="email" name="email" type="email" required maxLength={254} autoComplete="email" />
      </div>
      <button className="btn btn-gold btn-lg" style={{ width: "100%" }} disabled={pending}>
        {pending ? "Requesting link…" : "Email me a sign-in link"}
      </button>
      <p className="faint" style={{ marginTop: 14 }}>No password or Participant ID needed. Open the link in the same browser where you requested it. Never share a sign-in link.</p>
    </form>
  );
}
