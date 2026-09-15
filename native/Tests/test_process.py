"""Real loopback HTTP and child-process tests with explicitly synthetic inference."""
import json
import io
import os
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from test_runner import runner

class ProcessTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name).resolve()
        self.binary = self.folder / 'llama-server'
        fixture = Path(__file__).with_name('fake_llama_server.py')
        self.binary.write_text(f'#!{sys.executable}\n' + fixture.read_text())
        self.binary.chmod(0o700)
        self.model = self.folder / 'fixture.gguf'
        self.model.write_bytes(b'GGUFsynthetic fixture only')
        self.pid = self.folder / 'pid'
        self.calls = self.folder / 'calls'
        env = patch.dict(os.environ, BENCH_TEST_PID=str(self.pid), BENCH_TEST_CALLS=str(self.calls), BENCH_TEST_MODE='ok')
        env.start()
        self.addCleanup(env.stop)

    def assert_child_stopped(self):
        if self.pid.exists():
            with self.assertRaises(ProcessLookupError):
                os.kill(int(self.pid.read_text()), 0)

    def test_trial_stream_and_process_cleanup(self):
        result = runner.measure_model(self.binary, self.model, 2, 8 * 1024**3, trial=True)
        self.assertEqual(len(result['samples']), 1)
        self.assertEqual(result['samples'][0]['outputTokens'], 32)
        self.assertGreater(result['samples'][0]['ttftMs'], 0)
        self.assertEqual(len(self.calls.read_text().splitlines()), 2)
        self.assertNotIn('synthetic private text', json.dumps(result))
        self.assert_child_stopped()

    def test_closed_progress_pipe_does_not_prevent_cleanup(self):
        real_emit = runner.emit
        def emit(kind, **values):
            if values.get('phase') == 'cleanup':
                raise BrokenPipeError('GUI closed its output pipe')
            return real_emit(kind, **values)
        with patch.object(runner, 'emit', side_effect=emit):
            runner.measure_model(self.binary, self.model, 2, 8 * 1024**3, trial=True)
        self.assert_child_stopped()

    def test_three_selected_models_run_sequentially_and_export_one_report(self):
        models = [self.model]
        for index in (2, 3):
            model = self.folder / f'fixture-{index}.gguf'
            model.write_bytes(b'GGUFsynthetic fixture only ' + str(index).encode())
            models.append(model)
        report_path = self.folder / 'report.json'
        real_popen, children, launched = subprocess.Popen, [], []
        def capture(args, **kwargs):
            if str(args[0]) == str(self.binary) and '-m' in args:
                self.assertTrue(all(child.poll() is not None for child in children), 'models overlapped')
                launched.append(args[args.index('-m') + 1])
                child = real_popen(args, **kwargs)
                children.append(child)
                return child
            return real_popen(args, **kwargs)
        hw = {'chip': 'Apple M1', 'machine': 'Mac1,1', 'cpuCores': 2, 'memoryBytes': 8 * 1024**3, 'osVersion': '13.0'}
        argv = ['runner.py', '--server', str(self.binary), '--output', str(report_path), '--models', *map(str, models)]
        with patch.object(runner, 'hardware', return_value=hw), patch.object(runner.sys, 'argv', argv), patch.object(runner.subprocess, 'Popen', side_effect=capture), patch.object(runner.sys, 'stdout', io.StringIO()):
            runner.main()
        self.assertEqual(launched, list(map(str, models)))
        self.assertTrue(all(child.poll() is not None for child in children))
        report = json.loads(report_path.read_text())
        self.assertEqual(report['specVersion'], runner.SPEC)
        self.assertEqual(len(report['models']), 3)
        self.assertTrue(all(len(model['samples']) == 6 for model in report['models']))
        self.assertEqual(len(self.calls.read_text().splitlines()), 24)
        self.assertNotIn('synthetic private text', report_path.read_text())

    def test_single_model_standard_report(self):
        report_path = self.folder / 'single.json'
        hw = {'chip': 'Apple M1', 'machine': 'Mac1,1', 'cpuCores': 2, 'memoryBytes': 8 * 1024**3, 'osVersion': '13.0'}
        argv = ['runner.py', '--server', str(self.binary), '--output', str(report_path), '--models', str(self.model)]
        with patch.object(runner, 'hardware', return_value=hw), patch.object(runner.sys, 'argv', argv), patch.object(runner.sys, 'stdout', io.StringIO()):
            runner.main()
        report = json.loads(report_path.read_text())
        self.assertEqual(report['specVersion'], runner.SPEC)
        self.assertEqual(len(report['models']), 1)
        self.assertEqual(len(report['models'][0]['samples']), 6)
        self.assert_child_stopped()

    def test_standard_workloads_remain_complete(self):
        result = runner.measure_model(self.binary, self.model, 2, 8 * 1024**3)
        self.assertEqual([(r['inputTokens'], r['repeat'], r['outputTokens']) for r in result['samples']],
                         [(n, r, 128) for n in (512, 2048) for r in (1, 2, 3)])
        self.assertEqual(len(self.calls.read_text().splitlines()), 8)
        self.assert_child_stopped()

    def test_bad_completion_closes_server(self):
        with patch.dict(os.environ, BENCH_TEST_MODE='cached'):
            with self.assertRaisesRegex(ValueError, 'cached'):
                runner.measure_model(self.binary, self.model, 2, 8 * 1024**3, trial=True)
        self.assert_child_stopped()

    def test_startup_error_is_visible(self):
        with patch.dict(os.environ, BENCH_TEST_MODE='startup_error'):
            with self.assertRaisesRegex(ValueError, 'unsupported runtime option'):
                runner.measure_model(self.binary, self.model, 2, 8 * 1024**3, trial=True)

    def test_monitor_start_failure_closes_child(self):
        real_popen = subprocess.Popen
        children = []
        def capture(*args, **kwargs):
            child = real_popen(*args, **kwargs)
            children.append(child)
            return child
        with patch.object(runner.subprocess, 'Popen', side_effect=capture), patch.object(runner.RSSMonitor, 'start', side_effect=RuntimeError('monitor unavailable')):
            with self.assertRaisesRegex(RuntimeError, 'monitor unavailable'):
                runner.measure_model(self.binary, self.model, 2, 8 * 1024**3, trial=True)
        self.assertIsNotNone(children[0].poll())

    def test_cancel_during_generation_closes_child(self):
        code = '''import signal, sys
from pathlib import Path
sys.path.insert(0, sys.argv[1])
import runner
def cancel(*_):
    raise KeyboardInterrupt()
signal.signal(signal.SIGTERM, cancel)
try:
    runner.measure_model(Path(sys.argv[2]), Path(sys.argv[3]), 2, 8 * 1024**3, trial=True)
except KeyboardInterrupt:
    sys.exit(130)
'''
        with patch.dict(os.environ, BENCH_TEST_MODE='slow'):
            proc = subprocess.Popen([sys.executable, '-c', code, str(Path(runner.__file__).parent), str(self.binary), str(self.model)], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        try:
            deadline = time.monotonic() + 10
            while not self.calls.exists() and time.monotonic() < deadline and proc.poll() is None:
                time.sleep(.02)
            self.assertTrue(self.calls.exists(), 'fixture did not begin generation')
            proc.send_signal(signal.SIGTERM)
            _, error = proc.communicate(timeout=12)
            self.assertEqual(proc.returncode, 130, error.decode())
            self.assert_child_stopped()
        finally:
            if proc.poll() is None:
                proc.kill()
                proc.communicate()
            if self.pid.exists():
                try:
                    os.kill(int(self.pid.read_text()), signal.SIGKILL)
                except ProcessLookupError:
                    pass

if __name__ == '__main__':
    unittest.main()
