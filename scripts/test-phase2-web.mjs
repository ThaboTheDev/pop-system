// Executes the actual TypeScript server helpers/actions against controlled
// dependencies. SQL/RLS is tested separately in test-phase2.mjs. These checks do
// not pretend to exercise Supabase's real SMTP, browser cookies, or live Auth.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const load = async (file, mocks = {}, env = {}) => {
  const source = await readFile(new URL(`../${file}`, import.meta.url),'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const module = { exports: {} };
  const dependencies = name => Object.hasOwn(mocks,name) ? mocks[name] : require(name);
  const quietConsole = { error: () => {} };
  new Function('require','module','exports','process','console',outputText)(dependencies,module,module.exports,{env},quietConsole);
  return module.exports;
};
const form = fields => { const result = new FormData(); Object.entries(fields).forEach(([k,v]) => result.set(k,v)); return result; };
const redirect = url => { throw new Error(`REDIRECT:${url}`); };
const headers = async () => new Headers({ 'x-forwarded-for': '192.0.2.1' });
const originEnv = { NODE_ENV: 'production', APP_URL: 'https://payments.example.test' };
const origin = await load('src/lib/app-url.ts',{},originEnv);
assert.equal(origin.appOrigin(),'https://payments.example.test');
for (const value of ['', 'http://example.test', 'https://evil@example.test', 'https://example.test/other', 'https://example.test?next=evil', 'https://example.test/#fragment']) {
  const module = await load('src/lib/app-url.ts',{}, {NODE_ENV:'production',APP_URL:value});
  assert.throws(() => module.appOrigin());
}

// Known participants are provisioned without passwords; unknown, pending,
// ambiguous and staff addresses do not get provisioned or sent portal links.
let participants = [], staff = [], createError = null, sendError = null;
let created = [], sent = [], deletedCookies = [], signedOut = 0;
const admin = {
  from: table => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: table === 'participants' ? participants : staff, error: null }) }) }) }),
  auth: { admin: { createUser: async data => { created.push(data); return {error:createError}; } } },
};
const server = { auth: {
  signInWithOtp: async data => { sent.push(data); return {error:sendError}; },
  signOut: async () => { signedOut++; },
} };
const actionMocks = {
  'next/headers': {headers,cookies:async () => ({delete:name => deletedCookies.push(name)})},
  'next/navigation': {redirect},
  '@/lib/supabase/admin': {supabaseAdmin:() => admin},
  '@/lib/supabase/server': {supabaseServer:async () => server},
  '@/lib/rate-limit': {rateLimit:() => ({allowed:true})},
  '@/lib/app-url': origin,
};
const login = await load('src/app/portal/actions.ts',actionMocks,originEnv);
const request = () => login.requestPortalLink({},form({email:' Person@Example.test '}));
const unknown = await request();
assert.match(unknown.message,/If this email matches an enrolled participant/);
assert.equal(created.length,0); assert.equal(sent.length,0);
participants = [{id:'one'},{id:'two'}];
assert.deepEqual(await request(),unknown);
assert.equal(created.length,0);
participants = [{id:'one',auth_user_id:null}]; staff = [{id:'staff'}];
assert.deepEqual(await request(),unknown); assert.equal(created.length,0);
staff = [];
assert.deepEqual(await request(),unknown);
assert.deepEqual(created,[{email:'person@example.test',email_confirm:true}]);
assert.deepEqual(sent,[{email:'person@example.test',options:{shouldCreateUser:false,emailRedirectTo:'https://payments.example.test/auth/callback'}}]);
createError = {code:'email_exists'};
assert.deepEqual(await request(),unknown); assert.equal(sent.length,2);
createError = {code:'unexpected_provider_error'};
assert.deepEqual(await request(),unknown); assert.equal(sent.length,2);
participants = [{id:'one',auth_user_id:'bound'}];
const createsBefore = created.length;
await request(); assert.equal(created.length,createsBefore); assert.equal(sent.length,3);
sendError = {code:'over_email_send_rate_limit'};
assert.deepEqual(await request(),unknown);
assert.match((await login.requestPortalLink({},form({email:'not-an-email'}))).error,/valid email/);
await assert.rejects(login.logoutPortal(),/REDIRECT:\/portal\/login/);
assert.equal(signedOut,1); assert.ok(deletedCookies.includes('pop_portal'));
console.log('PASS portal link action: eligible-account provisioning, no password/open signup, generic unknown/staff/provider responses, callback origin, no code/legacy-cookie login');

// A callback cannot be redirected to a request host or a supplied next URL.
let exchangeError = null, codes = [];
const callback = await load('src/app/auth/callback/route.ts',{
  'next/server': {NextResponse:{redirect:url => Response.redirect(url)}},
  'next/headers': actionMocks['next/headers'],
  '@/lib/app-url': origin,
  '@/lib/supabase/server': {supabaseServer:async () => ({auth:{exchangeCodeForSession:async code => {codes.push(code);return {error:exchangeError};}}})},
});
assert.equal((await callback.GET(new Request('https://untrusted.example/auth/callback?code=valid&next=https://untrusted.example'))).headers.get('location'),'https://payments.example.test/portal');
assert.deepEqual(codes,['valid']);
exchangeError = {message:'expired'};
assert.equal((await callback.GET(new Request('https://untrusted.example/auth/callback?code=expired'))).headers.get('location'),'https://payments.example.test/portal/login?error=link');
assert.equal((await callback.GET(new Request('https://untrusted.example/auth/callback'))).headers.get('location'),'https://payments.example.test/portal/login?error=link');

