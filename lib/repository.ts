import type {BenchmarkDatabase} from '../db/raw.ts';
import { uploadSchema, summarize, cohortKey } from './benchmark.ts';
import { ApiError } from './access.ts';
import {nativeUploadSchema} from './serving.ts';
import {canonical,digest,measurementDigest,inspectIntegrity} from './integrity.ts';

export async function saveSubmission(db:BenchmarkDatabase, owner:string, input:unknown) {
  const parsed=uploadSchema.safeParse(input);
  if(!parsed.success)throw new ApiError(400,'Invalid report or missing collection consent. Use the current native runner.');
  return storeNativeSubmission(db,owner,parsed.data,false);
}
export async function storeNativeSubmission(db:BenchmarkDatabase,owner:string,input:unknown,idempotent=true){
  const parsed=nativeUploadSchema.safeParse(input);
  if(!parsed.success)throw new ApiError(400,'Invalid report or consent');
  const {report,consent}=parsed.data;
  if(Date.parse(report.measuredAt)>Date.now()+300000)throw new ApiError(400,'Report date is in the future');
  const now=Date.now();
  const reportDigest=digest(canonical(report));
  const existing=await db.prepare('SELECT id, owner_id, report_json FROM submissions WHERE run_id = ?').bind(report.runId).first<{id:string;owner_id:string;report_json:string}>();
  if(existing){
    if(!idempotent||existing.owner_id!==owner||digest(canonical(JSON.parse(existing.report_json)))!==reportDigest)throw new ApiError(409,'Run already exists with different ownership or report contents');
    const state=await db.prepare("SELECT s.is_public AS publicationRequested, COALESCE(i.status, 'community-unverified') AS status FROM submissions s LEFT JOIN submission_integrity i ON i.submission_id=s.id WHERE s.id=?").bind(existing.id).first<{publicationRequested:number;status:string}>();
    return {id:existing.id,stored:true,duplicate:true,status:state?.status??'community-unverified',published:!!state?.publicationRequested&&state?.status!=='quarantined'};
  }
  if(await db.prepare('SELECT run_id FROM run_receipts WHERE run_id = ?').bind(report.runId).first())throw new ApiError(409,'This run was already used and deleted. Start a new test.');
  const contentDigest=measurementDigest(report);
  if(await db.prepare('SELECT content_digest FROM measurement_claims WHERE content_digest = ?').bind(contentDigest).first())throw new ApiError(409,'Identical measurements have already been uploaded. Start a new test.');
  const integrity=await inspectIntegrity(db,owner,report,'challenge' in report?report.challenge:undefined,now);
  const id=crypto.randomUUID();
  const inserts=[db.prepare('INSERT INTO submissions (id, run_id, owner_id, collected_at, consent_version, is_public, publication_changed_at, report_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(id,report.runId,owner,now,consent.version,consent.publish?1:0,now,JSON.stringify(report))];
  inserts.push(db.prepare('INSERT INTO measurement_claims (content_digest) VALUES (?)').bind(contentDigest));
  inserts.push(db.prepare('INSERT INTO run_receipts (run_id, report_digest, content_digest) VALUES (?, ?, ?)').bind(report.runId,reportDigest,contentDigest));
  inserts.push(db.prepare('INSERT INTO submission_integrity (submission_id, status, reasons_json, checked_at) VALUES (?, ?, ?, ?)').bind(id,integrity.status,JSON.stringify(integrity.reasons),now));
  if(integrity.challengeId)inserts.push(db.prepare('INSERT INTO challenge_claims (challenge_id, run_id) VALUES (?, ?)').bind(integrity.challengeId,report.runId));
  if(report.specVersion==='local-ai-text-v1')for(const row of summarize(report)) {
    inserts.push(db.prepare('INSERT INTO measurements (id, submission_id, cohort, model_hash, input_tokens, chip, machine, cpu_cores, memory_bytes, os_version, runtime_hash, decode_tps, ttft_ms, prefill_tps, peak_rss_bytes, load_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(),id,await cohortKey(report,row),row.modelHash,row.inputTokens,report.hardware.chip,report.hardware.machine,report.hardware.cpuCores,report.hardware.memoryBytes,report.hardware.osVersion,report.runtime.binarySha256,row.decodeTps,row.ttftMs,row.prefillTps,row.peakRssBytes,row.loadMs));
  }
  try {await db.batch(inserts);} catch(error) {
    // Concurrent retries can race the first lookup. The unique index remains authoritative.
    if(await db.prepare('SELECT id FROM submissions WHERE run_id = ?').bind(report.runId).first())throw new ApiError(409,'This run has already been submitted.');
    if(await db.prepare('SELECT content_digest FROM measurement_claims WHERE content_digest = ?').bind(contentDigest).first())throw new ApiError(409,'Identical measurements have already been uploaded.');
    throw error;
  }
  return {id,stored:true,published:consent.publish&&integrity.status!=='quarantined',publicationRequested:consent.publish,status:integrity.status,reasons:integrity.reasons};
}
export async function ownSubmissions(db:BenchmarkDatabase,owner:string) {
  return db.prepare("SELECT s.id, s.run_id AS runId, s.collected_at AS collectedAt, s.is_public AS isPublic, s.report_json AS reportJson, COALESCE(i.status, 'community-unverified') AS integrityStatus, i.reasons_json AS integrityReasons FROM submissions s LEFT JOIN submission_integrity i ON i.submission_id = s.id WHERE s.owner_id = ? ORDER BY s.collected_at DESC LIMIT 100").bind(owner).all();
}
export async function publication(db:BenchmarkDatabase,owner:string,id:string,publish:boolean,version:string) {
  const result=await db.prepare('UPDATE submissions SET is_public = ?, publication_changed_at = ?, consent_version = ? WHERE id = ? AND owner_id = ?').bind(publish?1:0,Date.now(),version,id,owner).run();
  if(!result.meta.changes)throw new ApiError(404,'Submission not found');
  const integrity=await db.prepare('SELECT status FROM submission_integrity WHERE submission_id = ?').bind(id).first<{status:string}>();
  return {updated:true,published:publish&&integrity?.status!=='quarantined',status:integrity?.status??'community-unverified'};
}
export async function deleteSubmission(db:BenchmarkDatabase,owner:string,id:string) {
  const result=await db.prepare('DELETE FROM submissions WHERE id = ? AND owner_id = ?').bind(id,owner).run();
  if(!result.meta.changes)throw new ApiError(404,'Submission not found');
  return {deleted:true};
}
export async function leaderboard(db:BenchmarkDatabase) {
  return db.prepare(`SELECT m.cohort, m.model_hash AS modelHash, m.input_tokens AS inputTokens,
    m.chip, m.machine, m.cpu_cores AS cpuCores, m.memory_bytes AS memoryBytes, m.os_version AS osVersion,
    m.runtime_hash AS runtimeHash, AVG(m.decode_tps) AS decodeTps, AVG(m.ttft_ms) AS ttftMs,
    AVG(m.prefill_tps) AS prefillTps, COUNT(DISTINCT s.id) AS runs, COUNT(DISTINCT s.owner_id) AS contributors
    FROM measurements m JOIN submissions s ON s.id = m.submission_id WHERE s.is_public = 1 AND NOT EXISTS (SELECT 1 FROM submission_integrity i WHERE i.submission_id = s.id AND i.status = 'quarantined')
    GROUP BY m.cohort, m.model_hash, m.input_tokens, m.chip, m.machine, m.cpu_cores, m.memory_bytes, m.os_version, m.runtime_hash
    ORDER BY m.cohort, decodeTps DESC LIMIT 500`).all();
}
