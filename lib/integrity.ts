import {createHash,createHmac,randomBytes} from 'node:crypto';
import type {BenchmarkDatabase} from '../db/raw.ts';
import {ApiError} from './access.ts';
import type {WorkloadReport} from './workloads.ts';

import {challengeConfigSchema,type ChallengeConfig,type ChallengeEvidence} from './challenge-protocol.ts';
export function canonical(value:unknown):string {
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value!==null&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
 return JSON.stringify(value);
}
export const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export function measurementDigest(report:unknown){
 const contents={...(report as Record<string,unknown>)};
 delete contents.runId;delete contents.measuredAt;delete contents.challenge;
 return digest(canonical(contents));
}
export type Ticket={id:string;runId:string;nonce:string;issuedAt:number;expiresAt:number;config:ChallengeConfig};
export async function issueChallenge(db:BenchmarkDatabase,owner:string,input:unknown,now=Date.now()):Promise<Ticket>{
 const parsed=challengeConfigSchema.safeParse(input);if(!parsed.success)throw new ApiError(400,'Invalid test configuration');
 const ticket={id:crypto.randomUUID(),runId:crypto.randomUUID(),nonce:randomBytes(32).toString('hex'),issuedAt:now,expiresAt:now+86400000,config:parsed.data};
 await db.prepare('INSERT INTO run_challenges (id, run_id, owner_id, nonce, config_json, issued_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(ticket.id,ticket.runId,owner,ticket.nonce,canonical(ticket.config),now,ticket.expiresAt).run();
 return ticket;
}
// The digest binds the randomized request identifiers used by the runner. It is NOT hardware attestation.
export function requestDigest(nonce:string,runId:string,config:ChallengeConfig){
 const ids=[];for(const count of config.concurrencyLevels)for(let repeat=1;repeat<=config.repeats;repeat++)for(let job=1;job<=count;job++)ids.push(`${nonce}:${runId}:${count}:${repeat}:${job}`);
 return digest(ids.join('\n'));
}
export type IntegrityStatus='community-unverified'|'challenge-checked'|'quarantined';
export async function inspectIntegrity(db:BenchmarkDatabase,owner:string,report:{runId:string;specVersion:string;measuredAt:string},evidence?:ChallengeEvidence,now=Date.now()){
 const reasons:string[]=[];let challengeId:string|null=null;
 if(evidence){
  const ticket=await db.prepare('SELECT * FROM run_challenges WHERE id = ?').bind(evidence.id).first<{id:string;run_id:string;owner_id:string;nonce:string;config_json:string;issued_at:number;expires_at:number}>();
  if(!ticket||ticket.owner_id!==owner||ticket.run_id!==report.runId||ticket.nonce!==evidence.nonce)throw new ApiError(409,'Challenge does not belong to this guest session and run');
  challengeId=ticket.id;
  if(report.specVersion!=='tokfire-workloads-v1')throw new ApiError(400,'This report format does not support a run challenge');
  const r=report as WorkloadReport;
  const cfg={workload:r.settings.workload,engine:r.runtime.name,model:r.models[0].modelName,concurrencyLevels:r.settings.concurrencyLevels,repeats:r.settings.repeats};
  if(canonical(cfg)!==ticket.config_json||requestDigest(ticket.nonce,ticket.run_id,cfg)!==evidence.requestDigest)throw new ApiError(409,'Challenge configuration or request digest mismatch');
  if(now>ticket.expires_at)reasons.push('challenge-expired');
  const end=Date.parse(report.measuredAt),duration=r.groups.reduce((n,g)=>n+g.wallMs,0);
  if(end<ticket.issued_at-5000||duration>now-ticket.issued_at+5000)reasons.push('server-time-window-mismatch');
 }
 // All supported report formats have validated model samples. Legacy formats put metrics directly on each sample.
 type Metric={decodeTps?:number|null;endToEndTps?:number|null};
 const models=(report as unknown as {models:{samples:(Metric&{requests?:Metric[]})[]}[]}).models;
 if(models.some(m=>m.samples.some(s=>(s.requests??[s]).some(q=>(q.endToEndTps??0)>10000||(q.decodeTps??0)>10000))))reasons.push('extreme-throughput-review');
 return {status:(reasons.length?'quarantined':challengeId?'challenge-checked':'community-unverified') as IntegrityStatus,reasons,challengeId};
}
export async function uploadRateLimit(db:BenchmarkDatabase,request:Request,owner:string,action:'upload'|'challenge',now=Date.now()){
 // Only use the header overwritten by the deployment's trusted reverse proxy.
 // The app listens on loopback. Never trust arbitrary X-Forwarded-For / CF headers here.
 const secret=process.env.BENCH_RATE_SECRET??process.env.BETTER_AUTH_SECRET;
 const ip=process.env.BENCH_TRUST_PROXY==='1'?request.headers.get('x-tokfire-client-ip'):null;
 const hour=Math.floor(now/3600000);
 const keys=[{key:digest(`owner:${owner}:${action}:${hour}`),limit:action==='upload'?30:20}];
 if(ip&&secret)keys.push({key:createHmac('sha256',secret).update(`ip:${ip}:${action}:${hour}`).digest('hex'),limit:120});
 // Attempts persist independently of reports. Deleting reports never resets the limit.
 await db.prepare('DELETE FROM abuse_events WHERE created_at < ?').bind(now-7200000).run();
 await db.prepare('DELETE FROM run_challenges WHERE expires_at < ?').bind(now-7*86400000).run();
 for(const {key,limit} of keys){
  await db.prepare('INSERT INTO abuse_events (id, bucket, created_at) VALUES (?, ?, ?)').bind(crypto.randomUUID(),key,now).run();
  const row=await db.prepare('SELECT COUNT(*) AS n FROM abuse_events WHERE bucket = ?').bind(key).first<{n:number}>();
  if((row?.n??0)>limit)throw new ApiError(429,'Upload protection limit reached. Retry after the current hour. Your local report is unchanged.');
 }
}
