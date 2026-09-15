import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import {getMigrations} from 'better-auth/db/migration';
import {getAuth} from '../lib/auth.ts';
if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const db=await mysql.createConnection(process.env.DATABASE_URL);
try {
 const sql=await readFile(new URL('./schema.sql',import.meta.url),'utf8');
 for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean)) await db.query(statement);
 const migrations=await getMigrations(getAuth().options);
 await migrations.runMigrations();
 console.log('TokFire benchmark and authentication schemas ready.');
} finally { await db.end(); }
process.exit(0);
