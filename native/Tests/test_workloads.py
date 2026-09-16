"""Protocol fixtures only: these token counts are not hardware benchmark scores."""
import contextlib, http.server, io, json, sys, threading, time, unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'Sources/LocalAIBench/Resources'))
import workload_runner as runner
from workload_core import AgentTools, levels, percentile, summaries, PROFILES

class Handler(http.server.BaseHTTPRequestHandler):
    mode='normal'
    def log_message(self,*a): pass
    def do_POST(self):
        body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        if self.server.mode=='slow': time.sleep(.5)
        messages=body['messages']; agent='order workflow' in messages[0]['content']
        content = ('{"tool":"lookup","arguments":{"table":"orders"}}' if len(messages)==1 else '{"tool":"sum","arguments":{"values":[258,249,267]}}' if len(messages)==3 else '{"answer":774}') if agent else 'fixture answer'
        count=20
        if self.path=='/api/chat':
            self.send_response(200);self.send_header('Content-Type','application/x-ndjson');self.end_headers()
            self.wfile.write((json.dumps({'message':{'content':content},'done':False})+'\n').encode());self.wfile.flush();time.sleep(.005)
            final={'done':True,'done_reason':'stop','message':{'content':''},'prompt_eval_count':30,'eval_count':20,'prompt_eval_duration':100000000,'eval_duration':20000000}
            if self.server.mode!='unknown-cache':final['prompt_eval_cached_count']=2
            self.wfile.write((json.dumps(final)+'\n').encode());return
        self.send_response(200);self.send_header('Content-Type','text/event-stream');self.end_headers()
        def send(value):
            self.wfile.write(('data: '+json.dumps(value)+'\n\n').encode());self.wfile.flush()
        try:
            send({'choices':[{'delta':{'reasoning_content':'hidden'}}]});time.sleep(.005)
            send({'choices':[{'delta':{'content':content if self.server.mode!='reasoning-only' else ''}}]});time.sleep(.005)
            if self.server.mode=='broken': return
            usage={'prompt_tokens':30,'completion_tokens':count,'prompt_tokens_details':{'cached_tokens':0}}
            send({'choices':[{'delta':{},'finish_reason':'stop'}],**({'usage':usage} if self.server.mode!='missing-usage' else {}),**({'timings':{'predicted_per_second':50,'prompt_per_second':1000}} if self.server.mode=='timings' else {})})
            self.wfile.write(b'data: [DONE]\n\n')
        except (BrokenPipeError,ConnectionResetError): pass

@contextlib.contextmanager
def server(mode='normal'):
    httpd=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);httpd.mode=mode
    thread=threading.Thread(target=httpd.serve_forever,daemon=True);thread.start()
    try:yield f'http://127.0.0.1:{httpd.server_port}'
    finally:httpd.shutdown();httpd.server_close();thread.join()

