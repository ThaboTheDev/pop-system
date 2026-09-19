"use client";
import Link from "next/link";
import { useActionState } from "react";
import { requestOTP } from "./actions";
export function PortalForm() {
  const [state, action, pending] = useActionState(requestOTP, {});
  return <form action={action} className="card"><label>Participant ID<input name="ref" required /></label><label>Email<input name="email" type="email" required /></label>
    <button className="btn btn-primary" disabled={pending}>Request code</button>
    {state.error && <p role="alert">{state.error}</p>}{state.message && <p>{state.message}</p>}
    {state.devCode && <p>Development code: {state.devCode}</p>}{state.id && <Link href={`/portal/verify?id=${state.id}`}>Enter verification code</Link>}</form>;
}
