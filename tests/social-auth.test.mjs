import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {betterAuth} from 'better-auth';
import {getMigrations} from 'better-auth/db/migration';
import {googleProvider,signInOptions,socialAuthOptions} from '../lib/social-auth.ts';
import {safeAuthReturn,socialSignInError} from '../lib/auth-return.ts';

test('unconfigured providers stay disabled; readiness never includes credentials',()=>{
 for(const env of [{},{GOOGLE_CLIENT_ID:'id'},{GOOGLE_CLIENT_SECRET:'secret'},{GOOGLE_CLIENT_ID:' ',GOOGLE_CLIENT_SECRET:'secret'}]){
  assert.equal(googleProvider(env),undefined);assert.deepEqual(signInOptions(env),{google:false});
 }
 assert.deepEqual(signInOptions({GOOGLE_CLIENT_ID:'id',GOOGLE_CLIENT_SECRET:'secret'}),{google:true});
});
test('return paths reject external destinations, encoded auth loops and malformed URLs',()=>{
 for(const value of [null,'https://evil.invalid','//evil.invalid','/\\evil.invalid','/\nevil','/%2f%2fevil.invalid','/%5cevil.invalid','/signin','/zh-Hant/signin?return_to=/','/zh-Hans/api/auth/callback/google','/%73ignin','/api/auth/sign-out','/%GG'])assert.equal(safeAuthReturn(value,'/zh-Hant'),'/zh-Hant',String(value));
 for(const value of ['/?tab=rankings','/zh-Hant?tab=privacy','/native-connect?code=example','/methodology#grades'])assert.equal(safeAuthReturn(value),value);
 assert.equal(socialSignInError('<script>evil</script>'),socialSignInError('unknown'));
});
test('Google OAuth initiation uses bound state and PKCE; unsafe redirects and callbacks cannot create sessions',async()=>{
 const database=new DatabaseSync(':memory:');
 const auth=betterAuth({database,baseURL:'https://tokfire.test',secret:'test-secret-only-not-production-1234567890',trustedOrigins:['https://tokfire.test'],logger:{level:'error'},
  ...socialAuthOptions({GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'test-secret'}),onAPIError:{errorURL:'https://tokfire.test/signin'}});
 await (await getMigrations(auth.options)).runMigrations();
 const start=(body,origin='https://tokfire.test')=>auth.handler(new Request('https://tokfire.test/api/auth/sign-in/social',{method:'POST',headers:{'content-type':'application/json',origin,cookie:'test_browser=1'},body:JSON.stringify({provider:'google',callbackURL:'https://tokfire.test/zh-Hant?tab=privacy',errorCallbackURL:'https://tokfire.test/zh-Hant/signin',...body})}));
 const response=await start({});assert.equal(response.status,200);
 const {url}=await response.json();const destination=new URL(url);
 assert.equal(destination.origin,'https://accounts.google.com');
 assert.equal(destination.searchParams.get('redirect_uri'),'https://tokfire.test/api/auth/callback/google');
 assert.equal(destination.searchParams.get('prompt'),'select_account');
 assert.equal(destination.searchParams.get('code_challenge_method'),'S256');
 assert(destination.searchParams.get('code_challenge'));assert(destination.searchParams.get('state'));
 assert.deepEqual(new Set(destination.searchParams.get('scope').split(' ')),new Set(['openid','email','profile']));
 assert.match(response.headers.get('set-cookie'),/HttpOnly/i);
 assert(!url.includes('test-secret'));
 assert.equal((await start({callbackURL:'https://evil.invalid'})).status,403);
 assert.equal((await start({errorCallbackURL:'https://evil.invalid'})).status,403);
 assert.equal((await start({},'https://evil.invalid')).status,403);
 const forged=await auth.handler(new Request('https://tokfire.test/api/auth/callback/google?code=forged&state=forged'));
 assert.equal(forged.status,302);assert.match(forged.headers.get('location'),/signin\?error=/);
 const sessions=database.prepare('select count(*) as n from session').get();assert.equal(sessions.n,0);
 assert.equal(auth.options.account.accountLinking.enabled,false);
 database.close();
});
