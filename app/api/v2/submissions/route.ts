import {body,writer,json,failure,ApiError} from '@/lib/api';
import {rawDb} from '@/db/raw';
import {nativeUploadSchema} from '@/lib/serving';
import {saveSubmission} from '@/lib/repository';
export async function POST(request:Request){try{
 const owner=await writer(request);const parsed=nativeUploadSchema.safeParse(await body(request));
 if(!parsed.success)throw new ApiError(400,'Invalid report or consent.');
 const {report,consent}=parsed.data;const db=rawDb();
 if(Date.parse(report.measuredAt)>Date.now()+300000)throw new ApiError(400,'Future report date');
 const existing=await db.prepare('SELECT id, owner_id FROM submissions WHERE run_id = ?').bind(report.runId).first<{id:string,owner_id:string}>();
 if(existing){if(existing.owner_id!==owner)throw new ApiError(409,'Run already exists');return json({id:existing.id,stored:true,duplicate:true});}
 if(report.specVersion==='local-ai-text-v1')return json({...await saveSubmission(db,owner,parsed.data),stored:true},201);
 const quota=await db.prepare('SELECT COUNT(*) AS n FROM submissions WHERE owner_id = ? AND collected_at > ?').bind(owner,Date.now()-3600000).first<{n:number}>();
 if((quota?.n??0)>=20)throw new ApiError(429,'Hourly limit reached. Retry later.');
 const id=crypto.randomUUID();const now=Date.now();
 await db.prepare('INSERT INTO submissions (id, run_id, owner_id, collected_at, consent_version, is_public, publication_changed_at, report_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(id,report.runId,owner,now,consent.version,consent.publish?1:0,now,JSON.stringify(report)).run();
 return json({id,stored:true,published:consent.publish,status:'community-unverified'},201);
}catch(e){return failure(e);}}
