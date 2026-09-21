# Environment variables

Read `HANDOVER.md` **before deployment**. Confirm which Supabase project is
actually live, reconcile migration history, and use keys from that same project.
Never commit real keys or paste server credentials into chat.

Create `.env.local` for development, or use the host's secret/environment store:

```dotenv
# Supabase project settings → API. URL and keys must be from the same project.
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key

# Server only: public proof submission, controlled Auth provisioning, storage
# signing after RLS authorisation, outbox processing and admin operations.
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Migration/seed tools only; the app uses Supabase's API, not this connection.
# Use a direct or session-pooler connection suitable for running DDL.
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT_REF.supabase.co:5432/postgres

# Deployed public ORIGIN, with no path/query/fragment. HTTPS in production.
# For a hosted preview use its public https://...e2b.app origin, not localhost.
APP_URL=https://payments.example.org
ORG_NAME=MSR Learning Institute

# Application outbox delivery; NOT Supabase Auth SMTP configuration.
RESEND_API_KEY=your-resend-key
RESEND_FROM=Finance <finance@your-verified-domain.example>
CRON_SECRET=replace-with-a-long-random-secret

# Optional storage defaults.
POP_BUCKET=proof-of-payment
POP_SIGNED_URL_TTL=5
```

Generate `CRON_SECRET` locally, e.g. `openssl rand -hex 32`. Keep the service-role
key server-only; it bypasses RLS. The public key is not a substitute for it.
Rotate any real credentials previously committed in Git, even if their file was
subsequently deleted. No `PORTAL_SECRET` is used: custom portal sessions and
six-digit codes have been removed by Phase 2.

## Participant email-link sign-in (Supabase dashboard)

Under Authentication:

1. Enable email sign-in and set Site URL to `APP_URL`.
2. Add the deployed origin and `APP_URL/auth/callback` to allowed redirects.
3. Keep `APP_URL/login/reset` allowed for staff/runner invitations and resets.
4. Connect a production SMTP provider. Supabase's built-in sender is for testing,
   not intake volume; check sender/domain verification and Auth rate limits.
5. Keep the magic-link template using `{{ .ConfirmationURL }}`. The app exchanges
   PKCE codes at `/auth/callback`; links must be opened in the requesting browser.

Public Auth signups may remain disabled. A server action pre-provisions only an
unambiguous enrolled non-staff email, with no password, and calls `signInWithOtp`
with `shouldCreateUser: false`. Supabase still verifies mailbox possession before
issuing a session. The database binds that session on first sign-in by verified
email, refusing staff, unknown and ambiguous matches.

**Two independent email configurations:** Supabase SMTP sends portal sign-in
links. Resend + `RESEND_FROM` sends application/payment notifications through the
outbox. Configuring one does not configure the other.

## Application outbox

Resend requires a verified sending domain. Missing provider configuration marks
rows `skipped` with a reason; queued rows are claimed safely before delivery.
Application submission/decision/capture actions schedule prompt processing. The
Vercel cron drains remaining mail daily at 05:00 UTC, authenticated with
`Authorization: Bearer <CRON_SECRET>`. Inspect provider acceptance and delivery
before retrying ambiguous rows. No SMS/WhatsApp delivery is supported.

## Go-live checklist

| Variable | Required? | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Confirm the authoritative project with Tshidiso. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Request-scoped/browsing clients; RLS applies. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only privileged operations. |
| `APP_URL` | Yes | Canonical origin for Auth and clarification links. |
| `CRON_SECRET` | Yes | Protect scheduled outbox processing. |
| `RESEND_API_KEY` | For outbox delivery | Provider API credential. |
| `RESEND_FROM` | For outbox delivery | Sender on a verified domain. |
| `ORG_NAME` | Optional | Email/PDF letterhead. |
| `POP_BUCKET` | Optional | Defaults to `proof-of-payment`. |
| `POP_SIGNED_URL_TTL` | Optional | Signed document link lifetime in minutes; default 5. |
| `DATABASE_URL` | Migration/seed tools only | Not used at runtime. |

Before intake, test a first-time portal link with Auth signups disabled, approval
mail, an existing staff login, runner capture, and private document access on the
actual staging project. Local SQL tests do not exercise Auth SMTP or Storage.
