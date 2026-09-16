#!/usr/bin/env python3
"""Cross-platform fixed chat and bounded agent workloads. Standard library only.
External servers are loopback-only: the detected hardware must be the inference host.
No prompts, completions, endpoint addresses, credentials or local paths enter reports.
"""
import argparse
import concurrent.futures
import http.client
import json
import math
import os
import platform
import signal
import subprocess
import sys
import threading
import time
import urllib.parse
import uuid
from pathlib import Path
from runner import atomic_json, emit, hardware, sha256
from jobs_runner import launch, workspace, stop_all, preflight
from omlx_runner import model_manifest
from platform_support import windows_hardware
from pro_license import authorize
from workload_core import VERSION, SPEC, PROFILES, fingerprint, levels, AgentTools, assessment

CANCEL = threading.Event()
CONNECTIONS = set()
LOCK = threading.Lock()

class MeasurementError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)

def clean(value, limit=160):
    return ''.join(c for c in str(value) if c.isprintable()).strip()[:limit] or 'Unknown'

def detect_hardware():
    system = platform.system()
    if system == 'Darwin':
        data = hardware()
        data.update(platform='macOS', architecture=platform.machine(), gpuNames=[data['chip']], gpuMemoryBytes=None)
    elif os.name == 'nt':
        data = windows_hardware()
        data['gpuMemoryBytes'] = None
    elif system == 'Linux':
        android = bool(os.environ.get('ANDROID_ROOT')) or Path('/system/bin/getprop').exists()
        cpu = Path('/proc/cpuinfo').read_text(errors='replace')
        chip = next((x.split(':',1)[1].strip() for x in cpu.splitlines() if x.startswith(('model name', 'Hardware'))), platform.machine())
        memory = next(int(x.split()[1])*1024 for x in Path('/proc/meminfo').read_text().splitlines() if x.startswith('MemTotal:'))
        machine = 'Android device' if android else 'Linux device'
        if android:
            try: machine = subprocess.check_output(['/system/bin/getprop', 'ro.product.model'], text=True, timeout=5).strip()
            except (OSError, subprocess.SubprocessError): pass
        data = {'platform': 'Android' if android else 'Linux', 'architecture': clean(platform.machine(),32), 'chip': clean(chip),
                'machine': clean(machine), 'cpuCores': os.cpu_count() or 1, 'memoryBytes': memory,
                'osVersion': clean(platform.release(),80), 'gpuNames': [], 'gpuMemoryBytes': None}
        # Query names and memory only; never UUIDs, serials, hostnames or usernames.
        try:
            rows = subprocess.check_output(['nvidia-smi', '--query-gpu=name,memory.total', '--format=csv,noheader,nounits'], text=True, stderr=subprocess.DEVNULL, timeout=5).splitlines()[:8]
            data['gpuNames'] = [clean(row.rsplit(',',1)[0]) for row in rows]
            data['gpuMemoryBytes'] = [int(row.rsplit(',',1)[1].strip())*1024**2 for row in rows]
        except (OSError, ValueError, subprocess.SubprocessError): pass
    else:
        raise ValueError('Supported hosts: Apple Silicon macOS, Windows, Linux and Android Python/Termux.')
    return data

def battery_snapshot():
    def read(name, divisor=1):
        try: return float((Path('/sys/class/power_supply/battery')/name).read_text())/divisor
        except (OSError, ValueError): return None
    return {'batteryPercent': read('capacity'), 'batteryTemperatureC': read('temp',10)}

def endpoint(value):
    p = urllib.parse.urlsplit(value)
    if p.scheme != 'http' or p.hostname not in ('localhost', '127.0.0.1', '::1') or p.username or p.password or p.path not in ('','/') or p.query or p.fragment:
        raise ValueError('Use a local HTTP origin, e.g. http://127.0.0.1:11434 (without /v1). Remote hardware must be benchmarked on that host.')
    if p.port is None: raise ValueError('Specify the local runtime port.')
    return p.hostname, p.port

def number(value, zero=False):
    return type(value) in (int,float) and math.isfinite(value) and (value >= 0 if zero else value > 0)

def rate(tokens, ms):
    return tokens/(ms/1000) if number(tokens) and number(ms) else None

def cancel():
    CANCEL.set()
    with LOCK:
        for c in list(CONNECTIONS):
            try:
                if c.sock:
                    import socket
                    c.sock.shutdown(socket.SHUT_RDWR)
                c.close()
            except OSError: pass
    stop_all()

