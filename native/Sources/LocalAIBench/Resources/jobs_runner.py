#!/usr/bin/env python3
"""Synchronized concurrent jobs sharing one model and one isolated server.
A job is one request, not a person. All jobs share the selected model. No generated text is retained.
"""
import argparse, concurrent.futures, json, os, signal, socket, subprocess, sys, tempfile, threading, time, uuid
from pathlib import Path
from contextlib import contextmanager
from runner import hardware, sha256, emit, request, runtime_env, complete, PROMPT, atomic_json
from omlx_runner import model_manifest, measure
from pro_license import authorize
from platform_support import windows_hardware

SPEC = 'local-ai-jobs-v1'
PROCESSES = []

def stop_all():
    # Signal all servers before waiting: cancellation must unblock every streaming worker.
    for process in PROCESSES:
        if process.poll() is None:
            try:
                if os.name == 'nt': process.terminate()
                else: os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError: pass
    for process in PROCESSES:
        try: process.wait(timeout=8)
        except subprocess.TimeoutExpired:
            if os.name == 'nt': process.kill()
            else: os.killpg(process.pid, signal.SIGKILL)
            process.wait()
    PROCESSES.clear()

@contextmanager
def workspace():
    # Windows cannot delete the open server log until all child processes exit.
    with tempfile.TemporaryDirectory(prefix='localai-jobs-') as tmp:
        try: yield tmp
        finally: stop_all()

def preflight(paths, engine, memory, count):
    unique = list(dict.fromkeys(Path(p).resolve() for p in paths))
    weights = 0
    for p in unique:
        if engine == 'oMLX':
            files = list(p.glob('*.safetensors'))
            if not p.is_dir() or not (p/'config.json').is_file() or not files:
                raise ValueError('Every job needs an MLX model folder with config.json and safetensors.')
            weights += sum(f.stat().st_size for f in files)
        else:
            if not p.is_file() or p.suffix.lower() != '.gguf': raise ValueError('Every job needs a GGUF model file.')
            with p.open('rb') as f:
                if f.read(4) != b'GGUF': raise ValueError('Invalid GGUF file.')
            weights += p.stat().st_size
    estimated = weights * 1.25 + (2*len(unique) + count*.5)*1024**3
    if estimated > memory*.8:
        raise ValueError('Combined models and jobs exceed the estimated 80% RAM budget. Reduce jobs or choose smaller models.')
    return unique, estimated

def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0)); return sock.getsockname()[1]

def launch(engine, binary, model, slots, cores, root, context=4096, gpu_layers=999, advanced=None):
    port = free_port(); base = f'http://127.0.0.1:{port}'
    if engine == 'oMLX':
        directory=root/'models'; directory.mkdir(); (directory/'benchmark-model').symlink_to(model,target_is_directory=True)
        args=[binary,'serve','--model-dir',str(directory),'--base-path',str(root/'data'),'--host','127.0.0.1','--port',str(port),'--no-cache','--no-hf-cache','--max-concurrent-requests',str(slots),'--memory-guard','safe','--log-level','warning']
        health='/v1/models'
    else:
        args=[binary,'-m',str(model),'--host','127.0.0.1','--port',str(port),'-c',str(context*slots),'-ngl',str(gpu_layers),'-np',str(slots),'-b','512','-ub','512','-t',str(cores),'-tb',str(cores),'-fa','off','-ctk','f16','-ctv','f16','--no-webui','--no-warmup']
        if advanced:
            from advanced_config import runtime_args
            args = runtime_args(args, advanced, binary)
        health='/health'
    env={k:v for k,v in runtime_env().items() if not k.startswith(('OMLX_','MLX_'))}
    with (root/'server.log').open('w') as log:
        proc=subprocess.Popen(args,stdout=log,stderr=log,env=env,start_new_session=os.name!='nt',creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    PROCESSES.append(proc)
    deadline=time.monotonic()+300
    while time.monotonic()<deadline:
        if proc.poll() is not None: raise ValueError('Model runtime exited during loading. Check runtime compatibility and available RAM.')
        try:
            with request(base,health,timeout=2) as response: status=json.load(response)
            if (engine=='oMLX' and any(m.get('id')=='benchmark-model' for m in status.get('data',[]))) or (engine=='llama.cpp' and status.get('status')=='ok'): return base
        except (OSError,ValueError,KeyError): pass
        time.sleep(.2)
    raise TimeoutError('Model loading timed out.')

def prepare(base, engine):
    if engine=='oMLX': return None
    # Distinct leading token sequence also avoids an accidental shared prefix between jobs.
    with request(base,'/tokenize',{'content':str(uuid.uuid4())+'\n'+PROMPT,'add_special':True}) as res: tokens=json.load(res)['tokens']
    if len(tokens)<512 or any(type(t) is not int or t<0 for t in tokens): raise ValueError('Incompatible tokenizer.')
    return tokens[:512]

def measure_job(base,engine,tokens,count,repeat,job,barrier=None):
    if barrier: barrier.wait(timeout=30)
    if engine=='oMLX':
        row=measure(base,'benchmark-model',count,repeat,job)
        row.pop('user')
    else:
        raw=complete(base,tokens,128)
        row={k:raw[k] for k in ('inputTokens','outputTokens','ttftMs','prefillTps','decodeTps','elapsedMs')}
        row.update(endToEndTps=128/(raw['elapsedMs']/1000),cachedTokens=0,concurrency=count,repeat=repeat,finishReason='length')
    row['jobId']=job
    return row

def round_jobs(jobs,count,repeat):
    barrier=threading.Barrier(count); start=time.perf_counter(); rows=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=count) as pool:
        futures={pool.submit(measure_job,*job,count,repeat,i+1,barrier):i for i,job in enumerate(jobs)}
        try:
            for future in concurrent.futures.as_completed(futures):
                row=future.result(); rows.append((futures[future],row)); emit('sample',sample=row)
        except BaseException:
            barrier.abort(); stop_all()
            for future in futures: future.cancel()
            raise
    duration=time.perf_counter()-start
    return rows,{'concurrency':count,'repeat':repeat,'wallMs':duration*1000,'aggregateTps':sum(r['outputTokens'] for _,r in rows)/duration}

