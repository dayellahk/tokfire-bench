import {workloadSchema,workloadSummary,type WorkloadReport} from './workloads.ts';
export type WorkloadComparison={runId:string;measuredAt:string;platform:string;chip:string;memoryBytes:number;model:string;modelHash:string|null;runtime:string;runtimeHash:string|null;workload:string;location:string;cohort:string;rows:ReturnType<typeof workloadSummary>};
export async function publicWorkloadSummary(input:unknown):Promise<WorkloadComparison|null>{
 const parsed=workloadSchema.safeParse(input);if(!parsed.success)return null;
 const r:WorkloadReport=parsed.data;
 const cache=[...new Set(r.models[0].samples.flatMap(s=>s.requests.map(q=>q.cachedTokens===null?'unknown':q.cachedTokens===0?'uncached':'cached')))].sort();
 // External IDs are unverified. They must not establish a cross-machine exact-build cohort.
 const identity=JSON.stringify({spec:r.specVersion,settings:r.settings,runtime:r.runtime,model:r.models[0].modelSha256,cache,unverified:r.runtime.identity==='unverified-server-model-id'?r.runId:null});
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity));
 return {runId:r.runId,measuredAt:r.measuredAt,platform:r.hardware.platform,chip:r.hardware.chip,memoryBytes:r.hardware.memoryBytes,model:r.models[0].modelName,modelHash:r.models[0].modelSha256,runtime:r.runtime.name,runtimeHash:r.runtime.binarySha256,workload:r.settings.workload,location:r.settings.inferenceLocation,cohort:Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join(''),rows:workloadSummary(r)};
}
