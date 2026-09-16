import {workloadSchema} from './workloads.ts';
import { z } from 'zod';
import { CONSENT_VERSION, reportSchema } from './benchmark.ts';
const positive=z.number().finite().positive();
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const sample=z.object({inputTokens:positive.int().max(100000),outputTokens:z.number().int().min(16).max(128),ttftMs:positive.max(180000),prefillTps:positive.max(10000000),decodeTps:positive.max(1000000),endToEndTps:positive.max(1000000),elapsedMs:positive.max(180000),cachedTokens:z.literal(0),concurrency:z.number().int().min(1).max(3),repeat:z.number().int().min(1).max(3),user:z.number().int().min(1).max(3),finishReason:z.enum(['length','stop'])}).strict().superRefine((s,c)=>{if(s.user>s.concurrency||s.ttftMs>s.elapsedMs||Math.abs(s.endToEndTps*s.elapsedMs/1000-s.outputTokens)>.01)c.addIssue({code:'custom',message:'Invalid request timing'});});
export const servingSchema=z.object({specVersion:z.literal('local-ai-omlx-v1'),runnerVersion:z.literal('0.4.0'),runId:z.string().uuid(),measuredAt:z.string().datetime(),
 hardware:z.object({chip:z.string().regex(/^Apple M[0-9]+(?: (?:Pro|Max|Ultra))?$/),machine:z.string().regex(/^[A-Za-z]+[0-9]+,[0-9]+$/),cpuCores:positive.int().max(512),memoryBytes:positive.int().max(2**43),osVersion:z.string().regex(/^\d{1,3}\.\d{1,3}(?:\.\d{1,3})?$/)}).strict(),
 runtime:z.object({name:z.literal('oMLX'),versionText:z.string().min(1).max(80),binarySha256:hash}).strict(),
 settings:z.object({cache:z.literal('disabled; unique prefix'),concurrency:z.tuple([z.literal(1),z.literal(2),z.literal(3)]),repeats:z.literal(3),maxOutputTokens:z.literal(128),inputProfile:z.literal('family-guide-v1; server-counted variable token length'),timing:z.literal('decode/prefill from oMLX usage; TTFT and end-to-end from client'),targetTps:z.tuple([z.literal(100),z.literal(200)]),targetSource:z.literal('user-selected; not a ChatGPT plan speed guarantee')}).strict(),
 models:z.array(z.object({modelSha256:hash,modelName:z.string().min(1).max(200).regex(/^[^/\\\x00-\x1f]+$/),loadMs:positive.max(600000),samples:z.array(sample).length(18)}).strict()).length(1),
 groups:z.array(z.object({concurrency:z.number().int().min(1).max(3),repeat:z.number().int().min(1).max(3),wallMs:positive.max(600000),aggregateTps:positive.max(3000000)}).strict()).length(9),
}).strict().superRefine((r,c)=>{
 const rows=r.models[0].samples;const keys=new Set(rows.map(s=>`${s.concurrency}:${s.repeat}:${s.user}`));
 const groups=new Set(r.groups.map(g=>`${g.concurrency}:${g.repeat}`));
 if(keys.size!==18||groups.size!==9)c.addIssue({code:'custom',message:'Incomplete concurrency profile'});
 for(const g of r.groups){const matching=rows.filter(s=>s.concurrency===g.concurrency&&s.repeat===g.repeat);if(matching.length!==g.concurrency||Math.abs(g.aggregateTps*g.wallMs/1000-matching.reduce((a,s)=>a+s.outputTokens,0))>.01||matching.some(s=>s.elapsedMs>g.wallMs))c.addIssue({code:'custom',message:'Inconsistent group timing'});}
});
const standard=reportSchema.innerType();
const rawModel=standard.shape.models.element.innerType();
const trialSample=rawModel.shape.samples.element.innerType().extend({inputTokens:z.literal(512),outputTokens:z.literal(32),repeat:z.literal(1)}).superRefine((s,c)=>{if(s.ttftMs>s.elapsedMs||Math.abs(s.prefillTps*s.prefillMs/1000-s.inputTokens)>1||Math.abs(s.decodeTps*s.decodeMs/1000-s.outputTokens)>1)c.addIssue({code:'custom',message:'Invalid trial timings'});});
export const trialSchema=standard.extend({specVersion:z.literal('local-ai-trial-v1'),runnerVersion:z.literal('0.2.1'),models:z.array(rawModel.extend({samples:z.array(trialSample).length(1)})).length(1)}).superRefine((r,c)=>{if(r.runtime.threads!==r.hardware.cpuCores)c.addIssue({code:'custom',message:'Invalid thread count'});});
// Selected simultaneous jobs are a separate profile from the old 1→2→3 sweep.
const jobSample=sample.innerType().omit({user:true}).extend({
 concurrency:z.number().int().min(1).max(20),jobId:z.number().int().min(1).max(20),
 elapsedMs:positive.max(600000),ttftMs:positive.max(600000),
}).superRefine((s,c)=>{if(s.jobId>s.concurrency||s.ttftMs>s.elapsedMs||Math.abs(s.endToEndTps*s.elapsedMs/1000-s.outputTokens)>.01)c.addIssue({code:'custom',message:'Invalid job timing'});});
const jobsBase=z.object({
 specVersion:z.literal('local-ai-jobs-v1'),runnerVersion:z.literal('0.5.0'),runId:z.string().uuid(),measuredAt:z.string().datetime(),
 hardware:servingSchema.innerType().shape.hardware,
 runtime:z.object({name:z.enum(['oMLX','llama.cpp']),binarySha256:hash}).strict(),
 settings:z.object({concurrentJobs:z.number().int().min(1).max(20),repeats:z.literal(3),maxOutputTokens:z.literal(128),cache:z.literal('disabled; unique prefix'),inputProfile:z.enum(['family-guide-v1; variable','exact-512-v1']),serverLayout:z.literal('one shared model server'),contextPerSlot:z.literal(4096).nullable(),threadsPerServer:positive.int().max(512).nullable(),estimatedMemoryBytes:positive.int().max(2**43),targetTps:z.tuple([z.literal(100),z.literal(200)]),targetSource:z.literal('user-selected; not a ChatGPT plan speed guarantee')}).strict(),
 jobs:z.array(z.object({jobId:z.number().int().min(1).max(20),modelSha256:hash}).strict()).min(1).max(20),
 models:z.array(z.object({modelSha256:hash,modelName:z.string().min(1).max(200).regex(/^[^/\\\x00-\x1f]+$/),loadMs:positive.max(600000),samples:z.array(jobSample).min(3).max(60)}).strict()).length(1),
 groups:z.array(z.object({concurrency:z.number().int().min(1).max(20),repeat:z.number().int().min(1).max(3),wallMs:positive.max(600000),aggregateTps:positive.max(20000000)}).strict()).length(3),
}).strict();
const validateJobs=(r:z.infer<typeof jobsBase> | z.infer<typeof windowsJobsBase>,c:z.RefinementCtx)=>{
 const n=r.settings.concurrentJobs;const model=r.models[0];const rows=model.samples;
 const invalid=()=>c.addIssue({code:'custom',message:'Incomplete or inconsistent concurrent jobs report'});
 if(r.jobs.length!==n||new Set(r.jobs.map(j=>j.jobId)).size!==n||r.jobs.some(j=>j.jobId>n||j.modelSha256!==model.modelSha256))invalid();
 if(rows.length!==3*n||new Set(rows.map(s=>`${s.repeat}:${s.jobId}`)).size!==3*n||rows.some(s=>s.concurrency!==n||s.jobId>n))invalid();
 if(new Set(r.groups.map(g=>g.repeat)).size!==3)invalid();
 for(const g of r.groups){const matching=rows.filter(s=>s.repeat===g.repeat);if(g.concurrency!==n||matching.length!==n||Math.abs(g.aggregateTps*g.wallMs/1000-matching.reduce((a,s)=>a+s.outputTokens,0))>.01||matching.some(s=>s.elapsedMs>g.wallMs))invalid();}
 if(r.runtime.name==='llama.cpp'){
  if(r.settings.inputProfile!=='exact-512-v1'||r.settings.contextPerSlot!==4096||r.settings.threadsPerServer!==r.hardware.cpuCores||rows.some(s=>s.inputTokens!==512||s.outputTokens!==128))invalid();
 }else if(r.settings.inputProfile!=='family-guide-v1; variable'||r.settings.contextPerSlot!==null||r.settings.threadsPerServer!==null)invalid();
};
const windowsJobsBase=jobsBase.extend({
 specVersion:z.literal('local-ai-windows-jobs-v1'),runnerVersion:z.literal('0.6.0'),
 hardware:z.object({platform:z.literal('Windows'),architecture:z.enum(['x64','arm64']),chip:z.string().min(1).max(160).regex(/^[^\x00-\x1f]+$/),machine:z.string().min(1).max(160).regex(/^[^\x00-\x1f]+$/),cpuCores:positive.int().max(512),memoryBytes:positive.int().max(2**43),osVersion:z.string().regex(/^\d{1,3}\.\d{1,3}\.\d{1,6}(?:\.\d{1,6})?$/),gpuNames:z.array(z.string().min(1).max(160).regex(/^[^\x00-\x1f]+$/)).max(8)}).strict(),
 runtime:z.object({name:z.literal('llama.cpp'),binarySha256:hash}).strict(),
});
export const jobsSchema=jobsBase.superRefine(validateJobs);
export const windowsJobsSchema=windowsJobsBase.superRefine(validateJobs);
export const nativeUploadSchema=z.object({report:z.union([reportSchema,servingSchema,trialSchema,jobsSchema,windowsJobsSchema,workloadSchema]),consent:z.object({collect:z.literal(true),publish:z.boolean(),version:z.literal(CONSENT_VERSION)}).strict()}).strict();
