# Operations

## 1. Measured performance

Run against PostgreSQL 16 with **20 000 participants and 52 387 payments**, the
full seed rather than a demo set. Times are from `psql` on a single container,
so treat them as a floor: managed Postgres on real hardware is faster.

| Operation | Time | Notes |
| --- | --- | --- |
| Full seed, 20 000 participants and 52 387 payments | 8 s | Rollup triggers disabled for the load, aggregates rebuilt in one pass. |
| `dashboard_stats()`, every dashboard figure | 159 ms | One round trip, twelve aggregates. |
| Global search by participant ID | 1 to 5 ms | Trigram index. |
| Global search by name | 2.4 ms | |
| Global search by bank reference | 1.8 ms | |
| Payments page 50 (offset 1 250), joined and filtered | 3.5 ms | Partial index on the open-status queue. |
| Participant payment history | 0.2 ms | |
| `programme_report()` | 22 ms | |
| `monthly_payment_report()` over 12 months | 44 ms | |

### Bottlenecks found and fixed

Two real problems surfaced during testing, both now corrected in the migrations:

1. **Search was 70 to 100 ms.** `mobile`, `participant_ref` and `email` had only
   btree indexes, which a case-insensitive `ILIKE` cannot use. Worse, the single
   `WHERE a OR b OR c OR d` with an `ORDER BY` over it forced the planner to
   evaluate every matching row before sorting. Rewritten as four separately
   indexed branches, each with its own `LIMIT`, plus trigram indexes on the
   remaining fields. Bank-reference search went from 36 ms to 3 ms; the rest
   now run in single-digit milliseconds.

2. **Seeding took minutes.** The rollup trigger fired once per inserted payment,
   each firing locking a participant row and re-aggregating. The seed now
   disables the trigger for the bulk load and rebuilds every rollup in one
   statement. This is also the pattern to use for any future bulk migration.

### The remaining ceiling

`dashboard_stats()` scans both tables. At 20 000 participants that is 159 ms,
which is fine. At roughly 200 000 participants it will be noticeably slower, and
the fix at that point is a `dashboard_daily` summary table refreshed every few
minutes, with the function reading the summary and adding only today's rows.
The function signature does not change, so no page needs rewriting.

---

## 2. Historical baseline testing (before operations layer)

```
Migrations 0001, 0002, 0003          applied clean, first attempt
Seed at 20 000 participants           8 s, 52 387 payments, 130 flagged duplicates
Submit a PoP                          payment created, file metadata attached,
                                      notification queued, audit line written
Pending does not count as income       amount_paid unchanged at R0.00 after submission
Duplicate submission                   flagged on all three signals at once:
                                      same participant/amount/date, reused
                                      reference, identical document hash
Reject with no reason                  refused: REJECTION_REASON_REQUIRED
Verify                                 amount_paid R0 to R1 500, outstanding
                                      R12 000 to R10 500, status moved to
                                      Partially paid, history and audit written
Unknown participant ID                 refused: PARTICIPANT_NOT_FOUND
Edit the audit log                     refused: audit_logs is append-only
Delete from the audit log              refused: audit_logs is append-only
TypeScript                             tsc --noEmit clean
Production build                       baseline routes compiled, admin routes dynamic
```

### Re-running these

```bash
psql "$DATABASE_URL" -c "select dashboard_stats(null);"
psql "$DATABASE_URL" -c "select global_search('MSRI-001284', 10);"
```

For the workflow, use `/submit` with a participant ID from the seed, then work it
through `/verification` and confirm the participant profile figures move.

---

## 3. Deployment

1. Create the Supabase project. Apply all five migrations (0001–0005) in order, either with
   `psql` or the SQL editor. `0003` creates the private storage bucket.
2. Push to GitHub and import the repository into Vercel.
3. Set the environment variables in Vercel. `SUPABASE_SERVICE_ROLE_KEY` goes in
   as a server-side variable only; it must never carry the `NEXT_PUBLIC_` prefix.
4. Deploy, then run `scripts/create-admin.mjs` from your own machine against the
   production project to create the first super administrator.
5. Confirm before announcing the link: sign in, open a seeded PoP, verify one
   payment, and check the audit log recorded it.

Rotate the service role key from the Supabase dashboard if it is ever pasted
anywhere it should not be, and redeploy.

---

## 4. Backup

| What | How | Frequency |
| --- | --- | --- |
| Database | Supabase automatic backups. Point-in-time recovery on Pro. | Daily, retained 7 days |
| Database, independent copy | `pg_dump "$DATABASE_URL" -Fc -f pop-$(date +%F).dump` to storage outside Supabase | Weekly |
| Documents | Bucket copy to separate object storage | Weekly |
| Schema | The migration files, in version control | Every change |

