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
