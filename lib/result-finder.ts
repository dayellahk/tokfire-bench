import type {WorkloadComparison} from './workload-comparisons';
export type FinderFilters={query:string;platform:string;memory:string;purpose:string};
export function findWorkloadResults(runs:WorkloadComparison[],filters:FinderFilters){
 const terms=filters.query.toLowerCase().trim().split(/\s+/).filter(Boolean);
 return runs.filter(run=>{
  // Remote reports describe the request client, so cannot match an inference machine.
  if(run.location==='remote-server')return false;
  if(filters.platform!=='all'&&run.platform!==filters.platform)return false;
  if(filters.memory!=='all'&&Math.round(run.memoryBytes/2**30)!==Number(filters.memory))return false;
  if(filters.purpose==='chat'&&run.workload==='agent-tools')return false;
  if(filters.purpose==='agent'&&(run.workload!=='agent-tools'||!run.fit.levels.some(l=>l.jobs===1)))return false;
  if(filters.purpose==='parallel'&&(run.workload!=='agent-tools'||!run.fit.levels.some(l=>l.jobs>=2)))return false;
  const text=[run.model,run.chip,run.platform,run.runtime,...run.gpuNames].join(' ').toLowerCase();
  return terms.every(term=>text.includes(term));
 }).sort((a,b)=>{
  const order={A:0,B:1,C:2,D:3,U:4};
  return order[a.fit.grade]-order[b.fit.grade]||b.measuredAt.localeCompare(a.measuredAt);
 });
}
