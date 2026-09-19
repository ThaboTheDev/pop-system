"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
let exchange: Promise<boolean> | undefined;
async function establishSession() {
 const sb = supabaseBrowser(); const url = new URL(window.location.href);
 const code = url.searchParams.get("code"); const fragment = new URLSearchParams(url.hash.slice(1));
 if (code) { const { error } = await sb.auth.exchangeCodeForSession(code); if (error) return false; }
 else if (fragment.get("access_token") && fragment.get("refresh_token")) {
  const { error } = await sb.auth.setSession({ access_token: fragment.get("access_token")!, refresh_token: fragment.get("refresh_token")! }); if (error) return false;
 }
 window.history.replaceState(null, "", "/login/reset");
 return !!(await sb.auth.getSession()).data.session;
}
export default function Reset() {
 const [ready, setReady] = useState(false); const [message, setMessage] = useState("Validating reset link…");
 useEffect(() => { exchange ??= establishSession(); void exchange.then(ok => { setReady(ok); setMessage(ok ? "Choose a password of at least 12 characters." : "Link invalid or expired. Request a new reset email."); }); }, []);
 async function submit(form: FormData) {
  const password = String(form.get("password")); if (password.length < 12) { setMessage("Use at least 12 characters."); return; }
  const { error } = await supabaseBrowser().auth.updateUser({ password });
  if (error) setMessage(error.message); else { await supabaseBrowser().auth.signOut(); window.location.assign("/login"); }
 }
 return <main className="content"><h1>Choose a new password</h1><p role="status">{message}</p>{ready && <form action={submit}><label>New password<input name="password" type="password" minLength={12} autoComplete="new-password" required/></label><button className="btn">Save password</button></form>}<a href="/login/forgot">Request another reset link</a></main>;
}
