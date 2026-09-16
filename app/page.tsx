'use client';
/* eslint-disable @next/next/no-html-link-for-pages -- Full-page links also serve the script-free static mirror and auth redirects. */
import {localizeTree} from '@/lib/i18n';
import {useLocale} from '@/components/language-switcher';

import { useEffect, useState } from 'react';
import { Activity, Flame, ArrowRight, Check, Cpu, Database, Download, FileUp, Gauge, LockKeyhole, ShieldCheck, Trash2, Trophy } from 'lucide-react';
import {ComparisonData} from '@/components/comparison-data';
import {AccountMenu} from '@/components/account-menu';
import { Button } from '@/components/ui/button';
import { BenchmarkReport, CONSENT_VERSION, MAX_REPORT_BYTES, reportSchema, summarize, responsiveness } from '@/lib/benchmark';

import {workloadSchema,workloadSummary,type WorkloadReport} from '@/lib/workloads';

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

export default function Home() {const locale=useLocale();
  const [tab,setTab]=useState<Tab>('benchmark');
  const [report,setReport]=useState<BenchmarkReport|null>(null);
  const [workloadReport,setWorkloadReport]=useState<WorkloadReport|null>(null);
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

  useEffect(()=>{const frame=requestAnimationFrame(()=>{const requested=new URLSearchParams(location.search).get('tab');if(requested==='rankings'||requested==='privacy'){setLoading(true);setTab(requested);}});return ()=>cancelAnimationFrame(frame);},[]);

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
      if(file.size>1_500_000)throw new Error('Report is too large. Maximum size is 1.5 MB.');
      const raw=JSON.parse(await file.text());
      if(raw?.specVersion==='tokfire-workloads-v1'){
        const parsed=workloadSchema.safeParse(raw);if(!parsed.success)throw new Error('Invalid workload report: incomplete rounds, inconsistent metrics or unsupported fields.');
        setWorkloadReport(parsed.data);setReport(null);setCollect(false);setPublish(false);setSubmitted(false);setMessage('Report opened locally in this browser. Nothing has been uploaded.');return;
      }
      if(file.size>MAX_REPORT_BYTES)throw new Error('Legacy reports are limited to 200 KB.');
      if(raw?.specVersion==='local-ai-trial-v1')throw new Error('This is a short local trial. Run the full benchmark for your selected model(s) to submit comparable measurements.');
      const parsed=reportSchema.safeParse(raw);
      if(!parsed.success)throw new Error('This file is not a complete v1 benchmark report. Use the current native runner. Extra fields and incomplete runs are rejected.');
      setReport(parsed.data);setWorkloadReport(null);setCollect(false);setPublish(false);setSubmitted(false);
      setMessage('Report opened locally in this browser. Nothing has been uploaded.');
    } catch(e) {setError(e instanceof Error?e.message:'Could not read report');}
  }
  async function upload() {
    if((!report&&!workloadReport)||!collect||busy)return;
    setBusy(true);setError('');setMessage('');
    try {
      const result=await api<{published:boolean}>(workloadReport?'/api/v2/submissions':'/api/v1/submissions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({report:workloadReport??report,consent:{collect:true,publish,version:CONSENT_VERSION}})});
      setSubmitted(true);setMessage(workloadReport?'Workload report saved. Published reports appear in the separate workload comparison section.':result.published?'Saved and included in the community comparison.':'Saved privately. Excluded from the community comparison.');
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

  return localizeTree(<main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Flame size={21}/></div><div><b>TokFire</b><span>TOKFIRE BENCH</span></div></div>
      <nav aria-label="Primary navigation">{([['benchmark','Benchmark',Gauge],['rankings','Comparisons',Trophy],['privacy','My data',ShieldCheck]] as const).map(([id,label,Icon])=><button key={id} aria-label={label} aria-current={tab===id?'page':undefined} className={tab===id?'active':''} onClick={()=>{if(id===tab)return;setTab(id);history.replaceState(null,'',location.pathname+(id==='benchmark'?'':'?tab='+id));setLoading(id!=='benchmark');setError('');setMessage('');}}><Icon/>{label}</button>)}</nav>
      <div className="device-mini"><LockKeyhole size={14}/> LOCAL FIRST<div>Developer alpha</div><small>Measured on your device</small></div>
      <div className="side-foot"><span>TokFire Labs</span><b>tokfires.com</b></div>
    </aside>
    <section className="content">
      <header className="topbar"><div className="eyebrow">MACOS · WINDOWS · LINUX · ANDROID</div><span className="alpha-badge">0.7 PREVIEW</span><AccountMenu/></header>
      {error&&<div role="alert" className="notice error">{error}</div>}
      {message&&<div role="status" className="notice">{message}</div>}
      {tab==='benchmark'&&<>
        <div className="intro"><div><div className="kicker">TOKFIRE BENCH / BY TOKFIRE LABS</div><h1>Know your model.<br/><em>Know your machine.</em></h1><p>Benchmark GGUF or MLX models, choose 1–3 concurrent jobs calling one model, and save results automatically to your TokFire account.</p></div><div className="score-ring"><Cpu size={30}/><b>{'1–3'}</b><small>FREE CONCURRENT JOBS</small></div></div>
        <div className="notice subtle">Tests run in the desktop app. The website stores results and attributed oMLX reference data. TokFire Bench has been tested on an M2 Max; the developer DMG is ad-hoc signed and not notarized. Windows x64 is an unsigned preview; native Windows and GPU validation are still pending.</div>
        <div className="workspace-grid">
          <section className="panel setup-panel"><div className="panel-head"><div><span>01 / ON YOUR DEVICE</span><h2>Run a reproducible test</h2></div><Cpu/></div>
            <ol className="steps"><li><b>Install the desktop app</b><p>Mac: download the DMG and drag to Applications. Windows: extract the ZIP and open TokFire Bench.exe. Install Python and llama.cpp separately; MLX/oMLX is Mac-only. Windows account sign-in also requires WebView2.</p></li><li><b>Choose GGUF or MLX</b><p>Choose one model and select 1, 2 or 3 simultaneous jobs before Run. Both llama.cpp and oMLX show live progress and per-job results. TokFire Bench Pro unlocks up to 20 jobs on the same model. HK$180 once, one activated device. Paid release coming after store approval.</p></li><li><b>Connect once, then run</b><p>Automatic upload is enabled before Run; public sharing is separate and off by default. Offline or failed uploads remain queued. JSON and readable commentary are always saved locally.</p></li></ol>
            <a className="download-link" href="/TokFireBench-0.7.0-macos-arm64.dmg" download><Download size={17}/>Download macOS DMG · 0.7.0<ArrowRight size={16}/></a><a className="download-link" href="/tokfire-bench-source.zip" download><Download size={17}/>Download macOS source<ArrowRight size={16}/></a>
            <a className="download-link" href="/TokFireBench-0.7.0-windows-x64.zip" download><Download size={17}/>Windows x64 ZIP · 0.7.0 Preview<ArrowRight size={16}/></a><p className="fine-print">Windows 10/11 Intel or AMD 64-bit. Extract the entire ZIP. Core controls offer 20 languages; Windows-specific guidance and reports are currently in English. This preview has been cross-compiled and unit-tested on macOS; Windows runtime testing is pending.</p>
            <a className="download-link" href="/TokFireBench-0.7.0-android-preview.apk" download><Download size={17}/>Android APK · 0.7.0 Preview<ArrowRight size={16}/></a>
            <a className="download-link" href="/TokFireBench-0.7.0-cli.tar.gz" download><Download size={17}/>Linux / cross-platform CLI · 0.7.0<ArrowRight size={16}/></a>
            <p className="fine-print">Android is a native benchmark client for an existing on-device runtime or a selected LAN server. Model weights and an inference engine are not bundled. Remote results are labelled separately. Development signing; physical-phone validation is pending.</p>
            <p className="fine-print">New in 0.7: fixed chat, business, long-document and local agent-tool workloads; 3–5 repeats, concurrency sweeps, failure rates and P95/P99. The agent fixture is not a Hermes/OpenClaw integration.</p>
            <div className="fine-print"><b>Start small: MiniCPM5-2B trial</b><p>The download includes a trial launcher. In the extracted native folder, run <code>python3 trial-minicpm.py</code>. It downloads the official Q4_K_M model (~1.56 GB), verifies its checksum, and measures one short run on your Mac. Requires Python and llama-server; no Xcode build is needed for the command-line trial. The CLI trial stays local; trials run in the app follow its upload setting. The full benchmark also supports one model, or up to three in sequence.</p></div>
            <a className="text-link" href="/methodology">Read the methodology & limitations</a><a className="text-link" href="/references">oMLX reference library →</a><a className="text-link" href="/native-connect">Connect the desktop app →</a>
          </section>
          <aside className="panel run-panel"><span className="panel-index">02 / REVIEW</span><h2>Bring your results.</h2><p>Review standard GGUF or 0.7 workload reports locally, then choose whether to upload. Workload results remain separate from legacy synthetic rankings.</p>
            <label className="file-picker"><FileUp size={22}/><b>Choose a benchmark report</b><small>JSON · up to 1.5 MB (workload reports)</small><input type="file" accept="application/json,.json" disabled={busy} onChange={e=>{void importFile(e.target.files?.[0]);e.target.value='';}}/></label>
            <div className="run-note"><LockKeyhole size={15}/><span>Choosing a file does not send it to the server.</span></div>
          </aside>
        </div>
        {workloadReport&&<section className="panel imported">
          <h2>Workload benchmark · 0.7</h2><p data-no-translate>{workloadReport.hardware.platform} · {workloadReport.hardware.chip} · {workloadReport.settings.workload}</p>
          {workloadReport.settings.inferenceLocation==='remote-server'&&<p className="notice">Remote server test: this hardware is the request client, not the inference host.</p>}
          <div className="table-scroll"><table><thead><tr><th>Concurrent jobs</th><th>Complete / attempts</th><th>P95 task latency</th><th>P99 task latency</th><th>First output</th></tr></thead><tbody>{workloadSummary(workloadReport).map(row=><tr key={row.jobs}><td>{row.jobs}</td><td>{row.complete} / {row.attempts}</td><td>{fmt(row.p95Ms??0)} ms</td><td>{fmt(row.p99Ms??0)} ms</td><td>{row.ttftMs===null?'Unavailable':fmt(row.ttftMs)+' ms'}</td></tr>)}</tbody></table></div>
          <p>Small-sample P95/P99 are descriptive, not an SLA. Chat completion does not grade answer quality. Agent success checks a local tool fixture, not Hermes or OpenClaw.</p>
          <p>Missing runtime decode and prefill metrics remain unavailable. This report is stored separately from legacy synthetic comparisons.</p>
          <label className="checkbox-line"><input type="checkbox" checked={collect} disabled={busy||submitted} onChange={e=>{setCollect(e.target.checked);if(!e.target.checked)setPublish(false);}}/><span>I allow collection and storage of this report under policy {CONSENT_VERSION}.</span></label>
          <label className="checkbox-line"><input type="checkbox" checked={publish} disabled={!collect||busy||submitted} onChange={e=>setPublish(e.target.checked)}/><span>I also allow these measurements and hardware details to appear in community comparisons when site access permits.</span></label>
          <Button className="primary-action" disabled={!collect||busy||submitted} onClick={upload}>{busy?'Saving…':submitted?'Saved':'Save report'}</Button>
          <Button className="secondary-button" disabled={busy} onClick={()=>setWorkloadReport(null)}>Close local report</Button>
          <details><summary>Inspect the exact report</summary><pre>{JSON.stringify(workloadReport,null,2)}</pre></details>
        </section>}
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
        <ComparisonData/>
        <h2>Legacy exact-token comparisons</h2>
        {loading?<p role="status">Loading measurements…</p>:!rankings.length?<p>No public legacy benchmark reports yet. Workload reports and external references appear above.</p>:<>
          <label className="cohort-picker">Choose a comparison group<select value={selectedCohort} onChange={e=>setCohort(e.target.value)}>{cohorts.map(r=><option key={r.cohort} value={r.cohort}>{r.modelHash.slice(0,10)} · {r.inputTokens} input · runtime {r.runtimeHash.slice(0,8)} · group {r.cohort.slice(0,6)}</option>)}</select></label>
          <div className="table-scroll"><table><thead><tr><th>Hardware</th><th>Memory</th><th>macOS</th><th>Decode</th><th>TTFT</th><th>Prefill</th><th>Runs / people</th></tr></thead><tbody>{visible.map((r,i)=><tr key={i}><td><b>{r.chip}</b><small>{r.machine} · {r.cpuCores} CPU cores</small></td><td>{gb(r.memoryBytes)}</td><td>{r.osVersion}</td><td>{fmt(r.decodeTps)} tok/s</td><td>{fmt(r.ttftMs)} ms</td><td>{fmt(r.prefillTps)} tok/s</td><td>{r.runs} / {r.contributors}</td></tr>)}</tbody></table></div>
          <p className="fine-print">Mean of per-report medians, grouped by exact hardware, OS and comparison group. The first 500 groups are shown. Repeated reports can bias averages; contributor counts are shown. This alpha has no anti-cheat attestation or official overall score.</p>
        </>}
        <div className="method-note"><ShieldCheck/><div><b>Measured evidence before a global score</b><p>There is no verified reference fleet yet. We will calibrate hardware predictions and a fixed standard suite before publishing an overall AI score.</p></div></div>
      </section>}
      {tab==='privacy'&&<section className="page-section privacy-page"><div className="kicker">YOUR DATA / YOUR CHOICE</div><h1>Private by default.</h1><p className="lead">Collection and publication are separate choices. You can hide a contribution or delete the stored report.</p>
        <div className="privacy-grid"><div className="privacy-card allow"><Database/><span>WHEN UPLOAD IS ENABLED</span><h3>Measurements + hardware</h3><ul><li>Chip, machine identifier, CPU cores and memory</li><li>Operating system, GPU names on Windows, runtime/model hashes</li><li>Timing samples, token counts, concurrency and process RSS</li><li>Measurement timestamp and random run ID</li><li>Account ownership and consent timestamps</li></ul></div><div className="privacy-card never"><LockKeyhole/><span>EXCLUDED FROM THE REPORT</span><h3>Your personal content</h3><ul><li>Prompts and generated responses</li><li>Files and local paths (oMLX model names are included)</li><li>Serial number and Apple ID</li><li>Account identity in public comparisons</li><li>IP address in the benchmark dataset</li></ul></div></div>
        <p className="fine-print">The hosting provider processes network requests and authentication separately. We do not claim that infrastructure has no access logs. Rare hardware combinations may be recognizable. Deletion removes active records; it cannot retract copies already downloaded by visitors or promise immediate erasure of provider backups.</p>
        <h2 className="my-title">My submissions</h2>{loading?<p>Loading your reports…</p>:mine.length===0?<div className="empty-state">No saved reports for this account.</div>:mine.map(s=>{
          const data=JSON.parse(s.reportJson) as BenchmarkReport;
          return <article className="saved-row" key={s.id}><div><b>{data.hardware.chip} · {data.models.length} models</b><small>{new Date(s.collectedAt).toLocaleString()} · {s.isPublic?'Contributed':'Private'} · {s.runId.slice(0,8)}</small></div><div className="actions"><Button className="secondary-button" disabled={busy} onClick={()=>manage(s.id,s.isPublic?'hide':'publish')}>{s.isPublic?'Withdraw publication':'Allow publication'}</Button><Button className="secondary-button" disabled={busy} onClick={()=>setDeleteId(s.id)}><Trash2 size={15}/>Delete</Button></div><details><summary>View stored report · {data.specVersion}</summary><pre style={{maxHeight:360,overflow:"auto",fontSize:12}}>{JSON.stringify(data,null,2)}</pre></details>{deleteId===s.id&&<div className="delete-confirm" role="alert"><p>Delete this stored report and all its comparison measurements? Your local Mac copy is unaffected.</p><Button className="danger-action" disabled={busy} onClick={()=>manage(s.id,'delete')}>Delete permanently</Button><Button className="secondary-button" disabled={busy} onClick={()=>setDeleteId(null)}>Cancel</Button></div>}</article>;
        })}
        <a className="text-link" href="/signin-with-chatgpt?return_to=/" target="_top">Sign in to manage your submissions</a>
      </section>}
      <footer className="brand-footer"><b>TokFire Bench</b><span>Built by TokFire Labs · tokfires.com</span><span>Local models. Measured performance.</span></footer>
    </section>
  </main>,locale);
}
