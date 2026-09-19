"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
export function MFASettings() {
 const [factors, setFactors] = useState<{ id: string; friendly_name?: string }[]>([]);
 const [enrolment, setEnrolment] = useState<{ id: string; secret: string; qr: string } | null>(null);
 const [code, setCode] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
 async function refresh() { const { data, error } = await supabaseBrowser().auth.mfa.listFactors(); if (error) setMessage(error.message); else setFactors(data.totp); }
 useEffect(() => { void refresh(); }, []);
 async function enrol() {
  setBusy(true);
  const { data, error } = await supabaseBrowser().auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator ${new Date().toISOString()}` });
  if (error) setMessage(error.message); else setEnrolment({ id: data.id, secret: data.totp.secret, qr: data.totp.qr_code }); setBusy(false);
 }
 async function verify() {
  if (!enrolment) return; setBusy(true);
  const { error } = await supabaseBrowser().auth.mfa.challengeAndVerify({ factorId: enrolment.id, code });
  setMessage(error?.message ?? "Authenticator enabled"); if (!error) { setEnrolment(null); await refresh(); } setBusy(false);
 }
 async function remove(id: string) {
  const { error } = await supabaseBrowser().auth.mfa.unenroll({ factorId: id }); setMessage(error?.message ?? "Authenticator removed"); await refresh();
 }
 return <div className="card"><h2>Multi-factor authentication</h2><p role="status">{message}</p>
 {factors.map(f => <p key={f.id}>{f.friendly_name ?? "Authenticator"} <button className="btn" onClick={() => remove(f.id)}>Unenroll</button></p>)}
 {!enrolment && <button className="btn" onClick={enrol} disabled={busy}>Enroll authenticator</button>}
 {enrolment && <><img src={enrolment.qr.startsWith("data:") ? enrolment.qr : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(enrolment.qr)}`} alt="Scan authenticator QR code" width="200" height="200"/><p>Manual secret: <code>{enrolment.secret}</code></p><label>Authenticator code<input value={code} onChange={e => setCode(e.target.value)} autoComplete="one-time-code" inputMode="numeric"/></label><button className="btn" onClick={verify} disabled={busy}>Verify enrollment</button></>}</div>;
}
