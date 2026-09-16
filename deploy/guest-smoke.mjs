// Real guest sessions, private temporary report, cleanup. Never publishes test data.
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const origin=process.env.TEST_ORIGIN??'https://tokfires.com';let count=0;
function check(ok,label){assert(ok,label);count++;}
async function req(path,{cookie,method='GET',data,headers={}}={}){
 const response=await fetch(origin+path,{method,headers:{origin,...(cookie?{cookie}:{}),...(data?{'content-type':'application/json'}:{}),...headers},body:data?JSON.stringify(data):undefined});
 return {status:response.status,headers:response.headers,body:await response.json()};
}
async function guest(){const r=await req('/api/guest',{method:'POST'});check(r.status===200,'guest created without account');const header=r.headers.get('set-cookie');check(/HttpOnly/i.test(header)&&/SameSite=Strict/i.test(header)&&(!origin.startsWith('https:')||/Secure/i.test(header)),'secure guest cookie');return header.split(';')[0];}
const a=await guest(),b=await guest();check(a!==b,'independent credentials');let id;
try{
 check((await req('/api/v1/submissions')).status===401,'missing credential cannot list private reports');
 check((await req('/api/guest',{method:'POST',headers:{origin:'https://wrong.invalid'}})).status===403,'cross-site guest creation blocked');
 const report=JSON.parse(await readFile(new URL('../tests/fixtures/workload-mac-real.json',import.meta.url)));report.runId=crypto.randomUUID();report.hardware.chip="Private QA "+report.runId;
 const data={report,consent:{collect:true,publish:false,version:'2026-09-15-v1'}};
 const first=await req('/api/v2/submissions',{method:'POST',cookie:a,data});check(first.status===201&&first.body.stored,'guest upload accepted');id=first.body.id;
 const again=await req('/api/v2/submissions',{method:'POST',cookie:a,data});check(again.status===200&&again.body.duplicate,'retry is idempotent');
 check((await req('/api/v2/submissions',{method:'POST',cookie:b,data})).status===409,'another guest cannot claim the run');
 const owned=await req('/api/v1/submissions',{cookie:a});check(owned.body.results.some(r=>r.id===id&&r.isPublic===0),'owner can see private report');
 const other=await req('/api/v1/submissions',{cookie:b});check(!other.body.results.some(r=>r.id===id),'other guest cannot read private report');
 const feed=await req('/api/v2/leaderboard');check(!feed.body.results.some(r=>r.runId===report.runId),'private report absent from public feed');
 check((await req('/api/v1/submissions/'+id,{method:'DELETE',cookie:b})).status===404,'other guest cannot delete');
 check((await req('/api/v1/submissions/'+id,{method:'PATCH',cookie:b,data:{publish:false,version:'2026-09-15-v1'}})).status===404,'other guest cannot change publication');
 check((await req('/api/v1/submissions/'+id,{method:'DELETE',cookie:a,headers:{origin:'https://wrong.invalid'}})).status===403,'cross-site deletion blocked');
 check((await req('/api/v2/submissions',{method:'POST',cookie:a,data:{report,consent:{collect:false,publish:false,version:'2026-09-15-v1'}}})).status===400,'collection consent required');
}finally{if(id)check((await req('/api/v1/submissions/'+id,{method:'DELETE',cookie:a})).status===200,'owner cleanup succeeds');}
console.log(`PASS: ${count} guest session, upload, privacy, ownership, origin and cleanup checks`);
