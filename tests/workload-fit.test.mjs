import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {workloadSchema,WORKLOAD_PROFILES} from '../lib/workloads.ts';
import {assessWorkloadFit,WORKLOAD_FINGERPRINTS} from '../lib/workload-fit.ts';
import {publicWorkloadSummary} from '../lib/workload-comparisons.ts';
const real=JSON.parse(readFileSync(new URL('./fixtures/workload-mac-real.json',import.meta.url)));
function fixture(workload='agent-tools',levels=[1,2,3]){
 const r=structuredClone(real),agent=workload==='agent-tools';
 r.settings={...r.settings,workload,workloadSha256:WORKLOAD_FINGERPRINTS[workload],concurrencyLevels:levels,repeats:3,maxOutputTokens:WORKLOAD_PROFILES[workload].output,contextTokens:WORKLOAD_PROFILES[workload].context};
 r.models[0].samples=levels.flatMap(concurrency=>[1,2,3].flatMap(repeat=>Array.from({length:concurrency},(_,i)=>({jobId:i+1,concurrency,repeat,status:'complete',errorCode:null,elapsedMs:agent?12001:4000,toolCalls:agent?2:0,toolErrors:0,toolMs:agent?1:0,requests:Array.from({length:agent?3:1},()=>({inputTokens:100,outputTokens:50,ttftMs:100,firstVisibleMs:500,elapsedMs:4000,decodeTps:60,prefillTps:1000,streamTps:50,endToEndTps:12.5,cachedTokens:0,finishReason:'stop'}))}))));
 r.groups=levels.flatMap(concurrency=>[1,2,3].map(repeat=>({concurrency,repeat,wallMs:agent?13000:5000,aggregateTps:concurrency*(agent?150:50)/(agent?13:5)})));
 return r;
}
function assess(r){const valid=workloadSchema.safeParse(r);assert(valid.success,JSON.stringify(valid.error));return assessWorkloadFit(valid.data);}
test('A/B grades require successful tool workflows at each measured job level',()=>{
 const f=assess(fixture());assert.deepEqual(f.levels.map(x=>x.grade),['B','A','A']);assert.equal(f.grade,'A');assert.equal(f.maxSmoothJobs,3);
 assert.equal(assess(fixture('agent-tools',[1])).grade,'B');
});
test('chat, business and long-summary never become agent grades at high concurrency',()=>{
 for(const name of ['short-chat','business','long-summary']){const f=assess(fixture(name,[3]));assert.equal(f.grade,'C');assert.equal(f.maxSmoothJobs,3);assert.equal(f.levels.length,1);}
});
test('one slow request defeats fast medians/aggregate; single-job capacity is retained',()=>{
 const r=fixture();for(const n of [2,3])r.models[0].samples.find(s=>s.concurrency===n).requests[0].decodeTps=29.99;
 const f=assess(r);assert.equal(f.grade,'B');assert.equal(f.maxSmoothJobs,1);assert.deepEqual(f.levels.map(x=>x.grade),['B','D','D']);
});
test('inclusive app interaction boundaries and first visible response are used',()=>{
 const r=fixture('short-chat',[1]);for(const s of r.models[0].samples){s.requests[0].decodeTps=30;s.requests[0].firstVisibleMs=3000;}
 assert.equal(assess(r).grade,'C');r.models[0].samples[0].requests[0].firstVisibleMs=3001;assert.equal(assess(r).grade,'D');
});
test('failed and partial tasks or tool errors cannot earn A/B despite fast streams',()=>{
 for(const status of ['failure','partial']){const r=fixture();r.models[0].samples.find(s=>s.concurrency===3).status=status;const f=assess(r);assert.equal(f.levels[2].grade,'D');assert.equal(f.maxSmoothJobs,2);}
 const r=fixture();r.models[0].samples[0].status='failure';r.models[0].samples[0].toolErrors=1;assert(assess(r).levels[0].reasons.includes('tool-errors'));
});
test('missing runtime timing is unknown, while an observed failure stays actionable',()=>{
 const r=fixture('short-chat',[1]);r.models[0].samples[0].requests[0].decodeTps=null;
 assert.equal(assess(r).grade,'U');assert.equal(assess(r).maxSmoothJobs,null);assert.equal(assess(r).levels[0].meets100Tps,null);
 r.models[0].samples[1].status='partial';assert.equal(assess(r).grade,'D');
 const agent=fixture('agent-tools',[1]);agent.models[0].samples[0].requests[0].firstVisibleMs=null;assert.equal(assess(agent).grade,'U');
});
test('remote client specs and unknown prompt fingerprints cannot receive hardware grades',()=>{
 const r=fixture();r.runtime={name:'vLLM',binarySha256:null,management:'external-network',identity:'unverified-server-model-id',gpuLayersRequested:null};r.models[0].modelSha256=null;r.models[0].loadMs=null;r.settings.inferenceLocation='remote-server';r.settings.hardwareRole='request-client';
 assert.equal(assess(r).grade,'U');assert.equal(assess(r).maxSmoothJobs,null);
 const unknown=fixture();unknown.settings.workloadSha256='f'.repeat(64);assert.equal(assess(unknown).grade,'U');
});
test('100 tok/s target is separate from grade and must hold for every request',()=>{
 const r=fixture('short-chat',[1]);assert.equal(assess(r).grade,'C');assert.equal(assess(r).levels[0].meets100Tps,false);
 for(const s of r.models[0].samples)s.requests[0].decodeTps=100;assert.equal(assess(r).levels[0].meets100Tps,true);
 r.models[0].samples[0].requests[0].decodeTps=99;assert.equal(assess(r).levels[0].meets100Tps,false);
});
test('no untested job levels are inferred from a single measured level',()=>{
 const f=assess(fixture('agent-tools',[3]));assert.deepEqual(f.levels.map(l=>l.jobs),[3]);assert.equal(f.maxSmoothJobs,3);
});
test('real 0.7 app report is graded without changing its measurements',async()=>{
 const before=JSON.stringify(real),dto=await publicWorkloadSummary(real);assert.equal(dto.fit.grade,'C');assert.equal(dto.fit.maxSmoothJobs,1);assert.equal(JSON.stringify(real),before);
});
test('web thresholds and profile hashes match the shipped Python app assessor',()=>{
 const cases=[fixture(),fixture('short-chat',[1]),fixture('agent-tools',[3])];cases[1].models[0].samples[0].requests[0].firstVisibleMs=3001;cases[2].models[0].samples[0].requests[0].decodeTps=null;
 const code="import sys,json;sys.path.insert(0,'native/Sources/LocalAIBench/Resources');from workload_core import PROFILES,fingerprint,summaries;print(json.dumps({'hashes':{k:fingerprint(k) for k in PROFILES},'smooth':[[s['smooth'] for s in summaries(r)] for r in json.load(sys.stdin)]}))";
 const p=spawnSync('python3',['-c',code],{cwd:new URL('../',import.meta.url),input:JSON.stringify(cases),encoding:'utf8'});assert.equal(p.status,0,p.stderr);const result=JSON.parse(p.stdout);assert.deepEqual(result.hashes,WORKLOAD_FINGERPRINTS);assert.deepEqual(result.smooth,cases.map(r=>assess(r).levels.map(l=>['A','B','C'].includes(l.grade))));
});
