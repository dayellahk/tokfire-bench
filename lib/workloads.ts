import {z} from 'zod';
import {challengeEvidenceSchema} from './challenge-protocol.ts';
const pos=z.number().finite().positive();
const nonneg=z.number().finite().nonnegative();
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const label=(max:number)=>z.string().min(1).max(max).regex(/^[^\x00-\x1f\x7f]+$/);
const ms=pos.max(3_100_000);
const metric=pos.max(1e9).nullable();
const requestSchema=z.object({inputTokens:pos.int().max(200000),outputTokens:pos.int().max(1536),
 ttftMs:ms,firstVisibleMs:ms.nullable(),elapsedMs:ms,decodeTps:metric,prefillTps:metric,streamTps:metric,endToEndTps:pos.max(1e9),
 cachedTokens:nonneg.int().max(200000).nullable(),finishReason:z.enum(['stop','length'])}).strict().superRefine((r,c)=>{
 if(r.ttftMs>r.elapsedMs || (r.firstVisibleMs!==null&&(r.firstVisibleMs<r.ttftMs || r.firstVisibleMs>r.elapsedMs)) || (r.cachedTokens!==null&&r.cachedTokens>r.inputTokens) || Math.abs(r.endToEndTps*r.elapsedMs/1000-r.outputTokens)>.01)c.addIssue({code:'custom',message:'Inconsistent request timings'});
});
export const AGENT_CHECKS={
 'agent-data':['source-read','artifact-written','row-filter','total-cents','region-totals'],
 'agent-research':['all-pages-read','artifact-written','eligible-cheapest','source-evidence'],
 'agent-recovery':['request-read','transient-retried','reservation-once','receipt-read','artifact-correct'],
} as const;
export function isAgentSimulation(value:string):value is keyof typeof AGENT_CHECKS{return Object.hasOwn(AGENT_CHECKS,value);}
export function isAgentWorkload(value:string){return value==='agent-tools'||isAgentSimulation(value);}
const verificationSchema=z.object({suite:z.literal('tokfire-agent-sim-v1'),checks:z.array(z.object({id:z.string().max(40),passed:z.boolean()}).strict()).min(4).max(5),retries:nonneg.int().max(12)}).strict();
const jobSchema=z.object({jobId:pos.int().max(20),concurrency:pos.int().max(20),repeat:pos.int().max(5),status:z.enum(['complete','partial','failure','error']),
 errorCode:z.enum(['http-error','invalid-stream','timeout','response-too-large','runtime-error','incomplete-stream','missing-token-usage','invalid-token-usage','context-exceeded','transport-or-protocol-error']).nullable(),
 elapsedMs:ms,requests:z.array(requestSchema).max(12),verification:verificationSchema.optional(),toolCalls:nonneg.int().max(12),toolErrors:nonneg.int().max(12),toolMs:nonneg.max(600000)}).strict().superRefine((s,c)=>{
 if(s.jobId>s.concurrency || s.toolErrors>s.toolCalls+1 || s.toolMs>s.elapsedMs || s.requests.reduce((n,r)=>n+r.elapsedMs,0)+s.toolMs>s.elapsedMs+.1 || (s.status==='error')!==(s.errorCode!==null) || (s.status!=='error'&&s.requests.length===0))c.addIssue({code:'custom',message:'Inconsistent job result'});
});
const battery=z.object({batteryPercent:nonneg.max(100).nullable(),batteryTemperatureC:z.number().finite().min(-50).max(150).nullable()}).strict();
export const WORKLOAD_PROFILES={
 'short-chat':{output:512,context:4096},business:{output:1024,context:8192},'long-summary':{output:1536,context:32768},'agent-tools':{output:256,context:8192},'agent-data':{output:768,context:8192},'agent-research':{output:768,context:8192},'agent-recovery':{output:768,context:8192}
} as const;
export const workloadSchema=z.object({
 challenge:challengeEvidenceSchema.optional(),
 specVersion:z.literal('tokfire-workloads-v1'),runnerVersion:z.enum(['0.7.0','0.8.0']),runId:z.string().uuid(),measuredAt:z.string().datetime(),
 hardware:z.object({platform:z.enum(['macOS','Windows','Linux','Android']),architecture:label(32),chip:label(160),machine:label(160),cpuCores:pos.int().max(4096),memoryBytes:pos.int().max(2**50),osVersion:label(80),gpuNames:z.array(label(160)).max(8),gpuMemoryBytes:z.array(pos.int().max(2**50)).max(8).nullable()}).strict(),
 runtime:z.object({name:z.enum(['llama.cpp','oMLX','Ollama','vLLM']),binarySha256:hash.nullable(),management:z.enum(['managed','external-loopback','external-network']),identity:z.enum(['local-file-sha256','unverified-server-model-id']),gpuLayersRequested:nonneg.int().max(999).nullable()}).strict(),
 settings:z.object({workload:z.enum(['short-chat','business','long-summary','agent-tools','agent-data','agent-research','agent-recovery']),workloadSha256:hash,concurrencyLevels:z.array(pos.int().max(20)).min(1).max(9),repeats:z.number().int().min(3).max(5),maxOutputTokens:pos.int(),contextTokens:pos.int(),warmups:z.literal(1),temperature:z.literal(0),cachePolicy:z.literal('unique-prefix; report observed cache counts'),targetTps:z.tuple([z.literal(100),z.literal(200)]),timing:z.literal('runtime decode/prefill; client first output and wall time'),inferenceLocation:z.enum(['same-device','remote-server']),hardwareRole:z.enum(['inference-host','request-client']),timeoutSeconds:z.number().int().min(10).max(600)}).strict(),
 models:z.array(z.object({modelName:label(200),modelSha256:hash.nullable(),loadMs:ms.nullable(),samples:z.array(jobSchema).min(3).max(500)}).strict()).length(1),
 groups:z.array(z.object({concurrency:pos.int().max(20),repeat:pos.int().max(5),wallMs:ms,aggregateTps:nonneg.max(2e10)}).strict()).min(3).max(45),
 telemetry:z.object({before:battery,after:battery,energyJoules:z.null(),peakGpuMemoryBytes:z.null()}).strict(),
}).strict().superRefine((r,c)=>{
 const invalid=(message:string)=>c.addIssue({code:'custom',message});
 const cfg=r.settings,p=WORKLOAD_PROFILES[cfg.workload],counts=cfg.concurrencyLevels,model=r.models[0];
 if(p.output!==cfg.maxOutputTokens||p.context!==cfg.contextTokens)invalid('Invalid workload profile');
 if(new Set(counts).size!==counts.length||counts.some((v,i)=>i>0&&counts[i-1]>=v))invalid('Invalid sweep');
 if((cfg.inferenceLocation==='remote-server')!==(r.runtime.management==='external-network')||(cfg.hardwareRole==='request-client')!==(cfg.inferenceLocation==='remote-server'))invalid('Invalid hardware attribution');
 if(r.runtime.management==='managed'){
  if(!r.runtime.binarySha256||!model.modelSha256||model.loadMs===null||r.runtime.identity!=='local-file-sha256'||!['llama.cpp','oMLX'].includes(r.runtime.name))invalid('Missing managed runtime identity');
 }else if(r.runtime.binarySha256!==null||model.modelSha256!==null||model.loadMs!==null||r.runtime.gpuLayersRequested!==null||r.runtime.identity!=='unverified-server-model-id')invalid('Unverified server identity must be explicit');
 if(r.runtime.name==='oMLX'&&cfg.inferenceLocation==='same-device'&&r.hardware.platform!=='macOS')invalid('oMLX requires macOS');
 if(r.runtime.management==='managed'&&((r.runtime.name==='llama.cpp')!==(r.runtime.gpuLayersRequested!==null)))invalid('Invalid GPU request');
 const samples=model.samples;
 if(samples.length!==counts.reduce((n,v)=>n+v,0)*cfg.repeats||r.groups.length!==counts.length*cfg.repeats)invalid('Incomplete run');
 if(new Set(samples.map(s=>`${s.concurrency}:${s.repeat}:${s.jobId}`)).size!==samples.length||new Set(r.groups.map(g=>`${g.concurrency}:${g.repeat}`)).size!==r.groups.length)invalid('Duplicate samples');
 for(const s of samples){
  if(!counts.includes(s.concurrency)||s.repeat>cfg.repeats||s.requests.some(q=>q.outputTokens>p.output||q.inputTokens+q.outputTokens>p.context))invalid('Out of profile');
  if(isAgentSimulation(cfg.workload)){
   const v=s.verification,expected=AGENT_CHECKS[cfg.workload];
   if(r.runnerVersion!=='0.8.0'||!v||JSON.stringify(v.checks.map(k=>k.id))!==JSON.stringify(expected))invalid('Missing versioned task verification');
   if(s.toolCalls>s.requests.length||s.elapsedMs>cfg.timeoutSeconds*1000+2000)invalid('Invalid agent task budget');
   if(v&&(v.retries>s.toolCalls||(cfg.workload!=='agent-recovery'&&v.retries!==0)))invalid('Invalid recovery count');
   const minimum={'agent-data':2,'agent-research':4,'agent-recovery':7}[cfg.workload];
   if(s.status==='complete'&&(!v?.checks.every(k=>k.passed)||s.toolCalls<minimum||s.requests.length!==s.toolCalls+1||(cfg.workload==='agent-recovery'&&v.retries<2)))invalid('Unverified agent completion');
  }else if(s.verification||s.requests.length>5||s.toolCalls>5||s.toolErrors>5)invalid('Unexpected simulation evidence');
  if(!isAgentWorkload(cfg.workload)){
   if(s.toolCalls||s.toolErrors||s.toolMs||s.requests.length>1||s.status==='failure'||(s.status==='complete'&&s.requests[0]?.firstVisibleMs===null))invalid('Invalid chat result');
  }else if(cfg.workload==='agent-tools'&&s.status==='complete'&&(s.toolCalls!==2||s.toolErrors!==0||s.requests.length!==3))invalid('Incomplete tool workflow');
 }
 for(const g of r.groups){
  const rows=samples.filter(s=>s.concurrency===g.concurrency&&s.repeat===g.repeat);
  const tokens=rows.reduce((n,s)=>n+s.requests.reduce((t,q)=>t+q.outputTokens,0),0);
  if(!counts.includes(g.concurrency)||g.repeat>cfg.repeats||rows.length!==g.concurrency||rows.some(s=>s.elapsedMs>g.wallMs)||Math.abs(g.aggregateTps*g.wallMs/1000-tokens)>.01)invalid('Inconsistent round throughput');
 }
});
export type WorkloadReport=z.infer<typeof workloadSchema>;
export function workloadSummary(r:WorkloadReport){
 const percentile=(v:number[],p:number)=>v.length?[...v].sort((a,b)=>a-b)[Math.max(0,Math.ceil(v.length*p)-1)]:null;
 const median=(v:number[])=>{const a=[...v].sort((x,y)=>x-y),n=a.length;return n?(n%2?a[Math.floor(n/2)]:(a[n/2-1]+a[n/2])/2):null;};
 return r.settings.concurrencyLevels.map(n=>{const jobs=r.models[0].samples.filter(j=>j.concurrency===n);const requests=jobs.flatMap(j=>j.requests);return {checksPassed:jobs.reduce((n,j)=>n+(j.verification?.checks.filter(c=>c.passed).length??0),0),checksTotal:jobs.reduce((n,j)=>n+(j.verification?.checks.length??0),0),recoveryRetries:jobs.reduce((n,j)=>n+(j.verification?.retries??0),0),jobs:n,attempts:jobs.length,complete:jobs.filter(j=>j.status==='complete').length,p95Ms:percentile(jobs.map(j=>j.elapsedMs),.95),p99Ms:percentile(jobs.map(j=>j.elapsedMs),.99),ttftMs:median(requests.map(q=>q.ttftMs)),decodeTps:median(requests.flatMap(q=>q.decodeTps===null?[]:[q.decodeTps])),aggregateTps:median(r.groups.filter(g=>g.concurrency===n).map(g=>g.aggregateTps))};});
}
