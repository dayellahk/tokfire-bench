// Private QA only: cloned fixtures are labelled QA, never published, and removed.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {requestDigest} from '../lib/integrity.ts';
const origin=process.env.TEST_ORIGIN??'https://tokfires.com';let checks=0;
const check=(ok,msg)=>{assert(ok,msg);checks++;};
async function call(path,cookie,data,method='POST'){
 const r=await fetch(origin+path,{method,headers:{origin,...(cookie?{cookie}:{}),...(data?{'content-type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});
 return {status:r.status,headers:r.headers,body:await r.json()};
}
const guest=async()=>{const r=await call('/api/guest',null,{});check(r.status===200,'guest ready');return r.headers.get('set-cookie').split(';')[0];};
const a=await guest(),b=await guest();let savedID;
try{
 const report=JSON.parse(await readFile(new URL('../tests/fixtures/workload-mac-real.json',import.meta.url)));
 report.hardware.chip='Private QA '+crypto.randomUUID();
 const config={engine:report.runtime.name,model:report.models[0].modelName,workload:report.settings.workload,concurrencyLevels:report.settings.concurrencyLevels,repeats:report.settings.repeats};
 const issued=await call('/api/v2/challenges',a,config);check(issued.status===201,'ticket issued');const ticket=issued.body;
 report.runId=ticket.runId;report.measuredAt=new Date().toISOString();report.challenge={id:ticket.id,nonce:ticket.nonce,requestDigest:requestDigest(ticket.nonce,ticket.runId,config)};
 // The copied fixture predates the challenge. It must be quarantined, not called a real run.
 report.measuredAt=new Date(ticket.issuedAt-60000).toISOString();
 const payload={report,consent:{collect:true,publish:false,version:'2026-09-15-v1'}};
 check((await call('/api/v2/submissions',b,payload)).status===409,'different guest cannot use ticket');
 const changed=structuredClone(payload);changed.report.challenge.requestDigest='0'.repeat(64);
 check((await call('/api/v2/submissions',a,changed)).status===409,'wrong digest rejected');
 const responses=await Promise.all([call('/api/v2/submissions',a,payload),call('/api/v2/submissions',a,payload)]);
 const accepted=responses.find(r=>r.status===201);check(!!accepted,'one transaction accepted');savedID=accepted.body.id;
 check(responses.every(r=>[200,201,409].includes(r.status)),'race returns acknowledgement or conflict');
 check(responses.filter(r=>r.status===201).length===1,'only one row created');
 check(accepted.body.status==='quarantined'&&accepted.body.published===false,'copied timing quarantined');
 check((await call('/api/v2/submissions',a,payload)).body.duplicate===true,'retry acknowledged');
 const clone=structuredClone(payload);clone.report.runId=crypto.randomUUID();delete clone.report.challenge;
 check((await call('/api/v2/submissions',a,clone)).status===409,'run ID relabelling rejected');
 const mine=await call('/api/v1/submissions',a,null,'GET');const row=mine.body.results.find(r=>r.id===savedID);
 check(row?.integrityStatus==='quarantined'&&row.isPublic===0,'owner sees private quarantine');
 const publicRows=await call('/api/v2/leaderboard',null,null,'GET');check(!publicRows.body.results.some(r=>r.runId===report.runId),'QA absent from public feed');
 check((await call('/api/v1/submissions/'+savedID,a,null,'DELETE')).status===200,'private QA deleted');savedID=null;
 check((await call('/api/v2/submissions',a,payload)).status===409,'deleted run cannot replay');
 console.log(`PASS: ${checks} live MySQL guest/challenge/race/replay/quarantine/privacy checks`);
}finally{if(savedID)await call('/api/v1/submissions/'+savedID,a,null,'DELETE');}