Two points that matter for a payments system. First, keep at least one copy
outside the provider: a backup that can be deleted by the same credentials that
can delete the data is not a backup. Second, restore to a scratch project once a
quarter and confirm a participant's paid total matches verified payments plus approved signed adjustments. An untested backup is an assumption.

Retention: keep payment and audit records for at least five years, in line with
the South African Revenue Service's requirement to retain records supporting a
return. Do not prune `audit_logs` with `DELETE`; the append-only triggers block
it by design. When the volume justifies it, partition by month and drop old
partitions.

---

## 5. Security

Built in:

- Supabase Auth for credentials. No password handling in this codebase.
- Row level security on every table, default deny. An authenticated user with no
  `app_users` row sees nothing.
- Role-based access: super admin, finance admin, course admin (optionally granted
  verification, optionally scoped to programmes), viewer.
- Uploads validated by magic number, not by the browser's claimed MIME type.
  PDF, JPEG and PNG only, 10 MB ceiling, enforced at the bucket as well.
- Documents are never publicly reachable. `/api/pop/[popId]` authenticates the
  request, lets RLS decide whether that administrator may see that participant's
  file, then streams it through a five-minute signed link that is never given to
  the browser. Served with `nosniff` and a sandboxing content security policy.
- Storage paths are keyed by UUID, so nothing can be enumerated, and the bucket
  is private regardless.
- Rate limiting on the public submission route.
- CSV export escapes leading `=`, `+`, `-` and `@`, so an exported field cannot
  become a formula when the file is opened in Excel.
- Audit logging on views, downloads, exports, decisions and imports, with IP
  address, immutable at the database level.
- Parameterised queries throughout; no string-built SQL.
- Security headers: HSTS, `X-Frame-Options: DENY`, `nosniff`, restrictive
  referrer and permissions policies.
- Portal OTP requests have the same production response for matching and non-matching
  registration details. Public submission errors are not an identity-verification mechanism.

Enroll finance administrators in TOTP from Settings. Before heavy use, move the
IP rate limiter to an edge service or Redis so it holds across server instances.
OTP issuance and verification-attempt caps are already enforced in Postgres.

---

## 6. Scaling beyond 20 000 participants

The architecture already holds to roughly 100 000 participants without change.
Beyond that, in the order the pressure actually arrives:

1. **Dashboard aggregates.** Add the `dashboard_daily` summary table described
   above. This is the first thing that will slow down.
2. **Deep pagination.** `OFFSET` on page 500 makes Postgres walk every preceding
   row. Switch the payments and participants tables to keyset pagination
   (`where (submitted_at, id) < (:last_at, :last_id)`); the composite indexes to
   support it are already in place.
3. **Partition `payments` and `audit_logs` by month.** Keeps indexes small,
   makes retention a partition drop rather than a mass delete.
4. **Read replica** for reports and exports, so a large export cannot slow down
   the verification queue.
5. **Connection pooling (do this BEFORE launch on Vercel).** The DATABASE_URL
   used for migrations can be the direct Postgres URL, but for serverless
   runtimes point any server-side Postgres usage (migrations at scale, Edge
   Functions, scripts) at Supabase's **transaction pooler** on port 6543 with
   `?pgbouncer=true`. Direct connections exhaust Postgres slots under load.
   The Supabase JS client over HTTPS (which is what this app uses) is not
   affected — this applies only to raw `psql` connections. Configure the
   pooler in your Supabase project Settings → Database → Connection pooling.
6. **Move exports to a background job** writing to storage, with a link emailed
   when ready, once exports regularly exceed 100 000 rows.
7. **Storage lifecycle.** At 20 000 participants and three PoPs each, expect
   roughly 30 GB. Move documents older than two years to cold storage; the
   metadata rows stay, so history is unaffected.

The thing not to do is denormalise participant details into `payments` to avoid
joins. The joins are indexed and cost under 4 ms at this scale; duplicated
participant data would cost correctness, which is the one thing a payments
system cannot trade.

## 7. Email delivery

Verify the Resend sending domain before enabling the cron. Email is the only
supported channel. Delivery is split in two, because the hosting plan (Vercel
Hobby) allows at most one scheduled run a day and rejects an every-ten-minutes
schedule at deployment validation:

- **Prompt path.** `queueParticipantMessage()` commits the outbox row, then
  schedules `processOutbox(25)` with `after()`, so the message is sent as soon
  as the triggering response is flushed. Portal sign-in codes go through the
  same outbox, so they leave well within their ten-minute lifetime.
- **Daily sweep.** `vercel.json` schedules `/api/notifications/process` at
  05:00 UTC (`0 5 * * *`). Each run drains the queue in batches of 100 with at
  most ten concurrent sends, looping until the queue is empty or 45 s have
  elapsed (inside `maxDuration = 60`); anything left resumes tomorrow.

