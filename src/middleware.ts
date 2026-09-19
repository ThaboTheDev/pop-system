import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

type CookieItem = { name: string; value: string; options?: CookieOptions };

/** Refreshes the Supabase session cookie and keeps unauthenticated traffic out
 *  of the admin area. Page-level guards still run: this is the outer gate,
 *  not the only one. */
export async function middleware(request: NextRequest) {
  // Build a single response up front and apply cookies to it rather than
  // reassigning the response inside the setAll callback (which previously
  // constructed a new NextResponse for every cookie and could drop earlier
  // cookies, triggering spurious re-auth and extra round trips).
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (items: CookieItem[]) => {
          items.forEach(({ name, value, options }) => {
            // Keep request cookies in sync so later reads in this request
            // see the refreshed values, and mirror onto the outgoing response.
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // API routes authenticate themselves; the extra getUser() here adds a
  // round-trip to Supabase on every /api call for no protection benefit.
  const path = request.nextUrl.pathname;
  const isApi = path.startsWith("/api/");
  const isStatic = path.startsWith("/_next/") || path.startsWith("/favicon.");

  if (!isApi && !isStatic) {
    const { data: { user } } = await supabase.auth.getUser();
    const isPublic =
      path === "/" || path.startsWith("/login") || path.startsWith("/submit") || path === "/portal" || path.startsWith("/portal/") || path.startsWith("/clarify/");

    if (!user && !isPublic) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", path);
      return NextResponse.redirect(url);
    }

  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)"],
};
