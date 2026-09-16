import {json,failure} from '@/lib/api';
import {rawDb} from '@/db/raw';
import {publicWorkloadSummary} from '@/lib/workload-comparisons';
export async function GET(){try{
 // Apply publication consent in SQL, before loading/parsing any private report.
 const {results}=await rawDb().prepare("SELECT s.report_json AS reportJson, COALESCE(i.status, 'community-unverified') AS integrityStatus FROM submissions s LEFT JOIN submission_integrity i ON i.submission_id = s.id WHERE s.is_public = 1 AND COALESCE(i.status, 'community-unverified') <> 'quarantined' AND JSON_UNQUOTE(JSON_EXTRACT(report_json, '$.specVersion')) = 'tokfire-workloads-v1' ORDER BY collected_at DESC LIMIT 50").all<{reportJson:string;integrityStatus:'community-unverified'|'challenge-checked'}>();
 const rows=[];for(const row of results){try{const summary=await publicWorkloadSummary(JSON.parse(row.reportJson));if(summary)rows.push({...summary,integrityStatus:row.integrityStatus});}catch{/* malformed stored reports are not public measurements */}}
 return json({results:rows,verification:'community-unverified',limit:50});
}catch(e){return failure(e);}}
