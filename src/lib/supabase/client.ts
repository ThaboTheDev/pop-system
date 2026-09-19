"use client";
import { createBrowserClient } from "@supabase/ssr";

/** Module-level singleton so every consumer reuses one client and one set of
 *  auth state listeners instead of recreating them on every render. */
let _client: ReturnType<typeof createBrowserClient> | null = null;

export const supabaseBrowser = () => {
  if (!_client) {
    _client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return _client;
};
