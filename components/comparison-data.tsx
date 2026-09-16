'use client';
import {useEffect,useState} from 'react';
import {localizeTree} from '@/lib/i18n';
import {useLocale} from './language-switcher';
import type {WorkloadComparison} from '@/lib/workload-comparisons';
type Reference={kind:string;sourceUrl:string;fetchedAt:string;coverage:string;rowJson:string};
export function ComparisonData(){
 const locale=useLocale();const [references,setReferences]=useState<Reference[]>([]),[runs,setRuns]=useState<WorkloadComparison[]>([]);
 const [kind,setKind]=useState('performance'),[query,setQuery]=useState(''),[status,setStatus]=useState('Loading reference data…');
 const [runStatus,setRunStatus]=useState('Loading measurements…');
 useEffect(()=>{let alive=true;
  void fetch('/api/v1/references').then(async r=>{if(!r.ok)throw Error();return await r.json() as {results:Reference[]};}).then(refs=>{if(alive){setReferences(refs.results);setStatus('');}}).catch(()=>{if(alive)setStatus('Comparison data is temporarily unavailable. Please reload.');});
  void fetch('/api/v2/leaderboard').then(async r=>{if(!r.ok)throw Error();return await r.json() as {results:WorkloadComparison[]};}).then(data=>{if(alive){setRuns(data.results);setRunStatus('');}}).catch(()=>{if(alive)setRunStatus('Comparison data is temporarily unavailable. Please reload.');});
  return()=>{alive=false;};
 },[]);
 const visible=references.filter(r=>r.kind===kind&&r.rowJson.toLowerCase().includes(query.toLowerCase()));
 return localizeTree(<>
  <section className="panel comparison-panel" style={{marginBottom:24}}><div className="panel-head"><div><span>EXTERNAL REFERENCE / oMLX</span><h2>Reference results are available.</h2></div></div>
   <p>These imported oMLX results are external references, separate from TokFire submissions. They are not your local results or independently verified scores.</p>
   {status?<p role="status">{status}</p>:<>
    <p>{references.length+' imported reference records'}</p><p className="fine-print">Snapshot: <span data-no-translate>{references[0]?.fetchedAt}</span> · <span data-no-translate>{references[0]?.coverage}</span></p>
    <div className="actions"><label>Reference type <select value={kind} onChange={e=>setKind(e.target.value)}><option value="performance">Performance</option><option value="intelligence">Intelligence</option></select></label><input aria-label="Filter model or chip" placeholder="Filter model or chip" value={query} onChange={e=>setQuery(e.target.value)}/></div>
    <div className="table-scroll"><table><thead><tr>{(kind==='performance'?['Source','Chip','RAM','Model','Quant','Context','PP tok/s','TG tok/s']:['Source','Author','Model','Quant','Benchmark','Score','Samples']).map(x=><th key={x}>{x}</th>)}</tr></thead><tbody data-no-translate>{visible.slice(0,20).map(r=>{const d=JSON.parse(r.rowJson) as {cells:string[]};return <tr key={r.sourceUrl}>{d.cells.slice(0,kind==='performance'?8:7).map((cell,i)=><td key={i}>{i===0?<a href={r.sourceUrl} target="_blank" rel="noreferrer">oMLX ↗</a>:cell}</td>)}</tr>;})}</tbody></table></div>
    {!visible.length&&<p>No reference records match this filter.</p>}
    <a className="text-link" href={locale==='en'?'/references':`/${locale}/references`}>Open the complete reference library →</a>
   </>}
  </section>
  <section className="panel comparison-panel" style={{marginBottom:24}}><h2>TokFire workload submissions · 0.7</h2>
   <p>Only explicitly published reports appear here. Private reports and tests saved only on your device are excluded. Different workload or runtime groups are not a single speed ranking.</p>
   {runStatus?<p role="status">{runStatus}</p>:!runs.length?<p>No public workload reports yet. After uploading, open My data and choose Allow publication to contribute.</p>:runs.map(r=><article key={r.runId} style={{padding:'16px 0',borderTop:'1px solid #e5ded6'}}>
    <h3 data-no-translate>{r.model} · {r.runtime} · {r.workload}</h3><p data-no-translate>{r.platform} · {r.chip} · {(r.memoryBytes/2**30).toFixed(1)} GiB · {r.measuredAt}</p>
    {r.location==='remote-server'&&<p>Remote server test: this hardware is the request client, not the inference host.</p>}
    <p>Comparison group: <code>{r.cohort.slice(0,12)}</code>{!r.modelHash&&' · Unverified external runtime identity'}</p>
    <div className="table-scroll"><table><thead><tr><th>Concurrent jobs</th><th>Complete / attempts</th><th>Decode</th><th>Aggregate tok/s</th><th>P95 task latency</th><th>P99 task latency</th></tr></thead><tbody>{r.rows.map(row=><tr key={row.jobs}><td>{row.jobs}</td><td>{row.complete}/{row.attempts}</td><td>{row.decodeTps===null?"Unavailable":row.decodeTps.toFixed(1)+" tok/s"}</td><td>{row.aggregateTps?.toFixed(1)??"—"}</td><td>{Math.round(row.p95Ms??0)} ms</td><td>{Math.round(row.p99Ms??0)} ms</td></tr>)}</tbody></table></div>
   </article>)}
   <p className="fine-print">Small-sample tails are descriptive. Decode shows the median of available runtime metrics; aggregate throughput is not per-job speed.</p>
   <a className="text-link" href={(locale==='en'?'/':`/${locale}`)+'?tab=privacy'}>Open My data →</a>
  </section>
 </>,locale);
}
