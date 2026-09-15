#!/usr/bin/env python3
"""Protocol fixture only: performs NO inference and must never supply benchmark results."""
import json
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

mode = os.environ.get('BENCH_TEST_MODE', 'ok')
if '--version' in sys.argv:
    print('synthetic protocol fixture; not a language model')
    sys.exit(0)
if mode == 'startup_error':
    print('fixture: unsupported runtime option', file=sys.stderr, flush=True)
    sys.exit(2)
Path(os.environ['BENCH_TEST_PID']).write_text(str(os.getpid()))

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"status":"ok"}')
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        self.send_response(200)
        self.end_headers()
        if self.path == '/tokenize':
            self.wfile.write(json.dumps({'tokens': list(range(2048))}).encode())
            return
        with open(os.environ['BENCH_TEST_CALLS'], 'a') as log:
            log.write(json.dumps(body) + '\n')
        if mode == 'slow':
            time.sleep(60)
        inputs, outputs = len(body['prompt']), body['n_predict']
        events = [{'tokens': [123], 'content': 'synthetic private text', 'stop': False},
                  {'stop': True, 'timings': {'cache_n': 1 if mode == 'cached' else 0,
                    'prompt_n': inputs, 'predicted_n': outputs, 'prompt_per_second': inputs * 10.0,
                    'predicted_per_second': outputs * 1.0, 'prompt_ms': 100.0, 'predicted_ms': 1000.0}}]
        for event in events:
            self.wfile.write(b'data: ' + json.dumps(event).encode() + b'\n\n')
            self.wfile.flush()

HTTPServer(('127.0.0.1', int(sys.argv[sys.argv.index('--port') + 1])), Handler).serve_forever()
