"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
export default function Forgot() {
 const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
 async function submit(form: FormData) {
  setBusy(true); await supabaseBrowser().auth.resetPasswordForEmail(String(form.get("email")), { redirectTo: `${window.location.origin}/login/reset` });
  setMessage("If that account exists, a password-reset email has been sent."); setBusy(false);
 }
 return <main className="content"><h1>Reset password</h1><form action={submit}><label>Email<input type="email" name="email" required/></label><button className="btn" disabled={busy}>Send reset link</button></form><p role="status">{message}</p></main>;
}
