import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {issueChallenge,inspectIntegrity,requestDigest,uploadRateLimit,canonical} from '../lib/integrity.ts';
import {storeNativeSubmission,ownSubmissions,deleteSubmission,publication,leaderboard} from '../lib/repository.ts';
import {CONSENT_VERSION} from '../lib/benchmark.ts';
function database(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
 function prepare(q){let args=[];return {bind(...a){args=a;return this;},async first(){return sql.prepare(q).get(...args)??null;},async all(){return {results:sql.prepare(q).all(...args)};},async run(){return {meta:{changes:sql.prepare(q).run(...args).changes}};}};}
 return {sql,prepare,async batch(items){sql.exec('BEGIN');try{const result=[];for(const s of items)result.push(await s.run());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}};
}
const fixture=()=>{const r=JSON.parse(readFileSync(new URL('./fixtures/workload-mac-real.json',import.meta.url)));r.runId=crypto.randomUUID();r.measuredAt=new Date().toISOString();return r;};
const config=r=>({workload:r.settings.workload,engine:r.runtime.name,model:r.models[0].modelName,concurrencyLevels:r.settings.concurrencyLevels,repeats:r.settings.repeats});
const envelope=(r,publish=false)=>({report:r,consent:{collect:true,publish,version:CONSENT_VERSION}});
async function challenged(db,owner='guest-a',issued=Date.now()-3600000){const r=fixture(),ticket=await issueChallenge(db,owner,config(r),issued);r.runId=ticket.runId;r.challenge={id:ticket.id,nonce:ticket.nonce,requestDigest:requestDigest(ticket.nonce,ticket.runId,ticket.config)};return {r,ticket};}
test('challenge binds guest, run, model, workload and every concurrent request',async()=>{
 const db=database();try{const {r}=await challenged(db);assert.equal((await inspectIntegrity(db,'guest-a',r,r.challenge)).status,'challenge-checked');
 for(const change of [x=>x.runId=crypto.randomUUID(),x=>x.challenge.nonce='a'.repeat(64),x=>x.challenge.requestDigest='b'.repeat(64),x=>x.models[0].modelName='different',x=>x.settings.repeats=5]){const x=structuredClone(r);change(x);await assert.rejects(inspectIntegrity(db,'guest-a',x,x.challenge),{status:409});}
 await assert.rejects(inspectIntegrity(db,'guest-b',r,r.challenge),{status:409});
 }finally{db.sql.close();}
});
test('expired and impossible elapsed-time tickets are held for review, not silently verified',async()=>{
 const db=database();try{const {r,ticket}=await challenged(db,'guest-a',Date.now()-2*86400000);let out=await inspectIntegrity(db,'guest-a',r,r.challenge);assert.equal(out.status,'quarantined');assert(out.reasons.includes('challenge-expired'));
 db.sql.prepare('UPDATE run_challenges SET issued_at=?,expires_at=? WHERE id=?').run(Date.now()+60000,Date.now()+86400000,ticket.id);
 out=await inspectIntegrity(db,'guest-a',r,r.challenge);assert(out.reasons.includes('server-time-window-mismatch'));
 }finally{db.sql.close();}
});
test('single-use claims, exact retry acknowledgement, altered retry rejection and replay after deletion',async()=>{
 const db=database();try{const {r}=await challenged(db);const saved=await storeNativeSubmission(db,'guest-a',envelope(r));assert.equal(saved.status,'challenge-checked');
 assert.equal((await storeNativeSubmission(db,'guest-a',envelope(r))).duplicate,true);
 const clone=structuredClone(r);clone.runId=crypto.randomUUID();delete clone.challenge;await assert.rejects(storeNativeSubmission(db,'guest-a',envelope(clone)),{status:409});
 const altered=structuredClone(r);altered.hardware.chip='changed';await assert.rejects(storeNativeSubmission(db,'guest-a',envelope(altered)),{status:409});
 await assert.rejects(storeNativeSubmission(db,'guest-b',envelope(r)),{status:409});
 await deleteSubmission(db,'guest-a',saved.id);await assert.rejects(storeNativeSubmission(db,'guest-a',envelope(r)),{status:409});
 assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM challenge_claims').get().n,1);
 assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM submission_integrity').get().n,0);
 }finally{db.sql.close();}
});
test('failed transaction does not consume challenge or receipt; retry can succeed',async()=>{
 const db=database();try{const {r}=await challenged(db);db.sql.exec("CREATE TRIGGER fail_claim BEFORE INSERT ON challenge_claims BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
 await assert.rejects(storeNativeSubmission(db,'guest-a',envelope(r)));for(const table of ['submissions','submission_integrity','run_receipts','challenge_claims'])assert.equal(db.sql.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,0);
 db.sql.exec('DROP TRIGGER fail_claim');assert.equal((await storeNativeSubmission(db,'guest-a',envelope(r))).stored,true);
 }finally{db.sql.close();}
});
test('quarantine stays private after publication request, exposes reason to owner only; old reports remain unverified',async()=>{
 const db=database();try{const r=fixture();r.models[0].samples[0].requests[0].decodeTps=50000;
 const saved=await storeNativeSubmission(db,'guest-a',envelope(r,true));assert.equal(saved.status,'quarantined');assert.equal(saved.published,false);assert.equal((await storeNativeSubmission(db,'guest-a',envelope(r,true))).status,'quarantined');assert.equal((await publication(db,'guest-a',saved.id,true,CONSENT_VERSION)).published,false);
 const rows=(await ownSubmissions(db,'guest-a')).results;assert.equal(rows[0].integrityStatus,'quarantined');assert.match(rows[0].integrityReasons,/extreme-throughput/);assert.equal((await ownSubmissions(db,'guest-b')).results.length,0);
 assert.equal((await leaderboard(db)).results.length,0);
 assert.equal((await storeNativeSubmission(db,'guest-a',envelope(fixture()))).status,'community-unverified');
 // The public v2 feed must filter quarantine before selecting report JSON.
 const route=readFileSync(new URL('../app/api/v2/leaderboard/route.ts',import.meta.url),'utf8');assert(route.includes("<> 'quarantined'"));
 }finally{db.sql.close();}
});
test('durable per-owner attempt limit survives report deletion and resets next hour',async()=>{
 const db=database();try{const req=new Request('https://example.test/api');const now=36000000;
 for(let n=0;n<20;n++)await uploadRateLimit(db,req,'a','challenge',now);
 await assert.rejects(uploadRateLimit(db,req,'a','challenge',now),{status:429});
 await uploadRateLimit(db,req,'b','challenge',now);await uploadRateLimit(db,req,'a','challenge',now+3600000);
 }finally{db.sql.close();}
});
test('IP limits survive rotating guest identities; spoofable forwarding headers are ignored',async()=>{
 const db=database(),oldTrust=process.env.BENCH_TRUST_PROXY,oldSecret=process.env.BENCH_RATE_SECRET;
 process.env.BENCH_TRUST_PROXY='1';process.env.BENCH_RATE_SECRET='test-only-secret';
 try{const now=36000000;for(let n=0;n<120;n++)await uploadRateLimit(db,new Request('https://example.test',{headers:{'x-tokfire-client-ip':'192.0.2.1','x-forwarded-for':String(n)}}),'guest-'+n,'upload',now);
 await assert.rejects(uploadRateLimit(db,new Request('https://example.test',{headers:{'x-tokfire-client-ip':'192.0.2.1','x-forwarded-for':'spoof'}}),'fresh','upload',now),{status:429});
 const rows=db.sql.prepare('SELECT * FROM abuse_events').all();assert(!JSON.stringify(rows).includes('192.0.2.1'));
 }finally{if(oldTrust===undefined)delete process.env.BENCH_TRUST_PROXY;else process.env.BENCH_TRUST_PROXY=oldTrust;if(oldSecret===undefined)delete process.env.BENCH_RATE_SECRET;else process.env.BENCH_RATE_SECRET=oldSecret;db.sql.close();}
});
test('canonical report digest ignores key order; clients cannot choose trust status',async()=>{
 assert.equal(canonical({b:2,a:{y:1,x:0}}),canonical({a:{x:0,y:1},b:2}));
 const db=database();try{await assert.rejects(storeNativeSubmission(db,'a',{...envelope(fixture()),status:'challenge-checked'}),{status:400});}finally{db.sql.close();}
});
