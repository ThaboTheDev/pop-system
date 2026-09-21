"use client";

import { useActionState } from "react";
import { decideApplication } from "./actions";

export function ApplicationDecision({ id, fee, consent }: { id: string; fee: number; consent: boolean }) {
  const [approval, approve, approving] = useActionState(decideApplication, {});
  const [decline, reject, declining] = useActionState(decideApplication, {});
  const busy = approving || declining;
  return (
    <div style={{ minWidth: 240, maxWidth: 340 }}>
      {approval.error || decline.error ? <p className="notice notice-error" role="alert">{approval.error || decline.error}</p> : null}
      {approval.message || decline.message ? <p className="notice notice-ok" role="status">{approval.message || decline.message}</p> : null}
      {!consent ? <p className="notice notice-info">No legacy consent recorded. Decline and ask the applicant to reapply with consent.</p> : null}
      <form action={approve}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="decision" value="approved" />
        <label htmlFor={`fee-${id}`}>Fee override / bursary (R, optional)</label>
        <div className="btn-row">
          <input id={`fee-${id}`} name="fee" type="number" min="0" max="9999999999.99" step="0.01" placeholder={Number(fee).toFixed(2)} style={{ maxWidth: 150 }} disabled={busy || !consent} />
          <button className="btn btn-sm btn-primary" disabled={busy || !consent}>{approving ? "Approving…" : "Approve"}</button>
        </div>
        <small className="faint">Leave blank to use the applicant’s chosen price; enter 0 for a full bursary.</small>
      </form>
      <form action={reject} style={{ marginTop: 12 }}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="decision" value="declined" />
        <label htmlFor={`reason-${id}`}>Decline reason (sent to applicant)</label>
        <textarea id={`reason-${id}`} name="reason" required maxLength={2000} rows={2} disabled={busy} />
        <button className="btn btn-sm btn-danger" disabled={busy}>{declining ? "Declining…" : "Decline"}</button>
      </form>
    </div>
  );
}
