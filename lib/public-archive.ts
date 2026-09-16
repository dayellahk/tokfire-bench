import {nativeUploadSchema} from './serving.ts';
import {CONSENT_VERSION} from './benchmark.ts';
export type ArchiveReport={runId:string;spec:string;measuredAt:string;chip:string;memoryBytes:number;runtime:string;models:{name:string;rows:{jobs:number;inputTokens:number|null;samples:number;decodeTps:number;ttftMs:number}[]}[]};
const median=(values:number[])=>{const a=[...values].sort((a,b)=>a-b),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;};
// Explicit allowlist. Never return owner IDs, guest credentials or raw report blobs.
export function publicArchiveSummary(input:unknown):ArchiveReport|null{
 const parsed=nativeUploadSchema.safeParse({report:input,consent:{collect:true,publish:true,version:CONSENT_VERSION}});
 if(!parsed.success||parsed.data.report.specVersion==='tokfire-workloads-v1')return null;
 const r=parsed.data.report;
 return {runId:r.runId,spec:r.specVersion,measuredAt:r.measuredAt,chip:r.hardware.chip,memoryBytes:r.hardware.memoryBytes,runtime:r.runtime.name,models:r.models.map(m=>{
 const groups=new Map<string,{jobs:number;inputTokens:number|null;decode:number[];ttft:number[]}>();
 for(const s of m.samples){const jobs='concurrency' in s?s.concurrency:1;const input='concurrency' in s?null:s.inputTokens;const key=jobs+':'+input;const group=groups.get(key)??{jobs,inputTokens:input,decode:[],ttft:[]};group.decode.push(s.decodeTps);group.ttft.push(s.ttftMs);groups.set(key,group);}
 return {name:'modelName' in m?m.modelName:'SHA256 '+m.modelSha256.slice(0,12),rows:[...groups.values()].map(g=>({jobs:g.jobs,inputTokens:g.inputTokens,samples:g.decode.length,decodeTps:median(g.decode),ttftMs:median(g.ttft)}))};})};
}
