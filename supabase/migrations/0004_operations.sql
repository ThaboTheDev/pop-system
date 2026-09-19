-- Operations. New relations are default-deny; token material is server-only.
alter table payments add column claimed_by uuid references app_users(id) on delete set null;
alter table payments add column claimed_at timestamptz;
alter table participants add column consent_at timestamptz;
-- Use text for worker states, avoiding enum-value use in the migration transaction.
drop index notifications_state_idx;
alter table notifications alter column state drop default;
alter table notifications alter column state type text using state::text;
alter table notifications alter column state set default 'queued';
alter table notifications add constraint notifications_state_check check (state in ('queued','processing','sent','failed','skipped'));
alter table notifications add column claimed_at timestamptz;
create index notifications_state_idx on notifications(state,created_at) where state='queued';

create table account_adjustments (
 id uuid primary key default gen_random_uuid(),
 participant_id uuid not null references participants(id) on delete cascade,
 amount numeric(12,2) not null check (amount <> 0), reason text not null check (length(trim(reason)) > 0),
 status text not null default 'pending' check (status in ('pending','approved','rejected')),
 requested_by uuid references app_users(id), created_at timestamptz not null default now(),
 decided_by uuid references app_users(id), decided_at timestamptz, decision_note text
);
create table payment_plans (
 id uuid primary key default gen_random_uuid(), participant_id uuid not null references participants(id) on delete cascade,
 instalment_no int not null check(instalment_no > 0), amount numeric(12,2) not null check(amount > 0),
 due_date date not null, paid_at timestamptz, paid_payment_id uuid references payments(id) on delete set null,
 created_at timestamptz not null default now(), unique(participant_id, instalment_no)
);
create table resubmit_tokens (
 id uuid primary key default gen_random_uuid(), payment_id uuid not null references payments(id) on delete cascade,
 token_hash text not null unique, expires_at timestamptz not null, used_at timestamptz,
 created_at timestamptz not null default now()
);
create table bank_statement_lines (
 id uuid primary key default gen_random_uuid(), batch_id uuid not null, line_no int not null check(line_no > 0),
 tx_date date not null, description text, reference text, amount numeric(12,2) not null,
 matched_payment_id uuid references payments(id) on delete set null,
 status text not null default 'unmatched' check(status in ('unmatched','matched','ignored')),
 created_at timestamptz not null default now(), unique(batch_id,line_no),
 check ((status = 'matched') = (matched_payment_id is not null))
);
create unique index bank_line_one_match on bank_statement_lines(matched_payment_id) where matched_payment_id is not null;
create table portal_otps (
 id uuid primary key default gen_random_uuid(), participant_id uuid not null references participants(id) on delete cascade,
 code_hash text not null, expires_at timestamptz not null, attempts int not null default 0 check(attempts between 0 and 5),
 consumed_at timestamptz, created_at timestamptz not null default now()
);
create index portal_otps_participant on portal_otps(participant_id, created_at);
create index adjustments_participant on account_adjustments(participant_id);
create index plans_overdue on payment_plans(due_date) where paid_at is null;

alter table account_adjustments enable row level security;
alter table payment_plans enable row level security;
alter table resubmit_tokens enable row level security;
alter table bank_statement_lines enable row level security;
alter table portal_otps enable row level security;
revoke all on resubmit_tokens, portal_otps from anon, authenticated;
grant all on resubmit_tokens, portal_otps to service_role;
create policy adjustments_read on account_adjustments for select to authenticated using
 (is_admin() and exists(select 1 from participants p where p.id=participant_id and in_programme_scope(p.programme_id)));
create policy adjustments_write on account_adjustments for all to authenticated using
 (current_role_of() in ('super_admin','finance_admin')) with check(current_role_of() in ('super_admin','finance_admin'));
create policy plans_read on payment_plans for select to authenticated using
 (is_admin() and exists(select 1 from participants p where p.id=participant_id and in_programme_scope(p.programme_id)));