Set `CRON_SECRET` so the scheduler sends `Authorization: Bearer <secret>`. GET
and POST accept that credential or an active super-admin session. Settings
provides process-now and retries for email rows only.

| Email template | Payload fields |
| --- | --- |
| pop_received | payment_ref, amount |
| payment_verified | payment_ref |
| payment_rejected | payment_ref, reason |
| clarification_requested | payment_ref, reason, url |
| payment_reminder | participant_ref, amount, due_date |
| adjustment_decided | amount, status, reason |
| portal_otp | code |

Submission, payment decision and adjustment emails are queued transactionally in
Postgres. Reminders, portal codes and resubmit links use the email-only queue helper.
Resend uses a per-outbox-row idempotency key. Claims are guarded
`queued → processing` updates. A crash after provider acceptance may leave a row
`processing`: investigate provider logs before retrying, including the provider's
idempotency retention window. There is no automatic retry of ambiguous deliveries.

Missing configuration/recipients are `skipped`; rejected or timed-out requests are
`failed`; provider acceptance is `sent` (not proof of delivery). Fix configuration
before requeueing. Do not requeue redacted/anonymized recipients. Portal OTP email
leaves the queue as the response that issued it flushes; the daily sweep is the
backstop if a post-response run is interrupted. Monitor skipped/failed counts —
a backlog now means mail is slow, not lost.

### Upgrading an existing installation

Pause any old delivery workers and deploy the email-only code with
`0005_email_only.sql`. It replaces the adjustment notification function, marks
unsent non-email records skipped, prevents non-email queueing, and preserves
historical sent records. The old channel enum values remain only for compatibility.
Remove old Meta/WhatsApp credentials from the hosting environment. Do not run old
application instances alongside the email-only deployment.

## 8. POPIA and retention

Submission requires affirmative consent and records `participants.consent_at`.
Provide your organization's privacy notice, lawful basis, retention schedule and
information-officer contact before launch; the checkbox alone is not a compliance
programme. Obtain/record messaging consent appropriate to your use of email.
Limit provider access, keep audit history and approve deletion requests according
to your legal retention obligations rather than deleting financial records blindly.

Anonymization is super-admin-only with typed-reference confirmation. The application
deletes private document bytes before redacting participant contact data, notes,
payment references and queued message payloads. Financial and append-only audit
history remain. Historical audit metadata and external provider records/backups
may contain personal information and need a separate retention/access policy.
Database and object storage are not one transaction: investigate failures and
retry; avoid concurrent capture/resubmission while anonymizing a participant.

Merge transfers payments, adjustments and plans into the target account; the target
amount due and registration details win. Review both accounts before merging.
Receipts require verified payments. Statement PDFs display the latest 40 payments,
with a truncation notice, and balances include approved adjustments.

## 9. Go-live checklist

- Apply 0001–0005 in order; test on a scratch project and back up before production.
- Run `npm ci`, `npm run typecheck`, `npm run build`, `npm run test:operations`.
  The latter uses real temporary PostgreSQL with stub auth/storage, not live Supabase.
- Configure APP_URL, secrets, sending domains, email sender and scheduler.
- Allow `/login/reset` in Supabase Auth redirects. Test invite, password reset,
  PKCE and fragment links, MFA enroll/challenge/unenroll, and last-super-admin guard.
- Test role/programme isolation with real course-admin, viewer and finance accounts.
- Test portal matching/non-matching requests, wrong/expired codes and five-attempt cap;
  verify one participant cannot fetch another participant's receipt or statement.
- Test all three upload paths, MIME/size rejection, single-use links and expired links.
  Host ingress limits may be below Next's 32 MB setting; Vercel's function request
  limits cannot be increased by this config. Use direct uploads or suitable hosting.
- Exercise live storage deletion and inspect orphan cleanup after simulated failures.
- Confirm pending payments/adjustments do not change paid totals; verified payments
  and approved adjustments do. Bank matches and paid plan markers alone do not.
- Review bank matching, ambiguous references, manual unmatch/reopen and credit balances.
- Send test emails for every template; never use real participant
  data in staging. Watch queue age, skipped/failed counts and stuck processing rows.
- Document partial import retry procedure, retention policy and shared rate limiting.
- Test database AND storage restores and compare rollups with underlying ledger rows.

### Operations-layer automated checks

`scripts/test-operations.mjs` applies all migrations and uses a light seed to exercise
pending≠income, verification, clarification notification, claim release, pending and
approved adjustments, overdue plans, attached documents, token/statement/OTP inserts,
OTP attempt caps, single-use resubmission, merge, anonymization, reporting, append-only
audit, rejection reason, concurrent claims, cent-exact plan generation, bank auto-matching,
consent, super-admin guards and default-deny access. Live Auth, Storage and Resend
are not emulated by these database tests and need the staging checks above.
