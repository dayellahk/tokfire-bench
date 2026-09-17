"""Contract tests use synthetic streams; never publish them as benchmark evidence."""
import contextlib, io, json, sys, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'Sources/LocalAIBench/Resources'))
import advanced_config as config
import workload_runner as runner
from test_workloads import server

class Advanced(unittest.TestCase):
    def setUp(self): runner.ADVANCED=None; runner.CANCEL.clear();runner.CHALLENGE=None
    def tearDown(self): runner.ADVANCED=None;runner.CANCEL.clear();runner.CHALLENGE=None
    def validate(self,raw,engine='llama.cpp',managed=True,jobs=3,profile='short-chat'):
        return config.validate(raw,engine,managed,jobs,profile)
    def test_ranges_types_and_unknowns(self):
        for raw in [{'temperature':'nan'},{'top_k':'1.5'},{'seed':True},{'temperature':3},{'max_tokens':-1},{'host':'0.0.0.0'},{'n':2},{'beam_search':True},{}]:
            with self.subTest(raw=raw),self.assertRaises(ValueError):self.validate(raw)
    def test_runtime_and_engine_capability(self):
        for raw,engine,managed in [({'gpu_layers':5},'Ollama',False),({'batch_size':10},'llama.cpp',False),({'context_tokens':8192},'llama.cpp',False),({'mirostat':1},'vLLM',False),({'json_schema':'{}'},'oMLX',True)]:
            with self.assertRaises(ValueError):self.validate(raw,engine,managed)
    def test_interactions(self):
        for raw in [{'parallel_slots':2},{'batch_size':128},{'cache_type_v':'q8_0'},{'grammar':'root ::= "x"','json_schema':'{}'},{'tensor_split':'1;--host 0.0.0.0'},{'chat_template':'--host'}]:
            with self.assertRaises(ValueError):self.validate(raw)
        with self.assertRaises(ValueError):self.validate({'prompt':'fake task'},profile='agent-data')
        self.assertEqual(self.validate({'cache_type_v':'q8_0','flash_attention':'on'})['cache_type_v'],'q8_0')
    def test_structured_settings(self):
        for raw in [{'logit_bias':'{"1":true}'},{'logit_bias':'{"1":101}'},{'json_schema':'[]'},{'stop':'\n'},{'samplers':'top_p,unknown'}]:
            with self.assertRaises(ValueError):self.validate(raw)
        self.assertEqual(self.validate({'stop':'END\nSTOP'})['stop'],['END','STOP'])
    def test_payload_mappings(self):
        for engine in ['llama.cpp','Ollama','vLLM']:
            c=self.validate({'temperature':.4,'top_k':0,'repeat_penalty':1.2,'max_tokens':99,'seed':42},engine,engine=='llama.cpp')
            p={'options':{}} if engine=='Ollama' else {}
            config.apply_payload(p,c,engine);t=p.get('options',p)
            self.assertEqual(t['num_predict' if engine=='Ollama' else 'max_tokens'],99)
            self.assertEqual(t['repetition_penalty' if engine=='vLLM' else 'repeat_penalty'],1.2)
            self.assertEqual(t['top_k'],-1 if engine=='vLLM' else 0)
    def test_private_text_redaction_and_fingerprints(self):
        c=self.validate({'prompt':'PRIVATE_TEXT','system_prompt':'SECRET','temperature':.3})
        evidence=config.evidence(c,'base');self.assertNotIn('PRIVATE_TEXT',json.dumps(evidence));self.assertNotIn('SECRET',json.dumps(evidence))
        self.assertEqual(evidence['configurationSha256'],config.evidence(dict(reversed(list(c.items()))),'base')['configurationSha256'])
        c['temperature']=.4;self.assertNotEqual(evidence['configurationSha256'],config.evidence(c,'base')['configurationSha256'])
    def test_runtime_arguments_are_typed_and_version_checked(self):
        args=['server','-ngl','999','-b','512','-ub','512','-t','8','-tb','8','-fa','off','-ctk','f16','-ctv','f16']
        with patch('advanced_config.subprocess.check_output',return_value=b'--mlock --no-mmap --rope-freq-scale'):
            applied=config.runtime_args(args,{'gpu_layers':0,'threads':4,'mlock':'true','mmap':'false','rope_freq_scale':.5},'server')
        self.assertEqual(applied[applied.index('-ngl')+1],'0');self.assertIn('--mlock',applied);self.assertEqual(applied[applied.index('-tb')+1],'4')
        with patch('advanced_config.subprocess.check_output',return_value=b''),self.assertRaises(ValueError):config.runtime_args(args,{'mlock':'true'},'server')
    def options(self,root,endpoint):
        return runner.parser().parse_args(['--engine','llama.cpp','--endpoint',endpoint,'--model','fixture','--jobs','1','--repeats','3','--advanced-config',str(root/'config.json'),'--output',str(root/'report.json')])
    def test_one_job_requires_license_before_model_requests(self):
        with tempfile.TemporaryDirectory() as d,patch('sys.stdin',io.StringIO('')),patch.object(runner,'detect_hardware') as hw:
            with self.assertRaisesRegex(ValueError,'Pro license'):runner.run(self.options(Path(d),'http://127.0.0.1:9999'))
            hw.assert_not_called()
    def test_invalid_license_fails(self):
        with tempfile.TemporaryDirectory() as d,patch('sys.stdin',io.StringIO('not-a-license\n')),patch.object(runner,'verify_license',side_effect=ValueError('invalid')) as verify:
            with self.assertRaisesRegex(ValueError,'invalid'):runner.run(self.options(Path(d),'http://127.0.0.1:9999'))
            verify.assert_called_once()
    def test_advanced_stream_report_and_redaction(self):
        with tempfile.TemporaryDirectory() as d,server('timings') as endpoint:
            root=Path(d);(root/'config.json').write_text(json.dumps({'temperature':.5,'top_k':20,'prompt':'PRIVATE_SCENARIO'}))
            seen=[]
            original=config.apply_payload
            def capture(payload,c,e):
                output=original(payload,c,e);seen.append(json.loads(json.dumps(output)));return output
            hw={'platform':'macOS','architecture':'arm64','chip':'fixture','machine':'fixture','cpuCores':4,'memoryBytes':16*1024**3,'osVersion':'test','gpuNames':[],'gpuMemoryBytes':None}
            with patch('sys.stdin',io.StringIO('unit-test-only\n')),patch.object(runner,'verify_license',return_value=True),patch.object(runner,'detect_hardware',return_value=hw),patch.object(config,'apply_payload',side_effect=capture),contextlib.redirect_stdout(io.StringIO()):runner.run(self.options(root,endpoint))
            report=json.loads((root/'report.json').read_text());self.assertEqual(report['specVersion'],config.SPEC)
            self.assertEqual(len(seen),4);self.assertTrue(all(x['temperature']==.5 and x['top_k']==20 for x in seen))
            self.assertIn('PRIVATE_SCENARIO',seen[0]['messages'][0]['content']);self.assertNotIn('PRIVATE_SCENARIO',(root/'report.json').read_text())
            self.assertEqual(len(report['models'][0]['samples']),3);self.assertNotIn('challenge',report)
            self.assertIn('Not comparable to standard rankings',(root/'report.md').read_text())

if __name__=='__main__':unittest.main()
