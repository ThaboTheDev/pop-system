-- Apply after 0004, including on existing installations. Historical delivery
-- records and enum values remain; only email can enter the active queue.
create or replace function decide_adjustment(p_id uuid,p_status text,p_actor uuid) returns void
language plpgsql security definer set search_path=public as $$
declare a account_adjustments%rowtype; p participants%rowtype;
begin
 if p_actor is distinct from auth.uid() or not coalesce(current_role_of() in ('super_admin','finance_admin'),false) then raise exception 'FORBIDDEN'; end if;
 if p_status not in ('approved','rejected') then raise exception 'INVALID_DECISION'; end if;
 select * into a from account_adjustments where id=p_id for update;
 if not found or a.status<>'pending' then raise exception 'ALREADY_DECIDED'; end if;
 update account_adjustments set status=p_status,decided_by=p_actor,decided_at=now() where id=p_id;
 select * into p from participants where id=a.participant_id;
 insert into audit_logs(actor_id,action,entity_type,entity_id,summary) values(p_actor,'adjustment.'||p_status,'participant',p.id::text,a.reason);
 insert into notifications(participant_id,template,recipient,payload) values(p.id,'adjustment_decided',p.email,jsonb_build_object('amount',a.amount,'status',p_status,'reason',a.reason));
end $$;
revoke all on function decide_adjustment(uuid,text,uuid) from public,anon;
grant execute on function decide_adjustment(uuid,text,uuid) to authenticated;

update notifications set state='skipped', error='Unsupported channel: email delivery only', claimed_at=null
 where channel <> 'email' and state <> 'sent';
alter table notifications add constraint notifications_email_only_queue
 check (channel = 'email' or state in ('sent','skipped'));

create function enforce_email_notification() returns trigger
language plpgsql as $$
begin
 if new.channel <> 'email' then raise exception 'EMAIL_ONLY_NOTIFICATIONS'; end if;
 return new;
end $$;
create trigger notifications_email_only before insert or update of channel on notifications
 for each row execute function enforce_email_notification();
