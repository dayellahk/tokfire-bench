import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {servingSchema,nativeUploadSchema} from '../lib/serving.ts';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/omlx-real.json',import.meta.url)));
test('accept a real 18-request oMLX report with explicit consent',()=>{assert.ok(servingSchema.safeParse(fixture).success);assert.ok(nativeUploadSchema.safeParse({report:fixture,consent:{collect:true,publish:false,version:'2026-09-15-v1'}}).success);});
test('reject missing concurrency, duplicate users, cached samples, altered math and personal data',()=>{for(const alter of [r=>r.models[0].samples.pop(),r=>r.models[0].samples[1]=r.models[0].samples[0],r=>r.models[0].samples[0].cachedTokens=1,r=>r.groups[0].aggregateTps*=2,r=>r.hardware.serial='private',r=>r.models[0].samples[0].elapsedMs=1]){const r=structuredClone(fixture);alter(r);assert.equal(servingSchema.safeParse(r).success,false);}});
test('reject upload without opt-in and unknown fields',()=>{for(const consent of [{collect:false,publish:false,version:'2026-09-15-v1'},{collect:true,publish:false,version:'old'}])assert.equal(nativeUploadSchema.safeParse({report:fixture,consent}).success,false);});
test('v2 accepts real quick trials without mixing them into the v1 standard profile',async()=>{const {trialSchema}=await import('../lib/serving.ts');const {reportSchema}=await import('../lib/benchmark.ts');const r=JSON.parse(readFileSync(new URL('./fixtures/trial-real.json',import.meta.url)));assert.ok(trialSchema.safeParse(r).success);assert.equal(reportSchema.safeParse(r).success,false);r.models[0].samples[0].outputTokens=128;assert.equal(trialSchema.safeParse(r).success,false);});
test('selected jobs profile accepts a real same-model report and rejects inconsistent jobs',async()=>{
 const {jobsSchema}=await import('../lib/serving.ts');
 const r=JSON.parse(readFileSync(new URL('./fixtures/jobs-llama-real.json',import.meta.url)));
 assert.ok(jobsSchema.safeParse(r).success,JSON.stringify(jobsSchema.safeParse(r)));
 assert.ok(nativeUploadSchema.safeParse({report:r,consent:{collect:true,publish:false,version:'2026-09-15-v1'}}).success);
 for(const alter of [r=>r.settings.concurrentJobs=21,r=>r.settings.concurrentJobs=2,r=>r.models[0].samples[1].jobId=r.models[0].samples[0].jobId,r=>r.jobs[0].modelSha256='0'.repeat(64),r=>r.models[0].samples[0].licenseKey='secret',r=>r.groups[0].aggregateTps*=2,r=>r.settings.inputProfile='family-guide-v1; variable']){
  const wrong=structuredClone(r);alter(wrong);assert.equal(jobsSchema.safeParse(wrong).success,false);
 }
});
test('oMLX selected-job report is accepted without mixing its variable input profile with llama.cpp',async()=>{
 const {jobsSchema}=await import('../lib/serving.ts');const r=JSON.parse(readFileSync(new URL('./fixtures/jobs-omlx-real.json',import.meta.url)));
 assert.ok(jobsSchema.safeParse(r).success,JSON.stringify(jobsSchema.safeParse(r)));
 r.runtime.name='llama.cpp';assert.equal(jobsSchema.safeParse(r).success,false);
});
test('real 20-job stress report fits the report contract and cannot masquerade as 3 jobs',async()=>{
 const {jobsSchema}=await import('../lib/serving.ts');const r=JSON.parse(readFileSync(new URL('./fixtures/jobs-20-real.json',import.meta.url)));
 assert.ok(jobsSchema.safeParse(r).success,JSON.stringify(jobsSchema.safeParse(r)));
 r.settings.concurrentJobs=3;assert.equal(jobsSchema.safeParse(r).success,false);
});
