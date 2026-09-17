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
from pro_license import authorize, verify_license
import advanced_config
ADVANCED = None
import run_challenge
CHALLENGE = None

from agent_workloads import AgentWorkload, SIM_PROFILES
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
    if ADVANCED is not None: advanced_config.apply_payload(payload, ADVANCED, engine)
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
    start = time.perf_counter(); requests = []; tool_ms = 0.0; error = None; status = 'complete'
    request_id = run_challenge.request_id(CHALLENGE, count, repeat, job)
    simulated = profile in SIM_PROFILES
    agent = AgentWorkload(profile, request_id) if simulated else AgentTools(CHALLENGE['nonce'] if CHALLENGE else None)
    is_agent = simulated or profile == 'agent-tools'
    prompt = (ADVANCED or {}).get('prompt', PROFILES[profile]['prompt'])
    messages = [{'role':'user', 'content':f'Run ID: {request_id}\n' + prompt}]
    if ADVANCED and 'system_prompt' in ADVANCED: messages.insert(0, {'role':'system','content':ADVANCED['system_prompt']})
    try:
        for step in range(12 if simulated else 5 if is_agent else 1):
            remaining = timeout-(time.perf_counter()-start) if simulated else timeout
            if remaining <= 0: raise MeasurementError('timeout')
            metrics, content = stream(base, engine, model, messages, (ADVANCED or {}).get('max_tokens', PROFILES[profile]['maxOutputTokens']), context, remaining)
            requests.append(metrics)
            if not is_agent:
                if metrics['firstVisibleMs'] is None: status = 'partial'
                break
            begin = time.perf_counter(); response, outcome = agent.execute(content); tool_ms += (time.perf_counter()-begin)*1000
            if simulated:
                emit('progress', phase='agent-step', message=f"{count} jobs · repeat {repeat} · job {job} · step {step+1}: {sum(c['passed'] for c in agent.checks())}/{len(agent.checks())} task checks")
            if outcome is not None: status = outcome; break
            messages += [{'role':'assistant','content':content}, {'role':'user','content':'Tool result: '+json.dumps(response)+'. Return the next JSON action or final answer.'}]
        else: status = 'partial' if agent.stage else 'failure'
    except MeasurementError as exc:
        if CANCEL.is_set(): raise
        error = exc.code; status = 'error'
    finally:
        verification = agent.evidence() if simulated else None
        if simulated: agent.close()
    result = {'jobId':job, 'concurrency':count, 'repeat':repeat, 'status':status, 'errorCode':error,
            'elapsedMs':(time.perf_counter()-start)*1000, 'requests':requests,
            'toolCalls':agent.calls, 'toolErrors':agent.errors, 'toolMs':tool_ms}
    if simulated: result['verification'] = verification
    return result

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
    global CHALLENGE, ADVANCED
    ADVANCED = None
    counts = levels(options.jobs, options.sweep)
    advanced_path = getattr(options, 'advanced_config', None)
    key = sys.stdin.readline(4096).strip() if options.jobs>3 or advanced_path else None
    try:
        authorize(options.jobs,key)
        if advanced_path and options.jobs<=3:
            if not key: raise ValueError('Advanced tests require an active Pro license, even for one job.')
            verify_license(key)
    except ValueError:
        emit('license',valid=False); raise
    if advanced_path:
        if getattr(options, 'challenge', None): raise ValueError('Advanced experiments cannot use a standard ranking challenge.')
        with Path(advanced_path).open('rb') as config_file: raw = config_file.read(65537)
        if len(raw)>65536: raise ValueError('Advanced settings exceed 64 KiB.')
        ADVANCED = advanced_config.validate(json.loads(raw), options.engine, not options.endpoint, options.jobs, options.workload)
    config = {'workload': options.workload, 'engine': options.engine, 'model': options.model if options.endpoint else ('benchmark-model' if options.engine == 'oMLX' else Path(options.model).name), 'concurrencyLevels': counts, 'repeats': options.repeats}
    CHALLENGE = run_challenge.load_ticket(getattr(options, 'challenge', None), config)
    emit('progress', phase='integrity', message='Server challenge active; hardware remains self-reported.' if CHALLENGE else 'No server challenge: offline / community-unverified run.')
    profile = PROFILES[options.workload]; context = (ADVANCED or {}).get('context_tokens', profile['contextTokens'])
    if (ADVANCED or {}).get('max_tokens',profile['maxOutputTokens'])>=context: raise ValueError('Output limit must be smaller than the context token budget.')
    advanced_evidence = advanced_config.evidence(ADVANCED, fingerprint(options.workload)) if ADVANCED is not None else None
    if ADVANCED is not None: emit('progress',phase='advanced',message='Pro advanced experiment: local report only; runtime parameter effectiveness is not independently verified.')
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
                slots = (ADVANCED or {}).get('parallel_slots',options.jobs)
                _, estimate = preflight([path],options.engine,hw['memoryBytes'],slots)
                if ADVANCED and 'draft_model' in ADVANCED: estimate += Path(ADVANCED['draft_model']).stat().st_size*1.25
                # Longer contexts need a larger per-slot KV allowance; still a heuristic, not a fit guarantee.
                estimate += slots*.5*1024**3*(context/4096-1)
                if estimate > hw['memoryBytes']*.8: raise ValueError('Estimated weights + context/job memory exceed 80% RAM; reduce jobs or workload length.')
                emit('progress',phase='hash',message='Hashing selected model and runtime')
                model_hash = model_manifest(path) if options.engine=='oMLX' else sha256(path)
                binary_hash = sha256(options.server)
                emit('progress',phase='load',message='Starting a benchmark-owned model server')
                begin = time.perf_counter()
                base = launch(options.engine, options.server, path, slots, hw['cpuCores'], Path(tmp), context=context, gpu_layers=options.gpu_layers, **({'advanced': ADVANCED} if ADVANCED is not None else {}))
                load_ms = (time.perf_counter()-begin)*1000
                model = 'benchmark-model' if options.engine=='oMLX' else path.name
            emit('progress',phase='warmup',message='Running one excluded warm-up; first model initialization may take time')
            warmup = measure_job(base,options.engine,model,options.workload,context,1,0,0,timeout=options.timeout)
            if warmup['status']=='error' and not (options.workload in SIM_PROFILES and warmup['errorCode']=='timeout'): raise ValueError('Warm-up failed: '+warmup['errorCode']+'. Verify model chat template, context capacity and streaming token usage.')
            for count in counts:
                for repeat in range(1,options.repeats+1):
                    if CANCEL.is_set(): raise KeyboardInterrupt()
                    emit('progress',phase='measure',message=f'{count} concurrent jobs · repeat {repeat}/{options.repeats}')
                    rows,group = round_jobs(base,options.engine,model,options.workload,context,count,repeat,options.timeout)
                    samples += rows; groups.append(group)
    finally:
        emit('progress',phase='cleanup',message='Closing benchmark-owned processes'); stop_all()
    report = {'specVersion':advanced_config.SPEC if ADVANCED is not None else SPEC,'runnerVersion':'0.9.0' if ADVANCED is not None else VERSION,'runId':CHALLENGE['runId'] if CHALLENGE else str(uuid.uuid4()),
              'measuredAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()), 'hardware':hw,
              'runtime':{'name':options.engine,'binarySha256':binary_hash,'management':'external-loopback' if options.endpoint else 'managed',
                         'identity':'unverified-server-model-id' if options.endpoint else 'local-file-sha256',
                         'gpuLayersRequested':(ADVANCED or {}).get('gpu_layers',options.gpu_layers) if not options.endpoint and options.engine=='llama.cpp' else None},
              'settings':{'workload':options.workload,'workloadSha256':fingerprint(options.workload),'concurrencyLevels':counts,
                          'repeats':options.repeats,'maxOutputTokens':(ADVANCED or {}).get('max_tokens',profile['maxOutputTokens']),'contextTokens':context,
                          'warmups':1,'temperature':(ADVANCED or {}).get('temperature',0),'cachePolicy':'unique-prefix; report observed cache counts',
                          'targetTps':[100,200],'timing':'runtime decode/prefill; client first output and wall time',
                          'inferenceLocation':'same-device','hardwareRole':'inference-host','timeoutSeconds':options.timeout},
              'models':[{'modelName':clean(model,200),'modelSha256':model_hash,'loadMs':load_ms,'samples':sorted(samples,key=lambda r:(r['concurrency'],r['repeat'],r['jobId']))}],
              'groups':groups,'telemetry':{'before':before,'after':battery_snapshot(),'energyJoules':None,'peakGpuMemoryBytes':None}}
    if advanced_evidence:
        report['settings']['advanced'] = advanced_evidence
        report['settings']['mode'] = 'pro-advanced'
    if CHALLENGE: report['challenge'] = run_challenge.evidence(CHALLENGE)
    output = Path(options.output); atomic_json(output,report)
    notes = assessment(report)
    if advanced_evidence:
        notes = '# Pro advanced experiment — local only\n\nNot comparable to standard rankings. Compare only identical configuration fingerprints, model/runtime, workload, budgets and concurrency. Runtime settings are requested, not independently verified.\n\nConfiguration: '+advanced_evidence['configurationSha256']+'\n\nRequested settings (private text and paths redacted):\n```json\n'+json.dumps(advanced_evidence['requested'],indent=2)+'\n```\n\n'+notes
    output.with_suffix('.md').write_text(notes,encoding='utf-8')
    emit('complete',message=f'Workload benchmark complete: {len(samples)} jobs measured',output=str(output))

def parser():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--engine',choices=['llama.cpp','oMLX','Ollama','vLLM'],required=True)
    p.add_argument('--advanced-config', help='Pro-only local experiment parameter JSON; never uploaded to standard rankings')
    p.add_argument('--challenge', help='Server ticket JSON obtained before the run in the same guest session used to upload')
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
