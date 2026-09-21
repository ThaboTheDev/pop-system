# Phase 2 handover: applications, participant portal, runners

## 1. Confirm the authoritative database before deployment

**The live Vercel project has not been inspected or changed by this implementation.**
Confirm its `NEXT_PUBLIC_SUPABASE_URL` in Vercel and tell Tshidiso which project is
being used. The external Phase 2 brief names `xtzzclqrmcgetsbdczua`; this checkout
contains neither that project's credentials nor proof that it is the live database.

Use one authoritative project. If switching projects, move/reconcile production
participants, payments and private storage first; do not simply point a deployed
site at a seed database. Set the URL, anon/publishable key and server service-role
key from the **same** project. Recreate staff accounts when necessary.

### Migration numbering matters

The external brief's `0004_reference_index.sql`, `0005_runner_role.sql` and
`0006_registration_portal.sql` are **not** this repository's migrations. Versions
0004–0006 were already used here for operations, email-only delivery and the
retired participant-backed registration flow. Do not rename/rewrite applied
history or apply either set based on version numbers alone.

This implementation adds forward migrations:

1. `0007_runner_role.sql` — adds runner and in-person cash enum values.
2. **Commit 0007 on its own.**
3. `0008_registration_portal.sql` — applications, portal binding/RLS, constrained
   runner capture and retirement of the old registration/OTP implementation.

For a database that already has this repository's 0001–0006:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/migrations/0007_runner_role.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/migrations/0008_registration_portal.sql
```

Separate `psql` invocations/transactions are intentional. A fresh installation
runs 0001–0008 in order, with each file in its own transaction. If the chosen
project already contains the **other** Phase 2 schema, inspect its schema and
migration history and prepare a reviewed reconciliation migration instead. These
forward migrations target the previous schema in this repository, not an unknown
remote schema. No production migrations have been run in this session.

### Safe upgrade procedure

- Take and verify database and private-storage backups. Rehearse on a restored
  staging copy, not the production database or another person's seed project.
- Pause submissions, staff writes and delivery workers; do not run old and new
  application instances against the schema at the same time.
- Apply 0007 and then 0008, deploy matching code and configure Auth (below).
- Check counts, balances, legacy applications and outbox rows before reopening.
- Recovery requires the matching pre-upgrade backup/code, not blindly reversing
  the data-moving migration. There is no automatic down migration.

Existing enrolled participants retain their IDs and financial records. Legacy
pending/rejected participant rows become applications and leave financial totals.
Their old IDs and full rows are preserved in staff-visible legacy fields, with an
audit breadcrumb. Old hidden IDs are retired, never reused; approval issues a
new ID. Existing approved self-registrations retain application history too.
Outbox history is relinked before any unapproved register row is removed.

**Safety stop:** an unapproved legacy participant with payments, adjustments or a
payment plan aborts the migration (`LEGACY_APPLICANT_HAS_FINANCIAL_RECORDS`). Resolve
that record explicitly before retrying; the migration will not cascade-delete it.

Legacy consent is labelled `legacy-unversioned`, with the original timestamp or
lack of one. No consent is invented. A pending legacy application without consent
cannot be approved: decline it with instructions to reapply after reading the notice.

## 2. Registration and approval

- `/register` submits to `applications` through `submit_application()`. It does
  not create a participant, consume a Participant ID, or add a fee to the register.
- Consent, database timestamp, notice version and consent method are recorded.
  Unknown/inactive programmes and missing consent/version are refused in SQL.
- Repeat/concurrent applications for an email return “already applied”; no second
  waiting row or notification is created. A declined applicant may apply again.
- `/applications` is the staff queue, oldest first and paginated. The sidebar badge
  reads this table, not `participants`. Course-admin visibility respects programme scope.
- Active finance/super administrators call `approve_application()`. It creates
  the participant/ID, uses the **current** programme fee or an explicit bursary
  override (including zero), records the decision and queues the approval email
  in a single transaction. Double approval and actor spoofing are refused.
- `decline_application()` requires a reason, records it and queues it for email.
  No participant is created. Direct application table writes are not granted to
  anonymous or authenticated clients; transitions go through the checked RPCs.

The privacy notice is in `src/components/PrivacyNotice.tsx`. Increment
`PRIVACY_NOTICE_VERSION` in `src/lib/types.ts` whenever its wording changes.
The information officer must confirm institute-specific retention/contact details
before launch; a checkbox is not a complete POPIA compliance programme.

## 3. Participant portal

- `/portal/login` asks only for the institute-held email address and emails a
  Supabase magic link. `/auth/callback` exchanges its PKCE code; open the link in
  the same browser that requested it. No participant password, ID or six-digit code.
- Public Supabase Auth signups can remain disabled: the server pre-provisions
  only an unambiguously enrolled, non-staff email using the service role, without
  a password, then requests a link with `shouldCreateUser: false`. Mailbox
  possession is still required to obtain a session. Unknown/pending/staff emails
  receive the same public response, not a new account or participant data.
- `claim_participant_account()` uses `auth.uid()` and the verified email in
  `auth.users`, **never client metadata**. Unknown addresses get a polite dead
  end, ambiguous emails fail closed, and all staff/runner accounts (even suspended
  ones) are refused. A participant record cannot be stolen from another auth user.
- `/portal` reads using the participant's Supabase JWT, not a service-role client.
  `participants_self_read`, `payments_self_read`, `pops_self_read` and plan/programme
  policies enforce ownership in Postgres. Participants see no applications/audit.
- Details are read-only. History is paginated, with own proof documents, receipts,
  payment plan and statement. Existing clarification resubmission remains supported.
  Document endpoints authorise their data reads through the same participant RLS;
  the server signs storage URLs only after that check.
- A registry email correction clears the binding immediately. Anonymization also
  revokes access and redacts linked application data. Merging a *source* record
  already bound to an auth account is refused for explicit registry resolution.

The old HMAC `pop_portal` session, `PORTAL_SECRET`, OTP issuance/attempt functions,
OTP table and OTP mail template are retired. Old cookies are ignored. Unsent OTP
emails are marked skipped. `/portal/home`, `/portal/verify` and `/registrations`
are bookmark redirects only; they do not retain parallel workflows.

### Required Supabase Auth configuration

1. Enable email sign-in. Set the Site URL to the deployed `APP_URL` origin.
2. Allow the deployed origin and `https://<domain>/auth/callback` in Auth redirect
   URLs. Keep `/login/reset` allowed for **staff/runner** invitations and resets.
