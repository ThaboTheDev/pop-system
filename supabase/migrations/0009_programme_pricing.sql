-- Dual programme pricing: a single fee, or two prices — discounted once-off
-- and the original monthly amount. Additive; apply after 0008. Existing
-- programmes stay on a single price. Applicants choose a payment option when
-- a programme offers both; approval uses the quoted fee unless staff override.

alter table programmes
  add column once_off_amount numeric(12,2) check (once_off_amount is null or once_off_amount >= 0),
  add column pricing_model text not null default 'single';

alter table programmes
  add constraint programmes_pricing_model_check check (pricing_model in ('single','dual')),
  add constraint programmes_pricing_shape_check check (
    (pricing_model = 'single' and once_off_amount is null)
    or (pricing_model = 'dual' and once_off_amount is not null and once_off_amount <= amount_due)
  );

alter table applications
  add column payment_option text,
  add column quoted_fee numeric(12,2),
  add constraint applications_payment_option_check
    check (payment_option is null or payment_option in ('single','once_off','monthly')),
  add constraint applications_quoted_fee_check
    check (quoted_fee is null or quoted_fee >= 0);

drop function if exists registration_programmes();
create function registration_programmes()
returns table(code text, name text, amount_due numeric, once_off_amount numeric, pricing_model text)
language sql stable security definer set search_path = public as $$
  select code, name, amount_due, once_off_amount, pricing_model
  from programmes where is_active order by name;
$$;
revoke all on function registration_programmes() from public;
grant execute on function registration_programmes() to anon, authenticated;

drop function if exists submit_application(text, text, text, text, text, boolean, text, boolean);
drop function if exists submit_application(text, text, text, text, text, boolean, text, boolean, text);
create function submit_application(p_first_name text, p_surname text, p_email text, p_mobile text,
  p_programme_code text, p_consent boolean, p_notice_version text, p_in_person boolean default false,
  p_payment_option text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_programme uuid; v_monthly numeric; v_once_off numeric; v_model text;
  v_option text; v_quoted numeric;
  v_email citext := lower(btrim(p_email)); v_id uuid; v_actor uuid;
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
  select id, amount_due, once_off_amount, pricing_model
    into v_programme, v_monthly, v_once_off, v_model
    from programmes where code = btrim(p_programme_code) and is_active;
  if not found then raise exception 'UNKNOWN_PROGRAMME'; end if;
  if v_model = 'dual' then
    if p_payment_option is distinct from 'once_off' and p_payment_option is distinct from 'monthly' then
      raise exception 'PAYMENT_OPTION_REQUIRED';
    end if;
    v_option := p_payment_option;
    v_quoted := case when v_option = 'once_off' then v_once_off else v_monthly end;
    if v_quoted is null then raise exception 'UNKNOWN_PROGRAMME'; end if;
  else
    if p_payment_option is not null and btrim(p_payment_option) <> ''
       and p_payment_option is distinct from 'single' then
      raise exception 'INVALID_PAYMENT_OPTION';
    end if;
    v_option := 'single';
    v_quoted := v_monthly;
  end if;
  -- Serialize repeat submissions across tabs, devices and server instances.
  perform pg_advisory_xact_lock(hashtextextended(v_email::text, 20260921));
  if exists(select 1 from applications where email = v_email and status in ('pending','approved'))
     or exists(select 1 from participants where email = v_email) then
    return jsonb_build_object('already_applied',true);
  end if;
  insert into applications(first_name,surname,email,mobile,programme_id,source,captured_by,
    consent_given,consent_at,privacy_notice_version,consent_method,payment_option,quoted_fee)
  values(btrim(p_first_name),btrim(p_surname),v_email,nullif(btrim(p_mobile),''),v_programme,
    case when v_actor is null then 'public' else 'runner' end,v_actor,
    true,now(),btrim(p_notice_version),case when v_actor is null then 'online' else 'runner_declaration' end,
    v_option,v_quoted)
  returning id into v_id;
  insert into audit_logs(actor_id,action,entity_type,entity_id,summary)
    values(v_actor,'application.submitted','application',v_id::text,'Application submitted; no participant ID issued');
  insert into notifications(application_id,template,recipient,payload)
    values(v_id,'registration_received',v_email,jsonb_build_object('name',btrim(p_first_name),
      'programme',(select name from programmes where id = v_programme)));
  -- Never expose IDs or another person's application details on public submission.
  return jsonb_build_object('already_applied',false);
end $$;
revoke all on function submit_application(text,text,text,text,text,boolean,text,boolean,text) from public;
grant execute on function submit_application(text,text,text,text,text,boolean,text,boolean,text) to anon,authenticated;

create or replace function approve_application(p_application_id uuid,p_actor uuid,p_fee_override numeric default null)
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
  v_fee := coalesce(p_fee_override, a.quoted_fee, v_fee);
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
    'Application approved; participant ID issued',jsonb_build_object('participant_id',p.id,'participant_ref',p.participant_ref,'fee',v_fee,'payment_option',a.payment_option));
  insert into notifications(application_id,participant_id,template,recipient,payload)
  values(a.id,p.id,'registration_approved',p.email,jsonb_build_object('name',p.first_name,
    'participant_ref',p.participant_ref,'programme',v_programme,'amount_due',v_fee));
  return jsonb_build_object('participant_id',p.id,'participant_ref',p.participant_ref);
end $$;
revoke all on function approve_application(uuid,uuid,numeric) from public,anon;
grant execute on function approve_application(uuid,uuid,numeric) to authenticated;

notify pgrst, 'reload schema';