def run(options):
    count=options.jobs
    key = sys.stdin.readline(4096).strip() if count > 3 else None
    try: authorize(count,key)
    except ValueError:
        emit("license", valid=False)
        raise
    emit('progress',phase='inspect',message=f'Preparing {count} concurrent jobs')
    if os.name=='nt' and options.engine!='llama.cpp': raise ValueError('Windows supports llama.cpp / GGUF; oMLX requires Apple Silicon.')
    hw=windows_hardware() if os.name=='nt' else hardware(); paths=[Path(options.model).resolve()] * count
    emit('hardware',hardware=hw)
    unique,estimated=preflight(paths,options.engine,hw['memoryBytes'],count)
    results=[]; jobs=[]; groups=[]
    try:
        with workspace() as tmp:
            bases={}; hashes={}
            for i,path in enumerate(unique):
                emit('progress',phase='hash',message=f'Hashing model {i+1}/{len(unique)}',modelIndex=i+1)
                fingerprint=model_manifest(path) if options.engine=='oMLX' else sha256(path)
                if fingerprint in hashes: raise ValueError('Identical model content selected through different folders. Reuse the same model for those jobs.')
                hashes[fingerprint]=path
                emit('progress',phase='load',message=f'Loading model {i+1}/{len(unique)}')
                root=Path(tmp)/str(i); root.mkdir(); start=time.perf_counter()
                base=launch(options.engine,options.server,path,paths.count(path),hw['cpuCores'],root)
                emit('progress',phase='warmup',message=f'Warming model {i+1}/{len(unique)}')
                measure_job(base,options.engine,prepare(base,options.engine),1,0,0)
                bases[path]=base
                results.append({'modelSha256':fingerprint,'modelName':path.name,'loadMs':(time.perf_counter()-start)*1000,'samples':[]})
            # Every model is loaded before the barrier releases any measured requests.
            for path in paths: jobs.append((bases[path],options.engine,None))
            for repeat in (1,2,3):
                jobs=[(base,engine,prepare(base,engine)) for base,engine,_ in jobs]
                emit('progress',phase='measure',message=f'{count} simultaneous jobs · repeat {repeat}/3')
                rows,group=round_jobs(jobs,count,repeat); groups.append(group)
                for index,row in rows: results[unique.index(paths[index])]['samples'].append(row)
            report={'specVersion':'local-ai-windows-jobs-v1' if os.name=='nt' else SPEC,'runnerVersion':'0.6.0' if os.name=='nt' else '0.5.0','runId':str(uuid.uuid4()),'measuredAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'hardware':hw,
                    'runtime':{'name':options.engine,'binarySha256':sha256(options.server)},
                    'settings':{'concurrentJobs':count,'repeats':3,'maxOutputTokens':128,'cache':'disabled; unique prefix','inputProfile':'family-guide-v1; variable' if options.engine=='oMLX' else 'exact-512-v1',
                                'serverLayout':'one shared model server','contextPerSlot':4096 if options.engine=='llama.cpp' else None,'threadsPerServer':hw['cpuCores'] if options.engine=='llama.cpp' else None,
                                'estimatedMemoryBytes':int(estimated),'targetTps':[100,200],'targetSource':'user-selected; not a ChatGPT plan speed guarantee'},
                    'jobs':[{'jobId':i+1,'modelSha256':results[unique.index(path)]['modelSha256']} for i,path in enumerate(paths)],'models':results,'groups':groups}
    finally:
        emit('progress',phase='cleanup',message='Closing benchmark model processes');stop_all()
    atomic_json(Path(options.output),report)
    emit('complete',message=f'Complete: {count} jobs × 3 repeats',output=options.output)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--engine',choices=['oMLX','llama.cpp'],required=True);parser.add_argument('--server',required=True);parser.add_argument('--model',required=True);parser.add_argument('--jobs',type=int,choices=range(1,21),required=True);parser.add_argument('--output',required=True)
    def cancel(*_):
        stop_all(); raise KeyboardInterrupt()
    signal.signal(signal.SIGTERM,cancel)
    try: run(parser.parse_args())
    except KeyboardInterrupt: sys.exit(130)
    except Exception as error: emit('error',message=str(error));sys.exit(1)