def stream(base, engine, model, messages, max_tokens, context, timeout=180):
    if CANCEL.is_set(): raise MeasurementError('cancelled')
    host, port = endpoint(base)
    ollama = engine == 'Ollama'
    payload = {'model': model, 'messages': messages, 'stream': True}
    if ollama:
        payload.update(options={'temperature':0, 'seed':42, 'num_predict':max_tokens, 'num_ctx':context}, think=False)
    else:
        payload.update(temperature=0, max_tokens=max_tokens, stream_options={'include_usage':True})
        if engine == 'llama.cpp': payload.update(cache_prompt=False, seed=42, chat_template_kwargs={'enable_thinking':False})
    connection = http.client.HTTPConnection(host, port, timeout=timeout)
    with LOCK: CONNECTIONS.add(connection)
    start = time.perf_counter(); first = None; last = None; first_visible = None
    usage = None; timing = {}; final = None; reason = None; done = False; text = []; size = 0; chunks = 0
    try:
        connection.request('POST', '/api/chat' if ollama else '/v1/chat/completions', json.dumps(payload), {'Content-Type':'application/json'})
        response = connection.getresponse()
        if response.status != 200: raise MeasurementError('http-error')
        if not ollama and 'text/event-stream' not in response.getheader('Content-Type',''):
            raise MeasurementError('invalid-stream')
        while True:
            if CANCEL.is_set(): raise MeasurementError('cancelled')
            if time.perf_counter()-start > timeout: raise MeasurementError('timeout')
            try:
                if connection.sock: connection.sock.settimeout(max(.1,timeout-(time.perf_counter()-start)))
                raw = response.readline(1_048_577)
            except TimeoutError:
                raise MeasurementError('timeout') from None
            if not raw: break
            if len(raw)>1_048_576: raise MeasurementError('response-too-large')
            size += len(raw)
            if size>8_000_000: raise MeasurementError('response-too-large')
            if not ollama:
                if not raw.startswith(b'data:'): continue
                raw = raw[5:].strip()
                if raw == b'[DONE]': done = True; break
            row = json.loads(raw)
            if 'error' in row: raise MeasurementError('runtime-error')
            now = time.perf_counter()
            if ollama:
                msg = row.get('message') or {}
                content = msg.get('content') or ''; reasoning = msg.get('thinking') or ''
                if row.get('done'):
                    final = row; done = True; reason = row.get('done_reason','stop')
            else:
                choices = row.get('choices') or []
                choice = choices[0] if choices else {}
                msg = choice.get('delta') or {}
                content = msg.get('content') or ''; reasoning = msg.get('reasoning_content') or msg.get('reasoning') or ''
                if choice.get('finish_reason'): reason = choice['finish_reason']
                if row.get('usage'): usage = row['usage']
                if row.get('timings'): timing = row['timings']
            if not isinstance(content,str) or not isinstance(reasoning,str): raise MeasurementError('invalid-stream')
            if content or reasoning:
                if first is None: first = now
                last = now; chunks += 1
            if content:
                if first_visible is None: first_visible = now
                text.append(content)
            if ollama and done: break
        end = time.perf_counter()
        if not done or first is None or reason not in ('stop','length'):
            raise MeasurementError('incomplete-stream')
        if ollama:
            usage = {'prompt_tokens':final.get('prompt_eval_count'), 'completion_tokens':final.get('eval_count')}
            cached = final.get('prompt_eval_cached_count')
            prefill = rate(usage['prompt_tokens']-cached, final.get('prompt_eval_duration',0)/1e6) if type(cached) is int and type(usage['prompt_tokens']) is int and 0<=cached<=usage['prompt_tokens'] else None
            decode = rate(usage['completion_tokens'], final.get('eval_duration',0)/1e6)
        else:
            if not isinstance(usage,dict): raise MeasurementError('missing-token-usage')
            cached = (usage.get('prompt_tokens_details') or {}).get('cached_tokens', timing.get('cache_n'))
            prefill = timing.get('prompt_per_second', usage.get('prompt_tokens_per_second'))
            decode = timing.get('predicted_per_second', usage.get('generation_tokens_per_second'))
        inputs = usage.get('prompt_tokens'); outputs = usage.get('completion_tokens')
        if type(inputs) is not int or type(outputs) is not int or not 0<inputs<=200000 or not 0<outputs<=max_tokens:
            raise MeasurementError('invalid-token-usage')
        if inputs+outputs>context: raise MeasurementError('context-exceeded')
        prefill = prefill if number(prefill) else None
        decode = decode if number(decode) else None
        cached = cached if type(cached) is int and 0 <= cached <= inputs else None
        elapsed = (end-start)*1000
        return {'inputTokens':inputs, 'outputTokens':outputs, 'ttftMs':(first-start)*1000,
                'firstVisibleMs':(first_visible-start)*1000 if first_visible is not None else None,
                'elapsedMs':elapsed, 'decodeTps':decode, 'prefillTps':prefill,
                'streamTps': (outputs-1)/(last-first) if outputs>1 and chunks>1 and last>first else None,
                'endToEndTps':outputs/(elapsed/1000), 'cachedTokens':cached, 'finishReason':reason}, ''.join(text)
    except MeasurementError: raise
    except (OSError, ValueError, TypeError, http.client.HTTPException):
        raise MeasurementError('transport-or-protocol-error') from None
    finally:
        with LOCK: CONNECTIONS.discard(connection)
        connection.close()

