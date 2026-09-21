-- Phase 2: applications first, Supabase Auth participant portal, and runners.
-- Apply after 0007 HAS COMMITTED. Do not renumber or replace applied migrations.
-- Take a backup and pause writes during this migration. Legacy unapproved
-- participants are moved, not discarded; their complete old row is retained
-- privately on the application. Existing enrolled participants keep their IDs.

-- Fail rather than cascade-delete unexpected financial records belonging to a
-- legacy unapproved applicant. An operator must reconcile these before retrying.
lock table participants, payments, account_adjustments, payment_plans, notifications in share row exclusive mode;
do $$
begin
  if exists (
    select 1 from participants p where p.registration_status <> 'approved' and (
      exists(select 1 from payments where participant_id = p.id) or
      exists(select 1 from account_adjustments where participant_id = p.id) or
      exists(select 1 from payment_plans where participant_id = p.id)
    )
  ) then
    raise exception 'LEGACY_APPLICANT_HAS_FINANCIAL_RECORDS: reconcile before applying 0008';
  end if;
end $$;

create table applications (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  surname text not null,
  email citext,
  mobile text,
  programme_id uuid not null references programmes(id) on delete restrict,
  cohort_id uuid references cohorts(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  source text not null check (source in ('public','runner','legacy')),
  captured_by uuid references app_users(id) on delete set null,
  consent_given boolean not null,
  consent_at timestamptz,
  privacy_notice_version text not null check (length(privacy_notice_version) between 1 and 80),
  consent_method text not null check (consent_method in ('online','runner_declaration','legacy_unversioned')),
  check (consent_method = 'legacy_unversioned' or (consent_given and consent_at is not null)),
  decision_reason text,
  reviewed_by uuid references app_users(id) on delete set null,
  reviewed_at timestamptz,
  participant_id uuid references participants(id) on delete set null,
  approved_fee numeric(12,2) check (approved_fee >= 0),
  created_at timestamptz not null default now(),
  -- No FK: the old unapproved participant is removed from the register.
  legacy_participant_id uuid unique,
  legacy_participant_ref text,
  legacy_record jsonb,
  check (status <> 'declined' or coalesce(length(btrim(decision_reason)),0) > 0)
);
create index applications_queue_idx on applications(created_at, id) where status = 'pending';
create index applications_captured_idx on applications(captured_by, created_at desc);
create index applications_participant_idx on applications(participant_id);
create unique index applications_one_pending_email_idx on applications(email) where status = 'pending';

alter table applications enable row level security;
revoke all on applications from public, anon, authenticated;
grant select on applications to authenticated;
grant all on applications to service_role;
alter table notifications add column application_id uuid references applications(id) on delete set null;

-- Preserve the wording/version uncertainty of legacy consent; do not invent a
-- consent timestamp or claim that the new notice was shown to these applicants.
insert into applications(first_name,surname,email,mobile,programme_id,cohort_id,status,source,
  consent_given,consent_at,privacy_notice_version,consent_method,decision_reason,
  reviewed_by,reviewed_at,participant_id,approved_fee,created_at,
  legacy_participant_id,legacy_participant_ref,legacy_record)
select p.first_name,p.surname,p.email,p.mobile,p.programme_id,p.cohort_id,
  case p.registration_status when 'rejected' then 'declined' else p.registration_status end,'legacy',
  p.consent_at is not null,p.consent_at,'legacy-unversioned','legacy_unversioned',
  case when p.registration_status = 'rejected' then coalesce(nullif(btrim(p.registration_note),''),'Legacy rejection; reason not recorded') else p.registration_note end,
  p.reviewed_by,p.reviewed_at,
  case when p.registration_status = 'approved' then p.id end,
  case when p.registration_status = 'approved' then p.amount_due end,p.created_at,
  p.id,p.participant_ref,to_jsonb(p)
from participants p where p.registration_source = 'self' or p.registration_status <> 'approved';

-- Preserve the outbox/history before removing unapproved register entries.
update notifications n set application_id = a.id,
  participant_id = case when a.status = 'approved' then n.participant_id else null end
from applications a where n.participant_id = a.legacy_participant_id;
insert into audit_logs(action,entity_type,entity_id,summary,metadata)
select 'application.migrated','application',a.id::text,'Legacy application moved out of the participant register',
  jsonb_build_object('legacy_participant_id',a.legacy_participant_id,'legacy_participant_ref',a.legacy_participant_ref)
from applications a where a.status <> 'approved';
delete from participants where registration_status <> 'approved';

-- Retire the previous approval mechanism and custom OTP/session backend.
drop trigger payments_require_approved_participant on payments;
drop function enforce_approved_participant();
drop function approve_registration(uuid,uuid);
drop function reject_registration(uuid,text,uuid);
drop function issue_portal_otp(uuid,text);
drop function attempt_portal_otp(uuid);
drop table portal_otps;
update notifications set state = 'skipped', error = 'Legacy portal codes retired; request an email sign-in link', claimed_at = null
where template = 'portal_otp' and state <> 'sent';
alter table participants drop column registration_status;
alter table participants drop column registration_note;
alter table participants drop column reviewed_by;
alter table participants drop column reviewed_at;
alter table participants drop constraint participants_registration_source_check;
update participants set registration_source = 'application' where registration_source = 'self';
alter table participants add constraint participants_registration_source_check
  check (registration_source in ('registry','import','application'));
alter table participants add column auth_user_id uuid unique references auth.users(id) on delete set null;

-- Being an app_user is no longer synonymous with being an administrator.
-- Every existing staff-only policy using these helpers now excludes runners.
create or replace function is_admin() returns boolean language sql stable as $$
  select coalesce(current_role_of() in ('super_admin','finance_admin','course_admin','viewer'), false);
$$;
create or replace function in_programme_scope(p_programme_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from app_users u where u.id = auth.uid() and u.is_active
    and u.role <> 'runner' and (u.role <> 'course_admin' or cardinality(u.programme_ids) = 0
      or p_programme_id = any(u.programme_ids)));
$$;
-- can_verify_payments() deliberately remains an explicit allowlist that excludes
-- runner. The existing payments UPDATE/INSERT policies also exclude runner.
-- Cache request-constant checks as init plans. Without this, an OR-combined
-- staff/self policy can invoke security-definer lookups for every register row.
alter policy app_users_self on app_users using (id = (select auth.uid()) or (select is_admin()));
alter policy audit_read on audit_logs using ((select is_admin()));
alter policy verifications_read on payment_verifications using ((select is_admin()));
alter policy notifications_read on notifications using ((select is_admin()));
alter policy lines_read on bank_statement_lines using ((select is_admin()));
alter policy programmes_read on programmes using ((select is_admin()));
alter policy cohorts_read on cohorts using ((select is_admin()));
alter policy participants_read on participants using ((select is_admin()) and in_programme_scope(programme_id));
alter policy participants_update on participants
  using ((select current_role_of()) in ('super_admin','finance_admin'))
  with check ((select current_role_of()) in ('super_admin','finance_admin'));
alter policy participants_delete on participants using ((select is_super()));
alter policy payments_read on payments using ((select is_admin()) and in_programme_scope(programme_id));
alter policy payments_update on payments
  using ((select can_verify_payments()) and in_programme_scope(programme_id))
  with check ((select can_verify_payments()) and in_programme_scope(programme_id));
alter policy payments_delete on payments using ((select is_super()));
alter policy pops_read on pops using ((select is_admin()) and exists (
  select 1 from payments pm where pm.id = pops.payment_id and in_programme_scope(pm.programme_id)));
alter policy pops_write on pops
  using ((select current_role_of()) in ('super_admin','finance_admin'))
  with check ((select current_role_of()) in ('super_admin','finance_admin'));

alter table app_users add constraint runner_never_verifies check (role <> 'runner' or not can_verify);
create policy applications_staff_read on applications for select to authenticated
  using ((select is_admin()) and in_programme_scope(programme_id));
create policy applications_runner_read on applications for select to authenticated
  using ((select current_role_of()) = 'runner' and captured_by = (select auth.uid()));
create policy programmes_runner_read on programmes for select to authenticated
  using ((select current_role_of()) = 'runner' and is_active);

-- Public programme choices contain no participant or staff information.
create function registration_programmes() returns table(code text,name text,amount_due numeric)
language sql stable security definer set search_path = public as $$
  select code,name,amount_due from programmes where is_active order by name;
$$;
revoke all on function registration_programmes() from public;
grant execute on function registration_programmes() to anon, authenticated;

create function submit_application(p_first_name text,p_surname text,p_email text,p_mobile text,
  p_programme_code text,p_consent boolean,p_notice_version text,p_in_person boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_programme uuid; v_email citext := lower(btrim(p_email)); v_id uuid; v_actor uuid;
begin
  if not coalesce(p_consent,false) then raise exception 'CONSENT_REQUIRED'; end if;
  if p_notice_version is null or length(btrim(p_notice_version)) not between 1 and 80 then
    raise exception 'NOTICE_VERSION_REQUIRED';
  end if;
  if coalesce(length(btrim(p_first_name)),0) not between 1 and 100
     or coalesce(length(btrim(p_surname)),0) not between 1 and 100 then raise exception 'INVALID_NAME'; end if;
  if v_email is null or length(v_email) > 254 or v_email::text !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'INVALID_EMAIL';
  end if;
  if length(coalesce(p_mobile,'')) > 40 then raise exception 'INVALID_MOBILE'; end if;
  if coalesce(p_in_person,false) then
    if auth.uid() is null or not coalesce(current_role_of() = 'runner',false) then raise exception 'FORBIDDEN'; end if;
    v_actor := auth.uid();
  end if;
  select id into v_programme from programmes where code = btrim(p_programme_code) and is_active;
  if not found then raise exception 'UNKNOWN_PROGRAMME'; end if;
  -- Serialize repeat submissions across tabs, devices and server instances.
  perform pg_advisory_xact_lock(hashtextextended(v_email::text, 20260921));
  if exists(select 1 from applications where email = v_email and status in ('pending','approved'))
     or exists(select 1 from participants where email = v_email) then
    return jsonb_build_object('already_applied',true);
  end if;
  insert into applications(first_name,surname,email,mobile,programme_id,source,captured_by,
    consent_given,consent_at,privacy_notice_version,consent_method)
  values(btrim(p_first_name),btrim(p_surname),v_email,nullif(btrim(p_mobile),''),v_programme,
    case when v_actor is null then 'public' else 'runner' end,v_actor,
    true,now(),btrim(p_notice_version),case when v_actor is null then 'online' else 'runner_declaration' end)
  returning id into v_id;
  insert into audit_logs(actor_id,action,entity_type,entity_id,summary)
    values(v_actor,'application.submitted','application',v_id::text,'Application submitted; no participant ID issued');
  insert into notifications(application_id,template,recipient,payload)
    values(v_id,'registration_received',v_email,jsonb_build_object('name',btrim(p_first_name),
      'programme',(select name from programmes where id = v_programme)));
  -- Never expose IDs or another person's application details on public submission.
  return jsonb_build_object('already_applied',false);
end $$;
revoke all on function submit_application(text,text,text,text,text,boolean,text,boolean) from public;
grant execute on function submit_application(text,text,text,text,text,boolean,text,boolean) to anon,authenticated;

create function approve_application(p_application_id uuid,p_actor uuid,p_fee_override numeric default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a applications%rowtype; p participants%rowtype; v_fee numeric; v_programme text;
begin
  if auth.uid() is null or p_actor is distinct from auth.uid()
     or not coalesce(current_role_of() in ('super_admin','finance_admin'),false) then raise exception 'FORBIDDEN'; end if;
  select * into a from applications where id = p_application_id for update;
  if not found then raise exception 'APPLICATION_NOT_FOUND'; end if;
  if a.status <> 'pending' then raise exception 'ALREADY_REVIEWED'; end if;
  if not a.consent_given or a.consent_at is null then raise exception 'CONSENT_REQUIRED'; end if;
  -- Legacy missing consent must be recollected, not inferred from an old row.
  if a.email is null then raise exception 'INVALID_EMAIL'; end if;
  select amount_due,name into v_fee,v_programme from programmes where id = a.programme_id and is_active;
  if not found then raise exception 'UNKNOWN_PROGRAMME'; end if;
  v_fee := coalesce(p_fee_override,v_fee);
  if v_fee < 0 or v_fee > 9999999999.99 or v_fee <> round(v_fee,2) or v_fee::text = 'NaN' then raise exception 'INVALID_FEE'; end if;
  perform pg_advisory_xact_lock(hashtextextended(lower(a.email::text), 20260921));
  if exists(select 1 from participants where email = a.email) then raise exception 'PARTICIPANT_ALREADY_EXISTS'; end if;
  -- This is the first and only place an application consumes a participant ID.
  insert into participants(first_name,surname,email,mobile,programme_id,cohort_id,amount_due,consent_at,registration_source)
  values(a.first_name,a.surname,a.email,a.mobile,a.programme_id,a.cohort_id,v_fee,a.consent_at,'application') returning * into p;
  update applications set status = 'approved',participant_id = p.id,approved_fee = v_fee,
    reviewed_by = p_actor,reviewed_at = now() where id = a.id;
  insert into audit_logs(actor_id,actor_email,action,entity_type,entity_id,summary,metadata)
  values(p_actor,(select email from app_users where id = p_actor),'application.approved','application',a.id::text,
    'Application approved; participant ID issued',jsonb_build_object('participant_id',p.id,'participant_ref',p.participant_ref,'fee',v_fee));
  insert into notifications(application_id,participant_id,template,recipient,payload)
  values(a.id,p.id,'registration_approved',p.email,jsonb_build_object('name',p.first_name,
    'participant_ref',p.participant_ref,'programme',v_programme,'amount_due',v_fee));
  return jsonb_build_object('participant_id',p.id,'participant_ref',p.participant_ref);
end $$;

create function decline_application(p_application_id uuid,p_reason text,p_actor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a applications%rowtype;
begin
  if auth.uid() is null or p_actor is distinct from auth.uid()
     or not coalesce(current_role_of() in ('super_admin','finance_admin'),false) then raise exception 'FORBIDDEN'; end if;
  if coalesce(length(btrim(p_reason)),0) not between 1 and 2000 then raise exception 'DECLINE_REASON_REQUIRED'; end if;
  select * into a from applications where id = p_application_id for update;
  if not found then raise exception 'APPLICATION_NOT_FOUND'; end if;
  if a.status <> 'pending' then raise exception 'ALREADY_REVIEWED'; end if;
  update applications set status = 'declined',decision_reason = btrim(p_reason),reviewed_by = p_actor,reviewed_at = now() where id = a.id;
  insert into audit_logs(actor_id,action,entity_type,entity_id,summary,metadata)
  values(p_actor,'application.declined','application',a.id::text,'Application declined',jsonb_build_object('reason',btrim(p_reason)));
  insert into notifications(application_id,template,recipient,payload)
  values(a.id,'registration_rejected',a.email,jsonb_build_object('name',a.first_name,'reason',btrim(p_reason)));
end $$;
revoke all on function approve_application(uuid,uuid,numeric),decline_application(uuid,text,uuid) from public,anon;
grant execute on function approve_application(uuid,uuid,numeric),decline_application(uuid,text,uuid) to authenticated;

-- Bind only a verified Supabase identity to the exact email the institute holds.
-- Metadata supplied by the browser is never trusted. Ambiguous addresses fail
-- closed, and ALL staff accounts (including suspended staff/runners) are refused.
create function claim_participant_account() returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_email citext; v_id uuid; v_bound uuid; v_count int;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if exists(select 1 from app_users where id = v_uid) then raise exception 'STAFF_ACCOUNT'; end if;
  select lower(email)::citext into v_email from auth.users where id = v_uid and email_confirmed_at is not null;
  if v_email is null then raise exception 'EMAIL_NOT_VERIFIED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text,20260922));
  select id into v_id from participants where auth_user_id = v_uid;
  if found then return v_id; end if;
  select count(*) into v_count from participants where email = v_email;
  if v_count = 0 then return null; end if;
  if v_count <> 1 then raise exception 'AMBIGUOUS_EMAIL'; end if;
  select id,auth_user_id into v_id,v_bound from participants where email = v_email for update;
  if v_bound is not null and v_bound <> v_uid then raise exception 'ACCOUNT_ALREADY_CLAIMED'; end if;
  update participants set auth_user_id = v_uid where id = v_id;
  insert into audit_logs(actor_id,action,entity_type,entity_id,summary)
  values(v_uid,'participant.account_claimed','participant',v_id::text,'Verified email linked to participant account');
  return v_id;
end $$;
revoke all on function claim_participant_account() from public,anon;
grant execute on function claim_participant_account() to authenticated;

create function current_participant_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from participants where auth_user_id = auth.uid()
    and not exists(select 1 from app_users where id = auth.uid());
$$;
revoke all on function current_participant_id() from public,anon;
grant execute on function current_participant_id() to authenticated;
create policy participants_self_read on participants for select to authenticated using (id = (select current_participant_id()));
create policy payments_self_read on payments for select to authenticated using (participant_id = (select current_participant_id()));
create policy pops_self_read on pops for select to authenticated using (
  exists(select 1 from payments p where p.id = pops.payment_id and p.participant_id = (select current_participant_id()))
);
create policy plans_self_read on payment_plans for select to authenticated using (participant_id = (select current_participant_id()));
create policy programmes_self_read on programmes for select to authenticated using (
  exists(select 1 from participants p where p.id = (select current_participant_id()) and p.programme_id = programmes.id)
);
-- No self-write policies, and no participant policies on applications/audit_logs.

create function guard_participant_binding() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- A registry email correction revokes the old account's access immediately.
  if tg_op = 'UPDATE' and new.email is distinct from old.email then new.auth_user_id := null; end if;
  if new.auth_user_id is not null and (tg_op = 'INSERT' or new.auth_user_id is distinct from old.auth_user_id) then
    perform pg_advisory_xact_lock(hashtextextended(new.auth_user_id::text,20260922));
    if new.auth_user_id is distinct from auth.uid()
       or exists(select 1 from app_users where id = new.auth_user_id)
       or not exists(select 1 from auth.users where id = new.auth_user_id and email_confirmed_at is not null and lower(email)::citext = new.email) then
      raise exception 'INVALID_PARTICIPANT_BINDING';
    end if;
  end if;
  return new;
end $$;
create trigger participant_binding_guard before insert or update of auth_user_id,email on participants
for each row execute function guard_participant_binding();
create function guard_staff_binding() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.id::text,20260922));
  if exists(select 1 from participants where auth_user_id = new.id) then raise exception 'PARTICIPANT_ACCOUNT_CANNOT_BE_STAFF'; end if;
  return new;
end $$;
create trigger staff_binding_guard before insert or update of id on app_users for each row execute function guard_staff_binding();

-- Runner lookup is exact-reference-only, never a register export. Capture is a
-- constrained security-definer RPC: a runner gets no INSERT/UPDATE table rights.
alter table payments add column captured_by uuid references app_users(id) on delete set null;
alter table payments add column capture_request_id uuid;
create unique index runner_capture_request_idx on payments(captured_by,capture_request_id) where capture_request_id is not null;
create function runner_participant_lookup(p_ref text)
returns table(participant_ref text,full_name text,programme text)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not coalesce(current_role_of() = 'runner',false) then raise exception 'FORBIDDEN'; end if;
  return query select p.participant_ref,p.full_name,pr.name from participants p
    join programmes pr on pr.id = p.programme_id where p.participant_ref = upper(btrim(p_ref));
end $$;
create function capture_runner_payment(p_ref text,p_amount numeric,p_date date,p_method payment_method,
  p_reference text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p participants%rowtype; pm payments%rowtype;
begin
  if auth.uid() is null or not coalesce(current_role_of() = 'runner',false) then raise exception 'FORBIDDEN'; end if;
  if p_request_id is null then raise exception 'REQUEST_ID_REQUIRED'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 9999999999.99 or p_amount <> round(p_amount,2) or p_amount::text = 'NaN' then raise exception 'INVALID_AMOUNT'; end if;
  if p_date is null or p_date > (now() at time zone 'Africa/Johannesburg')::date or p_date < date '2000-01-01' then raise exception 'INVALID_DATE'; end if;
  if p_method is null or p_method not in ('cash','card') then raise exception 'INVALID_METHOD'; end if;
  if length(coalesce(p_reference,'')) > 200 then raise exception 'INVALID_REFERENCE'; end if;
  select * into p from participants where participant_ref = upper(btrim(p_ref));
  if not found then raise exception 'PARTICIPANT_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || p_request_id::text,20260923));
  select * into pm from payments where captured_by = auth.uid() and capture_request_id = p_request_id;
  if found then
    if pm.participant_id <> p.id or pm.amount <> p_amount or pm.payment_date <> p_date
       or pm.method <> p_method or pm.reference is distinct from nullif(btrim(p_reference),'') then raise exception 'REQUEST_ALREADY_USED'; end if;
    return jsonb_build_object('payment_ref',pm.payment_ref,'status',pm.status,'already_recorded',true);
  end if;
  insert into payments(participant_id,programme_id,amount,payment_date,method,reference,status,submitted_channel,captured_by,capture_request_id)
  values(p.id,p.programme_id,p_amount,p_date,p_method,nullif(btrim(p_reference),''),'pending_review','runner',auth.uid(),p_request_id)
  returning * into pm;
  perform detect_duplicate_payment(pm.id);
  insert into audit_logs(actor_id,action,entity_type,entity_id,summary)
  values(auth.uid(),'payment.runner_captured','payment',pm.id::text,'Runner recorded money received; awaiting independent verification');
  insert into notifications(participant_id,payment_id,template,recipient,payload)
  values(p.id,pm.id,'payment_captured',p.email,jsonb_build_object('payment_ref',pm.payment_ref,'amount',pm.amount));
  return jsonb_build_object('payment_ref',pm.payment_ref,'status',pm.status,'already_recorded',false);
end $$;
revoke all on function runner_participant_lookup(text),capture_runner_payment(text,numeric,date,payment_method,text,uuid) from public,anon;
grant execute on function runner_participant_lookup(text),capture_runner_payment(text,numeric,date,payment_method,text,uuid) to authenticated;

-- Remove OTP dependencies from the existing server-only registry operations.
create or replace function merge_participants(p_source uuid,p_target uuid,p_actor_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare offset_no int;
begin
  if p_source = p_target then raise exception 'SAME_PARTICIPANT'; end if;
  perform 1 from participants where id in (p_source,p_target) order by id for update;
  if (select count(*) from participants where id in (p_source,p_target)) <> 2 then raise exception 'PARTICIPANT_NOT_FOUND'; end if;
  if exists(select 1 from participants where id = p_source and auth_user_id is not null) then raise exception 'LINKED_PARTICIPANT_CANNOT_BE_MERGED'; end if;
  update payments set participant_id = p_target where participant_id = p_source;
  update account_adjustments set participant_id = p_target where participant_id = p_source;
  select coalesce(max(instalment_no),0) into offset_no from payment_plans where participant_id = p_target;
  update payment_plans set participant_id = p_target,instalment_no = instalment_no + offset_no where participant_id = p_source;
  update notifications set participant_id = p_target where participant_id = p_source;
  update applications set participant_id = p_target where participant_id = p_source;
  delete from participants where id = p_source;
  perform recalculate_participant(p_target);
  insert into audit_logs(actor_id,action,entity_type,entity_id,summary,metadata)
  values(p_actor_id,'participant.merged','participant',p_target::text,'Participant merged',jsonb_build_object('source',p_source));
end $$;
create or replace function anonymize_participant(p_participant_id uuid,p_actor_id uuid default null)
returns text[] language plpgsql security definer set search_path = public as $$
declare paths text[];
begin
  perform 1 from participants where id = p_participant_id for update;
  if not found then raise exception 'PARTICIPANT_NOT_FOUND'; end if;
  select coalesce(array_agg(storage_path),'{}') into paths from pops where payment_id in(select id from payments where participant_id = p_participant_id);
  delete from pops where payment_id in(select id from payments where participant_id = p_participant_id);
  delete from resubmit_tokens where payment_id in(select id from payments where participant_id = p_participant_id);
  update participants set first_name = 'Anonymized',surname = participant_ref,email = null,mobile = null,notes = null,consent_at = null,auth_user_id = null where id = p_participant_id;
  update applications set first_name = 'Anonymized',surname = '',email = null,mobile = null,decision_reason = 'Redacted',legacy_record = null
    where participant_id = p_participant_id;
  update payments set reference = null,bank = null,admin_notes = null,rejection_reason = null where participant_id = p_participant_id;
  update account_adjustments set reason = 'Redacted',decision_note = null where participant_id = p_participant_id;
  update notifications set recipient = null,payload = '{}',state = 'skipped',error = 'Participant anonymized'
    where participant_id = p_participant_id or application_id in(select id from applications where participant_id = p_participant_id);
  insert into audit_logs(actor_id,action,entity_type,entity_id,summary)
  values(p_actor_id,'participant.anonymized','participant',p_participant_id::text,'Personal information redacted; portal access revoked');
  return paths;
end $$;

-- Refresh the REST API's function/table cache after the transaction commits.
notify pgrst, 'reload schema';
