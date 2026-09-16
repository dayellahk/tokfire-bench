"""Protocol integrity checks only; no fixture is a public benchmark."""
import hashlib, json, sys, tempfile, time, unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'Sources/LocalAIBench/Resources'))
import run_challenge as protocol
import workload_runner as runner

class ChallengeTests(unittest.TestCase):
    def ticket(self):
        return {'id':'10000000-0000-4000-8000-000000000001','runId':'10000000-0000-4000-8000-000000000002','nonce':'a'*64,
                'expiresAt':int(time.time()*1000)+60000,'config':{'workload':'short-chat','engine':'vLLM','model':'fixture','concurrencyLevels':[1,2],'repeats':3}}
    def test_expiry_config_and_nonce_checked_before_run(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'ticket.json';t=self.ticket();path.write_text(json.dumps(t));self.assertEqual(protocol.load_ticket(path,t['config']),t)
            with self.assertRaises(ValueError):protocol.load_ticket(path,{**t['config'],'repeats':5})
            t['expiresAt']=0;path.write_text(json.dumps(t))
            with self.assertRaises(ValueError):protocol.load_ticket(path,t['config'])
    def test_challenge_identifier_reaches_model_request(self):
        t=self.ticket();runner.CANCEL.clear()
        metrics={'firstVisibleMs':10}
        with patch.object(runner,'CHALLENGE',t),patch.object(runner,'stream',return_value=(metrics,'fixture')) as stream:
            result=runner.measure_job('http://127.0.0.1:1','vLLM','fixture','short-chat',4096,2,3,1)
        self.assertEqual(result['status'],'complete')
        self.assertTrue(stream.call_args.args[3][0]['content'].startswith('Run ID: '+protocol.request_id(t,2,3,1)+'\n'))
        identifiers=[protocol.request_id(t,n,r,j) for n in [1,2] for r in range(1,4) for j in range(1,n+1)]
        self.assertEqual(len(set(identifiers)),9)
        self.assertEqual(protocol.evidence(t)['requestDigest'],hashlib.sha256('\n'.join(identifiers).encode()).hexdigest())
    def test_agent_fixture_uses_server_nonce_and_rejects_canned_answer(self):
        from workload_core import AgentTools
        a=AgentTools('a'*64);records,_=a.execute('{"tool":"lookup","arguments":{"table":"orders"}}')
        self.assertEqual(records['records'][0]['unit_price'],270)
        result,_=a.execute(json.dumps({'tool':'sum','arguments':{'values':a.totals}}))
        self.assertNotEqual(result['total'],774)
        self.assertEqual(a.execute('{"answer":774}')[1],'partial')
        self.assertEqual(a.execute(json.dumps({'answer':a.total}))[1],'complete')
    def test_offline_prefixes_are_unique(self):
        self.assertNotEqual(protocol.request_id(None,1,1,1),protocol.request_id(None,1,1,1))

if __name__=='__main__':unittest.main()
