#!/usr/bin/env python3
"""Isolated oMLX / MLX serving benchmark; never touches the user's server/config.
Distinct from the exact-token llama.cpp profile. Usage counts come from oMLX.
"""
import argparse, concurrent.futures, hashlib, json, math, os, signal, socket
import statistics, subprocess, sys, tempfile, threading, time, uuid
from pathlib import Path
from runner import hardware, sha256, emit, request, runtime_env

SPEC = 'local-ai-omlx-v1'
ACTIVE_PROCESS = None
TEXT = ('A family uses a local assistant for learning, recipes, and planning. '
        'Explain practical steps with examples and discuss limitations. ') * 32

def model_manifest(directory):
    root = Path(directory).resolve()
    files = sorted(p for p in root.rglob('*') if p.is_file() and p.suffix in
                   ('.safetensors', '.json', '.jinja', '.model'))
    if not (root / 'config.json').is_file() or not any(p.suffix == '.safetensors' for p in files):
        raise ValueError('Choose an MLX model directory containing config.json and safetensors weights.')
    rows = [(str(p.relative_to(root)), p.stat().st_size, sha256(p)) for p in files]
    return hashlib.sha256(json.dumps(rows, separators=(',', ':')).encode()).hexdigest()

def positive(value, name):
    if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value) or value <= 0:
        raise ValueError('Missing or invalid oMLX metric: ' + name)
    return value

def measure(base, model, concurrency, repeat, user, barrier=None):
    # Unique leading text plus --no-cache avoids cross-request prefix reuse.
    prompt = str(uuid.uuid4()) + '\n' + TEXT + '\nWrite a detailed practical guide:\n'
    payload = {'model': model, 'prompt': prompt, 'max_tokens': 128, 'temperature': 0,
               'stream': True, 'stream_options': {'include_usage': True}}
    if barrier: barrier.wait(timeout=20)
    start = time.perf_counter(); first = None; usage = None; reason = None; done = False
    with request(base, '/v1/completions', payload, timeout=180) as response:
        if 'text/event-stream' not in response.headers.get('Content-Type', ''):
            raise ValueError('oMLX did not return an event stream.')
        for line in response:
            if not line.startswith(b'data:'): continue
            raw = line[5:].strip()
            if raw == b'[DONE]': done = True; break
            row = json.loads(raw)
            if 'error' in row: raise ValueError('oMLX returned a streaming error.')
            for choice in row.get('choices', []):
                if choice.get('text') and first is None: first = time.perf_counter()
                if choice.get('finish_reason'): reason = choice['finish_reason']
            if row.get('usage'): usage = row['usage']
    elapsed = time.perf_counter() - start
    if not done or first is None or not usage or reason not in ('length', 'stop'):
        raise ValueError('Incomplete stream; no valid benchmark is saved.')
    output = positive(usage.get('completion_tokens'), 'completion_tokens')
    inputs = positive(usage.get('prompt_tokens'), 'prompt_tokens')
    if not isinstance(inputs, int) or not isinstance(output, int) or not 16 <= output <= 128:
        raise ValueError('Output too short or token count invalid.')
    cached = usage.get('prompt_tokens_details', {}).get('cached_tokens')
    if cached != 0: raise ValueError('Cache-free profile requires explicit zero cached tokens.')
    return {'inputTokens': inputs, 'outputTokens': output, 'ttftMs': (first-start)*1000,
            'prefillTps': positive(usage.get('prompt_tokens_per_second'), 'prefill speed'),
            'decodeTps': positive(usage.get('generation_tokens_per_second'), 'generation speed'),
            'endToEndTps': output/elapsed, 'elapsedMs': elapsed*1000, 'cachedTokens': cached,
            'concurrency': concurrency, 'repeat': repeat, 'user': user, 'finishReason': reason}