3. Use the normal magic-link template with `{{ .ConfirmationURL }}` so PKCE
   confirmation returns to the callback. A custom token-hash template needs a
   separate implementation; do not point it at a non-existent `/auth/confirm`.
4. Connect a production SMTP provider and check Auth email rate limits before intake.
   `RESEND_API_KEY` for the application outbox does **not** configure Auth SMTP.
5. Test first-time pre-provisioning, returning-user links, expired/reused links,
   same-browser callback and unknown/staff addresses on the actual staging project.

## 4. Runners

Invite/select the `runner` role at `/users`. Staff and runners use `/login`;
runner accounts are redirected to `/runner` instead of the staff dashboard.

- `/runner/register` submits an application. Its required declaration confirms
  the runner explained the same notice in person and obtained the applicant's
  consent. `captured_by` is derived from the authenticated identity in SQL.
- `/runner` shows only applications this runner captured, enforced by RLS.
- `/runner/capture` looks up an **exact approved Participant ID**, shows minimal
  identity/programme details, and records cash/card money received for review.
  `capture_runner_payment()` always inserts `pending_review`, records the runner
  and audit event, and queues an acknowledgement, not a verified receipt.
- Capture uses a per-form request ID to avoid double-recording after a retry.
- Runners have no participant-list/export, payment update, verification, application
  approval, audit-read or staff-management permissions. `is_admin()` explicitly
  excludes them; `can_verify_payments()` and the payments UPDATE policy refuse them,
  even through a direct database/API call. They cannot be granted `can_verify`.

## 5. Notifications and remaining deployment work

The working Resend outbox processor is **retained**, not removed to recreate the
brief's historical “not done” item. Submission, application decisions and runner
captures queue mail transactionally, with prompt post-response processing and the
existing daily sweep as a backstop. Approval mails include the new Participant ID,
programme and agreed fee. Supabase Auth sends sign-in links separately.

Configure and test SMTP, Resend, redirect URLs, cron, delivery monitoring and
production rate limiting. The in-process public-form limiter is not a distributed
abuse control; apply an edge/shared limiter before a large intake. No SMS sign-in
or participant self-editing is added. Production operation/provider delivery is
not established by local tests alone.

## 6. Verification

```bash
npm ci
npm run typecheck
npm run build
npm test
```

`test:operations` applies all eight migrations to temporary real PostgreSQL and
checks existing accounting, reconciliation, documents, merge/anonymization and
staff guards. `test:phase2` separately tests the forward upgrade with legacy data,
refusal of unsafe migration, consent/programme validation, concurrent duplicates,
approval/bursaries/audit/outbox, runner restrictions and participant isolation.
It tests one visible participant out of 20,001, two own payments and POPs, no
applications/audit, no self-edits, and unknown/unverified/ambiguous/staff identities.
Tests use stub Supabase auth/storage schemas and never send emails or touch live data.

`test:phase2-web` runs the actual TypeScript server actions/helpers with mocked
dependencies: eligible Auth pre-provisioning without open signup/passwords,
non-enumerating responses, fixed callback redirects, session binding/dead ends,
request-JWT document access, notice validation and runner route/capability guards.
