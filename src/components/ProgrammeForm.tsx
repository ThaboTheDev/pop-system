"use client";

import { useMemo, useState } from "react";
import { saveProgramme } from "@/app/(admin)/programmes/actions";
import { formatMoney } from "@/lib/format";
import type { PricingModel } from "@/lib/types";

export type ProgrammeFormValues = {
  id?: string;
  code?: string;
  name?: string;
  amount_due?: number | string;
  once_off_amount?: number | string | null;
  pricing_model?: PricingModel | string | null;
  is_active?: boolean;
};

export function ProgrammeForm({ programme }: { programme?: ProgrammeFormValues }) {
  const editing = Boolean(programme?.id);
  const [pricing, setPricing] = useState<PricingModel>(
    programme?.pricing_model === "dual" ? "dual" : "single",
  );
  const [monthly, setMonthly] = useState(
    programme?.amount_due == null || programme.amount_due === "" ? "" : String(programme.amount_due),
  );
  const [onceOff, setOnceOff] = useState(
    programme?.once_off_amount == null || programme.once_off_amount === ""
      ? ""
      : String(programme.once_off_amount),
  );
  const monthlyN = Number(monthly);
  const onceOffN = Number(onceOff);
  const savings = monthlyN > 0 && onceOffN >= 0 ? monthlyN - onceOffN : 0;
  const inverted = pricing === "dual" && monthlyN > 0 && onceOffN > monthlyN;
  const prefix = programme?.id ?? "new";
  const preview = useMemo(() => {
    if (pricing !== "dual" || monthly === "" || onceOff === ""
      || !Number.isFinite(monthlyN) || monthlyN < 0 || !Number.isFinite(onceOffN) || onceOffN < 0) {
      return null;
    }
    return { monthly: monthlyN, onceOff: onceOffN, savings: monthlyN - onceOffN };
  }, [pricing, monthly, onceOff, monthlyN, onceOffN]);

  return (
    <form action={saveProgramme} className={editing ? "programme-edit" : undefined}>
      {programme?.id ? <input type="hidden" name="id" value={programme.id} /> : null}

      <div className="field-row">
        <div className="field">
          <label htmlFor={`${prefix}-code`}>Code</label>
          <input
            id={`${prefix}-code`}
            name="code"
            required
            maxLength={40}
            autoComplete="off"
            placeholder="HC-AIS"
            defaultValue={programme?.code ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-name`}>Programme name</label>
          <input
            id={`${prefix}-name`}
            name="name"
            required
            maxLength={200}
            autoComplete="off"
            placeholder="Higher Certificate in …"
            defaultValue={programme?.name ?? ""}
          />
        </div>
      </div>

      <fieldset className="pricing-fieldset">
        <legend>How is this programme priced?</legend>
        <p className="faint" style={{ marginTop: 0 }}>
          Choose one fee for everyone, or two prices so applicants can pick a discounted once-off
          payment or the original monthly amount.
        </p>
        <div className="choice-grid">
          <label className="choice">
            <input
              type="radio"
              name="pricing_model"
              value="single"
              checked={pricing === "single"}
              onChange={() => setPricing("single")}
            />
            <span className="choice-body">
              <span className="choice-kicker">One price</span>
              <strong className="choice-title">Single programme fee</strong>
              <span className="choice-note">Everyone who registers pays the same amount.</span>
            </span>
          </label>
          <label className="choice">
            <input
              type="radio"
              name="pricing_model"
              value="dual"
              checked={pricing === "dual"}
              onChange={() => setPricing("dual")}
            />
            <span className="choice-body">
              <span className="choice-kicker">Two prices</span>
              <strong className="choice-title">Once-off and monthly</strong>
              <span className="choice-note">Discounted full payment, or the original monthly price.</span>
            </span>
          </label>
        </div>

        {pricing === "single" ? (
          <div className="field" style={{ marginTop: 16, marginBottom: 0 }}>
            <label htmlFor={`${prefix}-fee`}>Programme fee (R)</label>
            <input
              id={`${prefix}-fee`}
              name="fee"
              type="number"
              min="0"
              step="0.01"
              required
              inputMode="decimal"
              value={monthly}
              onChange={(e) => setMonthly(e.target.value)}
            />
            <p className="faint" style={{ margin: "6px 0 0" }}>
              This becomes the amount due for imports and for applicants on this programme.
            </p>
          </div>
        ) : (
          <>
            <div className="field-row" style={{ marginTop: 16 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor={`${prefix}-monthly`}>Monthly price (R) — original</label>
                <input
                  id={`${prefix}-monthly`}
                  name="fee"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  inputMode="decimal"
                  value={monthly}
                  onChange={(e) => setMonthly(e.target.value)}
                />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor={`${prefix}-once`}>Once-off price (R) — discounted</label>
                <input
                  id={`${prefix}-once`}
                  name="once_off"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  inputMode="decimal"
                  value={onceOff}
                  onChange={(e) => setOnceOff(e.target.value)}
                />
              </div>
            </div>
            <p className="faint" style={{ margin: "8px 0 0" }}>
              Applicants see both options when they apply. The once-off amount should be the
              discounted full payment; the monthly amount is the original programme fee.
            </p>
            {inverted ? (
              <p className="notice notice-warn" style={{ marginTop: 12, marginBottom: 0 }}>
                The once-off price should be lower than the monthly price — it is the discounted option.
              </p>
            ) : null}
            {preview && !inverted ? (
              <div className="choice-grid" style={{ marginTop: 14 }} aria-hidden="true">
                <div className="choice choice-static">
                  <span className="choice-body">
                    <span className="choice-kicker">Pay once-off</span>
                    <strong className="choice-price">{formatMoney(preview.onceOff)}</strong>
                    <span className="choice-note">Discounted full payment</span>
                    {preview.savings > 0 ? (
                      <span className="choice-save">Save {formatMoney(preview.savings)} versus monthly</span>
                    ) : null}
                  </span>
                </div>
                <div className="choice choice-static">
                  <span className="choice-body">
                    <span className="choice-kicker">Pay monthly</span>
                    <strong className="choice-price">{formatMoney(preview.monthly)}</strong>
                    <span className="choice-note">Original programme fee</span>
                  </span>
                </div>
              </div>
            ) : null}
            {savings > 0 && !inverted ? (
              <p className="faint" style={{ margin: "8px 0 0" }}>
                Once-off saves {formatMoney(savings)} against the original monthly price.
              </p>
            ) : null}
          </>
        )}
      </fieldset>

      <div className="consent" style={{ marginTop: 14 }}>
        <input id={`${prefix}-active`} type="checkbox" name="active" defaultChecked={programme?.is_active ?? true} />
        <label htmlFor={`${prefix}-active`}>Open for applications and imports</label>
      </div>

      <div className="btn-row" style={{ marginTop: 16 }}>
        <button className={`btn ${editing ? "btn-primary" : "btn-gold"}`}>
          {editing ? "Save programme" : "Create programme"}
        </button>
      </div>
    </form>
  );
}
