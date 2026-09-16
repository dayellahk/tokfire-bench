import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { reportSchema, summarize, cohortKey, CONSENT_VERSION } from '../lib/benchmark.ts';
import { saveSubmission, leaderboard, ownSubmissions, publication, deleteSubmission } from '../lib/repository.ts';
import { authorizeWrite } from '../lib/access.ts';

function report() {
  return {specVersion:'local-ai-text-v1',runnerVersion:'0.2.0',runId:crypto.randomUUID(),measuredAt:new Date().toISOString(),
    hardware:{chip:'Apple M4 Pro',machine:'Mac16,7',cpuCores:14,memoryBytes:48*2**30,osVersion:'15.5'},
    runtime:{name:'llama.cpp',binarySha256:'a'.repeat(64),versionSha256:'b'.repeat(64),threads:14,contextTokens:4096,gpuLayers:999,batchTokens:512,ubatchTokens:512,flashAttention:false,kvCache:'f16'},
    models:['1','2','3'].map(hash=>({modelSha256:hash.repeat(64),modelBytes:1000,loadMs:1000,peakProcessRssBytes:2000,
      samples:[512,2048].flatMap(inputTokens=>[1,2,3].map(repeat=>({inputTokens,outputTokens:128,repeat,ttftMs:200,
        prefillTps:inputTokens/0.1,prefillMs:100,decodeTps:128/(3+repeat),decodeMs:(3+repeat)*1000,elapsedMs:10000}))) }))};
}
function database() {
  const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
  for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new URL(`../drizzle/${file}`,import.meta.url),'utf8'));
  function prepare(query){let args=[];return {bind(...values){args=values;return this;},
    async first(){return sql.prepare(query).get(...args)??null;},async all(){return {results:sql.prepare(query).all(...args)};},
    async run(){return {meta:{changes:sql.prepare(query).run(...args).changes}};}};}
  return {sql,prepare,async batch(statements){sql.exec('BEGIN');try{const values=[];for(const s of statements)values.push(await s.run());sql.exec('COMMIT');return values;}catch(e){sql.exec('ROLLBACK');throw e;}}};
}
const payload=(r,publish=false)=>({report:r,consent:{collect:true,publish,version:CONSENT_VERSION}});

