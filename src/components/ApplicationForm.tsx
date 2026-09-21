"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { PRIVACY_NOTICE_VERSION, type RegistrationProgramme } from "@/lib/types";
import type { ApplicationResult } from "@/lib/applications";
import { PrivacyNotice } from "./PrivacyNotice";

type Props = {
  programmes: RegistrationProgramme[];
  submit: (form: FormData) => Promise<ApplicationResult>;
  inPerson?: boolean;
};

export function ApplicationForm({ programmes, submit, inPerson = false }: Props) {
  const [result, setResult] = useState<ApplicationResult | null>(null);
  const [pending, start] = useTransition();
  if (result?.ok) {
    return (
      <div className="card" role="status">
        <h2>{result.alreadyApplied ? "Already applied" : "Application received"}</h2>
        <p>{result.alreadyApplied
          ? "An application or participant record already exists for this email address. Please contact the registry if you need help; a duplicate has not been created."
          : "Staff will review the application. A Participant ID is created only if it is approved. The decision will be sent by email, along with a Participant ID if approved."}</p>
        <p className="faint">An application is not an enrolment. No fee is added to the participant register before approval.</p>
        {inPerson
          ? <button className="btn btn-primary" onClick={() => setResult(null)}>Register another person</button>
          : <Link className="btn" href="/portal/login">Already enrolled? Open the participant portal</Link>}
      </div>
    );
  }
  return (
    <form className="card" onSubmit={event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      start(async () => {
        try { setResult(await submit(form)); }
        catch { setResult({ error: "We could not submit the application. Please try again." }); }
      });
    }}>
      {result?.error ? <div className="notice notice-error" role="alert">{result.error}</div> : null}
      <div className="field-row">
        <div className="field">
          <label htmlFor="first_name">First name</label>
          <input id="first_name" name="first_name" required maxLength={100} autoComplete="given-name" />
        </div>
        <div className="field">
          <label htmlFor="surname">Surname</label>
          <input id="surname" name="surname" required maxLength={100} autoComplete="family-name" />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="email">{inPerson ? "Participant’s email" : "Email"}</label>
          <input id="email" name="email" type="email" required maxLength={254} autoComplete="email" />
          <p className="faint">Use the participant’s own address. Decisions and portal links are sent here.</p>
        </div>
        <div className="field">
          <label htmlFor="mobile">Mobile (optional)</label>
          <input id="mobile" name="mobile" type="tel" maxLength={40} autoComplete="tel" />
        </div>
      </div>
      <div className="field">
        <label htmlFor="programme_code">Programme</label>
        <select id="programme_code" name="programme_code" required defaultValue="">
          <option value="" disabled>Choose a programme</option>
          {programmes.map(p => <option key={p.code} value={p.code}>{p.name} — {formatMoney(p.amount_due)}</option>)}
        </select>
      </div>
      <PrivacyNotice />
      <input type="hidden" name="notice_version" value={PRIVACY_NOTICE_VERSION} />
      <div className="consent">
        <input id="consent" name="consent" type="checkbox" required aria-describedby="privacy-heading" />
        <label htmlFor="consent">{inPerson
          ? "I explained this privacy notice in person and the applicant agreed to the processing described. I am recording their consent, not consenting on their behalf."
          : "I have read this privacy notice and consent to the institute processing my details for my application and, if approved, my registration and payments."}</label>
      </div>
      <button className="btn btn-gold btn-lg" style={{ width: "100%", marginTop: 16 }} disabled={pending}>
        {pending ? "Submitting application…" : "Submit application"}
      </button>
    </form>
  );
}
