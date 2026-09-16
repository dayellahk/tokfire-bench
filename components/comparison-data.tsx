'use client';
/* eslint-disable @next/next/no-html-link-for-pages -- Full navigation resets the home page tab before scrolling to downloads. */
import {useEffect,useRef,useState} from 'react';
import {PublicArchive} from './public-archive';
import {HardwarePicks} from './hardware-picks';
import {ArrowDown,ArrowUpRight,Check,ChevronDown,Cpu,Download,FileJson,Search,Users} from 'lucide-react';
import {localizeTree} from '@/lib/i18n';
import {useLocale} from './language-switcher';
import {publicWorkloadSummary,type WorkloadComparison} from '@/lib/workload-comparisons';
import {findWorkloadResults} from '@/lib/result-finder';
import {FitBadge,FitGuide,WorkloadFitView,WORKLOAD_NAMES} from './workload-fit-view';
export function ComparisonData(){
 const locale=useLocale();
 const [runs,setRuns]=useState<WorkloadComparison[]>([]);
 const [query,setQuery]=useState(''),[platform,setPlatform]=useState('all'),[memory,setMemory]=useState('all'),[purpose,setPurpose]=useState('all');
 const [runStatus,setRunStatus]=useState('Loading measurements…');
 const [preview,setPreview]=useState<WorkloadComparison|null>(null),[importStatus,setImportStatus]=useState('');const importId=useRef(0);
 const picksRef=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{let alive=true;
  void fetch('/api/v2/leaderboard').then(async r=>{if(!r.ok)throw Error();return await r.json() as {results:WorkloadComparison[]};}).then(data=>{if(alive){setRuns(data.results);setRunStatus('');}}).catch(()=>{if(alive)setRunStatus('Comparison data is temporarily unavailable. Please reload.');});
  return()=>{alive=false;};
 },[]);
 async function inspect(file:File|undefined){if(!file)return;const id=++importId.current;setPreview(null);setImportStatus('Checking report locally…');try{
  if(file.size>1_500_000)throw Error();const summary=await publicWorkloadSummary(JSON.parse(await file.text()));if(!summary)throw Error();
  if(id===importId.current){setPreview(summary);setImportStatus('');}
 }catch{if(id===importId.current)setImportStatus('Choose a valid TokFire 0.7 workload JSON report, up to 1.5 MB.');}}
 function reset(){setQuery('');setPlatform('all');setMemory('all');setPurpose('all');}
 const publicRuns=findWorkloadResults(runs,{query,platform,memory,purpose});
 const localRuns=runs.filter(r=>r.location!=='remote-server');
 const memories=[...new Set(localRuns.map(r=>Math.round(r.memoryBytes/2**30)))].sort((a,b)=>a-b);
 const hardwareCount=new Set(localRuns.map(r=>[r.chip,r.memoryBytes,...r.gpuNames].join('|'))).size;
 const filtered=!!query||platform!=='all'||memory!=='all'||purpose!=='all';
 return localizeTree(<div className="fit-dashboard finder-dashboard">
  <section className="finder-console" aria-labelledby="finder-title">
   <div className="finder-console-heading"><span className="fit-eyebrow"><Cpu size={16}/>01 / FIND YOUR MATCH</span><span className="finder-live"><i/>Community measurements</span></div>
   <h2 id="finder-title">What computer are you using?</h2>
   <p>Search your chip or GPU, then choose what you want to do.</p>
   <label className="finder-search"><Search size={22}/><input aria-label="Search hardware or model" placeholder="Try M2 Max, RTX 4090, Qwen…" value={query} onChange={e=>setQuery(e.target.value)}/><kbd aria-hidden="true">⌕</kbd></label>
   <div className="finder-filters">
    <label><span>Your platform</span><select aria-label="Your platform" value={platform} onChange={e=>setPlatform(e.target.value)}><option value="all">All platforms</option><option value="macOS">Mac / Apple silicon</option><option value="Windows">Windows</option><option value="Linux">Linux</option><option value="Android">Android</option></select></label>
    <label><span>RAM in tested machine</span><select aria-label="RAM in tested machine" value={memory} onChange={e=>setMemory(e.target.value)}><option value="all">Any RAM</option>{memories.map(n=><option value={n} key={n}>{n} GiB</option>)}</select></label>
    <label><span>I want to use AI for</span><select aria-label="I want to use AI for" value={purpose} onChange={e=>setPurpose(e.target.value)}><option value="all">All uses</option><option value="chat">Chat &amp; writing</option><option value="agent">One agent task</option><option value="parallel">Parallel agent tasks</option></select></label>
   </div>
   <div className="finder-console-foot"><span><Check size={14}/>Results update as you choose</span><button type="button" onClick={reset} disabled={!filtered}>Reset filters</button></div>
  </section>
  <section id="measured" className="finder-results" aria-labelledby="finder-results-title">
   <div className="finder-results-head"><div><span className="fit-eyebrow">02 / EXPLORE THE EVIDENCE</span><h2 id="finder-results-title">Models tested on real computers</h2></div><span className="finder-result-count" role="status" aria-live="polite">{runStatus?'—':publicRuns.length} <span>matching reports</span></span></div>
   <p className="finder-coverage">{runStatus?'Loading measurements…':<><b>{localRuns.length}</b> <span>local workload reports across</span> <b>{hardwareCount}</b> <span>hardware configurations.</span></>} <span>Coverage is growing. Similar hardware is a starting point, not a guarantee.</span></p>
   {runStatus?<div className="finder-empty" role="status"><ActivityMark/><h3>{runStatus}</h3></div>:!publicRuns.length?<div className="finder-empty"><Search size={30}/><h3>No measured match yet.</h3><p>Your computer could fill this gap. Try broader filters, explore starter setups, or run TokFire Bench and contribute your result.</p><div className="finder-empty-actions"><button type="button" onClick={reset}>Show all results</button><a href="#setups" onClick={()=>{if(picksRef.current)picksRef.current.open=true;}}>Explore starter setups <ArrowDown size={15}/></a></div></div>:<div className="finder-cards">{publicRuns.map(run=>{
    const levels=run.fit.levels;
    const focusLevel=levels.find(l=>l.jobs===run.fit.maxSmoothJobs)??levels[0];
    const complete=levels.reduce((n,l)=>n+l.complete,0),attempts=levels.reduce((n,l)=>n+l.attempts,0);
    return <article className="finder-card" key={run.runId}>
     <div className="finder-card-top"><span className="finder-hardware"><Cpu size={16}/><span data-no-translate>{run.chip} · {Math.round(run.memoryBytes/2**30)} GiB</span></span><span data-no-translate>{run.platform}</span></div>
     <div className="finder-card-main"><div className="finder-model"><h3 data-no-translate>{run.model}</h3><p><span>{WORKLOAD_NAMES[run.workload]}</span> · <span data-no-translate>{run.runtime}</span></p>{run.gpuNames.some(g=>g!==run.chip)&&<small data-no-translate>{run.gpuNames.join(' · ')}</small>}</div><FitBadge grade={run.fit.grade}/></div>
     <div className="finder-card-metrics"><div><span>Smooth jobs measured</span><b>{run.fit.maxSmoothJobs??'—'}</b></div><div><span>Tasks completed</span><b>{complete}<small> / {attempts}</small></b></div><div><span>Slowest decode</span><b>{focusLevel?.minDecodeTps?.toFixed(1)??'—'}<small> tok/s</small></b><small>{focusLevel?.jobs??'—'} <span className="finder-inline">jobs in this level</span></small></div></div>
     <p className="finder-verdict">{run.fit.grade==='A'?'Parallel tool tasks passed at the measured job count.':run.fit.grade==='B'?'One tool task passed at the measured level. Check higher levels in the details.':run.fit.grade==='C'?'Chat/text passed. Agent capability needs a separate test.':run.fit.grade==='D'?'This tested setup missed the smooth-use guideline. Review the evidence before choosing.':'More evidence is needed before recommending this pairing.'}</p>
     <details className="finder-evidence"><summary><span>View test details</span><ChevronDown size={16}/></summary><WorkloadFitView run={run}/></details>
    </article>;
   })}</div>}
   <p className="finder-disclosure">Showing the latest 50 public workload reports, with passing grades first. Results are self-reported; challenge checks do not verify the hardware. Remote-server reports are excluded from hardware matching.</p>
   <FitGuide/>
  </section>
  <section className="finder-contribute" aria-labelledby="contribute-title">
   <div className="finder-contribute-copy"><span className="fit-eyebrow">03 / MAKE IT YOURS</span><h2 id="contribute-title">The next useful result<br/>could be yours.</h2><p>Other people’s results help you choose. Your own test tells you how it runs on your computer.</p><p>Run the model you care about, then share your measurements. Every real test helps the next person make a better choice—and helps TokFire improve its recommendations.</p><a className="finder-download" href="/#download"><Download size={18}/>Download TokFire Bench <ArrowUpRight size={18}/></a><span className="finder-contribute-note">Free: 1–3 jobs on one model · Guest uploads · You choose what to share</span></div>
   <ol className="finder-contribute-steps"><li><span>01</span><div><b>Test your own setup</b><p>Choose your model and workload in the app.</p></div></li><li><span>02</span><div><b>See what feels smooth</b><p>Compare chat, a tool task and concurrent jobs.</p></div></li><li><span>03</span><div><b>Give the community better data</b><p>Enable upload and public sharing to contribute your hardware and benchmark measurements.</p></div></li></ol>
  </section>
  <div className="finder-more">
   <details ref={picksRef} className="finder-resource" id="setups"><summary><Cpu size={20}/><span><b>Need a starting configuration?</b><small>6 curated PC &amp; Mac setups · Not measured recommendations</small></span><ChevronDown size={18}/></summary><HardwarePicks compact embedded/></details>
   <details className="finder-resource"><summary><Users size={20}/><span><b>Earlier community tests</b><small>Browse older test profiles separately</small></span><ChevronDown size={18}/></summary><PublicArchive/></details>
   <details className="finder-resource"><summary><FileJson size={20}/><span><b>Already have a report?</b><small>Preview a 0.7 JSON file locally</small></span><ChevronDown size={18}/></summary><div className="finder-import"><label className="fit-import"><FileJson size={17}/><span>Open 0.7 JSON</span><input type="file" accept=".json,application/json" aria-label="Open 0.7 workload report" onChange={e=>{void inspect(e.target.files?.[0]);e.target.value='';}}/></label><p>Local preview stays in this browser. Opening a report does not upload or publish it.</p>{importStatus&&<p role="status">{importStatus}</p>}{preview&&<><button type="button" onClick={()=>{importId.current++;setPreview(null);}}>Close preview</button><WorkloadFitView run={preview} local/></>}</div></details>
  </div>
 </div>,locale);
}
function ActivityMark(){return <Cpu size={30} aria-hidden="true"/>;}
