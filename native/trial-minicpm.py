#!/usr/bin/env python3
"""Download a pinned official MiniCPM GGUF, verify it, and run a local Mac trial."""
import argparse
import hashlib
import importlib.util
import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import urllib.request
import uuid
from pathlib import Path

MODEL = 'MiniCPM5-2B-Q4_K_M.gguf'
REVISION = '2079a22f3beaa4e306449978533478fe0522f4b3'
URL = f'https://huggingface.co/openbmb/MiniCPM5-2B-GGUF/resolve/{REVISION}/{MODEL}'
SHA256 = 'ec2d5801640099e97d8d7e8003ad4d81f336e757811f03a26173dddf386602fd'
ROOT = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location('benchmark_runner', ROOT / 'Sources/LocalAIBench/Resources/runner.py')
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)

def ensure_model(target):
    if target.exists():
        print('Checking the existing model checksum…', flush=True)
        if runner.sha256(target) != SHA256:
            raise ValueError('Existing model checksum does not match the official file. Move it aside and retry.')
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    if shutil.disk_usage(target.parent).free < 2_000_000_000:
        raise ValueError('At least 2 GB of free disk space is needed for this model download.')
    fd, temporary = tempfile.mkstemp(prefix='.minicpm-', dir=target.parent)
    try:
        print('Downloading official MiniCPM5-2B Q4_K_M (~1.56 GB) from Hugging Face. No results are uploaded.', flush=True)
        digest, size, last_bucket = hashlib.sha256(), 0, -1
        with os.fdopen(fd, 'wb') as out, urllib.request.urlopen(URL, timeout=120) as response:
            for block in iter(lambda: response.read(1024 * 1024), b''):
                size += len(block)
                if size > 2_000_000_000:
                    raise ValueError('Download exceeds the expected size limit.')
                out.write(block)
                digest.update(block)
                bucket = size // 100_000_000
                if bucket != last_bucket:
                    print(f'Downloaded {size / 1_000_000:.0f} MB', flush=True)
                    last_bucket = bucket
        if digest.hexdigest() != SHA256:
            raise ValueError('Download checksum mismatch. The incomplete file has been removed; retry.')
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--server', type=Path, help='Path to installed llama-server; otherwise detected on PATH.')
    parser.add_argument('--model', type=Path, help='Use this existing official Q4_K_M file after checksum verification.')
    parser.add_argument('--output', type=Path, help='Local report destination.')
    args = parser.parse_args()
    hw = runner.hardware()  # Refuse unsupported hosts before any download.
    server = args.server or Path(shutil.which('llama-server') or '/opt/homebrew/bin/llama-server')
    if not server.is_file() or not os.access(server, os.X_OK):
        raise ValueError('llama-server is missing. With Homebrew installed, run: brew install llama.cpp python')
    subprocess.run([str(server), '--version'], check=True, env=runner.runtime_env(), timeout=180)
    folder = Path.home() / 'Library/Application Support/LocalAIBench'
    model = args.model or folder / 'Models' / MODEL
    if args.model and not model.is_file():
        raise ValueError('--model must name an existing official Q4_K_M file.')
    output = args.output or folder / 'Reports' / f'minicpm-trial-{uuid.uuid4()}.json'
    print(f"Mac: {hw['chip']} · {hw['memoryBytes'] / 1024**3:.0f} GiB memory", flush=True)
    ensure_model(model)
    print('Trial: 512 input / 32 output tokens, one warm-up and one measured run.', flush=True)
    child = subprocess.Popen([sys.executable, '-u', str(ROOT / 'Sources/LocalAIBench/Resources/runner.py'),
                             '--trial', '--server', str(server.resolve()), '--models', str(model.resolve()),
                             '--output', str(output)], start_new_session=True)
    try:
        status = child.wait()
    except KeyboardInterrupt:
        # The runner owns llama-server and performs its own cleanup on SIGTERM.
        if child.poll() is None:
            child.terminate()
        child.wait()
        raise
    if status:
        raise ValueError(f'Trial did not finish (runner exit {status}). See the local error above.')
    report = json.loads(output.read_text())
    measured = report['models'][0]['samples'][0]
    print(f"\nMeasured decode: {measured['decodeTps']:.2f} tokens/sec")
    print(f"TTFT: {measured['ttftMs']:.1f} ms · Prefill: {measured['prefillTps']:.2f} tokens/sec")
    print(f'Report saved: {output}\nShort trial only; no upload or public comparison.')

if __name__ == '__main__':
    def cancel(_signum, _frame):
        raise KeyboardInterrupt()
    signal.signal(signal.SIGTERM, cancel)
    try:
        main()
    except KeyboardInterrupt:
        print('\nStopped. No results uploaded.', file=sys.stderr)
        sys.exit(130)
    except Exception as error:
        print(f'Trial error: {error}', file=sys.stderr)
        sys.exit(1)
