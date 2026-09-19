import EmbeddedPostgres from 'embedded-postgres';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const directory = await mkdtemp(join(tmpdir(), 'pop-db-'));
const pg = new EmbeddedPostgres({ databaseDir: join(directory, 'db'), port: 55439, user: 'postgres', password: 'test-only', persistent: false, createPostgresUser: process.getuid?.() === 0, onLog: () => {}, onError: console.error });
let db;
try {
 await pg.initialise(); await pg.start(); db=pg.getPgClient(); await db.connect();
 await db.query(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'service_role') $$;
 create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid,bucket_id text); alter table storage.objects enable row level security;
 grant usage on schema public,auth to anon,authenticated,service_role;
 alter default privileges in schema public grant all on tables to authenticated,service_role;
 alter default privileges in schema public grant usage,select on sequences to authenticated,service_role;`);
 for(const file of ['0001_schema.sql','0002_functions.sql','0003_security.sql','0004_operations.sql','0005_email_only.sql']) {
  if (file === '0005_email_only.sql') await db.query(`
   insert into notifications(template,channel,state,recipient) values
    ('legacy-test','whatsapp','queued','27721234567'),
    ('legacy-test','sms','failed','27721234567'),
    ('legacy-test','whatsapp','sent','27721234567');`);
  await db.query('begin');
  try { await db.query(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8')); await db.query('commit'); console.log(`PASS ${file}`); }
  catch(e) { await db.query('rollback'); throw e; }
 }
 const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
 const scalar=async(sql,args=[])=>Object.values((await q(sql,args))[0])[0];
 assert.equal(await scalar("select count(*)::int from notifications where channel <> 'email' and state='skipped'"),2);
 assert.equal(await scalar("select count(*)::int from notifications where channel <> 'email' and state='sent'"),1);
 await assert.rejects(q("insert into notifications(template,channel) values('test','whatsapp')"),/EMAIL_ONLY_NOTIFICATIONS/);
 await assert.rejects(q("update notifications set state='queued' where channel <> 'email' and state='skipped'"),/notifications_email_only_queue/);
 const actor=await scalar(`insert into auth.users values(gen_random_uuid()) returning id`);
 await q(`insert into app_users(id,email,full_name,role) values($1,'admin@example.test','Admin','super_admin')`,[actor]);
 const programme=await scalar(`insert into programmes(code,name,amount_due) values('TEST','Test',1000) returning id`);
 const participant=await scalar(`insert into participants(first_name,surname,email,programme_id,amount_due) values('Test','Person','test@example.test',$1,1000) returning id`,[programme]);
 const source=await scalar(`insert into participants(first_name,surname,programme_id,amount_due) values('Merge','Source',$1,1000) returning id`,[programme]);
 const payment=await scalar(`insert into payments(participant_id,programme_id,amount,payment_date) values($1,$2,200,current_date) returning id`,[participant,programme]);
 assert.equal(await scalar('select amount_paid::text from participants where id=$1',[participant]),'0.00');
 await q(`select decide_payment($1,'verified',$2)`,[payment,actor]);
 assert.equal(await scalar('select amount_paid::text from participants where id=$1',[participant]),'200.00');
 await q('update payments set claimed_by=$2,claimed_at=now() where id=$1',[payment,actor]);
 await q(`select decide_payment($1,'requires_clarification',$2,'Unreadable')`,[payment,actor]);
 assert.equal(await scalar('select claimed_by from payments where id=$1',[payment]),null);
 assert.equal(await scalar(`select count(*)::int from notifications where template='clarification_requested'`),1);
 const adjustment=await scalar(`insert into account_adjustments(participant_id,amount,reason) values($1,50,'Credit') returning id`,[participant]);
 assert.equal(await scalar('select amount_paid::text from participants where id=$1',[participant]),'0.00');
 await q(`update account_adjustments set status='approved' where id=$1`,[adjustment]);
 assert.equal(await scalar('select amount_paid::text from participants where id=$1',[participant]),'50.00');
 await q(`insert into payment_plans(participant_id,instalment_no,amount,due_date) values($1,1,100,current_date-1)`,[participant]);
 assert.equal((await q('select * from arrears_report()')).length,1);
 await q(`select attach_pop($1,'test/path','test.pdf','application/pdf',100,'hash')`,[payment]);
 await q(`insert into resubmit_tokens(payment_id,token_hash,expires_at) values($1,'token',now()+interval '1 day')`,[payment]);
 await q(`insert into bank_statement_lines(batch_id,line_no,tx_date,amount) values(gen_random_uuid(),1,current_date,200)`);
 const otp=await scalar(`select issue_portal_otp($1,'hash')`,[participant]);
 for(let i=0;i<5;i++) assert.equal(await scalar('select attempt_portal_otp($1)',[otp]),'hash');
 assert.equal(await scalar('select attempt_portal_otp($1)',[otp]),null);
 await q(`select finish_resubmit('token',$1::jsonb)`,[JSON.stringify([{path:'test/resubmit',name:'proof.pdf',mime:'application/pdf',size:100,hash:'hash2'}])]);
 await assert.rejects(q(`select finish_resubmit('token','[]')`),/INVALID_TOKEN/);
 await assert.rejects(q(`select decide_payment($1,'rejected',$2)`,[payment,actor]),/REJECTION_REASON_REQUIRED/);
 await assert.rejects(q(`update audit_logs set summary='tampered'`),/append-only/);
 await assert.rejects(q(`delete from audit_logs`),/append-only/);
 await q(`select merge_participants($1,$2,$3)`,[source,participant,actor]);
 const paths=await scalar(`select anonymize_participant($1,$2)`,[participant,actor]); assert.equal(paths.length,2);
 assert.equal(await scalar('select email from participants where id=$1',[participant]),null);
 await q('select * from admin_throughput(30)'); await q('select * from duplicate_report()'); await q('select dashboard_stats()');
 await q(`set role authenticated; select set_config('request.jwt.claim.role','authenticated',false);`);
 assert.equal(await scalar('select count(*)::int from participants'),0);
 await assert.rejects(q('select * from portal_otps'),/permission denied/);
 await assert.rejects(q(`select attach_pop($1,'forbidden','x','application/pdf',1,'x')`,[payment]),/permission denied/);
 await assert.rejects(q(`select decide_payment($1,'verified',$2)`,[payment,actor]),/FORBIDDEN/);
 await q('reset role');
 await q(`select set_config('request.jwt.claim.sub',$1,false)`,[actor]);
 await q(`set role authenticated`);
 assert.equal(await scalar('select claim_payment($1)',[payment]),true);
 assert.equal(await scalar('select claimed_by from payments where id=$1',[payment]),actor);
 await q(`select decide_payment($1,'verified',$2)`,[payment,actor]);
 assert.equal(await scalar('select claimed_by from payments where id=$1',[payment]),null);
 await assert.rejects(q(`update app_users set role='viewer' where id=$1`,[actor]),/CANNOT_DEMOTE_SELF/);
 await q("update participants set email='email-only@example.test',mobile='0721234567' where id=$1",[participant]);
 const adjustment2=await scalar(`insert into account_adjustments(participant_id,amount,reason) values($1,25,'Test credit') returning id`,[participant]);
 await q(`select decide_adjustment($1,'approved',$2)`,[adjustment2,actor]);
 assert.equal(await scalar('select amount_paid::text from participants where id=$1',[participant]),'275.00');
 assert.equal(await scalar("select count(*)::int from notifications where participant_id=$1 and template='adjustment_decided' and channel='email'",[participant]),1);
 assert.equal(await scalar("select count(*)::int from notifications where participant_id=$1 and channel <> 'email'",[participant]),0);
 await assert.rejects(q(`select decide_adjustment($1,'approved',$2)`,[adjustment2,actor]),/ALREADY_DECIDED/);
 await q('delete from payment_plans where participant_id=$1',[participant]);
 await q(`select generate_payment_plan($1,3,current_date)`,[participant]);
 assert.equal(await scalar('select sum(amount)::text from payment_plans where participant_id=$1',[participant]),'725.00');
 assert.deepEqual((await q('select amount::text from payment_plans where participant_id=$1 order by instalment_no',[participant])).map(r=>r.amount),['241.66','241.66','241.68']);
 await q(`update payments set reference='BANK-123' where id=$1`,[payment]);
 const batch=await scalar('select gen_random_uuid()');
 await q(`insert into bank_statement_lines(batch_id,line_no,tx_date,reference,amount) values($1,1,current_date+3,'bank 123',200)`,[batch]);
 assert.equal(await scalar('select auto_match_statement($1)',[batch]),1);
 assert.equal(await scalar('select auto_match_statement($1)',[batch]),0);
 const cohort=await scalar(`insert into cohorts(programme_id,code,name) values($1,'A','A') returning id`,[programme]);
 await q('update participants set cohort_id=$2 where id=$1',[participant,cohort]);
 await q('delete from cohorts where id=$1',[cohort]);
 assert.equal(await scalar('select cohort_id from participants where id=$1',[participant]),null);
 await q('reset role');
 await q(`select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claim.role','service_role',false); set role service_role`);
 await q(`select attach_pop($1,'service-role/test','proof.pdf','application/pdf',100,'service-hash')`,[payment]);
 // Issuance limit holds across all attempts, even consumed/expired codes.
 for(let i=0;i<5;i++) assert.ok(await scalar(`select issue_portal_otp($1,'hash')`,[participant]));
 assert.equal(await scalar(`select issue_portal_otp($1,'hash')`,[participant]),null);
 const participantRef=await scalar('select participant_ref from participants where id=$1',[participant]);
 const uploaded=await scalar(`select submit_payment_documents($1,20,current_date,'DOCS','eft',null,$2::jsonb,true)`,[participantRef,JSON.stringify([{path:'multi/1',name:'a.pdf',mime:'application/pdf',size:12,hash:'multi1'},{path:'multi/2',name:'b.pdf',mime:'application/pdf',size:12,hash:'multi2'}])]);
 assert.equal(await scalar('select count(*)::int from pops where payment_id=$1',[uploaded.payment_id]),2);
 assert.ok(await scalar('select consent_at from participants where id=$1',[participant]));
 await assert.rejects(q(`select submit_payment_documents($1,20,current_date,'DOCS','eft',null,'[]',false)`,[participantRef]),/CONSENT_REQUIRED/);
 await q('reset role');
 await assert.rejects(q(`update app_users set is_active=false where id=$1`,[actor]),/LAST_SUPER_ADMIN/);
 // Separate clients prove conditional claim updates serialize under contention.
 const finance=await scalar('insert into auth.users values(gen_random_uuid()) returning id');
 await q(`insert into app_users(id,email,full_name,role) values($1,'finance@example.test','Finance','finance_admin')`,[finance]);
 const clients=[pg.getPgClient(),pg.getPgClient()];
 try {
  await Promise.all(clients.map(c=>c.connect()));
  await Promise.all(clients.map(async(c,i)=>{
   await c.query(`select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)`,[i ? finance : actor]);
   await c.query('set role authenticated');
  }));
  const claims=await Promise.all(clients.map(c=>c.query('select claim_payment($1) as claimed',[uploaded.payment_id])));
  assert.equal(claims.filter(r=>r.rows[0].claimed).length,1);
  await clients[0].query('select claim_payment($1,true)',[uploaded.payment_id]);
  assert.equal(await scalar('select claimed_by from payments where id=$1',[uploaded.payment_id]),null);
 } finally { await Promise.all(clients.map(c=>c.end())); }

 console.log('PASS accounting, clarification, concurrent claims, adjustments, plan rounding, reconciliation, documents, consent, tokens, OTP caps, merge, anonymization, reports, append-only audit, super-admin guards, rejection reason, default-deny RLS');
} finally {
 if(db) await db.end(); await pg.stop(); await rm(directory,{recursive:true,force:true});
}
