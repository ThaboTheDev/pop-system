"use client";

import { useActionState, useState } from "react";
import { capturePayment, lookupParticipant } from "./actions";
import { StatusBadge } from "@/components/StatusBadge";

export function CaptureForm({ requestId, today }: { requestId: string; today: string }) {
  const [request, setRequest] = useState(requestId);
  return <PaymentEntry key={request} requestId={request} today={today} restart={() => setRequest(crypto.randomUUID())} />;
}

function PaymentEntry({ requestId, today, restart }: { requestId: string; today: string; restart: () => void }) {
  const [lookup, find, finding] = useActionState(lookupParticipant, {});
  const [result, capture, saving] = useActionState(capturePayment, {});
  if (result.reference) return <div className="card" role="status">
    <h2>{result.alreadyRecorded ? "Payment already recorded" : "Money received recorded"}</h2>
    <p><strong>{result.reference}</strong> · <StatusBadge status={result.status ?? "pending_review"} /></p>
    <p>This is a capture acknowledgement, not a verified receipt. Finance must confirm the payment independently before it counts towards the participant’s paid balance.</p>
    <button className="btn btn-primary" onClick={restart}>Record another payment</button>
  </div>;
  return (
    <div className="card">
      {!lookup.participant ? <form action={find}>
        {lookup.error ? <div className="notice notice-error" role="alert">{lookup.error}</div> : null}
        <div className="field"><label htmlFor="participant_ref">Approved Participant ID</label><input id="participant_ref" name="participant_ref" required autoCapitalize="characters" placeholder="MSRI-001284" /></div>
        <button className="btn btn-primary" disabled={finding}>{finding ? "Looking up…" : "Find participant"}</button>
      </form> : <>
        <h3>{lookup.participant.full_name}</h3><p>{lookup.participant.participant_ref} · {lookup.participant.programme}</p>
        <button type="button" className="btn btn-sm" onClick={restart} disabled={saving}>Choose a different participant</button>
        <form action={capture} style={{ marginTop: 20 }}>
          {result.error ? <div className="notice notice-error" role="alert">{result.error}</div> : null}
          <input type="hidden" name="participant_ref" value={lookup.participant.participant_ref} />
          <input type="hidden" name="request_id" value={requestId} />
          <div className="field-row">
            <div className="field"><label htmlFor="amount">Money received (R)</label><input id="amount" name="amount" type="number" min="0.01" max="9999999999.99" step="0.01" inputMode="decimal" required /></div>
            <div className="field"><label htmlFor="date">Received on</label><input id="date" name="date" type="date" min="2000-01-01" max={today} defaultValue={today} required /></div>
          </div>
          <div className="field"><label htmlFor="method">How was it received?</label><select id="method" name="method" defaultValue="cash"><option value="cash">Cash in person</option><option value="card">Card in person</option></select></div>
          <div className="field"><label htmlFor="reference">Receipt / terminal reference (optional)</label><input id="reference" name="reference" maxLength={200} /></div>
          <div className="consent"><input id="confirmed" name="confirmed" type="checkbox" required /><label htmlFor="confirmed">I checked the participant’s identity and received this amount. I understand that this does not verify the payment.</label></div>
          <button className="btn btn-gold btn-lg" style={{ width: "100%", marginTop: 16 }} disabled={saving}>{saving ? "Recording…" : "Record for finance review"}</button>
        </form>
      </>}
    </div>
  );
}
