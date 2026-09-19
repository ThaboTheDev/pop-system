import type { NextConfig } from "next";

// A strict-enough-to-be-useful CSP. This is an admin app with no third-party
// embeds, so we can lock it down tightly. `'self'` for same-origin assets and
// Supabase for auth + data calls.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next dev + inline RSC scripts; tighten in production if you add a nonce
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-src 'self' data: blob:", // allow the /api/pop PDF iframe
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Three 10 MB documents plus multipart overhead. Hosting platforms can
  // impose a lower request limit; this setting cannot override that limit.
  experimental: {
    serverActions: {
      bodySizeLimit: "32mb",
    },
    // Client-side router cache lifetimes. Revisiting an admin tab within the
    // dynamic window re-renders from cache instantly instead of refetching;
    // 30 s keeps figures fresh enough for an ops screen while making tab
    // switches feel immediate.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
          { key: "Content-Security-Policy", value: csp },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        // Document previews are sandboxed more tightly than the app shell.
        source: "/api/pop/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "sandbox; default-src 'none'" },
        ],
      },
    ];
  },
};

export default nextConfig;
