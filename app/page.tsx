'use client';

import { useEffect, useState } from 'react';
import { Activity, Flame, ArrowRight, Check, Cpu, Database, Download, FileUp, Gauge, LockKeyhole, ShieldCheck, Trash2, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BenchmarkReport, CONSENT_VERSION, MAX_REPORT_BYTES, reportSchema, summarize, responsiveness } from '@/lib/benchmark';

type Tab = 'benchmark' | 'rankings' | 'privacy';
type Ranking = {cohort:string; modelHash:string; inputTokens:number; chip:string; machine:string; cpuCores:number; memoryBytes:number; osVersion:string; runtimeHash:string; decodeTps:number; ttftMs:number; prefillTps:number; runs:number; contributors:number};
type Submission = {id:string;runId:string;collectedAt:number;isPublic:number;reportJson:string};
const gb=(n:number)=>`${(n/2**30).toFixed(1)} GiB`;
const fmt=(n:number)=>n.toLocaleString(undefined,{maximumFractionDigits:1});
async function api<T>(path:string, options?:RequestInit) {
  const response=await fetch(path,options);
  if(!response.headers.get('content-type')?.includes('application/json')) throw new Error('Please sign in to this website, then try again.');
  const result=await response.json() as T & {error?:string};
  if(!response.ok) throw new Error(result.error||'Request failed. Please try again.');
  return result;
}

