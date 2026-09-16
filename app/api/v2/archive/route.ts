import {rawDb} from '@/db/raw';
import {json,failure} from '@/lib/api';
import {publicArchiveSummary} from '@/lib/public-archive';
export const dynamic='force-dynamic';
export async function GET(){try{
 const {results}=await rawDb().prepare("SELECT s.report_json AS reportJson FROM submissions s LEFT JOIN submission_integrity i ON i.submission_id=s.id WHERE s.is_public=1 AND COALESCE(i.status,'community-unverified') <> 'quarantined' AND JSON_UNQUOTE(JSON_EXTRACT(s.report_json,'$.specVersion')) <> 'tokfire-workloads-v1' ORDER BY s.collected_at DESC LIMIT 100").all<{reportJson:string}>();
 return json({results:results.flatMap(row=>{try{const r=publicArchiveSummary(JSON.parse(row.reportJson));return r?[r]:[];}catch{return [];}})});
}catch(error){return failure(error);}}