def measure_job(base, engine, model, profile, context, count, repeat, job, barrier=None, timeout=180):
    if barrier: barrier.wait(timeout=30)
    start = time.perf_counter(); requests = []; agent = AgentTools(); tool_ms = 0.0; error = None; status = 'complete'
    messages = [{'role':'user', 'content':f'Run ID: {uuid.uuid4()}\n' + PROFILES[profile]['prompt']}]
    try:
        for step in range(5 if profile == 'agent-tools' else 1):
            metrics, content = stream(base, engine, model, messages, PROFILES[profile]['maxOutputTokens'], context, timeout)
            requests.append(metrics)
            if profile != 'agent-tools':
                if metrics['firstVisibleMs'] is None: status = 'partial'
                break
            begin = time.perf_counter(); response, outcome = agent.execute(content); tool_ms += (time.perf_counter()-begin)*1000
            if outcome is not None: status = outcome; break
            messages += [{'role':'assistant','content':content}, {'role':'user','content':'Tool result: '+json.dumps(response)+'. Return the next JSON action or final answer.'}]
        else: status = 'partial' if agent.stage else 'failure'
    except MeasurementError as exc:
        if CANCEL.is_set(): raise
        error = exc.code; status = 'error'
    return {'jobId':job, 'concurrency':count, 'repeat':repeat, 'status':status, 'errorCode':error,
            'elapsedMs':(time.perf_counter()-start)*1000, 'requests':requests,
            'toolCalls':agent.calls, 'toolErrors':agent.errors, 'toolMs':tool_ms}

def round_jobs(base, engine, model, profile, context, count, repeat, timeout):
    barrier = threading.Barrier(count); start = time.perf_counter(); rows = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=count) as pool:
        futures = [pool.submit(measure_job, base, engine, model, profile, context, count, repeat, job, barrier, timeout) for job in range(1,count+1)]
        try:
            for future in concurrent.futures.as_completed(futures):
                row = future.result(); rows.append(row); emit('workload-sample', sample=row,
                    message=f"{count} jobs · repeat {repeat} · job {row['jobId']}: {row['status']}")
        except BaseException:
            barrier.abort(); cancel()
            for future in futures: future.cancel()
            raise
    elapsed = (time.perf_counter()-start)*1000
    tokens = sum(r['outputTokens'] for s in rows for r in s['requests'])
    return rows, {'concurrency':count,'repeat':repeat,'wallMs':elapsed,'aggregateTps':tokens/(elapsed/1000)}

