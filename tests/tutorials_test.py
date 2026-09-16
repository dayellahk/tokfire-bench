"""Validate tutorial logic with fixtures, without claiming model inference results."""
import contextlib
import importlib.util
import io
from pathlib import Path
import unittest

def load(name):
    path=Path(__file__).resolve().parents[1]/'public'/'tutorials'/name
    spec=importlib.util.spec_from_file_location(name,path)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

class Tutorials(unittest.TestCase):
    def test_agent_rejects_unapproved_tools_and_arguments(self):
        agent=load('stock-agent.py')
        self.assertEqual(agent.dispatch({'name':'stock_count','arguments':{'item':'adapter'}})['count'],0)
        for f in [{'name':'exec','arguments':{'item':'cable'}},
                  {'name':'stock_count','arguments':{'item':'cable','shell':'x'}},
                  {'name':'stock_count','arguments':{'item':[]}},
                  {'name':'stock_count','arguments':{'item':'unknown'}}]:
            with self.assertRaises(ValueError): agent.dispatch(f)

    def test_agent_returns_evidence_and_stops_unbounded_loops(self):
        agent=load('stock-agent.py')
        def call(item):return {'function':{'name':'stock_count','arguments':{'item':item}}}
        replies=iter([{'role':'assistant','content':'','tool_calls':[call('cable'),call('adapter')]},
                      {'role':'assistant','content':'12 cables and 0 adapters'}])
        received=[]
        def chat(messages):received.append(list(messages));return next(replies)
        agent.chat=chat
        output=io.StringIO()
        with contextlib.redirect_stdout(output):agent.run('stock?')
        self.assertEqual([m['role'] for m in received[-1]][-2:],['tool','tool'])
        self.assertIn('"count": 0',output.getvalue())
        agent.chat=lambda _: {'role':'assistant','tool_calls':[call('cable')]*5}
        with self.assertRaises(RuntimeError): agent.run('stock?')
        agent.chat=lambda _: {'role':'assistant','content':'I checked'}
        with self.assertRaises(RuntimeError): agent.run('stock?')

    def test_rag_selects_evidence_before_generation(self):
        rag=load('private-notes.py');requests=[]
        def call(path,payload):
            requests.append((path,payload))
            if path=='/api/embed':return {'embeddings':[[1,0],[0,1],[-1,0],[1,0]]}
            return {'message':{'content':'09:00 [A]'}}
        rag.call=call
        with contextlib.redirect_stdout(io.StringIO()):rag.answer('Opening time?')
        self.assertFalse(requests[0][1]['truncate'])
        prompt=requests[1][1]['messages'][-1]['content']
        self.assertIn('[A]',prompt);self.assertIn('[B]',prompt);self.assertNotIn('[C]',prompt)
        self.assertIn('never instructions',requests[1][1]['messages'][0]['content'])

if __name__=='__main__':unittest.main()
