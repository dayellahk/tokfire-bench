'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {Activity,ArrowUpRight,FileJson,Layers3,Search} from 'lucide-react';
import {localizeTree} from '@/lib/i18n';
import {useLocale} from './language-switcher';
import {publicWorkloadSummary,type WorkloadComparison} from '@/lib/workload-comparisons';
import {referenceSpeedSignal,type FitGrade} from '@/lib/workload-fit';
import {FitBadge,FitGuide,WorkloadFitView,WORKLOAD_NAMES} from './workload-fit-view';
type Reference={kind:string;sourceUrl:string;fetchedAt:string;coverage:string;rowJson:string};
type ReferenceRow=Reference&{cells:string[]};
function parseReferences(rows:Reference[]):ReferenceRow[]{return rows.flatMap(r=>{try{const d=JSON.parse(r.rowJson);return Array.isArray(d.cells)&&d.cells.every((v:unknown)=>typeof v==='string')&&d.cells.length>=(r.kind==='performance'?8:7)?[{...r,cells:d.cells}]:[];}catch{return [];}}).sort((a,b)=>Number(a.cells[0])-Number(b.cells[0]));}
const PAGE_SIZE=10;
export function ComparisonData(){
 const locale=useLocale();
 const [references,setReferences]=useState<ReferenceRow[]>([]),[runs,setRuns]=useState<WorkloadComparison[]>([]);
 const [kind,setKind]=useState('performance'),[query,setQuery]=useState(''),[page,setPage]=useState(1),[workload,setWorkload]=useState('all');
 const [refStatus,setRefStatus]=useState('Loading reference data…'),[runStatus,setRunStatus]=useState('Loading measurements…');
 const [preview,setPreview]=useState<WorkloadComparison|null>(null),[importStatus,setImportStatus]=useState('');const importId=useRef(0);
 useEffect(()=>{let alive=true;
  void fetch('/api/v1/references').then(async r=>{if(!r.ok)throw Error();return await r.json() as {results:Reference[]};}).then(refs=>{if(alive){setReferences(parseReferences(refs.results));setRefStatus('');}}).catch(()=>{if(alive)setRefStatus('Comparison data is temporarily unavailable. Please reload.');});
  void fetch('/api/v2/leaderboard').then(async r=>{if(!r.ok)throw Error();return await r.json() as {results:WorkloadComparison[]};}).then(data=>{if(alive){setRuns(data.results);setRunStatus('');}}).catch(()=>{if(alive)setRunStatus('Comparison data is temporarily unavailable. Please reload.');});
  return()=>{alive=false;};
 },[]);
 async function inspect(file:File|undefined){if(!file)return;const id=++importId.current;setPreview(null);setImportStatus('Checking report locally…');try{
  if(file.size>1_500_000)throw Error();const summary=await publicWorkloadSummary(JSON.parse(await file.text()));if(!summary)throw Error();
  if(id===importId.current){setPreview(summary);setImportStatus('');}
 }catch{if(id===importId.current)setImportStatus('Choose a valid TokFire 0.7 workload JSON report, up to 1.5 MB.');}}
 const needle=query.toLowerCase().trim();
 const visible=references.filter(r=>r.kind===kind&&r.cells.join(' ').toLowerCase().includes(needle));
 const totalPages=Math.max(1,Math.ceil(visible.length/PAGE_SIZE)),currentPage=Math.min(page,totalPages);
 const rows=visible.slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE);
 const publicRuns=runs.filter(r=>(workload==='all'||r.workload===workload)&&[r.model,r.chip,r.platform,r.runtime,...r.gpuNames].join(' ').toLowerCase().includes(needle));
 return localizeTree(<div className="fit-dashboard">
  <div className="fit-overview"><div><Activity/><span>Public app reports</span><strong>{runStatus?'—':runs.length}</strong></div><div><Layers3/><span>External references</span><strong>{refStatus?'—':references.length}</strong></div><div><FileJson/><span>App compatibility</span><strong>0.7 <small>JSON</small></strong></div></div>
  <div className="fit-legend" aria-label="Fit grade legend">{(['A','B','C','D','U'] as FitGrade[]).map(grade=><div key={grade}><FitBadge grade={grade}/><small>{({A:'2+ jobs measured',B:'1 job measured',C:'Agent use untested',D:'Tested level missed guideline',U:'More evidence needed'})[grade]}</small></div>)}</div>
  <FitGuide/>
  <div className="fit-search"><Search size={18}/><input aria-label="Search hardware or model" placeholder="Search hardware, model or runtime" value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}}/></div>
  <section className="panel fit-section" aria-labelledby="app-fit-title">
   <div className="fit-section-head"><div><span className="fit-eyebrow">01 / MEASURED WORKLOAD FIT</span><h2 id="app-fit-title">Your setup. Your workload.</h2><p>Read the grade alongside the tested job count, completion rate and worst request latency.</p></div><label className="fit-import"><FileJson size={17}/><span>Open 0.7 JSON</span><input type="file" accept=".json,application/json" aria-label="Open 0.7 workload report" onChange={e=>{void inspect(e.target.files?.[0]);e.target.value='';}}/></label></div>
   <p className="fit-local-note">Local preview stays in this browser. Opening a report does not upload or publish it.</p>
   {importStatus&&<p role="status" className="fit-warning">{importStatus}</p>}
   {preview&&<div className="fit-local-preview"><div className="fit-preview-bar"><span>Local report preview</span><button type="button" onClick={()=>{importId.current++;setPreview(null);}}>Close preview</button></div><WorkloadFitView run={preview} local/></div>}
   <div className="fit-feed-head"><h3>Published app results</h3><label><span>Workload</span><select aria-label="Filter workload" value={workload} onChange={e=>setWorkload(e.target.value)}><option value="all">All workloads</option>{Object.entries(WORKLOAD_NAMES).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label></div>
   {runStatus?<p role="status">{runStatus}</p>:!runs.length?<div className="fit-empty"><div><b>No public 0.7 reports yet.</b><p>Open your app report above to see its grade now. To contribute, upload a report and select Allow publication in My data.</p></div><Link href="/?tab=privacy">Open My data <ArrowUpRight size={16}/></Link></div>:!publicRuns.length?<p>No app reports match these filters.</p>:publicRuns.map(run=><WorkloadFitView key={run.runId} run={run}/>)}
   <p className="fit-footnote">Latest 50 public reports. Community submissions are format-checked, not independently verified. Grades apply only to the measured workload and levels.</p>
  </section>
  <section className="panel fit-section" aria-labelledby="reference-fit-title">
   <div className="fit-section-head"><div><span className="fit-eyebrow">02 / EXTERNAL REFERENCE</span><h2 id="reference-fit-title">Explore hardware & model pairings.</h2><p>Use source results as a starting point, then validate your workload in TokFire Bench.</p></div><a className="fit-source-link" href={locale==='en'?'/references':`/${locale}/references`}>Full reference library <ArrowUpRight size={16}/></a></div>
   <div className="fit-ref-toolbar"><div className="fit-tabs" aria-label="Reference type"><button type="button" aria-pressed={kind==='performance'} onClick={()=>{setKind('performance');setPage(1);}}>Performance</button><button type="button" aria-pressed={kind==='intelligence'} onClick={()=>{setKind('intelligence');setPage(1);}}>Intelligence</button></div><span>{visible.length} <span>matching records</span></span></div>
   <p className="fit-reference-note">U = not assessed. External speed and intelligence scores do not verify chat responsiveness, tool success or concurrent-job capacity.</p>
   {refStatus?<p role="status">{refStatus}</p>:<>
    <div className="table-scroll fit-reference-table" tabIndex={0} aria-label="External reference comparisons"><table><thead><tr><th>{kind==='performance'?'Hardware':'Model'}</th><th>{kind==='performance'?'LLM / configuration':'Quality benchmark'}</th><th>Hardware × model fit</th><th>{kind==='performance'?'Reported speed':'Evidence limit'}</th><th>Source</th></tr></thead><tbody>{rows.map(r=><tr key={r.sourceUrl}>
     <td><b data-no-translate>{r.cells[kind==='performance'?1:2]}</b><small data-no-translate>{kind==='performance'?r.cells[2]+' RAM':r.cells[3]}</small></td>
     <td>{kind==='performance'?<><b data-no-translate>{r.cells[3]}</b><small><span data-no-translate>{r.cells[4]} · {r.cells[5]}</span> <span>context</span></small></>:<><b data-no-translate>{r.cells[4]} · {r.cells[5]}</b><small><span>Samples</span> <span data-no-translate>{r.cells[6]}</span></small></>}</td>
     <td><FitBadge grade="U"/><small>{kind==='performance'?'Agent & job capacity untested':'Hardware pairing not established'}</small></td>
     <td>{kind==='performance'?<><strong className="fit-tps" data-no-translate>{r.cells[7]} <small>tok/s</small></strong><small>{referenceSpeedSignal(r.cells[7]??'')}</small><small><span>Prefill</span> <span data-no-translate>{r.cells[6]} tok/s</span></small></>:<><span>No workload timing</span><small>Quality score is not an agent-fit grade</small></>}</td>
     <td><a href={r.sourceUrl} target="_blank" rel="noreferrer" aria-label="Open source report">oMLX <ArrowUpRight size={15}/></a>{kind==='intelligence'&&<small data-no-translate>{r.cells[1]}</small>}</td>
    </tr>)}</tbody></table></div>
    {!visible.length&&<p role="status">No reference records match this filter.</p>}
    <div className="fit-pagination"><span>Page <b>{currentPage}</b> / {totalPages}</span><div><button type="button" disabled={currentPage<=1} onClick={()=>setPage(currentPage-1)}>Previous</button><button type="button" disabled={currentPage>=totalPages} onClick={()=>setPage(currentPage+1)}>Next</button></div></div>
    <details className="fit-snapshot"><summary>Source coverage & limitations</summary><p>Snapshot: <span data-no-translate>{references[0]?.fetchedAt}</span></p><p data-no-translate>{references[0]?.coverage}</p><p>Imported reference data has not been independently verified. It is kept separate from TokFire measurements.</p></details>
   </>}
  </section>
 </div>,locale);
}
