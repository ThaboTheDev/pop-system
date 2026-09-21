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

1. Read `HANDOVER.md` and confirm the authoritative Supabase project and migration
   history first. Fresh databases apply 0001–0008 in order. Existing installations
   of this repository apply 0007 and 0008 after a backup and staging rehearsal.
   **0007 must commit on its own before 0008.** The external brief uses conflicting
   version numbers; do not mix the two migration histories. Pause writes for the
   data-moving upgrade; unapproved legacy rows with financial records abort it.
2. Push to GitHub and import the repository into Vercel.
3. Set the environment variables in Vercel. `SUPABASE_SERVICE_ROLE_KEY` goes in
   as a server-side variable only; it must never carry the `NEXT_PUBLIC_` prefix.
4. Deploy, then run `scripts/create-admin.mjs` from your own machine against the
   production project to create the first super administrator.
5. Configure Supabase Auth Site URL, `/auth/callback` and `/login/reset` redirects
   plus production SMTP. Test participant email links with public Auth signups
   disabled, unknown/staff addresses, runner restrictions and own-document access.
6. Confirm before announcing the link: sign in, open a seeded PoP, verify one
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
  verification, optionally scoped to programmes), viewer, and capture-only runner.
- Uploads validated by magic number, not by the browser's claimed MIME type.
  PDF, JPEG and PNG only, 10 MB ceiling, enforced at the bucket as well.
- Documents are never publicly reachable. `/api/pop/[popId]` authenticates the
  request, lets RLS decide whether that staff member or participant may see the
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
- Portal email-link requests have the same production response for eligible, unknown,
  ambiguous and staff email addresses. Public submission errors are not an identity-verification mechanism.

Administrator sign-in is work email and password only — there is no second
factor to enroll. Require long passphrases, suspend leavers the day they go,
and watch the audit log; README §7 records the trade-off and the compensating
controls (row level security, SQL-level role checks, append-only audit,
server-only secrets). Before heavy use, move the
IP rate limiter to an edge service or Redis so it holds across server instances.
Supabase Auth owns email-link expiry, single-use validation and Auth rate limits;
configure production SMTP and shared abuse controls before intake.

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
  as the triggering response is flushed. Application RPCs queue their messages
  transactionally and call the same scheduler afterwards. Participant sign-in
  links are sent separately by Supabase Auth SMTP, not by this outbox.
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
| payment_captured | payment_ref, amount |
| registration_received | name, programme |
| registration_approved | name, participant_ref, programme, amount_due |
| registration_rejected | name, reason |

Submission, payment decision and adjustment emails are queued transactionally in
Postgres, as are application received/decision and runner-capture notifications.
Reminders and resubmit links use the email-only queue helper.
Resend uses a per-outbox-row idempotency key. Claims are guarded
`queued → processing` updates. A crash after provider acceptance may leave a row
`processing`: investigate provider logs before retrying, including the provider's
idempotency retention window. There is no automatic retry of ambiguous deliveries.

Missing configuration/recipients are `skipped`; rejected or timed-out requests are
`failed`; provider acceptance is `sent` (not proof of delivery). Fix configuration
before requeueing. Do not requeue redacted/anonymized recipients or retired
`portal_otp` rows. The daily sweep is the backstop if post-response processing
is interrupted. Monitor queue age, skipped/failed counts and stuck claims.

### Upgrading an existing installation

Pause any old delivery workers and deploy the email-only code with
`0005_email_only.sql`. It replaces the adjustment notification function, marks
unsent non-email records skipped, prevents non-email queueing, and preserves
historical sent records. The old channel enum values remain only for compatibility.
Remove old Meta/WhatsApp credentials from the hosting environment. Do not run old
application instances alongside the email-only deployment.

## 8. POPIA and retention

Application submission requires affirmative consent and records `applications`
consent, database timestamp, notice version and online/runner-declaration method.
Increment `PRIVACY_NOTICE_VERSION` when changing the shared notice. Legacy consent
is labelled unversioned, never backfilled with invented agreement. Public proof
submission still records `participants.consent_at`. Provide the institute's
privacy notice, lawful basis, retention schedule and
information-officer contact before launch; the checkbox alone is not a compliance
programme. Obtain/record messaging consent appropriate to your use of email.
Limit provider access, keep audit history and approve deletion requests according
to your legal retention obligations rather than deleting financial records blindly.

Anonymization is super-admin-only with typed-reference confirmation. The application
deletes private document bytes before redacting participant contact data, notes,
payment references, linked application data (including legacy snapshots) and
queued message payloads. Participant auth bindings are cleared. Financial and append-only audit
history remain. Historical audit metadata and external provider records/backups
may contain personal information and need a separate retention/access policy.
Database and object storage are not one transaction: investigate failures and
retry; avoid concurrent capture/resubmission while anonymizing a participant.

Merge transfers payments, adjustments and plans into the target account; the target
amount due and registration details win. Review both accounts before merging.
Receipts require verified payments. Statement PDFs display the latest 40 payments,
with a truncation notice, and balances include approved adjustments.

## 9. Go-live checklist

- Confirm the live project and migration history using `HANDOVER.md`; rehearse and
  back up before production. Fresh installations run 0001–0008; existing repository
  installations add 0007 then 0008, in separate committed transactions.
- Run `npm ci`, `npm run typecheck`, `npm run build`, `npm test`.
  The latter uses real temporary PostgreSQL with stub auth/storage and mocked
  server-action dependencies, not live Supabase or SMTP.
- Configure APP_URL, secrets, sending domains, email sender and scheduler.
- Allow `/login/reset` and `/auth/callback` in Supabase Auth redirects. Test staff
  invite/reset links and participant PKCE links, with public signups disabled.
  Staff/runners use passwords; participants use email links only.
- Exercise self-registration end to end: apply at `/register`; confirm the
  application has no participant record, ID, financial totals or portal access; approve
  and confirm the email carries the participant ID; confirm a rejection without
  a reason is refused, and with a reason emails the applicant; submit the same
  email twice and confirm the second is told it is already waiting.
- Test role/programme isolation with real course-admin, viewer and finance accounts.
- Test portal matching/non-matching requests, expired/reused links, unknown and
  staff accounts; verify one participant cannot fetch another's proof, receipt or
  statement, including direct API calls. Test runner application ownership and
  direct verification refusal, not just the absence of a verification button.
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

`scripts/test-operations.mjs` applies 0001–0008 and uses a light seed to exercise
accounting, verification/claims, adjustments, plans, reconciliation, documents,
single-use resubmission, merge, anonymization, reporting, append-only audit and
staff guards. The removed OTP/participant-backed registration checks are replaced
by `scripts/test-phase2.mjs`:

- Legacy-data migration and refusal to discard unexpected financial records.
- Consent, notice version, programme validation and concurrent duplicate applications.
- No participant/ID/fees until approval; default fees, bursaries, decline reasons,
  audit/outbox atomicity and missing/forged staff actor refusal.
- Runner own-application RLS, idempotent pending capture, no payment updates or
  verification, no audit access, no role escalation, and suspended-runner refusal.
- A participant sees 1 of 20,001 records, only their 2 payments/POPs and own plan,
  no audit/applications and no self-edit access. Unknown, unverified, ambiguous,
  already-claimed and staff identities fail closed; email corrections and
  anonymization revoke old access.

The companion `test-phase2-web.mjs` checks the actual TypeScript actions/helpers
with mocked Auth/Next dependencies, including passwordless provisioning, callback
redirects, session/document access, notice validation and runner guards.
Run all suites with `npm test`. Supabase Auth, Storage and provider delivery are not
emulated by these SQL tests and still require the staging checks above.
