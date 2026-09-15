import { uploadSchema, summarize, cohortKey } from './benchmark.ts';
import { ApiError } from './access.ts';

export async function saveSubmission(db:D1Database, owner:string, input:unknown) {
  const parsed=uploadSchema.safeParse(input);
  if(!parsed.success)throw new ApiError(400,'Invalid report or missing collection consent. Use the current native runner.');
  const {report,consent}=parsed.data;
  if(Date.parse(report.measuredAt)>Date.now()+300000)throw new ApiError(400,'Report date is in the future');
  const now=Date.now();
  const existing=await db.prepare('SELECT id FROM submissions WHERE run_id = ?').bind(report.runId).first();
  if(existing)throw new ApiError(409,'This run has already been submitted. Manage the existing record in My submissions.');
  const quota=await db.prepare('SELECT COUNT(*) AS n FROM submissions WHERE owner_id = ? AND collected_at > ?').bind(owner,now-3600000).first<{n:number}>();
  if((quota?.n??0)>=20)throw new ApiError(429,'Hourly submission limit reached. Try later.');
  const id=crypto.randomUUID();
  const inserts=[db.prepare('INSERT INTO submissions (id, run_id, owner_id, collected_at, consent_version, is_public, publication_changed_at, report_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(id,report.runId,owner,now,consent.version,consent.publish?1:0,now,JSON.stringify(report))];
  for(const row of summarize(report)) {
    inserts.push(db.prepare('INSERT INTO measurements (id, submission_id, cohort, model_hash, input_tokens, chip, machine, cpu_cores, memory_bytes, os_version, runtime_hash, decode_tps, ttft_ms, prefill_tps, peak_rss_bytes, load_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(),id,await cohortKey(report,row),row.modelHash,row.inputTokens,report.hardware.chip,report.hardware.machine,report.hardware.cpuCores,report.hardware.memoryBytes,report.hardware.osVersion,report.runtime.binarySha256,row.decodeTps,row.ttftMs,row.prefillTps,row.peakRssBytes,row.loadMs));
  }
  try {await db.batch(inserts);} catch(error) {
    // Concurrent retries can race the first lookup. The unique index remains authoritative.
    if(await db.prepare('SELECT id FROM submissions WHERE run_id = ?').bind(report.runId).first())throw new ApiError(409,'This run has already been submitted.');
    throw error;
  }
  return {id,published:consent.publish,status:'community-unverified'};
}
export async function ownSubmissions(db:D1Database,owner:string) {
  return db.prepare('SELECT id, run_id AS runId, collected_at AS collectedAt, is_public AS isPublic, report_json AS reportJson FROM submissions WHERE owner_id = ? ORDER BY collected_at DESC LIMIT 100').bind(owner).all();
}
export async function publication(db:D1Database,owner:string,id:string,publish:boolean,version:string) {
  const result=await db.prepare('UPDATE submissions SET is_public = ?, publication_changed_at = ?, consent_version = ? WHERE id = ? AND owner_id = ?').bind(publish?1:0,Date.now(),version,id,owner).run();
  if(!result.meta.changes)throw new ApiError(404,'Submission not found');
  return {updated:true};
}
export async function deleteSubmission(db:D1Database,owner:string,id:string) {
  const result=await db.prepare('DELETE FROM submissions WHERE id = ? AND owner_id = ?').bind(id,owner).run();
  if(!result.meta.changes)throw new ApiError(404,'Submission not found');
  return {deleted:true};
}
export async function leaderboard(db:D1Database) {
  return db.prepare(`SELECT m.cohort, m.model_hash AS modelHash, m.input_tokens AS inputTokens,
    m.chip, m.machine, m.cpu_cores AS cpuCores, m.memory_bytes AS memoryBytes, m.os_version AS osVersion,
    m.runtime_hash AS runtimeHash, AVG(m.decode_tps) AS decodeTps, AVG(m.ttft_ms) AS ttftMs,
    AVG(m.prefill_tps) AS prefillTps, COUNT(DISTINCT s.id) AS runs, COUNT(DISTINCT s.owner_id) AS contributors
    FROM measurements m JOIN submissions s ON s.id = m.submission_id WHERE s.is_public = 1
    GROUP BY m.cohort, m.chip, m.machine, m.cpu_cores, m.memory_bytes, m.os_version, m.runtime_hash
    ORDER BY m.cohort, decodeTps DESC LIMIT 500`).all();
}