def run(options):
    global ACTIVE_PROCESS
    emit('progress', phase='inspect', message='Inspecting oMLX and Apple Silicon hardware')
    hw = hardware()
    emit('progress', phase='hash', message='Hashing MLX weights, tokenizer and configuration', modelIndex=1)
    model_hash = model_manifest(options.model)
    version = subprocess.check_output([options.server, '--version'], text=True, timeout=60).strip()
    with tempfile.TemporaryDirectory(prefix='localai-omlx-') as temporary:
        root = Path(temporary); directory = root/'models'; directory.mkdir()
        (directory/'benchmark-model').symlink_to(Path(options.model).resolve(), target_is_directory=True)
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
        base = 'http://127.0.0.1:' + str(port)
        args = [options.server, 'serve', '--model-dir', str(directory), '--base-path', str(root/'data'),
                '--host', '127.0.0.1', '--port', str(port), '--no-cache', '--no-hf-cache',
                '--max-concurrent-requests', '3', '--memory-guard', 'safe', '--log-level', 'warning']
        env = {k:v for k,v in runtime_env().items() if not k.startswith(('OMLX_', 'MLX_'))}
        process = None
        with open(root/'server.log', 'w+') as log:
            try:
                emit('progress', phase='load', message='Starting a separate oMLX instance; existing service is unchanged')
                start=time.perf_counter()
                process = subprocess.Popen(args, stdout=log, stderr=log, env=env, start_new_session=True)
                ACTIVE_PROCESS = process
                deadline = time.monotonic()+180
                while time.monotonic()<deadline:
                    if process.poll() is not None: raise ValueError('oMLX failed to start. Check runtime and MLX model compatibility.')
                    try:
                        with request(base, '/v1/models', timeout=2) as response: available=json.load(response)['data']
                        if available: break
                    except (OSError, ValueError, KeyError): time.sleep(.3)
                else: raise TimeoutError('oMLX startup timed out.')
                ids=[m['id'] for m in available]
                if 'benchmark-model' not in ids: raise ValueError('oMLX did not discover the selected MLX model.')
                emit('progress', phase='warmup', message='Loading model and running one discarded warm-up')
                measure(base, 'benchmark-model', 1, 0, 0)
                load_ms=(time.perf_counter()-start)*1000
                samples=[]; groups=[]
                for concurrency in (1,2,3):
                    for repeat in (1,2,3):
                        emit('progress', phase='measure', message=f'{concurrency} simultaneous users · repeat {repeat}/3')
                        barrier=threading.Barrier(concurrency)
                        begin=time.perf_counter()
                        with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as pool:
                            futures=[pool.submit(measure,base,'benchmark-model',concurrency,repeat,u+1,barrier) for u in range(concurrency)]
                            rows=[]
                            for future in concurrent.futures.as_completed(futures):
                                row=future.result(); rows.append(row); samples.append(row); emit('sample', sample=row)
                        duration=time.perf_counter()-begin
                        groups.append({'concurrency':concurrency,'repeat':repeat,'wallMs':duration*1000,
                                       'aggregateTps':sum(r['outputTokens'] for r in rows)/duration})
                report={'specVersion':SPEC,'runnerVersion':'0.4.0','runId':str(uuid.uuid4()),
                        'measuredAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'hardware':hw,
                        'runtime':{'name':'oMLX','versionText':version,'binarySha256':sha256(options.server)},
                        'settings':{'cache':'disabled; unique prefix','concurrency':[1,2,3],'repeats':3,'maxOutputTokens':128,
                                    'inputProfile':'family-guide-v1; server-counted variable token length',
                                    'timing':'decode/prefill from oMLX usage; TTFT and end-to-end from client',
                                    'targetTps':[100,200],'targetSource':'user-selected; not a ChatGPT plan speed guarantee'},
                        'models':[{'modelSha256':model_hash,'modelName':Path(options.model).name,'loadMs':load_ms,
                                   'samples':sorted(samples,key=lambda r:(r['concurrency'],r['repeat'],r['user']))}],
                        'groups':groups}
            finally:
                try: emit('progress', phase='cleanup', message='Closing the benchmark-owned oMLX process')
                except OSError: pass
                if process is not None:
                    if process.poll() is None:
                        os.killpg(process.pid, signal.SIGTERM)
                        try: process.wait(timeout=15)
                        except subprocess.TimeoutExpired: os.killpg(process.pid,signal.SIGKILL);process.wait()
                    else: process.wait()
        destination=Path(options.output); destination.parent.mkdir(parents=True,exist_ok=True)
        temporary_report=destination.with_suffix('.tmp')
        temporary_report.write_text(json.dumps(report,indent=2,allow_nan=False));temporary_report.replace(destination)
        emit('complete', message='oMLX benchmark complete: 18 measured requests', output=str(destination))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--server',required=True);parser.add_argument('--model',required=True);parser.add_argument('--output',required=True)
    def cancel(*_):
        if ACTIVE_PROCESS is not None and ACTIVE_PROCESS.poll() is None:
            try: os.killpg(ACTIVE_PROCESS.pid, signal.SIGTERM)
            except ProcessLookupError: pass
        raise KeyboardInterrupt()
    signal.signal(signal.SIGTERM,cancel)
    try: run(parser.parse_args())
    except KeyboardInterrupt: sys.exit(130)
    except Exception as error: emit('error',message=str(error));sys.exit(1)
