import test from 'node:test';
import assert from 'node:assert/strict';
import {workloadSchema,workloadSummary} from '../lib/workloads.ts';
import {nativeUploadSchema} from '../lib/serving.ts';
import {CONSENT_VERSION} from '../lib/benchmark.ts';
function fixture(agent=false,remote=false){
 const requests=()=>Array.from({length:agent?3:1},()=>({inputTokens:100,outputTokens:20,ttftMs:20,firstVisibleMs:25,elapsedMs:100,decodeTps:null,prefillTps:null,streamTps:240,endToEndTps:200,cachedTokens:null,finishReason:'stop'}));
 return {specVersion:'tokfire-workloads-v1',runnerVersion:'0.7.0',runId:crypto.randomUUID(),measuredAt:new Date().toISOString(),
 hardware:{platform:remote?'Android':'Linux',architecture:'arm64',chip:'Fixture CPU',machine:'Fixture device',cpuCores:8,memoryBytes:8*2**30,osVersion:'fixture-1',gpuNames:[],gpuMemoryBytes:null},
 runtime:{name:'vLLM',binarySha256:null,management:remote?'external-network':'external-loopback',identity:'unverified-server-model-id',gpuLayersRequested:null},
 settings:{workload:agent?'agent-tools':'short-chat',workloadSha256:'a'.repeat(64),concurrencyLevels:[1,2,3],repeats:3,maxOutputTokens:agent?256:512,contextTokens:agent?8192:4096,warmups:1,temperature:0,cachePolicy:'unique-prefix; report observed cache counts',targetTps:[100,200],timing:'runtime decode/prefill; client first output and wall time',inferenceLocation:remote?'remote-server':'same-device',hardwareRole:remote?'request-client':'inference-host',timeoutSeconds:180},
 models:[{modelName:'fixture',modelSha256:null,loadMs:null,samples:[1,2,3].flatMap(concurrency=>[1,2,3].flatMap(repeat=>Array.from({length:concurrency},(_,i)=>({jobId:i+1,concurrency,repeat,status:'complete',errorCode:null,elapsedMs:agent?310:110,requests:requests(),toolCalls:agent?2:0,toolErrors:0,toolMs:agent?1:0}))))}],
 groups:[1,2,3].flatMap(concurrency=>[1,2,3].map(repeat=>({concurrency,repeat,wallMs:500,aggregateTps:concurrency*(agent?60:20)/.5}))),
 telemetry:{before:{batteryPercent:null,batteryTemperatureC:null},after:{batteryPercent:null,batteryTemperatureC:null},energyJoules:null,peakGpuMemoryBytes:null}};
}
const envelope=r=>({report:r,consent:{collect:true,publish:false,version:CONSENT_VERSION}});
test('workload chat, agent and remote Android reports accepted without manufactured decode timing',()=>{
 for(const a of [false,true])for(const remote of [false,true]){const r=fixture(a,remote);assert.equal(workloadSchema.safeParse(r).success,true);assert.equal(nativeUploadSchema.safeParse(envelope(r)).success,true);}
});
test('privacy allowlist excludes generated text, endpoints, keys and hardware IDs',()=>{
 for(const change of [r=>r.endpoint='http://secret',r=>r.hardware.serial='secret',r=>r.runtime.apiKey='secret',r=>r.models[0].samples[0].requests[0].output='secret']){const r=fixture();change(r);assert.equal(workloadSchema.safeParse(r).success,false);}
});
test('reject incomplete sweeps, duplicate jobs, wrong totals and fabricated timing',()=>{
 for(const change of [r=>r.groups.pop(),r=>r.models[0].samples.pop(),r=>r.models[0].samples[1]=r.models[0].samples[0],r=>r.groups[0].aggregateTps=900,r=>r.models[0].samples[0].requests[0].endToEndTps=99,r=>r.models[0].samples[0].elapsedMs=1,r=>r.settings.maxOutputTokens=128]){const r=fixture();change(r);assert.equal(workloadSchema.safeParse(r).success,false);}
});
test('agent success needs measured three-step tool sequence and local identity cannot be forged for remote reports',()=>{
 let r=fixture(true);r.models[0].samples[0].toolCalls=1;assert.equal(workloadSchema.safeParse(r).success,false);
 r=fixture(false,true);r.settings.hardwareRole='inference-host';assert.equal(workloadSchema.safeParse(r).success,false);
 r=fixture();r.models[0].modelSha256='b'.repeat(64);assert.equal(workloadSchema.safeParse(r).success,false);
 r=fixture();r.models[0].samples[0].requests[0].firstVisibleMs=null;assert.equal(workloadSchema.safeParse(r).success,false);
});
test('failed measured jobs remain in denominators and throughput totals',()=>{
 const r=fixture();const row=r.models[0].samples[0];row.requests=[];row.status='error';row.errorCode='timeout';r.groups[0].aggregateTps=0;
 assert.equal(workloadSchema.safeParse(r).success,true);const summary=workloadSummary(r)[0];assert.equal(summary.attempts,3);assert.equal(summary.complete,2);
});
test('consent required for workload uploads',()=>{
 const r=envelope(fixture());r.consent.collect=false;assert.equal(nativeUploadSchema.safeParse(r).success,false);
});


const {publicWorkloadSummary}=await import('../lib/workload-comparisons.ts');
test('public comparison is an allowlisted summary and remote hardware stays identified as client',async()=>{
 const report=fixture(false,true);const summary=await publicWorkloadSummary(report);
 assert.equal(summary.location,'remote-server');assert.equal(summary.rows[0].attempts,3);
 assert.equal(summary.rows[0].decodeTps,null);
 assert.deepEqual(Object.keys(summary).sort(),['runId','measuredAt','platform','chip','memoryBytes','model','modelHash','runtime','runtimeHash','workload','location','cohort','contextTokens','repeats','gpuNames','fit','rows'].sort());
 assert.equal(await publicWorkloadSummary({...report,ownerEmail:'private@example.invalid'}),null);
});
test('unverified external model IDs cannot merge into exact-build comparison groups',async()=>{
 const first=fixture();const second=structuredClone(first);second.runId=crypto.randomUUID();
 const a=await publicWorkloadSummary(first),b=await publicWorkloadSummary(second);
 assert.notEqual(a.cohort,b.cohort);
 assert.equal(a.cohort,(await publicWorkloadSummary(first)).cohort);
});

test('Pro advanced experiments cannot enter standard uploads or ranking contracts',()=>{
 const advanced=fixture();advanced.specVersion='tokfire-advanced-v1';advanced.runnerVersion='0.9.0';
 advanced.settings.mode='pro-advanced';advanced.settings.advanced={configurationSha256:'b'.repeat(64)};
 assert.equal(workloadSchema.safeParse(advanced).success,false);
 assert.equal(nativeUploadSchema.safeParse(envelope(advanced)).success,false);
 const disguised=fixture();disguised.settings.advanced={requested:{temperature:0.5}};
 assert.equal(nativeUploadSchema.safeParse(envelope(disguised)).success,false);
});
