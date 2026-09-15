// Run against an isolated/staging deployment. Creates and removes two QA accounts.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
const origin=process.env.TEST_ORIGIN;
if(!origin||!process.env.DATABASE_URL)throw Error('TEST_ORIGIN and DATABASE_URL required');
const ids=[];let passed=0;
async function request(path,{method='GET',data,cookie,headers={}}={}){
 const r=await fetch(origin+path,{method,headers:{origin,...(data?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{}),...headers},body:data?JSON.stringify(data):undefined,redirect:'manual'});
 const content=await r.text();let body;try{body=JSON.parse(content);}catch{body={};}
 return {status:r.status,body,cookie:r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; '),headers:r.headers};
}
function check(value,message){assert.ok(value,message);passed++;console.log('PASS '+message);}
const password=randomBytes(24).toString('base64url');
const db=await mysql.createConnection(process.env.DATABASE_URL);
try{
 check((await request('/api/health')).status===200,'database health');
 check((await request('/api/v1/submissions',{headers:{'oai-authenticated-user-id':'forged'}})).status===401,'forged Sites header cannot authenticate');
 const accounts=[];
 for(let i=0;i<2;i++){
  const email='tokfire-qa-'+randomUUID()+'@example.invalid';
  const result=await request('/api/auth/sign-up/email',{method:'POST',data:{name:'TokFire QA',email,password}});
  check(result.status===200&&result.body.user?.id,'register QA account');ids.push(result.body.user.id);
  if(origin.startsWith('https:'))check(result.headers.getSetCookie().some(c=>/httponly/i.test(c)&&/secure/i.test(c)&&/samesite=lax/i.test(c)),'secure HttpOnly session cookie');
  accounts.push({email,cookie:result.cookie});
 }
 const [a,b]=accounts;
 check((await request('/api/auth/get-session',{cookie:a.cookie})).body.user?.id===ids[0],'session persists');
 const report=JSON.parse(await readFile(new URL('../tests/fixtures/jobs-llama-real.json',import.meta.url)));report.runId=randomUUID();report.measuredAt=new Date().toISOString();
 const data={report,consent:{collect:true,publish:false,version:'2026-09-15-v1'}};
 check((await request('/api/v2/submissions',{method:'POST',data,cookie:a.cookie,headers:{origin:'https://attacker.invalid'}})).status===403,'cross-origin upload rejected');
 const saved=await request('/api/v2/submissions',{method:'POST',data,cookie:a.cookie});
 check(saved.status===201&&saved.body.stored,'real concurrent report saved to MySQL');
 check((await request('/api/v2/submissions',{method:'POST',data,cookie:a.cookie})).body.duplicate===true,'retry is idempotent');
 const own=await request('/api/v1/submissions',{cookie:a.cookie});check(own.body.results?.some(x=>x.id===saved.body.id),'owner can retrieve stored report');
 check(!(await request('/api/v1/submissions',{cookie:b.cookie})).body.results?.some(x=>x.id===saved.body.id),'other account cannot read private report');
 check((await request('/api/v1/submissions/'+saved.body.id,{method:'DELETE',cookie:b.cookie})).status===404,'other account cannot delete report');
 check((await request('/api/v1/submissions/'+saved.body.id,{method:'DELETE',cookie:a.cookie})).status===200,'owner can delete report');
 const win=structuredClone(report);win.runId=randomUUID();win.specVersion='local-ai-windows-jobs-v1';win.runnerVersion='0.6.0';
 win.hardware={platform:'Windows',architecture:'x64',chip:'Synthetic QA CPU',machine:'Synthetic QA PC',cpuCores:win.settings.threadsPerServer,memoryBytes:32*1024**3,osVersion:'10.0.26100',gpuNames:['Synthetic QA GPU']};
 const windows=await request('/api/v2/submissions',{method:'POST',cookie:a.cookie,data:{...data,report:win}});
 check(windows.status===201&&windows.body.stored,'synthetic Windows report saved with separate platform profile');
 const records=await request('/api/v1/submissions',{cookie:a.cookie});check(records.body.results?.some(x=>x.id===windows.body.id),'owner can retrieve Windows report');
 check(!(await request('/api/v1/submissions',{cookie:b.cookie})).body.results?.some(x=>x.id===windows.body.id),'Windows report remains private');
 check((await request('/api/v1/submissions/'+windows.body.id,{method:'DELETE',cookie:a.cookie})).status===200,'owner can delete Windows report');
 check((await request('/api/auth/sign-out',{method:'POST',data:{},cookie:a.cookie})).status===200,'sign out');
 check((await request('/api/v1/submissions',{cookie:a.cookie})).status===401,'signed-out session revoked');
 const login=await request('/api/auth/sign-in/email',{method:'POST',data:{email:a.email,password}});check(login.status===200&&login.body.user?.id===ids[0],'password sign in');
 console.log(`${passed} deployment checks passed`);
}finally{
 for(const id of ids){await db.execute('DELETE FROM submissions WHERE owner_id=?',[id]);await db.execute('DELETE FROM session WHERE userId=?',[id]);await db.execute('DELETE FROM account WHERE userId=?',[id]);await db.execute('DELETE FROM user WHERE id=?',[id]);}
 await db.end();
}
