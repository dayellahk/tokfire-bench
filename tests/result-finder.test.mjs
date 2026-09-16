import test from 'node:test';
import assert from 'node:assert/strict';
import {findWorkloadResults} from '../lib/result-finder.ts';
const all={query:'',platform:'all',memory:'all',purpose:'all'};
const run=(overrides={})=>({runId:'chat',location:'local-machine',platform:'macOS',chip:'Apple M2 Max',memoryBytes:96*2**30,model:'Qwen GGUF',runtime:'llama.cpp',gpuNames:['Apple M2 Max'],workload:'short-chat',measuredAt:'2026-09-16',fit:{grade:'C',levels:[{jobs:1}]},...overrides});
test('finder searches all words across hardware, model and runtime without mutating reports',()=>{
 const runs=[run()];const before=JSON.stringify(runs);
 assert.equal(findWorkloadResults(runs,{...all,query:'  M2   QWEN  '}).length,1);
 assert.equal(findWorkloadResults(runs,{...all,query:'M2 RTX'}).length,0);
 assert.equal(JSON.stringify(runs),before);
});
test('hardware matching excludes remote request clients and applies platform and exact tested RAM',()=>{
 const runs=[run(),run({runId:'remote',location:'remote-server'}),run({runId:'windows',platform:'Windows',memoryBytes:32*2**30})];
 assert.deepEqual(findWorkloadResults(runs,{...all,memory:'96'}).map(r=>r.runId),['chat']);
 assert.equal(findWorkloadResults(runs,{...all,memory:'64'}).length,0);
 assert.deepEqual(findWorkloadResults(runs,{...all,platform:'Windows'}).map(r=>r.runId),['windows']);
});
test('agent filters require measured task type and job count, retaining failed evidence',()=>{
 const chat=run(),one=run({runId:'one',workload:'agent-tools',fit:{grade:'B',levels:[{jobs:1}]}});
 const many=run({runId:'many',workload:'agent-tools',fit:{grade:'D',levels:[{jobs:2},{jobs:3}]}});
 assert.deepEqual(findWorkloadResults([chat,one,many],{...all,purpose:'parallel'}).map(r=>r.runId),['many']);
 assert.deepEqual(findWorkloadResults([chat,one,many],{...all,purpose:'agent'}).map(r=>r.runId),['one']);
 assert.deepEqual(findWorkloadResults([chat,one,many],{...all,purpose:'chat'}).map(r=>r.runId),['chat']);
});
test('passing evidence precedes failed and unknown reports without inventing a performance score',()=>{
 const runs=['U','D','C','B','A'].map(grade=>run({runId:grade,fit:{grade,levels:[]}}));
 assert.deepEqual(findWorkloadResults(runs,all).map(r=>r.runId),['A','B','C','D','U']);
 assert.deepEqual(runs.map(r=>r.runId),['U','D','C','B','A']);
});
