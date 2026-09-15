#!/usr/bin/env python3
"""Local-only llama.cpp benchmark. No external network calls or automatic uploads."""
import argparse
import hashlib
import json
import math
import os
import platform
import signal
import socket
import statistics
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

SPEC = 'local-ai-text-v1'
PROMPT = ('A local language model helps explain software, compare ideas, and summarize documents. '
          'Describe a practical approach, give an example, and explain its limitations.\n') * 600
INPUTS = (512, 2048)
OUTPUT = 128
REPEATS = 3
HTTP = urllib.request.build_opener(urllib.request.ProxyHandler({}))

def runtime_env():
    # Inherited runtime options must not silently enable remote models or change the workload.
    return {k: v for k, v in os.environ.items() if not k.startswith(('LLAMA_', 'GGML_', 'HF_'))}

def emit(kind, **values):
    print(json.dumps({'event': kind, **values}, allow_nan=False), flush=True)

def sha256(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()

def command(args):
    return subprocess.check_output(args, text=True, timeout=20).strip()

def hardware():
    if platform.system() != 'Darwin' or platform.machine() != 'arm64':
        raise ValueError('This benchmark profile requires an Apple Silicon Mac.')
    return {'chip': command(['/usr/sbin/sysctl', '-n', 'machdep.cpu.brand_string']),
            'machine': command(['/usr/sbin/sysctl', '-n', 'hw.model']),
            'cpuCores': int(command(['/usr/sbin/sysctl', '-n', 'hw.ncpu'])),
            'memoryBytes': int(command(['/usr/sbin/sysctl', '-n', 'hw.memsize'])),
            'osVersion': platform.mac_ver()[0]}

def request(base, path, data=None, timeout=600):
    body = None if data is None else json.dumps(data).encode()
    req = urllib.request.Request(base + path, body, headers={'Content-Type': 'application/json'})
    return HTTP.open(req, timeout=timeout)

def complete(base, tokens):
    payload = {'prompt': tokens, 'n_predict': OUTPUT, 'stream': True, 'temperature': 0,
               'seed': 42, 'cache_prompt': False, 'ignore_eos': True, 'return_tokens': True}
    started = time.perf_counter()
    first = None
    final = None
    # Never retain generated text or send it to stdout/export.
    with request(base, '/completion', payload) as response:
        for line in response:
            if not line.startswith(b'data: '):
                continue
            raw = line[6:].strip()
            if raw == b'[DONE]':
                continue
            event = json.loads(raw)
            if 'error' in event:
                raise ValueError('Inference engine returned an error.')
            if first is None and event.get('tokens'):
                first = time.perf_counter()
            if event.get('stop'):
                final = event
    ended = time.perf_counter()
    if not final or first is None:
        raise ValueError('Missing streamed token IDs or final timings; update llama-server.')
    t = final.get('timings', {})
    if final.get('truncated') or t.get('predicted_n') != OUTPUT or t.get('prompt_n') != len(tokens) or t.get('cache_n', 0) != 0:
        raise ValueError('Incomplete, truncated or cached run rejected by the benchmark specification.')
    vals = [t.get('prompt_per_second'), t.get('predicted_per_second'), t.get('prompt_ms'), t.get('predicted_ms')]
    if any(not isinstance(v, (float, int)) or not math.isfinite(v) or v <= 0 for v in vals):
        raise ValueError('Invalid inference timings.')
    return {'inputTokens': len(tokens), 'outputTokens': OUTPUT, 'ttftMs': (first-started)*1000,
            'prefillTps': vals[0], 'decodeTps': vals[1], 'prefillMs': vals[2],
            'decodeMs': vals[3], 'elapsedMs': (ended-started)*1000}

class RSSMonitor:
    """Sample process RSS only. This is NOT total unified/Metal memory."""
    def __init__(self, pid):
        self.pid, self.peak, self.stop_event = pid, None, threading.Event()
        self.thread = threading.Thread(target=self.sample, daemon=True)
    def sample(self):
        while not self.stop_event.is_set():
            try:
                value = int(command(['/bin/ps', '-o', 'rss=', '-p', str(self.pid)])) * 1024
                self.peak = max(self.peak or 0, value)
            except (ValueError, subprocess.SubprocessError):
                pass
            self.stop_event.wait(.25)
    def start(self):
        self.thread.start()
    def stop(self):
        self.stop_event.set()
        self.thread.join(timeout=21)

def measure_model(binary, path, threads, memory):
    if path.suffix.lower() != '.gguf' or not path.is_file():
        raise ValueError('Choose a single-file GGUF model.')
    with path.open('rb') as f:
        if f.read(4) != b'GGUF':
            raise ValueError('The selected file is not a GGUF model.')
    if path.stat().st_size > memory * .65:
        raise ValueError('Model exceeds the initial 65% memory safety budget. Choose a smaller model.')
    emit('progress', message='Hashing model for reproducible comparisons')
    fingerprint = sha256(path)
    # Reserve then release an ephemeral loopback port; health checks also check child exit.
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        port = s.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    args = [str(binary), '-m', str(path), '--host', '127.0.0.1', '--port', str(port),
            '-c', '4096', '-ngl', '999', '-np', '1', '-b', '512', '-ub', '512',
            '-t', str(threads), '-tb', str(threads), '-fa', 'off', '-ctk', 'f16', '-ctv', 'f16',
            '--no-webui', '--no-warmup']
    started = time.perf_counter()
    with tempfile.TemporaryFile() as log:
        proc = subprocess.Popen(args, stdout=log, stderr=log, env=runtime_env())
        monitor = RSSMonitor(proc.pid)
        monitor.start()
        try:
            deadline = time.monotonic() + 300
            while True:
                if proc.poll() is not None:
                    raise ValueError('llama-server exited. Check the runtime version and model compatibility.')
                try:
                    with request(base, '/health', timeout=1) as res:
                        ready = json.load(res).get('status') == 'ok'
                    if ready:
                        break
                except (OSError, urllib.error.URLError, ValueError):
                    pass
                if time.monotonic() > deadline:
                    raise ValueError('Model loading timed out after five minutes.')
                time.sleep(.2)
            load_ms = (time.perf_counter()-started)*1000
            with request(base, '/tokenize', {'content': PROMPT, 'add_special': True}) as res:
                all_tokens = json.load(res)['tokens']
            if len(all_tokens) < max(INPUTS) or any(type(x) is not int for x in all_tokens):
                raise ValueError('Tokenizer response is incompatible.')
            samples = []
            for count in INPUTS:
                tokens = all_tokens[:count]
                emit('progress', message=f'Warm-up: {count} input tokens')
                complete(base, tokens)
                for repeat in range(REPEATS):
                    emit('progress', message=f'{count} input tokens · measured run {repeat+1}/{REPEATS}')
                    row = complete(base, tokens)
                    row['repeat'] = repeat + 1
                    samples.append(row)
            result = {'modelSha256': fingerprint, 'modelBytes': path.stat().st_size,
                      'loadMs': load_ms, 'peakProcessRssBytes': monitor.peak, 'samples': samples}
            return result
        finally:
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=8)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait()
            monitor.stop()

