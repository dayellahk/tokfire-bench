import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AGENT_CHECKS,WORKLOAD_PROFILES,workloadSchema} from '../lib/workloads.ts';
import {WORKLOAD_FINGERPRINTS,assessWorkloadFit} from '../lib/workload-fit.ts';
import {publicWorkloadSummary} from '../lib/workload-comparisons.ts';
import {findWorkloadResults} from '../lib/result-finder.ts';
import {challengeConfigSchema} from '../lib/challenge-protocol.ts';
function fixture(workload='agent-data'){
 const r=JSON.parse(readFileSync(new URL('./fixtures/workload-mac-real.json',import.meta.url)));
 const calls={'agent-data':2,'agent-research':4,'agent-recovery':7}[workload];
 r.runnerVersion='0.8.0';r.settings={...r.settings,workload,workloadSha256:WORKLOAD_FINGERPRINTS[workload],concurrencyLevels:[1,2,3],repeats:3,maxOutputTokens:WORKLOAD_PROFILES[workload].output,contextTokens:8192};
 r.models[0].samples=[1,2,3].flatMap(concurrency=>[1,2,3].flatMap(repeat=>Array.from({length:concurrency},(_,i)=>({jobId:i+1,concurrency,repeat,status:'complete',errorCode:null,elapsedMs:(calls+1)*100+10,toolCalls:calls,toolErrors:0,toolMs:1,verification:{suite:'tokfire-agent-sim-v1',checks:AGENT_CHECKS[workload].map(id=>({id,passed:true})),retries:workload==='agent-recovery'?2:0},requests:Array.from({length:calls+1},()=>({inputTokens:100,outputTokens:20,ttftMs:10,firstVisibleMs:15,elapsedMs:100,decodeTps:60,prefillTps:null,streamTps:null,endToEndTps:200,cachedTokens:0,finishReason:'stop'}))}))));
 r.groups=[1,2,3].flatMap(concurrency=>[1,2,3].map(repeat=>({concurrency,repeat,wallMs:1000,aggregateTps:concurrency*(calls+1)*20})));
 return r;
}
test('new simulations validate and retain per-level verified checks, retry counts and finder visibility',async()=>{
 for(const workload of Object.keys(AGENT_CHECKS)){
  const r=fixture(workload);assert.equal(workloadSchema.safeParse(r).success,true);
  assert.equal(challengeConfigSchema.safeParse({workload,engine:'llama.cpp',model:'test',concurrencyLevels:[1,2,3],repeats:3}).success,true);
  const summary=await publicWorkloadSummary(r);assert.equal(summary.fit.grade,'A');
  assert.equal(summary.rows[0].checksTotal,AGENT_CHECKS[workload].length*3);assert.equal(summary.rows[0].checksPassed,summary.rows[0].checksTotal);
  assert.equal(summary.rows[0].recoveryRetries,workload==='agent-recovery'?6:0);
  assert.equal(findWorkloadResults([summary],{query:'',platform:'all',memory:'all',purpose:'agent'}).length,1);
  assert.equal(findWorkloadResults([summary],{query:'',platform:'all',memory:'all',purpose:'chat'}).length,0);
 }
});
test('claimed completion cannot omit, rename or fail task checks, or impersonate an actual agent',()=>{
 for(const mutate of [r=>delete r.models[0].samples[0].verification,r=>r.models[0].samples[0].verification.checks[0].passed=false,r=>r.models[0].samples[0].verification.checks[0].id='arbitrary',r=>r.models[0].samples[0].verification.checks.pop(),r=>r.models[0].samples[0].verification.suite='hermes',r=>r.runnerVersion='0.7.0',r=>r.models[0].samples[0].verification.prompt='private',r=>r.models[0].samples[0].verification.retries=20]){
  const r=fixture();mutate(r);assert.equal(workloadSchema.safeParse(r).success,false);
 }
 const legacy=fixture();legacy.settings.workload='agent-tools';legacy.settings.maxOutputTokens=256;assert.equal(workloadSchema.safeParse(legacy).success,false);
 const recovery=fixture('agent-recovery');recovery.models[0].samples[0].verification.retries=0;assert.equal(workloadSchema.safeParse(recovery).success,false);
});
test('partial and failed tasks stay visible; speed alone cannot earn an agent grade',async()=>{
 const r=fixture();r.models[0].samples[0].verification.checks[2].passed=false;r.models[0].samples[0].status='partial';
 assert.equal(workloadSchema.safeParse(r).success,true);
 const summary=await publicWorkloadSummary(r);assert.equal(summary.fit.levels[0].grade,'D');assert.equal(summary.rows[0].complete,2);assert.equal(summary.rows[0].checksPassed,14);
 const missing=fixture();for(const row of missing.models[0].samples)for(const q of row.requests)q.decodeTps=null;
 assert.equal(assessWorkloadFit(missing).grade,'U');assert.equal((await publicWorkloadSummary(missing)).rows[0].checksPassed,15);
});
