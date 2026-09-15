import importlib.util,json,sys,threading,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'Sources/LocalAIBench/Resources'))
import omlx_runner as runner
class Response:
    headers={'Content-Type':'text/event-stream'}
    def __init__(self,usage,done=True):self.usage=usage;self.done=done
    def __enter__(self):return self
    def __exit__(self,*args):pass
    def __iter__(self):
        yield b'data: '+json.dumps({'choices':[{'text':'visible','finish_reason':'length'}]}).encode()
        yield b'data: '+json.dumps({'usage':self.usage}).encode()
        if self.done:yield b'data: [DONE]'
class OMLXTests(unittest.TestCase):
    def setUp(self):self.original=runner.request
    def tearDown(self):runner.request=self.original
    def usage(self):return {'completion_tokens':128,'prompt_tokens':780,'prompt_tokens_details':{'cached_tokens':0},'generation_tokens_per_second':100,'prompt_tokens_per_second':400}
    def test_counts_come_from_usage_not_sse_chunks(self):
        runner.request=lambda *a,**k:Response(self.usage());row=runner.measure('http://localhost','model',1,1,1)
        self.assertEqual(row['outputTokens'],128);self.assertEqual(row['decodeTps'],100)
    def test_missing_usage_cache_and_incomplete_stream_fail(self):
        for mutation,done in [(lambda u:u.pop('generation_tokens_per_second'),True),(lambda u:u['prompt_tokens_details'].update(cached_tokens=10),True),(lambda u:None,False)]:
            usage=self.usage();mutation(usage);runner.request=lambda *a,**k:Response(usage,done)
            with self.assertRaises(ValueError):runner.measure('http://localhost','model',1,1,1)
    def test_three_requests_really_overlap(self):
        lock=threading.Lock();count=0;barrier=threading.Barrier(3)
        def request(*a,**k):
            nonlocal count
            with lock:count+=1
            barrier.wait(timeout=3);return Response(self.usage())
        runner.request=request
        with runner.concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            rows=list(pool.map(lambda u:runner.measure('http://localhost','m',3,1,u),[1,2,3]))
        self.assertEqual(count,3);self.assertEqual(len(rows),3)
if __name__=='__main__':unittest.main()