class Workloads(unittest.TestCase):
    def setUp(self):runner.CANCEL.clear()
    def test_sweep_limits_and_quantiles(self):
        self.assertEqual(levels(3,True),[1,2,3]);self.assertEqual(levels(7,True),[1,2,3,4,7])
        self.assertEqual(levels(20,False),[20]);self.assertEqual(percentile([1,2,3],.95),3)
        with self.assertRaises(ValueError):levels(21,True)
    def test_endpoint_cannot_misattribute_remote_machine(self):
        for value in ['https://example.com','http://192.168.1.2:8000','http://localhost:80/v1','http://user:pass@localhost:80','http://localhost:80/?token=x']:
            with self.assertRaises(ValueError):runner.endpoint(value)
        self.assertEqual(runner.endpoint('http://127.0.0.1:8080'),('127.0.0.1',8080))
    def test_stream_unknown_runtime_timing_stays_null(self):
        with server() as base:
            m,text=runner.stream(base,'vLLM','test',[{'role':'user','content':'fixture'}],512,4096)
        self.assertEqual(text,'fixture answer');self.assertIsNone(m['decodeTps']);self.assertIsNone(m['prefillTps'])
        self.assertGreater(m['firstVisibleMs'],m['ttftMs']);self.assertAlmostEqual(m['endToEndTps']*m['elapsedMs']/1000,20)
    def test_runtime_timing_not_client_estimate(self):
        with server('timings') as base:m,_=runner.stream(base,'llama.cpp','test',[{'role':'user','content':'fixture'}],512,4096)
        self.assertEqual(m['decodeTps'],50);self.assertEqual(m['prefillTps'],1000)
    def test_truncated_and_missing_usage_streams_fail(self):
        for mode in ('broken','missing-usage'):
            with server(mode) as base:
                row=runner.measure_job(base,'vLLM','test','short-chat',4096,1,1,1)
            self.assertEqual(row['status'],'error');self.assertEqual(row['requests'],[])
    def test_reasoning_without_visible_answer_is_partial(self):
        with server('reasoning-only') as base:
            row=runner.measure_job(base,'vLLM','test','short-chat',4096,1,1,1)
        self.assertEqual(row['status'],'partial')
    def test_agent_tools_have_no_shell_or_file_execution(self):
        a=AgentTools();self.assertEqual(a.execute('{"tool":"shell","arguments":{"command":"touch /tmp/no"}}')[1],'failure')
        a=AgentTools();self.assertEqual(a.execute('{"answer":774}')[1],'failure')
        a=AgentTools();self.assertIsNone(a.execute('{"tool":"lookup","arguments":{"table":"orders"}}')[1]);self.assertEqual(a.execute('{"answer":774}')[1],'partial')
    def test_agent_full_workflow_and_parallel_round(self):
        with server() as base,contextlib.redirect_stdout(io.StringIO()):
            rows,g=runner.round_jobs(base,'vLLM','test','agent-tools',8192,3,1,30)
        self.assertEqual(len(rows),3);self.assertTrue(all(r['status']=='complete' and r['toolCalls']==2 and len(r['requests'])==3 for r in rows))
        self.assertAlmostEqual(g['aggregateTps']*g['wallMs']/1000,180)
        self.assertTrue(all(r['elapsedMs']<=g['wallMs'] for r in rows))
    def test_failures_do_not_disappear_from_round(self):
        with server('broken') as base,contextlib.redirect_stdout(io.StringIO()):rows,g=runner.round_jobs(base,'vLLM','test','short-chat',4096,3,1,30)
        self.assertEqual(len(rows),3);self.assertTrue(all(r['status']=='error' for r in rows));self.assertEqual(g['aggregateTps'],0)
    def test_ollama_nanoseconds_and_cached_prefill(self):
        with server() as base:m,_=runner.stream(base,'Ollama','test',[{'role':'user','content':'fixture'}],512,4096)
        self.assertEqual(m['decodeTps'],1000);self.assertEqual(m['prefillTps'],280);self.assertEqual(m['cachedTokens'],2)
        with server('unknown-cache') as base:m,_=runner.stream(base,'Ollama','test',[{'role':'user','content':'fixture'}],512,4096)
        self.assertIsNone(m['prefillTps']);self.assertIsNone(m['cachedTokens'])

    def test_pro_authorization_precedes_loading_or_measurement(self):
        options=runner.parser().parse_args(['--engine','vLLM','--endpoint','http://127.0.0.1:80','--model','test','--jobs','4','--output','/tmp/not-written.json'])
        with patch.object(sys,'stdin',io.StringIO('')),patch.object(runner,'detect_hardware') as hw,contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(ValueError):runner.run(options)
            hw.assert_not_called()
    def test_cancellation_does_not_write_success(self):
        runner.CANCEL.set()
        with self.assertRaises(runner.MeasurementError):runner.measure_job('http://127.0.0.1:1','vLLM','x','short-chat',4096,1,1,1)
    def test_profile_prompt_hashes_differ(self):
        from workload_core import fingerprint
        self.assertEqual(len(set(fingerprint(p) for p in PROFILES)),7)

if __name__=='__main__':unittest.main()