create policy plans_write on payment_plans for all to authenticated using
 (current_role_of() in ('super_admin','finance_admin')) with check(current_role_of() in ('super_admin','finance_admin'));
create policy lines_read on bank_statement_lines for select to authenticated using(is_admin());
create policy lines_write on bank_statement_lines for all to authenticated using
 (current_role_of() in ('super_admin','finance_admin')) with check(current_role_of() in ('super_admin','finance_admin'));
create policy notifications_insert on notifications for insert to authenticated with check(current_role_of() in ('super_admin','finance_admin'));

create or replace function recalculate_participant(p_participant_id uuid)
returns void language plpgsql as $$
declare
  v_paid      numeric(12,2);
  v_due       numeric(12,2);
  v_pops      integer;
  v_last      date;
  v_open      integer;   -- payments still in the verification pipeline
  v_rejected  integer;
  v_status    participant_status;
  v_override  participant_status;
begin
  -- Lock the participant row so concurrent verifications serialise.
  select amount_due, status_override into v_due, v_override
    from participants where id = p_participant_id for update;
  if not found then return; end if;

  select
    coalesce(sum(amount) filter (where status = 'verified'), 0),
    count(*),
    max(payment_date) filter (where status = 'verified'),
    count(*) filter (where status in ('pending_review','under_review','requires_clarification')),
    count(*) filter (where status = 'rejected')
  into v_paid, v_pops, v_last, v_open, v_rejected
  from payments where participant_id = p_participant_id;

  v_paid := v_paid + coalesce((select sum(amount) from account_adjustments where participant_id = p_participant_id and status = 'approved'), 0);

  if v_due > 0 and v_paid >= v_due then
    v_status := 'fully_paid';
  elsif v_paid > 0 then
    v_status := 'partially_paid';
  elsif v_open > 0 then
    v_status := 'verification_pending';
  elsif v_rejected > 0 then
    v_status := 'payment_issue';
  else
    v_status := 'not_paid';
  end if;

  update participants set
    amount_paid       = v_paid,
    pop_count         = v_pops,
    last_payment_date = v_last,
    payment_status    = coalesce(v_override, v_status),
    updated_at        = now()
  where id = p_participant_id;
end $$;


create trigger adjustments_rollup after insert or update or delete on account_adjustments
 for each row execute function payments_rollup_trigger();