export default function Home() {
  const [tab,setTab]=useState<Tab>('benchmark');
  const [report,setReport]=useState<BenchmarkReport|null>(null);
  const [collect,setCollect]=useState(false),[publish,setPublish]=useState(false);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  const [submitted,setSubmitted]=useState(false);
  const [rankings,setRankings]=useState<Ranking[]>([]),[cohort,setCohort]=useState('');
  const [mine,setMine]=useState<Submission[]>([]),[loading,setLoading]=useState(false);
  const [deleteId,setDeleteId]=useState<string|null>(null);
  const rows=report?summarize(report):[];
  const shortRows=rows.filter(r=>r.inputTokens===512).sort((a,b)=>b.decodeTps-a.decodeTps);
  const best=shortRows[0];
  const cohorts=Array.from(new Map(rankings.map(r=>[r.cohort,r])).values());
  const selectedCohort=cohorts.some(r=>r.cohort===cohort)?cohort:cohorts[0]?.cohort;
  const visible=rankings.filter(r=>r.cohort===selectedCohort).sort((a,b)=>b.decodeTps-a.decodeTps);

  useEffect(()=>{
    if(tab==='benchmark') return;
    let cancelled=false;
    const request = tab==='rankings'
      ? api<{results:Ranking[]}>('/api/v1/leaderboard').then(data=>{if(!cancelled)setRankings(data.results);})
      : api<{results:Submission[]}>('/api/v1/submissions').then(data=>{if(!cancelled)setMine(data.results);});
    request.catch(e=>{if(!cancelled)setError(e.message);}).finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;};
  },[tab]);

  async function importFile(file?:File) {
    if(!file)return;
    setError('');setMessage('');
    try {
      if(file.size>MAX_REPORT_BYTES)throw new Error('Report is too large. Maximum size is 200 KB.');
      const raw=JSON.parse(await file.text());
      if(raw?.specVersion==='local-ai-trial-v1')throw new Error('This is a short local trial. Run the full benchmark for your selected model(s) to submit comparable measurements.');
      const parsed=reportSchema.safeParse(raw);
      if(!parsed.success)throw new Error('This file is not a complete v1 benchmark report. Use the current native runner. Extra fields and incomplete runs are rejected.');
      setReport(parsed.data);setCollect(false);setPublish(false);setSubmitted(false);
      setMessage('Report opened locally in this browser. Nothing has been uploaded.');
    } catch(e) {setError(e instanceof Error?e.message:'Could not read report');}
  }
  async function upload() {
    if(!report||!collect||busy)return;
    setBusy(true);setError('');setMessage('');
    try {
      const result=await api<{published:boolean}>('/api/v1/submissions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({report,consent:{collect:true,publish,version:CONSENT_VERSION}})});
      setSubmitted(true);setMessage(result.published?'Saved and included in the community comparison.':'Saved privately. Excluded from the community comparison.');
    } catch(e) {setError(e instanceof Error?e.message:'Upload failed');} finally {setBusy(false);}
  }
  async function manage(id:string, action:'publish'|'hide'|'delete') {
    setBusy(true);setError('');setMessage('');
    try {
      await api(`/api/v1/submissions/${id}`,action==='delete'?{method:'DELETE'}:{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({publish:action==='publish',version:CONSENT_VERSION})});
      setMine((await api<{results:Submission[]}>('/api/v1/submissions')).results);setDeleteId(null);
      setMessage(action==='delete'?'Deleted from the active database and community comparison.':action==='hide'?'Removed from community comparison. The private record is retained.':'Included in the community comparison.');
    } catch(e) {setError(e instanceof Error?e.message:'Update failed');} finally {setBusy(false);}
  }

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Flame size={21}/></div><div><b>TokFire</b><span>TOKFIRE BENCH</span></div></div>
      <nav aria-label="Primary navigation">{([['benchmark','Benchmark',Gauge],['rankings','Comparisons',Trophy],['privacy','My data',ShieldCheck]] as const).map(([id,label,Icon])=><button key={id} aria-label={label} aria-current={tab===id?'page':undefined} className={tab===id?'active':''} onClick={()=>{if(id===tab)return;setTab(id);setLoading(id!=='benchmark');setError('');setMessage('');}}><Icon/>{label}</button>)}</nav>
      <div className="device-mini"><LockKeyhole size={14}/> LOCAL FIRST<div>Developer alpha</div><small>Measured on your Mac</small></div>
      <div className="side-foot"><span>TokFire Labs</span><b>tokfires.com</b></div>
    </aside>
    <section className="content">
      <header className="topbar"><div className="eyebrow">MACOS · APPLE SILICON</div><span className="alpha-badge">MACOS PREVIEW / 0.5.1</span></header>
      {error&&<div role="alert" className="notice error">{error}</div>}
      {message&&<div role="status" className="notice">{message}</div>}
      {tab==='benchmark'&&<>
        <div className="intro"><div><div className="kicker">TOKFIRE BENCH / BY TOKFIRE LABS</div><h1>Know your model.<br/><em>Know your Mac.</em></h1><p>Benchmark GGUF or MLX models, choose 1–3 concurrent jobs calling one model, and save results automatically to your connected account.</p></div><div className="score-ring"><Cpu size={30}/><b>{'1–3'}</b><small>FREE CONCURRENT JOBS</small></div></div>
        <div className="notice subtle">Tests run in the Mac app. The website stores results and attributed oMLX reference data. TokFire Bench has been tested on an M2 Max; the developer DMG is ad-hoc signed and not notarized.</div>
        <div className="workspace-grid">
          <section className="panel setup-panel"><div className="panel-head"><div><span>01 / ON YOUR MAC</span><h2>Run a reproducible test</h2></div><Cpu/></div>
            <ol className="steps"><li><b>Install the Mac app</b><p>Download the DMG, drag the app to Applications, and install Python plus llama.cpp or oMLX. Model weights are downloaded separately.</p></li><li><b>Choose GGUF or MLX</b><p>Choose one model and select 1, 2 or 3 simultaneous jobs before Run. Both llama.cpp and oMLX show live progress and per-job results. TokFire Bench Pro unlocks up to 20 jobs on the same model. HK$180 once, one activated Mac. Paid release coming after store approval.</p></li><li><b>Connect once, then run</b><p>Automatic upload is enabled before Run; public sharing is separate and off by default. Offline or failed uploads remain queued. JSON and readable commentary are always saved locally.</p></li></ol>
            <a className="download-link" href="/TokFireBench-0.5.1-macos-arm64.dmg" download><Download size={17}/>Download macOS DMG · 0.5.1<ArrowRight size={16}/></a><a className="download-link" href="/tokfire-bench-source.zip" download><Download size={17}/>Download macOS source<ArrowRight size={16}/></a>
            <div className="fine-print"><b>Start small: MiniCPM5-2B trial</b><p>The download includes a trial launcher. In the extracted native folder, run <code>python3 trial-minicpm.py</code>. It downloads the official Q4_K_M model (~1.56 GB), verifies its checksum, and measures one short run on your Mac. Requires Python and llama-server; no Xcode build is needed for the command-line trial. The CLI trial stays local; trials run in the app follow its upload setting. The full benchmark also supports one model, or up to three in sequence.</p></div>
            <a className="text-link" href="/methodology">Read the methodology & limitations</a><a className="text-link" href="/references">oMLX reference library →</a><a className="text-link" href="/native-connect">Connect the Mac app →</a>
          </section>
          <aside className="panel run-panel"><span className="panel-index">02 / REVIEW</span><h2>Bring your results.</h2><p>Optional manual review for standard GGUF reports. oMLX and quick trials upload through the connected Mac app and appear in My data.</p>
            <label className="file-picker"><FileUp size={22}/><b>Choose a benchmark report</b><small>JSON · up to 200 KB</small><input type="file" accept="application/json,.json" disabled={busy} onChange={e=>{void importFile(e.target.files?.[0]);e.target.value='';}}/></label>
            <div className="run-note"><LockKeyhole size={15}/><span>Choosing a file does not send it to the server.</span></div>
          </aside>
        </div>
        {report&&<section className="results imported">
          <div className="hardware-strip"><div><Cpu/><span>CHIP<b>{report.hardware.chip}</b></span></div><div><Activity/><span>CPU<b>{report.hardware.cpuCores} cores</b></span></div><div><Database/><span>MEMORY<b>{gb(report.hardware.memoryBytes)}</b></span></div><div><Check/><span>MEASURED<b>{new Date(report.measuredAt).toLocaleDateString()}</b></span></div></div>
          <div className="results-head"><div><span className="success-label">LOCAL REPORT / {report.models.length} MODELS</span><h2>Measured performance.</h2><p>Each row shows the median of three runs. Hashes identify the exact model files; these are user-submitted measurements, not independently verified scores.</p></div></div>
          <div className="table-scroll"><table><caption className="sr-only">Local benchmark results</caption><thead><tr><th>Model hash</th><th>Input tokens</th><th>Decode</th><th>TTFT</th><th>Prefill</th><th>Process RSS</th><th>Response rating</th></tr></thead><tbody>{rows.map(r=><tr key={`${r.modelHash}:${r.inputTokens}`}><td><code title={r.modelHash}>{r.modelHash.slice(0,12)}</code></td><td>{r.inputTokens}</td><td>{fmt(r.decodeTps)} tok/s</td><td>{fmt(r.ttftMs)} ms</td><td>{fmt(r.prefillTps)} tok/s</td><td>{r.peakRssBytes?gb(r.peakRssBytes):'Unavailable'}</td><td>{responsiveness(r.decodeTps,r.ttftMs)}</td></tr>)}</tbody></table></div>
          {best&&<div className="recommendation"><Gauge/><div><span>FASTEST OF YOUR SELECTED MODELS · 512 INPUT TOKENS</span><h3>{best.modelHash.slice(0,12)} · {fmt(best.decodeTps)} tok/s</h3><p>This is a speed recommendation. It does not measure answer quality, coding ability, or long-duration thermal performance.</p></div></div>}
          <div className="consent-panel"><span className="panel-index">03 / YOUR CHOICE</span><h2>Save privately or contribute.</h2><p>Uploads contain the hardware fields above, OS version, runtime/model hashes, run ID, timestamps and timing samples. The server links your submission to your signed-in account for ownership and deletion. Your identity is not displayed in comparisons. This is pseudonymous, not fully anonymous.</p>
            <label className="checkbox-line"><input type="checkbox" checked={collect} disabled={busy||submitted} onChange={e=>{setCollect(e.target.checked);if(!e.target.checked)setPublish(false);}}/><span>I allow collection and storage of this report under policy {CONSENT_VERSION}.</span></label>
            <label className="checkbox-line"><input type="checkbox" checked={publish} disabled={!collect||busy||submitted} onChange={e=>setPublish(e.target.checked)}/><span>I also allow these measurements and hardware details to appear in community comparisons when site access permits.</span></label>
            <div className="actions"><Button className="primary-action" disabled={!collect||busy||submitted} onClick={upload}>{busy?'Saving…':submitted?'Saved':publish?'Save & contribute':'Save privately'}</Button><Button className="secondary-button" disabled={busy} onClick={()=>{setReport(null);setCollect(false);setPublish(false);setMessage('Local report closed. Existing server records, if any, are managed in My data.');}}>Close local report</Button></div>
            <details><summary>Inspect the exact report</summary><pre>{JSON.stringify(report,null,2)}</pre></details>
          </div>
        </section>}
      </>}
      {tab==='rankings'&&<section className="page-section"><div className="kicker">COMMUNITY / OPT-IN RESULTS</div><div className="section-title"><div><h1>Compare like with like.</h1><p>Compare the same model file, runtime build and workload. These submissions have passed format validation; they have not been independently verified.</p></div></div>
        {loading?<p role="status">Loading measurements…</p>:!rankings.length?<div className="empty-state"><Database/><h2>No contributed measurements yet.</h2><p>Run the native benchmark, then explicitly allow publication when submitting. Private reports never appear here.</p></div>:<>
          <label className="cohort-picker">Choose a comparison group<select value={selectedCohort} onChange={e=>setCohort(e.target.value)}>{cohorts.map(r=><option key={r.cohort} value={r.cohort}>{r.modelHash.slice(0,10)} · {r.inputTokens} input · runtime {r.runtimeHash.slice(0,8)} · group {r.cohort.slice(0,6)}</option>)}</select></label>
          <div className="table-scroll"><table><thead><tr><th>Hardware</th><th>Memory</th><th>macOS</th><th>Decode</th><th>TTFT</th><th>Prefill</th><th>Runs / people</th></tr></thead><tbody>{visible.map((r,i)=><tr key={i}><td><b>{r.chip}</b><small>{r.machine} · {r.cpuCores} CPU cores</small></td><td>{gb(r.memoryBytes)}</td><td>{r.osVersion}</td><td>{fmt(r.decodeTps)} tok/s</td><td>{fmt(r.ttftMs)} ms</td><td>{fmt(r.prefillTps)} tok/s</td><td>{r.runs} / {r.contributors}</td></tr>)}</tbody></table></div>
          <p className="fine-print">Mean of per-report medians, grouped by exact hardware, OS and comparison group. The first 500 groups are shown. Repeated reports can bias averages; contributor counts are shown. This alpha has no anti-cheat attestation or official overall score.</p>
        </>}
        <div className="method-note"><ShieldCheck/><div><b>Measured evidence before a global score</b><p>There is no verified reference fleet yet. We will calibrate hardware predictions and a fixed standard suite before publishing an overall AI score.</p></div></div>
      </section>}
      {tab==='privacy'&&<section className="page-section privacy-page"><div className="kicker">YOUR DATA / YOUR CHOICE</div><h1>Private by default.</h1><p className="lead">Collection and publication are separate choices. You can hide a contribution or delete the stored report.</p>
        <div className="privacy-grid"><div className="privacy-card allow"><Database/><span>WHEN UPLOAD IS ENABLED</span><h3>Measurements + hardware</h3><ul><li>Chip, machine identifier, CPU cores and memory</li><li>macOS, exact runtime/model hashes</li><li>Timing samples, token counts, concurrency and process RSS</li><li>Measurement timestamp and random run ID</li><li>Account ownership and consent timestamps</li></ul></div><div className="privacy-card never"><LockKeyhole/><span>EXCLUDED FROM THE REPORT</span><h3>Your personal content</h3><ul><li>Prompts and generated responses</li><li>Files and local paths (oMLX model names are included)</li><li>Serial number and Apple ID</li><li>Account identity in public comparisons</li><li>IP address in the benchmark dataset</li></ul></div></div>
        <p className="fine-print">The hosting provider processes network requests and authentication separately. We do not claim that infrastructure has no access logs. Rare hardware combinations may be recognizable. Deletion removes active records; it cannot retract copies already downloaded by visitors or promise immediate erasure of provider backups.</p>
        <h2 className="my-title">My submissions</h2>{loading?<p>Loading your reports…</p>:mine.length===0?<div className="empty-state">No saved reports for this account.</div>:mine.map(s=>{
          const data=JSON.parse(s.reportJson) as BenchmarkReport;
          return <article className="saved-row" key={s.id}><div><b>{data.hardware.chip} · {data.models.length} models</b><small>{new Date(s.collectedAt).toLocaleString()} · {s.isPublic?'Contributed':'Private'} · {s.runId.slice(0,8)}</small></div><div className="actions"><Button className="secondary-button" disabled={busy} onClick={()=>manage(s.id,s.isPublic?'hide':'publish')}>{s.isPublic?'Withdraw publication':'Allow publication'}</Button><Button className="secondary-button" disabled={busy} onClick={()=>setDeleteId(s.id)}><Trash2 size={15}/>Delete</Button></div><details><summary>View stored report · {data.specVersion}</summary><pre style={{maxHeight:360,overflow:"auto",fontSize:12}}>{JSON.stringify(data,null,2)}</pre></details>{deleteId===s.id&&<div className="delete-confirm" role="alert"><p>Delete this stored report and all its comparison measurements? Your local Mac copy is unaffected.</p><Button className="danger-action" disabled={busy} onClick={()=>manage(s.id,'delete')}>Delete permanently</Button><Button className="secondary-button" disabled={busy} onClick={()=>setDeleteId(null)}>Cancel</Button></div>}</article>;
        })}
        <a className="text-link" href="/signin-with-chatgpt?return_to=/" target="_top">Sign in to manage your submissions</a>
      </section>}
      <footer className="brand-footer"><b>TokFire Bench</b><span>Built by TokFire Labs · tokfires.com</span><span>Local models. Measured performance.</span></footer>
    </section>
  </main>;
}