def atomic_json(path, report):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix='.benchmark-')
    try:
        with os.fdopen(fd, 'w') as out:
            json.dump(report, out, indent=2, allow_nan=False)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--server', type=Path)
    parser.add_argument('--models', nargs='+', type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--hardware', action='store_true')
    options = parser.parse_args()
    hw = hardware()
    if options.hardware:
        emit('hardware', hardware=hw)
        return
    if not options.server or not options.server.is_file() or not os.access(options.server, os.X_OK):
        raise ValueError('Select an executable llama-server binary.')
    if not options.models or not 3 <= len(options.models) <= 5 or len(set(p.resolve() for p in options.models)) != len(options.models):
        raise ValueError('Choose 3–5 different GGUF files.')
    if options.output is None:
        raise ValueError('Choose an output report path.')
    emit('progress', message='Inspecting runtime and hardware')
    version = subprocess.run([str(options.server), '--version'], capture_output=True, text=True, timeout=20, check=True, env=runtime_env())
    # Public record uses hashes, not arbitrary binary output or local file names.
    version_hash = hashlib.sha256((version.stdout + version.stderr).encode()).hexdigest()
    report = {'specVersion': SPEC, 'runnerVersion': '0.2.0', 'runId': str(uuid.uuid4()),
              'measuredAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
              'hardware': hw, 'runtime': {'name': 'llama.cpp', 'binarySha256': sha256(options.server),
              'versionSha256': version_hash, 'threads': hw['cpuCores'], 'contextTokens': 4096,
              'gpuLayers': 999, 'batchTokens': 512, 'ubatchTokens': 512, 'flashAttention': False,
              'kvCache': 'f16'}, 'models': []}
    hashes = set()
    for idx, path in enumerate(options.models):
        emit('progress', message=f'Model {idx+1}/{len(options.models)}')
        model = measure_model(options.server.resolve(), path.resolve(), hw['cpuCores'], hw['memoryBytes'])
        if model['modelSha256'] in hashes:
            raise ValueError('Duplicate model content; choose different model files.')
        hashes.add(model['modelSha256'])
        report['models'].append(model)
        emit('model', modelIndex=idx+1, decodeTps=statistics.median(s['decodeTps'] for s in model['samples'] if s['inputTokens']==512))
    atomic_json(options.output, report)
    emit('complete', report=report)

if __name__ == '__main__':
    def cancel(_signum, _frame):
        raise KeyboardInterrupt()
    signal.signal(signal.SIGTERM, cancel)
    try:
        main()
    except KeyboardInterrupt:
        emit('cancelled', message='Stopped. Nothing uploaded.')
        sys.exit(130)
    except Exception as error:
        # No raw runtime log or local path is exported. UI errors remain local.
        emit('error', message=str(error))
        sys.exit(1)
