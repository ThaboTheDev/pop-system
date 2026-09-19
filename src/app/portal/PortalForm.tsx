"use client";
import Link from "next/link";
import { useActionState } from "react";
import { requestOTP } from "./actions";

export function PortalForm() {
  const [state, action, pending] = useActionState(requestOTP, {});
  return (
    <form action={action} className="card">
      {state.error ? <div className="notice notice-error" role="alert">{state.error}</div> : null}
      {state.message ? <div className="notice notice-ok">{state.message}</div> : null}

      <div className="field">
        <label htmlFor="ref">Participant ID</label>
        <input id="ref" name="ref" required placeholder="MSRI-001284" autoCapitalize="characters" />
      </div>
      <div className="field">
        <label htmlFor="email">Email on your registration</label>
        <input id="email" name="email" type="email" required autoComplete="email" />
      </div>

      <button className="btn btn-gold btn-lg" style={{ width: "100%" }} disabled={pending}>
        {pending ? "Sending" : "Email me a code"}
      </button>

      {state.devCode ? (
        <p className="faint" style={{ marginTop: 12, marginBottom: 0 }}>
          Development code: {state.devCode}
        </p>
      ) : null}
      {state.id ? (
        <p style={{ marginTop: 12, marginBottom: 0 }}>
          <Link href={`/portal/verify?id=${state.id}`}>Enter the verification code</Link>
        </p>
      ) : null}
      <p className="faint" style={{ marginTop: 12, marginBottom: 0 }}>
        Submitting a proof of payment? <Link href="/submit">Use the submission form</Link>.
      </p>
    </form>
  );
}