test('valid report medians and changes to runtime/model/workload split cohorts',async()=>{
  const r=report();assert.equal(reportSchema.safeParse(r).success,true);
  const rows=summarize(r);assert.equal(rows.length,6);assert.equal(rows[0].decodeTps,25.6);
  const a=await cohortKey(r,rows[0]);assert.notEqual(a,await cohortKey(r,rows[1]));
  r.runtime.binarySha256='c'.repeat(64);assert.notEqual(a,await cohortKey(r,rows[0]));
});
test('reject extra personal fields, incomplete workloads, duplicate models and inconsistent timing',()=>{
  const variants=[r=>r.hardware.serial='secret',r=>r.models[0].samples.pop(),r=>r.models[0].samples[0].decodeTps=999,
    r=>r.models[1].modelSha256=r.models[0].modelSha256,r=>r.models[0].samples[0].repeat=2,r=>r.models[0].samples[0].ttftMs=20000];
  for(const mutate of variants){const r=report();mutate(r);assert.equal(reportSchema.safeParse(r).success,false);}
});
test('accept updated standard runner and reject short trial submissions before persistence',async()=>{
  const r=report();r.runnerVersion='0.2.1';assert.equal(reportSchema.safeParse(r).success,true);
  r.specVersion='local-ai-trial-v1';r.models=r.models.slice(0,1);r.models[0].samples=r.models[0].samples.slice(0,1);
  r.models[0].samples[0].outputTokens=32;
  assert.equal(reportSchema.safeParse(r).success,false);
  const db=database();await assert.rejects(saveSubmission(db,'owner',payload(r,true)),{status:400});
  assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM submissions').get().n,0);db.sql.close();
});
test('single-model full benchmark can be saved and compared with collection and publication consent',async()=>{
  const r=report();r.runnerVersion='0.2.1';r.models=r.models.slice(0,1);
  assert.equal(reportSchema.safeParse(r).success,true);
  const db=database();await saveSubmission(db,'owner',payload(r,true));
  assert.equal((await ownSubmissions(db,'owner')).results.length,1);
  assert.equal((await leaderboard(db)).results.length,2);db.sql.close();
});
test('collection consent required; private results cannot leak; owner can publish, withdraw and delete',async()=>{
  const db=database(),r=report();
  const noConsent=payload(r);noConsent.consent.collect=false;
  await assert.rejects(saveSubmission(db,'owner-A',noConsent),{status:400});
  assert.equal(db.sql.prepare('SELECT count(*) n FROM submissions').get().n,0);
  const saved=await saveSubmission(db,'owner-A',payload(r));
  assert.equal((await leaderboard(db)).results.length,0);
  assert.equal((await ownSubmissions(db,'owner-B')).results.length,0);
  await assert.rejects(publication(db,'owner-B',saved.id,true,CONSENT_VERSION),{status:404});
  await assert.rejects(deleteSubmission(db,'owner-B',saved.id),{status:404});
  await publication(db,'owner-A',saved.id,true,CONSENT_VERSION);
  const publicRows=(await leaderboard(db)).results;assert.equal(publicRows.length,6);
  assert.equal(JSON.stringify(publicRows).includes('owner-A'),false);
  await publication(db,'owner-A',saved.id,false,CONSENT_VERSION);
  assert.equal((await leaderboard(db)).results.length,0);
  await deleteSubmission(db,'owner-A',saved.id);
  assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM measurements').get().n,0);
  db.sql.close();
});
test('duplicate run does not inflate comparisons and failed batch rolls back everything',async()=>{
  const db=database(),r=report();await saveSubmission(db,'owner',payload(r,true));
  await assert.rejects(saveSubmission(db,'owner',payload(r,true)),{status:409});
  assert.equal((await leaderboard(db)).results[0].runs,1);
  db.sql.exec("CREATE TRIGGER fail_measure BEFORE INSERT ON measurements BEGIN SELECT RAISE(ABORT,'test failure'); END");
  await assert.rejects(saveSubmission(db,'owner',payload(report())));
  assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM submissions').get().n,1);db.sql.close();
});
test('unauthenticated and cross-origin mutations fail before storage',()=>{
  assert.throws(()=>authorizeWrite(new Request('https://bench.test/api'),'') ,{status:401});
  assert.throws(()=>authorizeWrite(new Request('https://bench.test/api',{headers:{origin:'https://attacker.test'}}),'owner'),{status:403});
  assert.equal(authorizeWrite(new Request('https://bench.test/api',{headers:{origin:'https://bench.test'}}),'owner'),'owner');
});

test('reverse proxy writes use the configured public origin, not an internal listener or spoofed header',()=>{
 const internal='http://127.0.0.1:3000/api/v2/submissions';
 assert.equal(authorizeWrite(new Request(internal,{headers:{origin:'https://tokfires.com'}}),'owner','https://tokfires.com'),'owner');
 assert.throws(()=>authorizeWrite(new Request(internal,{headers:{origin:'https://attacker.invalid','x-forwarded-host':'attacker.invalid'}}),'owner','https://tokfires.com'),{status:403});
});

test('one-token runtime timing boundary tolerates machine rounding, not extra missing tokens',()=>{
  const r=report();const s=r.models[0].samples[0];
  s.decodeMs=2600.445;s.decodeTps=48.83779506968999;
  assert.equal(reportSchema.safeParse(r).success,true);
  s.decodeTps=(s.outputTokens-1.00001)*1000/s.decodeMs;
  assert.equal(reportSchema.safeParse(r).success,false);
  s.decodeTps=(s.outputTokens-2)*1000/s.decodeMs;
  assert.equal(reportSchema.safeParse(r).success,false);
});