create or replace function decide_payment(
  p_payment_id uuid,
  p_to_status  payment_status,
  p_actor_id   uuid,
  p_reason     text default null,
  p_note       text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_from  payment_status;
  v_email text;
  v_pref  text;
  v_part  uuid;
begin
  if auth.role() <> 'service_role' then
    if p_actor_id is distinct from auth.uid() or not coalesce(can_verify_payments(), false)
       or not exists (select 1 from payments where id=p_payment_id and in_programme_scope(programme_id)) then
      raise exception 'FORBIDDEN';
    end if;
  end if;
  select status, participant_id, payment_ref into v_from, v_part, v_pref
    from payments where id = p_payment_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0002'; end if;

  if exists (select 1 from payments where id=p_payment_id and claimed_by is not null
      and claimed_by is distinct from p_actor_id) and auth.role() <> 'service_role' and not coalesce(is_super(),false) then
    raise exception 'CLAIMED_BY_ANOTHER';
  end if;
  if p_to_status = 'rejected' and coalesce(trim(p_reason), '') = '' then
    raise exception 'REJECTION_REASON_REQUIRED' using errcode = 'P0001';
  end if;

  select email into v_email from app_users where id = p_actor_id;

  update payments set
    status           = p_to_status,
    claimed_by = null, claimed_at = null,
    verified_by      = case when p_to_status = 'verified' then p_actor_id else verified_by end,
    verified_at      = case when p_to_status = 'verified' then now() else verified_at end,
    rejection_reason = case when p_to_status = 'rejected' then p_reason else rejection_reason end,
    admin_notes      = coalesce(nullif(trim(p_note), ''), admin_notes)
  where id = p_payment_id;

  insert into payment_verifications (payment_id, actor_id, actor_email, from_status, to_status, reason, note)
  values (p_payment_id, p_actor_id, v_email, v_from, p_to_status, p_reason, p_note);

  insert into audit_logs (actor_id, actor_email, action, entity_type, entity_id, summary, metadata)
  values (p_actor_id, v_email, 'payment.' || p_to_status::text, 'payment', p_payment_id::text,
          format('%s moved from %s to %s', v_pref, v_from, p_to_status),
          jsonb_build_object('reason', p_reason));

  if p_to_status in ('verified','rejected','requires_clarification') then
    insert into notifications (participant_id, payment_id, template, recipient, payload)
    select v_part, p_payment_id,
           case when p_to_status = 'verified' then 'payment_verified' when p_to_status = 'rejected' then 'payment_rejected' else 'clarification_requested' end,
           pt.email, jsonb_build_object('payment_ref', v_pref, 'reason', p_reason)
      from participants pt where pt.id = v_part;
  end if;

  return jsonb_build_object('payment_id', p_payment_id, 'from', v_from, 'to', p_to_status);
end $$;


-- Claims are compare-and-set operations, never read-then-write.
create function claim_payment(p_payment_id uuid, p_release boolean default false) returns boolean
language plpgsql security definer set search_path=public as $$
declare n int;
begin
 if not coalesce(can_verify_payments(),false) then raise exception 'FORBIDDEN'; end if;
 if p_release then
  update payments set claimed_by=null, claimed_at=null where id=p_payment_id
   and in_programme_scope(programme_id) and (claimed_by=auth.uid() or is_super());
 else
  update payments set claimed_by=auth.uid(), claimed_at=now() where id=p_payment_id
   and in_programme_scope(programme_id) and (claimed_by is null or claimed_by=auth.uid())
   and status in ('pending_review','under_review','requires_clarification');
 end if;
 get diagnostics n = row_count;
 return n=1;
end $$;
revoke all on function claim_payment(uuid,boolean) from public,anon;
grant execute on function claim_payment(uuid,boolean) to authenticated;

create function attach_pop(p_payment_id uuid, p_storage_path text, p_file_name text,
 p_mime_type text, p_file_size bigint, p_file_hash text, p_actor_id uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if p_mime_type not in ('application/pdf','image/jpeg','image/png') or p_file_size not between 1 and 10485760 then
  raise exception 'INVALID_DOCUMENT';
 end if;
 insert into pops(payment_id,storage_path,file_name,mime_type,file_size,file_hash,uploaded_by)
 values(p_payment_id,p_storage_path,p_file_name,p_mime_type,p_file_size,p_file_hash,p_actor_id) returning id into v_id;
 perform detect_duplicate_payment(p_payment_id);
 insert into audit_logs(actor_id,action,entity_type,entity_id,summary)
 values(p_actor_id,'pop.attached','payment',p_payment_id::text,'Additional document attached');
 return v_id;
end $$;

create function merge_participants(p_source uuid, p_target uuid, p_actor_id uuid default null)
returns void language plpgsql security definer set search_path=public as $$
declare offset_no int;
begin
 if p_source=p_target then raise exception 'SAME_PARTICIPANT'; end if;
 perform 1 from participants where id in (p_source,p_target) order by id for update;
 if (select count(*) from participants where id in (p_source,p_target)) <> 2 then raise exception 'PARTICIPANT_NOT_FOUND'; end if;
 update payments set participant_id=p_target where participant_id=p_source;
 update account_adjustments set participant_id=p_target where participant_id=p_source;
 select coalesce(max(instalment_no),0) into offset_no from payment_plans where participant_id=p_target;
 update payment_plans set participant_id=p_target,instalment_no=instalment_no+offset_no where participant_id=p_source;
 update notifications set participant_id=p_target where participant_id=p_source;
 delete from portal_otps where participant_id=p_source;
 delete from participants where id=p_source;
 perform recalculate_participant(p_target);
 insert into audit_logs(actor_id,action,entity_type,entity_id,summary,metadata)
 values(p_actor_id,'participant.merged','participant',p_target::text,'Participant merged',jsonb_build_object('source',p_source));
end $$;

-- Returns storage paths for the caller to delete from the private bucket.
-- Audit history is retained, never rewritten.
create function anonymize_participant(p_participant_id uuid,p_actor_id uuid default null)
returns text[] language plpgsql security definer set search_path=public as $$
declare paths text[];
begin
 perform 1 from participants where id=p_participant_id for update;
 if not found then raise exception 'PARTICIPANT_NOT_FOUND'; end if;
 select coalesce(array_agg(storage_path),'{}') into paths from pops where payment_id in(select id from payments where participant_id=p_participant_id);
 delete from pops where payment_id in(select id from payments where participant_id=p_participant_id);
 delete from resubmit_tokens where payment_id in(select id from payments where participant_id=p_participant_id);
 delete from portal_otps where participant_id=p_participant_id;
 update participants set first_name='Anonymized',surname=participant_ref,email=null,mobile=null,notes=null,consent_at=null where id=p_participant_id;
 update payments set reference=null,bank=null,admin_notes=null,rejection_reason=null where participant_id=p_participant_id;
 update account_adjustments set reason='Redacted',decision_note=null where participant_id=p_participant_id;
 update notifications set recipient=null,payload='{}',state='skipped',error='Participant anonymized' where participant_id=p_participant_id;
 insert into audit_logs(actor_id,action,entity_type,entity_id,summary)
 values(p_actor_id,'participant.anonymized','participant',p_participant_id::text,'Personal information redacted');
 return paths;
end $$;
revoke all on function attach_pop(uuid,text,text,text,bigint,text,uuid),
 merge_participants(uuid,uuid,uuid),anonymize_participant(uuid,uuid) from public,anon,authenticated;
grant execute on function attach_pop(uuid,text,text,text,bigint,text,uuid),
 merge_participants(uuid,uuid,uuid),anonymize_participant(uuid,uuid) to service_role;

create function arrears_report() returns table(participant_id uuid,participant_ref text,full_name text,outstanding numeric,overdue numeric,oldest_due date)
language sql stable security invoker as $$
 select p.id,p.participant_ref,p.full_name,p.outstanding,sum(pp.amount),min(pp.due_date)
 from participants p join payment_plans pp on pp.participant_id=p.id
 where pp.paid_at is null and pp.due_date<current_date and p.outstanding>0
 group by p.id order by min(pp.due_date);
$$;
create function admin_throughput(p_days int default 30)
returns table(actor_id uuid,actor_email text,verified bigint,rejected bigint,clarifications bigint)
language sql stable security invoker as $$
 select v.actor_id,v.actor_email,count(*) filter(where to_status='verified'),
 count(*) filter(where to_status='rejected'),count(*) filter(where to_status='requires_clarification')
 from payment_verifications v where created_at>=now()-make_interval(days=>greatest(1,least(p_days,366)))
 group by v.actor_id,v.actor_email;
$$;
create function duplicate_report() returns table(payment_id uuid,payment_ref text,participant_id uuid,amount numeric,reason text)
language sql stable security invoker as $$
 select id,payment_ref,participant_id,amount,duplicate_reason from payments where duplicate_flag or status='duplicate';
$$;
revoke all on function arrears_report(),admin_throughput(int),duplicate_report() from public,anon;
grant execute on function arrears_report(),admin_throughput(int),duplicate_report() to authenticated,service_role;

-- Serialize OTP issuance and attempts in Postgres, including across server instances.
create function issue_portal_otp(p_participant_id uuid,p_code_hash text) returns uuid
language plpgsql security definer set search_path=public as $$
declare result uuid;
begin
 perform 1 from participants where id=p_participant_id for update;
 if (select count(*) from portal_otps where participant_id=p_participant_id and created_at>now()-interval '1 hour')>=5 then return null; end if;
 insert into portal_otps(participant_id,code_hash,expires_at) values(p_participant_id,p_code_hash,now()+interval '10 minutes') returning id into result;
 return result;
end $$;
-- Reserves an attempt before returning the hash for a timing-safe server comparison.
create function attempt_portal_otp(p_id uuid) returns text
language plpgsql security definer set search_path=public as $$
declare result text;
begin
 update portal_otps set attempts=attempts+1 where id=p_id and attempts<5 and consumed_at is null and expires_at>now() returning code_hash into result;
 return result;
end $$;
create function finish_resubmit(p_token_hash text,p_documents jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare t resubmit_tokens%rowtype; d jsonb;
begin
 select * into t from resubmit_tokens where token_hash=p_token_hash for update;
 if not found or t.used_at is not null or t.expires_at<=now() then raise exception 'INVALID_TOKEN'; end if;
 if jsonb_array_length(p_documents) not between 1 and 2 then raise exception 'INVALID_DOCUMENT_COUNT'; end if;
 perform 1 from payments where id=t.payment_id and status in ('requires_clarification','rejected') for update;
 if not found then raise exception 'PAYMENT_NOT_RESUBMITTABLE'; end if;
 for d in select * from jsonb_array_elements(p_documents) loop
  perform attach_pop(t.payment_id,d->>'path',d->>'name',d->>'mime',(d->>'size')::bigint,d->>'hash');
 end loop;
 perform decide_payment(t.payment_id,'pending_review',null,null,'Participant resubmitted documents');
 update resubmit_tokens set used_at=now() where id=t.id;
 return t.payment_id;
end $$;
revoke all on function issue_portal_otp(uuid,text),attempt_portal_otp(uuid),finish_resubmit(text,jsonb) from public,anon,authenticated;
grant execute on function issue_portal_otp(uuid,text),attempt_portal_otp(uuid),finish_resubmit(text,jsonb) to service_role;
create function submit_payment_documents(p_ref text,p_amount numeric,p_date date,p_reference text,p_method payment_method,p_bank text,p_documents jsonb,p_consent boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; d jsonb; n int:=0;
begin
 if not coalesce(p_consent,false) then raise exception 'CONSENT_REQUIRED'; end if;
 if jsonb_array_length(p_documents) not between 1 and 3 then raise exception 'INVALID_DOCUMENT_COUNT'; end if;
 for d in select * from jsonb_array_elements(p_documents) loop
  if d->>'mime' not in ('application/pdf','image/jpeg','image/png') or (d->>'size')::bigint not between 1 and 10485760 then raise exception 'INVALID_DOCUMENT'; end if;
  if n=0 then
   result := submit_payment(p_ref,p_amount,p_date,p_reference,p_method,p_bank,d->>'path',d->>'name',d->>'mime',(d->>'size')::bigint,d->>'hash','participant_portal');
  else
   perform attach_pop((result->>'payment_id')::uuid,d->>'path',d->>'name',d->>'mime',(d->>'size')::bigint,d->>'hash');
  end if;
  n:=n+1;
 end loop;
 update participants set consent_at=coalesce(consent_at,now()) where participant_ref=upper(trim(p_ref));
 return result;
end $$;
revoke all on function submit_payment_documents(text,numeric,date,text,payment_method,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function submit_payment_documents(text,numeric,date,text,payment_method,text,jsonb,boolean) to service_role;
-- Adjustment decisions and their outbox entries commit together.
create function decide_adjustment(p_id uuid,p_status text,p_actor uuid) returns void
language plpgsql security definer set search_path=public as $$
declare a account_adjustments%rowtype; p participants%rowtype; mobile text;
begin
 if p_actor is distinct from auth.uid() or not coalesce(current_role_of() in ('super_admin','finance_admin'),false) then raise exception 'FORBIDDEN'; end if;
 if p_status not in ('approved','rejected') then raise exception 'INVALID_DECISION'; end if;
 select * into a from account_adjustments where id=p_id for update;
 if not found or a.status<>'pending' then raise exception 'ALREADY_DECIDED'; end if;
 update account_adjustments set status=p_status,decided_by=p_actor,decided_at=now() where id=p_id;
 select * into p from participants where id=a.participant_id;
 insert into audit_logs(actor_id,action,entity_type,entity_id,summary) values(p_actor,'adjustment.'||p_status,'participant',p.id::text,a.reason);
 insert into notifications(participant_id,template,recipient,payload) values(p.id,'adjustment_decided',p.email,jsonb_build_object('amount',a.amount,'status',p_status,'reason',a.reason));
 mobile:=regexp_replace(coalesce(p.mobile,''),'[^0-9]','','g');
 if left(mobile,2)='00' then mobile:=substring(mobile from 3); end if;
 if mobile ~ '^0[6-8][0-9]{8}$' then mobile:='27'||substring(mobile from 2); end if;
 if mobile ~ '^27[6-8][0-9]{8}$' then
  insert into notifications(participant_id,template,channel,recipient,payload) values(p.id,'adjustment_decided','whatsapp',mobile,jsonb_build_object('amount',a.amount,'status',p_status,'reason',a.reason));
 end if;
end $$;
revoke all on function decide_adjustment(uuid,text,uuid) from public,anon;
grant execute on function decide_adjustment(uuid,text,uuid) to authenticated;

create function generate_payment_plan(p_id uuid,p_count int,p_start date) returns void
language plpgsql security definer set search_path=public as $$
declare cents bigint; portion bigint; i int;
begin
 if not coalesce(current_role_of() in ('super_admin','finance_admin'),false) then raise exception 'FORBIDDEN'; end if;
 if p_count not between 1 and 120 or p_start is null then raise exception 'INVALID_PLAN'; end if;
 select round(outstanding*100)::bigint into cents from participants where id=p_id for update;
 if cents is null or cents<p_count then raise exception 'NO_OUTSTANDING_BALANCE'; end if;
 if exists(select 1 from payment_plans where participant_id=p_id) then raise exception 'PLAN_ALREADY_EXISTS'; end if;
 portion:=cents/p_count;
 for i in 1..p_count loop
  insert into payment_plans(participant_id,instalment_no,amount,due_date)
  values(p_id,i,(case when i=p_count then cents-portion*(p_count-1) else portion end)::numeric/100,(p_start+make_interval(months=>i-1))::date);
 end loop;
 insert into audit_logs(actor_id,action,entity_type,entity_id,summary) values(auth.uid(),'plan.created','participant',p_id::text,'Monthly payment plan generated');
end $$;
revoke all on function generate_payment_plan(uuid,int,date) from public,anon;
grant execute on function generate_payment_plan(uuid,int,date) to authenticated;

create function validate_plan_payment() returns trigger language plpgsql as $$
begin
 if new.paid_payment_id is not null and not exists(select 1 from payments where id=new.paid_payment_id and participant_id=new.participant_id and status='verified') then raise exception 'VERIFIED_PAYMENT_REQUIRED'; end if;
 return new;
end $$;
create trigger plan_payment_check before insert or update on payment_plans for each row execute function validate_plan_payment();

-- Serialize super-admin membership changes; never lose the final active super.
create function protect_super_admin() returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(841902);
 if tg_op='DELETE' or new.role<>old.role or new.is_active<>old.is_active then
  if old.id=auth.uid() and (tg_op='DELETE' or new.role<>'super_admin' or not new.is_active) then raise exception 'CANNOT_DEMOTE_SELF'; end if;
  if old.role='super_admin' and old.is_active and (tg_op='DELETE' or new.role<>'super_admin' or not new.is_active)
   and not exists(select 1 from app_users where id<>old.id and role='super_admin' and is_active) then raise exception 'LAST_SUPER_ADMIN'; end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create trigger app_users_protect before update or delete on app_users for each row execute function protect_super_admin();

create function auto_match_statement(p_batch uuid) returns int
language plpgsql security invoker as $$
declare line bank_statement_lines%rowtype; candidate uuid; n int; matched int:=0;
begin
 if not coalesce(current_role_of() in ('super_admin','finance_admin'),false) then raise exception 'FORBIDDEN'; end if;
 for line in select * from bank_statement_lines where batch_id=p_batch and status='unmatched' order by line_no for update loop
  if coalesce(regexp_replace(upper(line.reference),'[^A-Z0-9]','','g'),'')='' then continue; end if;
  select count(*),min(p.id::text)::uuid into n,candidate from payments p
   where regexp_replace(upper(p.reference),'[^A-Z0-9]','','g')=regexp_replace(upper(line.reference),'[^A-Z0-9]','','g')
    and p.amount=line.amount and abs(p.payment_date-line.tx_date)<=3
    and not exists(select 1 from bank_statement_lines x where x.matched_payment_id=p.id);
  if n=1 then
   begin
    update bank_statement_lines set matched_payment_id=candidate,status='matched' where id=line.id;
    matched:=matched+1;
   exception when unique_violation then null;
   end;
  end if;
 end loop;
 return matched;
end $$;
revoke all on function auto_match_statement(uuid) from public,anon;
grant execute on function auto_match_statement(uuid) to authenticated;

create function validate_participant_cohort() returns trigger language plpgsql as $$
begin
 if new.cohort_id is not null and not exists(select 1 from cohorts where id=new.cohort_id and programme_id=new.programme_id) then raise exception 'COHORT_NOT_IN_PROGRAMME'; end if;
 return new;
end $$;
create trigger participant_cohort_check before insert or update of cohort_id,programme_id on participants for each row execute function validate_participant_cohort();
create function participant_terms_changed() returns trigger language plpgsql as $$
begin
 perform recalculate_participant(new.id);
 if old.programme_id is distinct from new.programme_id then update payments set programme_id=new.programme_id where participant_id=new.id; end if;
 return new;
end $$;
create trigger participant_terms after update of amount_due,status_override,programme_id on participants for each row execute function participant_terms_changed();
create function capture_payment_documents(p_ref text,p_amount numeric,p_date date,p_reference text,p_method payment_method,p_bank text,p_documents jsonb,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; d jsonb; participant uuid;
begin
 if jsonb_array_length(p_documents)>3 then raise exception 'INVALID_DOCUMENT_COUNT'; end if;
 result:=submit_payment(p_ref,p_amount,p_date,p_reference,p_method,p_bank,null,null,null,null,null,'staff_capture');
 for d in select * from jsonb_array_elements(p_documents) loop
  perform attach_pop((result->>'payment_id')::uuid,d->>'path',d->>'name',d->>'mime',(d->>'size')::bigint,d->>'hash',p_actor);
 end loop;
 select participant_id into participant from payments where id=(result->>'payment_id')::uuid;
 insert into audit_logs(actor_id,action,entity_type,entity_id,summary) values(p_actor,'payment.captured','payment',result->>'payment_id','Staff captured payment');
 return result||jsonb_build_object('participant_id',participant);
end $$;
revoke all on function capture_payment_documents(text,numeric,date,text,payment_method,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function capture_payment_documents(text,numeric,date,text,payment_method,text,jsonb,uuid) to service_role;

-- Explicit grants rather than depending on project default privileges.
grant execute on function submit_payment(text,numeric,date,text,payment_method,text,text,text,text,bigint,text,text),
 decide_payment(uuid,payment_status,uuid,text,text) to service_role;
