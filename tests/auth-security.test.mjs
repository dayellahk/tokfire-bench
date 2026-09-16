import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHmac} from 'node:crypto';
import {betterAuth} from 'better-auth';
import {getMigrations} from 'better-auth/db/migration';
import {createAuthEndpoint} from 'better-auth/api';
import {setSessionCookie} from 'better-auth/cookies';
import {portalAuthPlugins,twoFactorReturn} from '../lib/auth-security.ts';
import {turnstileAction,turnstileOptions,verifyTurnstile} from '../lib/turnstile.ts';
const env={TURNSTILE_SECRET:'server-secret',TURNSTILE_SITE_KEY:'public-key',TURNSTILE_HOSTNAMES:'tokfire.test',NODE_ENV:'production'};
const valid=()=>Response.json({success:true,action:'auth',hostname:'tokfire.test'});
test('Turnstile fails closed on missing, malformed, wrong-action, wrong-host, network, and provider failures',async()=>{
 for(const token of [null,{},'', ' '.repeat(5),'x'.repeat(2049)])assert.equal(await verifyTurnstile(token,'auth',env,async()=>{throw Error('should not fetch');}),false);
 for(const data of [{success:false},{success:'true',action:'auth',hostname:'tokfire.test'},{success:true,action:'security',hostname:'tokfire.test'},{success:true,action:'auth',hostname:'localhost'},{success:true,action:'auth',hostname:'tokfire.test.attacker.invalid'},null])assert.equal(await verifyTurnstile('token','auth',env,async()=>Response.json(data)),false);
 for(const fetcher of [async()=>{throw Error('timeout');},async()=>new Response('bad',{status:500}),async()=>new Response('not json')])assert.equal(await verifyTurnstile('token','auth',env,fetcher),false);
 assert.equal(await verifyTurnstile('token','auth',{},valid),false);
 assert.equal(await verifyTurnstile('token','auth',{...env,TURNSTILE_HOSTNAMES:'tokfire.test,localhost'},valid),false);
 assert.equal(await verifyTurnstile('token','auth',env,async(url,options)=>{assert.equal(url,'https://challenges.cloudflare.com/turnstile/v0/siteverify');assert.equal(options.body.get('secret'),'server-secret');assert.equal(options.body.get('response'),'token');return valid();}),true);
 assert.deepEqual(turnstileOptions(env),{ready:true,siteKey:'public-key'});assert(!JSON.stringify(turnstileOptions(env)).includes('server-secret'));
 assert.equal(turnstileAction('/sign-in/social'),'auth');assert.equal(turnstileAction('/two-factor/verify-backup-code'),'two_factor');assert.equal(turnstileAction('/get-session'),null);
});
test('OAuth 2FA redirects preserve local locale/return paths and reject external auth loops',()=>{
 assert.equal(twoFactorReturn('https://tokfire.test/zh-Hant?tab=privacy','https://tokfire.test/api/auth'),'https://tokfire.test/zh-Hant/signin?two_factor=1&return_to=%2Fzh-Hant%3Ftab%3Dprivacy');
 for(const target of ['https://evil.invalid','/signin','/api/auth/sign-out'])assert.equal(twoFactorReturn(target,'https://tokfire.test/api/auth'),'https://tokfire.test/signin?two_factor=1&return_to=%2F');
});
function totp(uri){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',raw=new URL(uri).searchParams.get('secret').replace(/=+$/,'');let bits='';for(const c of raw)bits+=alphabet.indexOf(c).toString(2).padStart(5,'0');const key=Buffer.from((bits.match(/.{8}/g)||[]).map(b=>parseInt(b,2)));const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30_000)));const mac=createHmac('sha1',key).update(counter).digest();const offset=mac[mac.length-1]&15;return String((mac.readUInt32BE(offset)&0x7fffffff)%1_000_000).padStart(6,'0');}
async function harness(){
 const database=new DatabaseSync(':memory:'),used=new Set();let oauthUser;
 const auth=betterAuth({database,baseURL:'https://tokfire.test',secret:'test-only-tokfire-auth-security-01234567890123456789',trustedOrigins:['https://tokfire.test'],logger:{level:'error'},emailAndPassword:{enabled:true,minPasswordLength:12},rateLimit:{enabled:false},plugins:[...portalAuthPlugins(async(token,action)=>{if(token!==action||used.has(token))return false;used.add(token);return true;}),{
  id:'test-only-oauth-callback',endpoints:{testCallback:createAuthEndpoint('/callback/fixture',{method:'GET'},async ctx=>{
   const user=await ctx.context.internalAdapter.findUserById(oauthUser);const session=await ctx.context.internalAdapter.createSession(user.id);await setSessionCookie(ctx,{session,user});throw ctx.redirect('https://tokfire.test/zh-Hant?tab=privacy');
  })},
 }]});
 await (await getMigrations(auth.options)).runMigrations();
 const cookies=new Map();
 function accept(response){for(const item of response.headers.getSetCookie()){const first=item.split(';')[0],i=first.indexOf('=');const key=first.slice(0,i),value=first.slice(i+1);if(/max-age=0/i.test(item))cookies.delete(key);else cookies.set(key,value);}}
 async function request(path,body,options={}){const action=turnstileAction(path);if(!options.replay)used.clear();const r=await auth.handler(new Request('https://tokfire.test/api/auth'+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',origin:'https://tokfire.test',cookie:[...cookies].map(([k,v])=>k+'='+v).join(';'),...(options.noToken?{}:{'x-turnstile-token':action??''})},...(body===undefined?{}:{body:JSON.stringify(body)})}));accept(r);return r;}
 return {database,auth,request,cookies,oauthUser:id=>{oauthUser=id;}};
}
test('real Better Auth flow: TOTP enrollment, pending session, bad code, recovery single-use, OAuth gate and disable',async()=>{
 const h=await harness(),{request,database}=h;
 try{
 const credentials={email:'security@example.test',password:'test-password-only-123456'};
 let r=await request('/sign-up/email',{...credentials,name:'Security Test'},{noToken:true});assert.equal(r.status,403);assert.equal(database.prepare('select count(*) n from user').get().n,0);
 r=await request('/sign-up/email',{...credentials,name:'Security Test'});assert.equal(r.status,200);const user=(await r.json()).user;h.oauthUser(user.id);
 assert.equal((await request('/sign-up/email',{...credentials,email:'replay@example.test',name:'Replay'},{replay:true})).status,403);
 r=await request('/two-factor/enable',{password:credentials.password});assert.equal(r.status,200);const setup=await r.json();assert.equal(setup.backupCodes.length,10);assert(setup.totpURI.startsWith('otpauth://'));
 const stored=database.prepare('select * from twoFactor').get();assert(!stored.secret.includes(new URL(setup.totpURI).searchParams.get('secret')));assert(!stored.backupCodes.includes(setup.backupCodes[0]));
 assert.equal(database.prepare('select twoFactorEnabled from user').get().twoFactorEnabled,0);
 r=await request('/two-factor/verify-totp',{code:totp(setup.totpURI)});assert.equal(r.status,200);assert.equal(database.prepare('select twoFactorEnabled from user').get().twoFactorEnabled,1);
 await request('/sign-out',{});r=await request('/sign-in/email',credentials);assert.equal(r.status,200);assert.equal((await r.json()).twoFactorRedirect,true);
 assert.equal(await (await request('/get-session')).json(),null,'no session before second factor');
 r=await request('/two-factor/verify-totp',{code:'not-a-code'});assert.equal(r.status,401);assert.equal(await (await request('/get-session')).json(),null);
 r=await request('/two-factor/verify-backup-code',{code:setup.backupCodes[0]});assert.equal(r.status,200);assert((await (await request('/get-session')).json()).session);
 await request('/sign-out',{});await request('/sign-in/email',credentials);
 assert.equal((await request('/two-factor/verify-backup-code',{code:setup.backupCodes[0]})).status,401);
 assert.equal((await request('/two-factor/verify-totp',{code:totp(setup.totpURI)})).status,200);
 await request('/sign-out',{});
 r=await request('/callback/fixture');assert.equal(r.status,302);assert.equal(r.headers.get('location'),'https://tokfire.test/zh-Hant/signin?two_factor=1&return_to=%2Fzh-Hant%3Ftab%3Dprivacy');assert.equal(await (await request('/get-session')).json(),null,'OAuth cannot bypass second factor');
 assert.equal((await request('/two-factor/verify-totp',{code:totp(setup.totpURI)})).status,200);
 database.prepare('update session set createdAt=?').run(Date.now()-6*60_000);
 assert.equal((await request('/two-factor/disable',{password:credentials.password})).status,403,'old session cannot change security');
 database.prepare('update session set createdAt=?').run(Date.now());
 assert.equal((await request('/two-factor/disable',{password:'wrong'})).status,400);
 assert.equal((await request('/two-factor/disable',{password:credentials.password})).status,200);
 assert.equal(database.prepare('select count(*) n from twoFactor').get().n,0);
 assert.equal(database.prepare('select twoFactorEnabled from user').get().twoFactorEnabled,0);
 }finally{database.close();}
});
test('Google-only accounts can enroll without inventing a password and failed codes exhaust the challenge',async()=>{
 const h=await harness(),{request,database}=h;
 try{
 const r=await request('/sign-up/email',{email:'oauth-security@example.test',password:'temporary-fixture-password',name:'OAuth Fixture'});const user=(await r.json()).user;
 // Fixture removes the password account and adds a Google account before enrollment.
 database.prepare('update account set providerId=?, password=null where userId=?').run('google',user.id);h.oauthUser(user.id);
 const setupResponse=await request('/two-factor/enable',{method:'totp'});assert.equal(setupResponse.status,200);const setup=await setupResponse.json();
 assert.equal((await request('/two-factor/verify-totp',{code:totp(setup.totpURI)})).status,200);
 await request('/sign-out',{});await request('/callback/fixture');
 for(let i=0;i<5;i++)assert.equal((await request('/two-factor/verify-totp',{code:'bad-code'})).status,401);
 assert.equal(await (await request('/get-session')).json(),null);
 assert.notEqual((await request('/two-factor/verify-totp',{code:totp(setup.totpURI)})).status,200,'exhausted challenge must not accept even a valid code');
 await request('/callback/fixture');
 assert.equal((await request('/two-factor/verify-totp',{code:totp(setup.totpURI)})).status,200);
 assert.equal((await request('/two-factor/disable',{})).status,200);
 }finally{database.close();}
});
