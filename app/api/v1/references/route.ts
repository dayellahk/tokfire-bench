import {writer,json,failure} from '@/lib/api';
import {rawDb} from '@/db/raw';
import snapshot from '@/data/omlx-reference.json';
export async function GET(){try{const {results}=await rawDb().prepare('SELECT kind, source_url AS sourceUrl, fetched_at AS fetchedAt, coverage, row_json AS rowJson FROM external_benchmarks ORDER BY kind,id LIMIT 2000').all();return json({results});}catch(e){return failure(e);}}
export async function POST(request:Request){try{
 await writer(request);const db=rawDb();
 const existing=await db.prepare('SELECT COUNT(*) AS n FROM external_benchmarks WHERE fetched_at = ?').bind(snapshot.fetchedAt).first<{n:number}>();
 if(existing?.n===snapshot.rows.length)return json({imported:existing.n,fetchedAt:snapshot.fetchedAt,coverage:snapshot.coverage,unchanged:true});
 // Only the reviewed, bundled public snapshot is accepted. No client SQL/data.
 for(let offset=0;offset<snapshot.rows.length;offset+=50){await db.batch(snapshot.rows.slice(offset,offset+50).map(row=>db.prepare('INSERT INTO external_benchmarks (id,kind,source_url,fetched_at,coverage,row_json) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET fetched_at=excluded.fetched_at,coverage=excluded.coverage,row_json=excluded.row_json').bind('omlx:'+row.kind+':'+row.sourceId,row.kind,row.sourceUrl,snapshot.fetchedAt,snapshot.coverage,JSON.stringify(row))));}
 return json({imported:snapshot.rows.length,fetchedAt:snapshot.fetchedAt,coverage:snapshot.coverage});
}catch(e){return failure(e);}}
