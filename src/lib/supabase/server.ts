import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { CookieOptions } from "@supabase/ssr";

type CookieItem = { name: string; value: string; options?: CookieOptions };

/** Request-scoped client carrying the signed-in administrator's session.
 *  Every query it makes is subject to row level security. */
export async function supabaseServer() {
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
}
