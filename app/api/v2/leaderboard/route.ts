import {json,failure} from '@/lib/api';
import {rawDb} from '@/db/raw';
import {publicWorkloadSummary} from '@/lib/workload-comparisons';
export async function GET(){try{
 // Apply publication consent in SQL, before loading/parsing any private report.
 const {results}=await rawDb().prepare("SELECT report_json AS reportJson FROM submissions WHERE is_public = 1 AND JSON_UNQUOTE(JSON_EXTRACT(report_json, '$.specVersion')) = 'tokfire-workloads-v1' ORDER BY collected_at DESC LIMIT 50").all<{reportJson:string}>();
 const rows=[];for(const row of results){try{const summary=await publicWorkloadSummary(JSON.parse(row.reportJson));if(summary)rows.push(summary);}catch{/* malformed stored reports are not public measurements */}}
 return json({results:rows,verification:'community-unverified',limit:50});
}catch(e){return failure(e);}}
