'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {Activity,ArrowUpRight,FileJson,Search} from 'lucide-react';
import {localizeTree} from '@/lib/i18n';
import {useLocale} from './language-switcher';
import {publicWorkloadSummary,type WorkloadComparison} from '@/lib/workload-comparisons';
import {type FitGrade} from '@/lib/workload-fit';
import {FitBadge,FitGuide,WorkloadFitView,WORKLOAD_NAMES} from './workload-fit-view';
export function ComparisonData(){
 const locale=useLocale();
 const [runs,setRuns]=useState<WorkloadComparison[]>([]);
 const [query,setQuery]=useState(''),[workload,setWorkload]=useState('all');
 const [runStatus,setRunStatus]=useState('Loading measurements…');
 const [preview,setPreview]=useState<WorkloadComparison|null>(null),[importStatus,setImportStatus]=useState('');const importId=useRef(0);
 useEffect(()=>{let alive=true;
  void fetch('/api/v2/leaderboard').then(async r=>{if(!r.ok)throw Error();return await r.json() as {results:WorkloadComparison[]};}).then(data=>{if(alive){setRuns(data.results);setRunStatus('');}}).catch(()=>{if(alive)setRunStatus('Comparison data is temporarily unavailable. Please reload.');});
  return()=>{alive=false;};
 },[]);
 async function inspect(file:File|undefined){if(!file)return;const id=++importId.current;setPreview(null);setImportStatus('Checking report locally…');try{
  if(file.size>1_500_000)throw Error();const summary=await publicWorkloadSummary(JSON.parse(await file.text()));if(!summary)throw Error();
  if(id===importId.current){setPreview(summary);setImportStatus('');}
 }catch{if(id===importId.current)setImportStatus('Choose a valid TokFire 0.7 workload JSON report, up to 1.5 MB.');}}
 const needle=query.toLowerCase().trim();
 const publicRuns=runs.filter(r=>(workload==='all'||r.workload===workload)&&[r.model,r.chip,r.platform,r.runtime,...r.gpuNames].join(' ').toLowerCase().includes(needle));
 return localizeTree(<div className="fit-dashboard">
  <div className="fit-overview"><div><Activity/><span>Public app reports</span><strong>{runStatus?'—':runs.length}</strong></div><div><FileJson/><span>App compatibility</span><strong>0.7 <small>JSON</small></strong></div></div>
  <div className="fit-legend" aria-label="Fit grade legend">{(['A','B','C','D','U'] as FitGrade[]).map(grade=><div key={grade}><FitBadge grade={grade}/><small>{({A:'2+ jobs measured',B:'1 job measured',C:'Agent use untested',D:'Tested level missed guideline',U:'More evidence needed'})[grade]}</small></div>)}</div>
  <FitGuide/>
  <div className="fit-search"><Search size={18}/><input aria-label="Search hardware or model" placeholder="Search hardware, model or runtime" value={query} onChange={e=>{setQuery(e.target.value);}}/></div>
  <section className="panel fit-section" aria-labelledby="app-fit-title">
   <div className="fit-section-head"><div><span className="fit-eyebrow">01 / MEASURED WORKLOAD FIT</span><h2 id="app-fit-title">Your setup. Your workload.</h2><p>Read the grade alongside the tested job count, completion rate and worst request latency.</p></div><label className="fit-import"><FileJson size={17}/><span>Open 0.7 JSON</span><input type="file" accept=".json,application/json" aria-label="Open 0.7 workload report" onChange={e=>{void inspect(e.target.files?.[0]);e.target.value='';}}/></label></div>
   <p className="fit-local-note">Local preview stays in this browser. Opening a report does not upload or publish it.</p>
   {importStatus&&<p role="status" className="fit-warning">{importStatus}</p>}
   {preview&&<div className="fit-local-preview"><div className="fit-preview-bar"><span>Local report preview</span><button type="button" onClick={()=>{importId.current++;setPreview(null);}}>Close preview</button></div><WorkloadFitView run={preview} local/></div>}
   <div className="fit-feed-head"><h3>Published app results</h3><label><span>Workload</span><select aria-label="Filter workload" value={workload} onChange={e=>setWorkload(e.target.value)}><option value="all">All workloads</option>{Object.entries(WORKLOAD_NAMES).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label></div>
   {runStatus?<p role="status">{runStatus}</p>:!runs.length?<div className="fit-empty"><div><b>No public 0.7 reports yet.</b><p>Open your app report above to see its grade now. To contribute, upload a report and select Allow publication in My data.</p></div><Link href="/?tab=privacy">Open My data <ArrowUpRight size={16}/></Link></div>:!publicRuns.length?<p>No app reports match these filters.</p>:publicRuns.map(run=><WorkloadFitView key={run.runId} run={run}/>)}
   <p className="fit-footnote">Latest 50 public reports. Community submissions are format-checked, not independently verified. Grades apply only to the measured workload and levels.</p>
  </section>

 </div>,locale);
}
