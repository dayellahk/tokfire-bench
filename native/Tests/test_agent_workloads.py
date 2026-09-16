"""Controlled fixtures test the harness. Their timings are never benchmark evidence."""
import contextlib,csv,io,json,re,sys,tempfile,time,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'Sources/LocalAIBench/Resources'))
from agent_workloads import AgentWorkload,SIM_PROFILES,CHECKS
import workload_runner as runner

def action(tool,**arguments):return json.dumps({'tool':tool,'arguments':arguments})
def responses(messages):return [json.loads(m['content'][13:].split('. Return the next JSON')[0]) for m in messages if m['content'].startswith('Tool result: ')]
def oracle(profile,messages):
    results=responses(messages);n=len(results)
    if profile=='agent-data':
        if n==0:return action('read_file',path='orders.csv')
        if n==1:
            rows=list(csv.DictReader(io.StringIO(results[0]['content'])));included=[r for r in rows if r['status']!='cancelled' and r['quantity']]
            totals={region:sum(int(r['quantity'])*int(r['unit_cents']) for r in included if r['region']==region) for region in ['East','West']}
            return action('write_json',path='result.json',data={'total_cents':sum(totals.values()),'included_rows':len(included),'excluded_rows':len(rows)-len(included),'by_region':totals})
    elif profile=='agent-research':
        if n<3:return action('fetch_page',page=['alpha','beta','gamma'][n])
        if n==3:
            evidence=[{'page':r['page'],**{k:int(v) for k,v in re.findall(r'<p>(\w+): (\d+)</p>',r['html'])}} for r in results]
            selected=min((v for v in evidence if v['ram_gb']>=16 and v['jobs']>=3),key=lambda v:v['monthly_cents'])
            return action('write_json',path='result.json',data={'selected':selected['page'],'monthly_cents':selected['monthly_cents'],'evidence':evidence})
    else:
        if n==0:return action('read_file',path='request.json')
        request=json.loads(results[0]['content'])
        if n<=2:return action('inventory',sku=request['sku'])
        if n<=4:return action('reserve',sku=request['sku'],quantity=request['quantity'],idempotency_key=request['request_id'])
        if n==5:return action('receipt',idempotency_key=request['request_id'])
        if n==6:return action('write_json',path='result.json',data=results[-1])
    return '{"done":true}'

class AgentSimulations(unittest.TestCase):
    def test_real_artifacts_and_state_across_variants(self):
        for profile in SIM_PROFILES:
            for seed in ['one','two','three']:
                agent=AgentWorkload(profile,seed);root=agent.root;messages=[]
                try:
                    for step in range(12):
                        reply,outcome=agent.execute(oracle(profile,messages))
                        if outcome:
                            self.assertEqual(outcome,'complete');break
                        messages.append({'content':'Tool result: '+json.dumps(reply)+'. Return the next JSON'})
                    else:self.fail('task exceeded step budget')
                    self.assertTrue(all(c['passed'] for c in agent.evidence()['checks']))
                    self.assertTrue((root/'result.json').exists())
                    self.assertEqual(agent.errors,0)
                    if profile=='agent-recovery':self.assertEqual(agent.retries,2);self.assertEqual(len(agent.reservations),1)
                finally:agent.close()
                self.assertFalse(root.exists())
    def test_claimed_completion_and_wrong_artifact_never_pass(self):
        for profile in SIM_PROFILES:
            agent=AgentWorkload(profile)
            try:
                self.assertEqual(agent.execute('{"done":true}')[1],'failure')
                agent.execute(action('write_json',path='result.json',data={'total_cents':True,'evidence':[{'page':1},{'page':'alpha'}]}))
                self.assertNotEqual(agent.execute('{"done":true}')[1],'complete')
                self.assertFalse(all(c['passed'] for c in agent.evidence()['checks']))
            finally:agent.close()
    def test_only_allowlisted_tools_files_and_writes(self):
        agent=AgentWorkload('agent-data')
        try:
            for content in ['not json','[]',action('shell',command='id'),action('read_file',path='../orders.csv'),action('read_file',path='/etc/passwd'),action('write_json',path='../escape.json',data={})]:
                result,outcome=agent.execute(content);self.assertEqual(result['error'],'invalid-tool-or-arguments');self.assertIsNone(outcome)
            self.assertEqual(agent.errors,6);self.assertEqual(agent.calls,6)
            self.assertFalse((agent.root.parent/'escape.json').exists())
        finally:agent.close()
    def test_nonce_variants_and_job_isolation(self):
        a,b=AgentWorkload('agent-data','a'),AgentWorkload('agent-data','b')
        try:
            self.assertNotEqual(a.root,b.root);self.assertNotEqual(a.expected,b.expected)
            a.execute(action('write_json',path='result.json',data=a.expected));self.assertFalse((b.root/'result.json').exists())
        finally:a.close();b.close()
    def test_parallel_runner_emits_verified_results_without_content(self):
        runner.CANCEL.clear()
        for profile in SIM_PROFILES:
            def stream(base,engine,model,messages,max_tokens,context,timeout):
                content=oracle(profile,messages);time.sleep(.003)
                return {'inputTokens':100,'outputTokens':20,'ttftMs':.5,'firstVisibleMs':.6,'elapsedMs':1,'decodeTps':None,'prefillTps':None,'streamTps':None,'endToEndTps':20000,'cachedTokens':0,'finishReason':'stop'},content
            with patch.object(runner,'stream',side_effect=stream),contextlib.redirect_stdout(io.StringIO()):
                rows,group=runner.round_jobs('http://localhost:1','vLLM','fixture',profile,8192,3,1,30)
            self.assertEqual(len(rows),3);self.assertTrue(all(r['status']=='complete' for r in rows))
            for row in rows:
                self.assertTrue(all(c['passed'] for c in row['verification']['checks']));self.assertLess(row['elapsedMs'],group['wallMs'])
                self.assertEqual(set(row['verification']),{'suite','checks','retries'})
                self.assertNotIn('content',json.dumps(row));self.assertNotIn('/tokfire-agent-',json.dumps(row))
    def test_timeout_preserves_failed_task_evidence_and_cleans_workspace(self):
        runner.CANCEL.clear();roots=[]
        class Observed(AgentWorkload):
            def __init__(self,*args,**kwargs):super().__init__(*args,**kwargs);roots.append(self.root)
        with patch.object(runner,'AgentWorkload',Observed),patch.object(runner,'stream',side_effect=runner.MeasurementError('timeout')):
            result=runner.measure_job('http://localhost:1','vLLM','fixture','agent-data',8192,1,1,1)
        self.assertEqual(result['status'],'error');self.assertEqual(result['errorCode'],'timeout');self.assertEqual(len(result['verification']['checks']),5)
        self.assertTrue(all(not p.exists() for p in roots))

if __name__=='__main__':unittest.main()
