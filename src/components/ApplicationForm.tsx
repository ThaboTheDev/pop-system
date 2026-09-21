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

function isDual(programme: RegistrationProgramme | undefined) {
  return programme?.pricing_model === "dual" && programme.once_off_amount != null;
}

export function ApplicationForm({ programmes, submit, inPerson = false }: Props) {
  const [result, setResult] = useState<ApplicationResult | null>(null);
  const [pending, start] = useTransition();
  const [code, setCode] = useState("");
  const selected = programmes.find(p => p.code === code);
  const dual = isDual(selected);
  const monthly = Number(selected?.amount_due ?? 0);
  const onceOff = Number(selected?.once_off_amount ?? 0);
  const savings = monthly - onceOff;

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
        <select id="programme_code" name="programme_code" required value={code} onChange={e => setCode(e.target.value)}>
          <option value="" disabled>Choose a programme</option>
          {programmes.map(p => (
            <option key={p.code} value={p.code}>
              {p.pricing_model === "dual" && p.once_off_amount != null
                ? `${p.name} — once-off ${formatMoney(p.once_off_amount)} / monthly ${formatMoney(p.amount_due)}`
                : `${p.name} — ${formatMoney(p.amount_due)}`}
            </option>
          ))}
        </select>
      </div>

      {selected && !dual ? (
        <div className="price-callout">
          <span className="choice-kicker">Programme fee</span>
          <strong className="choice-price">{formatMoney(selected.amount_due)}</strong>
          <p className="faint" style={{ margin: "4px 0 0" }}>
            This programme has one price. It becomes the amount due if the application is approved.
          </p>
          <input type="hidden" name="payment_option" value="single" />
        </div>
      ) : null}

      {selected && dual ? (
        <fieldset className="pricing-fieldset">
          <legend>How will you pay?</legend>
          <p className="faint" style={{ marginTop: 0 }}>
            Choose one. Once-off is the discounted full payment. Monthly is the original programme fee.
          </p>
          <div className="choice-grid" key={selected.code}>
            <label className="choice">
              <input type="radio" name="payment_option" value="once_off" required />
              <span className="choice-body">
                <span className="choice-kicker">Pay once-off</span>
                <strong className="choice-price">{formatMoney(onceOff)}</strong>
                <span className="choice-note">Discounted full payment</span>
                {savings > 0 ? <span className="choice-save">Save {formatMoney(savings)} versus monthly</span> : null}
              </span>
            </label>
            <label className="choice">
              <input type="radio" name="payment_option" value="monthly" required />
              <span className="choice-body">
                <span className="choice-kicker">Pay monthly</span>
                <strong className="choice-price">{formatMoney(monthly)}</strong>
                <span className="choice-note">Original programme fee</span>
              </span>
            </label>
          </div>
        </fieldset>
      ) : null}

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