def run(options):
    counts = levels(options.jobs, options.sweep)
    key = sys.stdin.readline(4096).strip() if options.jobs>3 else None
    try: authorize(options.jobs,key)
    except ValueError:
        emit('license',valid=False); raise
    profile = PROFILES[options.workload]; context = profile['contextTokens']
    hw = detect_hardware(); emit('hardware',hardware=hw)
    if options.engine == 'oMLX' and hw['platform'] != 'macOS': raise ValueError('oMLX requires Apple Silicon macOS.')
    before = battery_snapshot(); samples = []; groups = []; model_hash = None; binary_hash = None; load_ms = None
    if options.endpoint:
        endpoint(options.endpoint)
        if options.server: raise ValueError('Choose a managed executable or an existing endpoint, not both.')
        if not options.model or len(options.model)>200 or any(ord(c)<32 for c in options.model): raise ValueError('Provide the served model ID.')
    elif options.engine not in ('llama.cpp','oMLX') or not options.server:
        raise ValueError('Ollama and vLLM require an existing local --endpoint; llama.cpp/oMLX can use --server.')
    emit('progress', phase='inspect', message=f"{profile['label']} · levels {counts} · {options.repeats} repeats")
    try:
        with workspace() as tmp:
            if options.endpoint:
                base = options.endpoint.rstrip('/'); model = options.model
            else:
                path = Path(options.model).resolve()
                _, estimate = preflight([path],options.engine,hw['memoryBytes'],options.jobs)
                # Longer contexts need a larger per-slot KV allowance; still a heuristic, not a fit guarantee.
                estimate += options.jobs*.5*1024**3*(context/4096-1)
                if estimate > hw['memoryBytes']*.8: raise ValueError('Estimated weights + context/job memory exceed 80% RAM; reduce jobs or workload length.')
                emit('progress',phase='hash',message='Hashing selected model and runtime')
                model_hash = model_manifest(path) if options.engine=='oMLX' else sha256(path)
                binary_hash = sha256(options.server)
                emit('progress',phase='load',message='Starting a benchmark-owned model server')
                begin = time.perf_counter()
                base = launch(options.engine, options.server, path, options.jobs, hw['cpuCores'], Path(tmp), context=context, gpu_layers=options.gpu_layers)
                load_ms = (time.perf_counter()-begin)*1000
                model = 'benchmark-model' if options.engine=='oMLX' else path.name
            emit('progress',phase='warmup',message='Running one excluded warm-up; first model initialization may take time')
            warmup = measure_job(base,options.engine,model,options.workload,context,1,0,0,timeout=options.timeout)
            if warmup['status']=='error': raise ValueError('Warm-up failed: '+warmup['errorCode']+'. Verify model chat template, context capacity and streaming token usage.')
            for count in counts:
                for repeat in range(1,options.repeats+1):
                    if CANCEL.is_set(): raise KeyboardInterrupt()
                    emit('progress',phase='measure',message=f'{count} concurrent jobs · repeat {repeat}/{options.repeats}')
                    rows,group = round_jobs(base,options.engine,model,options.workload,context,count,repeat,options.timeout)
                    samples += rows; groups.append(group)
    finally:
        emit('progress',phase='cleanup',message='Closing benchmark-owned processes'); stop_all()
    report = {'specVersion':SPEC,'runnerVersion':VERSION,'runId':str(uuid.uuid4()),
              'measuredAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()), 'hardware':hw,
              'runtime':{'name':options.engine,'binarySha256':binary_hash,'management':'external-loopback' if options.endpoint else 'managed',
                         'identity':'unverified-server-model-id' if options.endpoint else 'local-file-sha256',
                         'gpuLayersRequested':options.gpu_layers if not options.endpoint and options.engine=='llama.cpp' else None},
              'settings':{'workload':options.workload,'workloadSha256':fingerprint(options.workload),'concurrencyLevels':counts,
                          'repeats':options.repeats,'maxOutputTokens':profile['maxOutputTokens'],'contextTokens':context,
                          'warmups':1,'temperature':0,'cachePolicy':'unique-prefix; report observed cache counts',
                          'targetTps':[100,200],'timing':'runtime decode/prefill; client first output and wall time',
                          'inferenceLocation':'same-device','hardwareRole':'inference-host','timeoutSeconds':options.timeout},
              'models':[{'modelName':clean(model,200),'modelSha256':model_hash,'loadMs':load_ms,'samples':sorted(samples,key=lambda r:(r['concurrency'],r['repeat'],r['jobId']))}],
              'groups':groups,'telemetry':{'before':before,'after':battery_snapshot(),'energyJoules':None,'peakGpuMemoryBytes':None}}
    output = Path(options.output); atomic_json(output,report)
    output.with_suffix('.md').write_text(assessment(report),encoding='utf-8')
    emit('complete',message=f'Workload benchmark complete: {len(samples)} jobs measured',output=str(output))

def parser():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--engine',choices=['llama.cpp','oMLX','Ollama','vLLM'],required=True)
    p.add_argument('--server'); p.add_argument('--endpoint'); p.add_argument('--model',required=True)
    p.add_argument('--workload',choices=list(PROFILES),default='short-chat')
    p.add_argument('--jobs',type=int,choices=range(1,21),default=1); p.add_argument('--sweep',action='store_true')
    p.add_argument('--repeats',type=int,choices=range(3,6),default=3)
    p.add_argument('--gpu-layers',type=int,choices=range(0,1000),default=999)
    p.add_argument('--timeout',type=int,choices=range(10,601),default=180); p.add_argument('--output',required=True)
    return p

if __name__ == '__main__':
    def stop(*_): cancel(); raise KeyboardInterrupt()
    signal.signal(signal.SIGTERM,stop); signal.signal(signal.SIGINT,stop)
    try: run(parser().parse_args())
    except KeyboardInterrupt: cancel(); sys.exit(130)
    except Exception as error: emit('error',message=str(error)); sys.exit(1)
