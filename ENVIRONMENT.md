# Environment variables

Copy this into `.env.local` for development, or into your host's environment
variable store for production (Vercel, etc.). **Never commit real keys.**

```
# Supabase project (Project settings → API)
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key-here

# Server only. Never expose to the browser, never commit.
# Used by the public PoP submission route and the admin bootstrap script.
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Postgres connection, used for migrations and seeding only.
# For serverless production prefer the Supabase TRANSACTION POOLER
# (port 6543, append ?pgbouncer=true) to avoid exhausting DB slots.
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT_REF.supabase.co:5432/postgres

# Storage bucket holding proof-of-payment documents (private).
POP_BUCKET=proof-of-payment

# Minutes a signed PoP link stays valid.
POP_SIGNED_URL_TTL=5
```

If the previous `.env.example` in your git history contained real credentials,
rotate them in the Supabase dashboard immediately. Anything that has been
pushed to a remote must be treated as compromised regardless of whether you
rewrite history.

## Operations layer (migration 0004)

All variables below are **server-only**. Configure the same `APP_URL` in
Supabase Auth's Site URL and allow `/login/reset` as a redirect URL.

```dotenv
APP_URL=https://payments.example.org
ORG_NAME=MSR Learning Institute
RESEND_API_KEY=your-resend-key
RESEND_FROM=Finance <finance@your-verified-domain.example>
CRON_SECRET=replace-with-a-long-random-secret
PORTAL_SECRET=replace-with-at-least-32-random-characters
```

Generate secrets locally with `openssl rand -hex 32`. Rotating `PORTAL_SECRET`
invalidates portal sessions and outstanding OTP hashes. Cookies last seven days;
OTP codes expire in ten minutes. Development builds may display an issued OTP;
production never does. Never run a development server as your public deployment.

Resend requires a verified sending domain. Missing provider configuration causes
outbox rows to be marked `skipped` with a reason. Email is the only delivery channel.
Apply `0005_email_only.sql` to existing installations to disable legacy non-email
queue entries. Remove any old Meta/WhatsApp credentials from your hosting environment.

## Go-live checklist

Twelve variables in all. Confirm every line is set (or consciously left to its
default) before the first participant is told about the system:

| # | Variable | Required? | Notes |
| --- | --- | --- | --- |
| 1 | `NEXT_PUBLIC_SUPABASE_URL` | required | Supabase project URL. |
| 2 | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | required | Anonymous key; RLS governs what it can see. |
| 3 | `SUPABASE_SERVICE_ROLE_KEY` | required | Server only; bypasses RLS. Never `NEXT_PUBLIC_`. |
| 4 | `APP_URL` | required | The public origin; also Supabase Auth Site URL, with `/login/reset` allowed. |
| 5 | `PORTAL_SECRET` | required | At least 32 random characters; rotation invalidates portal sessions and outstanding OTP hashes. |
| 6 | `CRON_SECRET` | required | Long random; the scheduler sends it as `Bearer` for the daily 05:00 UTC sweep. |
| 7 | `RESEND_API_KEY` | required for delivery | Without it every outbox row is `skipped` with a reason. |
| 8 | `RESEND_FROM` | required for delivery | Sender on your verified Resend domain. |
| 9 | `ORG_NAME` | optional | Email letterhead; defaults to `Payments and PoP`. |
| 10 | `POP_BUCKET` | optional | Defaults to `proof-of-payment`. |
| 11 | `POP_SIGNED_URL_TTL` | optional | Minutes a signed PoP link lives; default 5. |
| 12 | `DATABASE_URL` | migrations only | Not used by the app at runtime; prefer the transaction pooler for production runs. |
