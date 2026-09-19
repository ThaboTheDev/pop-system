import { createClient } from "@supabase/supabase-js";

/** Service-role client. Bypasses RLS, so it is used only where a request has
 *  no session by design: public PoP submission and signed file links.
 *  Never import this into a Client Component. */
export function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
