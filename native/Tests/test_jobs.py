import json,sys,tempfile,threading,time,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'Sources/LocalAIBench/Resources'))
import jobs_runner as runner
import pro_license

class JobsTests(unittest.TestCase):
    def test_twenty_jobs_overlap_with_stable_ids(self):
        inside=threading.Barrier(20)
        def measured(base,engine,tokens,count,repeat,job,barrier):
            barrier.wait(timeout=3);inside.wait(timeout=3)
            return {'outputTokens':128,'jobId':job,'concurrency':count,'repeat':repeat}
        with patch.object(runner,'measure_job',measured),patch.object(runner,'emit'):
            rows,group=runner.round_jobs([('base','oMLX',None)]*20,20,1)
        self.assertEqual(sorted(r['jobId'] for _,r in rows),list(range(1,21)))
        self.assertAlmostEqual(group['aggregateTps']*group['wallMs']/1000,2560)
    def test_failure_stops_servers_and_does_not_save_partial_report(self):
        def failed(*args):raise ValueError('request failed')
        with patch.object(runner,'measure_job',failed),patch.object(runner,'stop_all') as stop:
            with self.assertRaises(ValueError):runner.round_jobs([('base','oMLX',None)]*3,3,1)
            stop.assert_called_once()
    def test_free_limit_and_pro_enforcement(self):
        for n in (1,2,3):pro_license.authorize(n)
        for n in (0,21,True):
            with self.assertRaises(ValueError):pro_license.authorize(n)
        for n in (4,20):
            with self.assertRaises(ValueError):pro_license.authorize(n)
        with patch.object(pro_license,'verify_license',return_value=True) as verify:
            pro_license.authorize(20,'test-fixture-key');verify.assert_called_once_with('test-fixture-key')
    def test_same_model_weights_counted_once_but_each_job_adds_memory(self):
        with tempfile.TemporaryDirectory() as tmp:
            file=Path(tmp)/'test.gguf';file.write_bytes(b'GGUF1234')
            one,e1=runner.preflight([file], 'llama.cpp', 96*1024**3,1)
            three,e3=runner.preflight([file]*3,'llama.cpp',96*1024**3,3)
            self.assertEqual(len(three),1);self.assertEqual(e3-e1,1024**3)
            with self.assertRaises(ValueError):runner.preflight([file]*20,'llama.cpp',8*1024**3,20)
    def test_lemon_rejects_wrong_product_instance_disabled_and_expiring_license(self):
        cfg={'storeId':1,'productId':2,'variantId':3};credential={'key':'key','instanceID':'instance'}
        good={'valid':True,'error':None,'license_key':{'key':'key','status':'active','expires_at':None},'instance':{'id':'instance'},'meta':{'store_id':1,'product_id':2,'variant_id':3}}
        self.assertTrue(pro_license.validate_response(good,cfg,credential))
        for section,field,value in [('meta','product_id',9),('meta','variant_id',9),('meta','store_id',9),('license_key','status','disabled'),('license_key','status','inactive'),('license_key','expires_at','2027-01-01'),('instance','id','wrong')]:
            row=json.loads(json.dumps(good));row[section][field]=value
            with self.assertRaises(ValueError):pro_license.validate_response(row,cfg,credential)
        good['valid']=False
        with self.assertRaises(ValueError):pro_license.validate_response(good,cfg,credential)

if __name__=='__main__':unittest.main()
