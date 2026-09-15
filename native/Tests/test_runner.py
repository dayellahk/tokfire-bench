import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SPEC=importlib.util.spec_from_file_location('runner',Path(__file__).parents[1]/'Sources/LocalAIBench/Resources/runner.py')
runner=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)

class FakeResponse(io.BytesIO):
    pass

def stream(*, cached=0, predicted=128, truncated=False, first_tokens=True):
    events=[{'tokens': [123] if first_tokens else [], 'content':'private generated text', 'stop':False},
            {'stop':True,'truncated':truncated,'timings':{'cache_n':cached,'prompt_n':512,
              'predicted_n':predicted,'prompt_per_second':5120.0,'predicted_per_second':128.0,
              'prompt_ms':100.0,'predicted_ms':1000.0}}]
    return FakeResponse(b''.join(b'data: '+json.dumps(e).encode()+b'\n\n' for e in events))

class CompletionTests(unittest.TestCase):
    def test_real_stream_measurement_and_privacy(self):
        with patch.object(runner,'request',return_value=stream()) as request, patch.object(runner.time,'perf_counter',side_effect=[1,1.25,3]):
            result=runner.complete('http://127.0.0.1:1',list(range(512)))
        self.assertEqual(result['ttftMs'],250)
        self.assertEqual(result['elapsedMs'],2000)
        self.assertEqual(result['decodeTps'],128)
        self.assertNotIn('content',json.dumps(result))
        payload=request.call_args.args[2]
        self.assertFalse(payload['cache_prompt'])
        self.assertTrue(payload['return_tokens'])
        self.assertEqual(payload['n_predict'],128)
    def test_invalid_runs_cannot_produce_a_report(self):
        for kwargs in ({'cached':1},{'predicted':127},{'truncated':True},{'first_tokens':False}):
            with self.subTest(kwargs=kwargs),patch.object(runner,'request',return_value=stream(**kwargs)):
                with self.assertRaises(ValueError):runner.complete('http://127.0.0.1:1',list(range(512)))
    def test_atomic_write_has_no_content_or_identity_fields(self):
        with tempfile.TemporaryDirectory() as folder:
            target=Path(folder)/'report.json'
            runner.atomic_json(target,{'runId':'test','models':[]})
            self.assertEqual(json.loads(target.read_text()),{'runId':'test','models':[]})
            self.assertEqual(len(list(Path(folder).iterdir())),1)
            self.assertEqual(target.stat().st_mode & 0o777,0o600)
    def test_non_mac_rejected(self):
        with patch.object(runner.platform,'system',return_value='Linux'):
            with self.assertRaisesRegex(ValueError,'Apple Silicon'):runner.hardware()
    def test_large_model_rejected_before_launch(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'model.gguf';path.write_bytes(b'GGUF'+b'x'*100)
            with patch.object(runner.subprocess,'Popen') as start:
                with self.assertRaisesRegex(ValueError,'65%'):runner.measure_model(Path('/binary'),path,4,100)
                start.assert_not_called()

if __name__=='__main__':unittest.main()
