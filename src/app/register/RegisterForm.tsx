"use client";

import { useState, useTransition } from "react";
import { registerParticipant, type RegisterResult } from "./actions";
import { formatMoney } from "@/lib/format";

export function RegisterForm({
  programmes,
}: {
  programmes: { id: string; name: string; amount_due: number }[];
}) {
  const [result, setResult] = useState<RegisterResult | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    start(async () => {
      const r = await registerParticipant(fd);
      setResult(r);
      if (r.ok) { form.reset(); window.scrollTo({ top: 0 }); }
    });
  }

  if (result?.ok) {
    return (
      <div className="card">
        <div className="notice notice-ok" style={{ marginBottom: 14 }}>
          <strong>Received.</strong> Your registration is waiting for review by
          the finance office.
        </div>
        <p className="faint" style={{ marginBottom: 0 }}>
          The decision is sent to the email address you gave. Nothing is due
          until the registration is approved — the approval email carries your
          participant ID, and you will need it to submit proof of payment.
        </p>
      </div>
    );
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      {result?.error ? <div className="notice notice-error">{result.error}</div> : null}

      <div className="field-row">
        <div className="field">
          <label htmlFor="first_name">First name</label>
          <input id="first_name" name="first_name" type="text" required
                 autoComplete="given-name" />
        </div>
        <div className="field">
          <label htmlFor="surname">Surname</label>
          <input id="surname" name="surname" type="text" required
                 autoComplete="family-name" />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required
                 autoComplete="email" />
          <p className="faint" style={{ marginTop: 4, marginBottom: 0 }}>
            The approval decision is sent here.
          </p>
        </div>
        <div className="field">
          <label htmlFor="mobile">Mobile (optional)</label>
          <input id="mobile" name="mobile" type="tel" autoComplete="tel" />
        </div>
      </div>

      <div className="field">
        <label htmlFor="programme_id">Programme</label>
        <select id="programme_id" name="programme_id" required defaultValue="">
          <option value="" disabled>Choose a programme</option>
          {programmes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {formatMoney(p.amount_due)}
            </option>
          ))}
        </select>
      </div>

      <div className="consent">
        <input id="consent" name="consent" type="checkbox" required />
        <label htmlFor="consent">
          I consent to the institute storing these details to process my
          registration and, if approved, my payments.
        </label>
      </div>

      <button className="btn btn-gold btn-lg" style={{ width: "100%" }} disabled={pending}>
        {pending ? "Sending your registration" : "Send registration"}
      </button>
    </form>
  );
}