// The session helper delegates binding to SQL and never uses a service client.
let authUser = {id:'participant-auth'}, claim = {data:'participant-row',error:null}, claimCalls = [];
const portal = await load('src/lib/portal.ts',{
  react:{cache:fn => fn},
  '@/lib/supabase/server':{supabaseServer:async () => ({auth:{getUser:async () => ({data:{user:authUser}})},rpc:async name => {claimCalls.push(name);return claim;}})},
});
assert.deepEqual(await portal.participantSession(),{status:'linked',participantId:'participant-row',authUserId:'participant-auth'});
assert.deepEqual(claimCalls,['claim_participant_account']);
claim = {data:null,error:null}; assert.equal((await portal.participantSession()).status,'unmatched');
for (const message of ['AMBIGUOUS_EMAIL','ACCOUNT_ALREADY_CLAIMED','EMAIL_NOT_VERIFIED']) {
  claim = {data:null,error:{message}}; assert.equal((await portal.participantSession()).status,'unmatched');
}
claim = {data:null,error:{message:'STAFF_ACCOUNT'}}; assert.equal((await portal.participantSession()).status,'staff');
claim = {data:null,error:{message:'missing migration'}}; assert.equal((await portal.participantSession()).status,'unavailable');
authUser = null; assert.equal((await portal.participantSession()).status,'signed_out');

let staffUser = null, participant = {status:'linked',participantId:'one'}, serviceClientCalls = 0;
const scopedClient = {identity:'request-scoped-jwt'};
const docs = await load('src/lib/pdf.ts',{
  '@/lib/auth':{currentUser:async () => staffUser},
  '@/lib/portal':{participantSession:async () => participant},
  '@/lib/supabase/admin':{supabaseAdmin:() => {serviceClientCalls++;throw new Error('Must not bypass RLS for portal reads');}},
  '@/lib/supabase/server':{supabaseServer:async () => scopedClient},
});
assert.equal((await docs.documentAccess()).sb,scopedClient);
assert.equal(serviceClientCalls,0);
staffUser = {role:'runner'}; assert.equal(await docs.documentAccess(),null);
staffUser = {role:'finance_admin'}; assert.equal((await docs.documentAccess()).sb,scopedClient);
staffUser = null; participant = {status:'unmatched'}; assert.equal(await docs.documentAccess(),null);
console.log('PASS callback/session/document helpers: fixed redirect, expired-link handling, verified-session binding, polite dead ends, scoped JWT reads, runner document denial');

// The shared application action cannot silently upgrade a stale notice or
// bypass required consent; new registration never inserts a participant.
let rpcCalls = [], scheduled = 0;
const types = await load('src/lib/types.ts');
const applications = await load('src/lib/applications.ts',{
  'next/headers':{headers},
  '@/lib/supabase/server':{supabaseServer:async () => ({rpc:async (name,args) => {rpcCalls.push({name,args});return {data:{already_applied:false},error:null};}})},
  '@/lib/rate-limit':actionMocks['@/lib/rate-limit'],
  '@/lib/notify':{scheduleOutbox:() => {scheduled++;}},
  '@/lib/types':types,
});
const fields = {first_name:'Nomvula',surname:'Sithole',email:'Nomvula@example.test',mobile:'0721234567',programme_code:'OPEN',consent:'on',notice_version:types.PRIVACY_NOTICE_VERSION};
assert.match((await applications.submitApplication(form({...fields,consent:''}),false)).error,/Consent/);
assert.match((await applications.submitApplication(form({...fields,notice_version:'old'}),false)).error,/changed/);
assert.equal(rpcCalls.length,0);
assert.equal((await applications.submitApplication(form(fields),false)).ok,true);
assert.equal(rpcCalls[0].name,'submit_application');
assert.equal(rpcCalls[0].args.p_notice_version,types.PRIVACY_NOTICE_VERSION);
assert.equal(rpcCalls[0].args.p_in_person,false);
await applications.submitApplication(form(fields),true);
assert.equal(rpcCalls[1].args.p_in_person,true); assert.equal(scheduled,2);

let role = 'runner';
const auth = await load('src/lib/auth.ts',{
  react:{cache:fn => fn}, 'next/navigation':{redirect},
  './supabase/server':{supabaseServer:async () => ({auth:{getUser:async () => ({data:{user:{id:'user'}}})},from:() => ({select:() => ({eq:() => ({single:async () => ({data:{id:'user',role,is_active:true,can_verify:true}})})})})})},
});
assert.equal(auth.canVerify({role:'runner',can_verify:true}),false);
assert.equal(auth.canExport({role:'runner'}),false);
await assert.rejects(auth.requireUser(),/REDIRECT:\/runner/);
assert.equal((await auth.requireRole('runner')).role,'runner');
await assert.rejects(auth.requireRole('finance_admin'),/REDIRECT:\/runner/);
role = 'finance_admin'; assert.equal((await auth.requireUser()).role,'finance_admin');
console.log('PASS application and role helpers: required current notice/consent, one checked RPC, runner declaration, no staff-area/export/verification fallback for runner');
