import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { CookieOptions } from "@supabase/ssr";

type CookieItem = { name: string; value: string; options?: CookieOptions };

/** Request-scoped client carrying the signed-in administrator's session.
 *  Every query it makes is subject to row level security.
 *
 *  Wrapped in React cache() so callers (middleware excepted — it doesn't have
 *  React context) all share one client per request, which also means the
 *  cookie jar is read exactly once rather than re-read on every query site. */
export const supabaseServer = cache(async () => {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (items: CookieItem[]) => {
          try {
            items.forEach(({ name, value, options }: CookieItem) =>
              cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component; middleware refreshes instead.
          }
        },
      },
    },
  );
});
