import { createClient } from "@supabase/supabase-js";

/** Service-role client. Bypasses RLS, so it is used only where a request has
 *  no session by design: public PoP submission and signed file links.
 *  Never import this into a Client Component.
 *
 *  Module-level singleton: creating a Supabase client is cheap but not free,
 *  and in serverless environments reusing one per cold start avoids repeated
 *  auth setup work. */
let _admin: any = null;

export function supabaseAdmin(): any {
  if (_admin) return _admin;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  _admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}
