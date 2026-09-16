import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publicArchiveSummary} from '../lib/public-archive.ts';
const fixture=name=>JSON.parse(readFileSync(new URL('./fixtures/'+name,import.meta.url)));
test('archive preserves real concurrency levels and request medians without exposing raw reports',()=>{
 const r=fixture('omlx-real.json'),s=publicArchiveSummary(r);assert(s);assert.deepEqual(s.models[0].rows.map(x=>x.jobs),[1,2,3]);
 const rows=r.models[0].samples.filter(x=>x.concurrency===2).map(x=>x.decodeTps).sort((a,b)=>a-b);
 assert.equal(s.models[0].rows[1].decodeTps,(rows[2]+rows[3])/2);assert.equal(s.models[0].rows[1].samples,6);
 assert.deepEqual(Object.keys(s).sort(),['runId','spec','measuredAt','chip','memoryBytes','runtime','models'].sort());assert(!JSON.stringify(s).includes('binarySha256'));
});
test('trial remains a trial; 0.7 workloads belong to the workload endpoint',()=>{
 assert.equal(publicArchiveSummary(fixture('trial-real.json')).spec,'local-ai-trial-v1');
 assert.equal(publicArchiveSummary(fixture('workload-mac-real.json')),null);
});
test('archive rejects invalid metrics and additional private fields',()=>{
 const r=fixture('jobs-llama-real.json');r.hardware.serial='private';assert.equal(publicArchiveSummary(r),null);
 const bad=fixture('omlx-real.json');bad.models[0].samples[0].decodeTps=-1;assert.equal(publicArchiveSummary(bad),null);
});
test('archive includes public and non-quarantined app submissions only',()=>{
 const code=readFileSync(new URL('../app/api/v2/archive/route.ts',import.meta.url),'utf8');assert(code.includes('s.is_public=1'));assert(code.includes("<> 'quarantined'"));assert(!code.includes('external_references'));assert(!code.includes('reference_records'));
});
