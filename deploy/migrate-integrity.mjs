import mysql from 'mysql2/promise';
import {readFile} from 'node:fs/promises';
import {canonical,digest,measurementDigest} from '../lib/integrity.ts';
const db=await mysql.createConnection(process.env.DATABASE_URL);
try{
 const sql=await readFile(new URL('./schema.sql',import.meta.url),'utf8');
 for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await db.query(statement);
 // Preserve every existing report and its publication choice. Backfill replay receipts only.
 const [rows]=await db.query('SELECT run_id, report_json FROM submissions');
 for(const row of rows){const report=JSON.parse(row.report_json),content=measurementDigest(report);
  await db.execute('INSERT IGNORE INTO run_receipts (run_id,report_digest,content_digest) VALUES (?,?,?)',[row.run_id,digest(canonical(report)),content]);
  await db.execute('INSERT IGNORE INTO measurement_claims (content_digest) VALUES (?)',[content]);
 }
 console.log(`Upload integrity tables ready; preserved ${rows.length} reports.`);
}finally{await db.end();}
