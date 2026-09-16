"""Versioned, deterministic agent simulations. No model-generated code is executed.
Each job owns a private temporary directory; tools have explicit file/argument allowlists.
Only check outcomes and tool counts enter public reports, never document contents.
"""
import csv
import hashlib
import io
import json
import tempfile
from pathlib import Path

SUITE = 'tokfire-agent-sim-v1'
COMMON = ('Complete the task using the tools below. Each turn return exactly one JSON object, without markdown. '
          'Call a tool with {"tool":"name","arguments":{...}}. Tool results will be supplied to you. '
          'When finished return {"done":true}. Do not claim completion until you have produced the requested artifact. '
          'Tools: read_file {"path":"allowed filename"}; write_json {"path":"result.json","data":{...}}. '
          'You cannot use a shell or access other files. Output token budget is 768 per turn. ')
SIM_PROFILES = {
 'agent-data': {'label':'Agent simulation: CSV analysis', 'maxOutputTokens':768, 'contextTokens':8192,
   'prompt':COMMON+'Read orders.csv. Exclude rows whose status is cancelled or whose quantity is blank. '
   'Calculate quantity * unit_cents for each remaining row. Write result.json containing exactly '
   '{"total_cents":integer,"included_rows":integer,"excluded_rows":integer,"by_region":{"East":integer,"West":integer}}. '
   'All money values are integer cents. You must actually read the file and write the report.'},
 'agent-research': {'label':'Agent simulation: multi-page research', 'maxOutputTokens':768, 'contextTokens':8192,
   'prompt':COMMON+'Additional tool: fetch_page {"page":"alpha"|"beta"|"gamma"}, which reads a fixed local HTML snapshot, not the live web. '
   'Compare all three plans for exactly 3 concurrent jobs and at least 16 GB RAM. Prices are in cents per month. '
   'Fetch all three pages, pick the cheapest qualifying plan, and write result.json with exactly '
   '{"selected":"plan id","monthly_cents":integer,"evidence":[{"page":"plan id","ram_gb":integer,"jobs":integer,"monthly_cents":integer},...]}. '
   'Include evidence for all three pages; use their actual values, not guessed prices.'},
 'agent-recovery': {'label':'Agent simulation: retry and idempotency', 'maxOutputTokens':768, 'contextTokens':8192,
   'prompt':COMMON+'Read request.json. Additional tools: inventory {"sku":"item id"}; '
   'reserve {"sku":"item id","quantity":integer,"idempotency_key":"request id"}; receipt {"idempotency_key":"request id"}. '
   'Reserve exactly the requested quantity. A service may return a retryable error; retry with identical arguments. '
   'If reserve times out, it may already have committed: retry using the same idempotency key to avoid a duplicate. '
   'Check receipt after reserving. Write result.json with exactly {"request_id":"id","reserved":integer,"remaining":integer}. '
   'The reservation must exist in the service; writing a claimed result alone does not complete the task.'},
}
CHECKS = {
 'agent-data': ['source-read','artifact-written','row-filter','total-cents','region-totals'],
 'agent-research': ['all-pages-read','artifact-written','eligible-cheapest','source-evidence'],
 'agent-recovery': ['request-read','transient-retried','reservation-once','receipt-read','artifact-correct'],
}

class AgentWorkload:
    def __init__(self, profile, seed='fixture'):
        self.profile = profile
        self.tmp = tempfile.TemporaryDirectory(prefix='tokfire-agent-')
        self.root = Path(self.tmp.name)
        self.calls = self.errors = self.retries = self.stage = 0
        self.reads = set(); self.pages_read = set(); self.written = False
        self.inventory_attempts = self.reserve_attempts = 0
        self.reservations = {}; self.receipt_read = False
        n = int(hashlib.sha256(str(seed).encode()).hexdigest()[:8],16)
        if profile == 'agent-data':
            rows = [('East',2,100+n%71,'paid'),('West',3,230+n%53,'paid'),
                    ('East',1,499+n%31,'paid'),('West',4,111,'cancelled'),('East','',700,'paid')]
            out=io.StringIO();writer=csv.writer(out);writer.writerow(['region','quantity','unit_cents','status']);writer.writerows(rows)
            (self.root/'orders.csv').write_text(out.getvalue(),encoding='utf-8')
            east=rows[0][1]*rows[0][2]+rows[2][1]*rows[2][2];west=rows[1][1]*rows[1][2]
            self.expected={'total_cents':east+west,'included_rows':3,'excluded_rows':2,'by_region':{'East':east,'West':west}}
        elif profile == 'agent-research':
            # Rotate which plan is eligible/cheapest; a constant guessed ID cannot pass.
            ids=['alpha','beta','gamma'];shift=n%3
            specs=[(8,1,500+n%99),(16,3,1500+n%137),(32,4,2500+n%149)]
            self.pages={ids[(i+shift)%3]:{'ram_gb':ram,'jobs':jobs,'monthly_cents':price} for i,(ram,jobs,price) in enumerate(specs)}
            for name,values in self.pages.items():
                (self.root/(name+'.html')).write_text('<html><body><h1>'+name+'</h1>'+''.join('<p>'+k+': '+str(v)+'</p>' for k,v in values.items())+'</body></html>',encoding='utf-8')
            self.selected=min((key for key,v in self.pages.items() if v['ram_gb']>=16 and v['jobs']>=3),key=lambda key:self.pages[key]['monthly_cents'])
        elif profile == 'agent-recovery':
            self.request={'request_id':'req-'+format(n,'08x'),'sku':'local-kit','quantity':2+n%3}
            self.stock=15+n%5;self.initial_stock=self.stock
            (self.root/'request.json').write_text(json.dumps(self.request),encoding='utf-8')
        else:
            self.close();raise ValueError('Unknown agent simulation')

    def close(self): self.tmp.cleanup()

    def checks(self):
        try: artifact=json.loads((self.root/'result.json').read_text(encoding='utf-8'))
        except (OSError,ValueError): artifact=None
        data=artifact if isinstance(artifact,dict) else {}
        # Compare JSON encodings to distinguish booleans from integer answers.
        same=lambda a,b:json.dumps(a,sort_keys=True)==json.dumps(b,sort_keys=True)
        if self.profile=='agent-data':
            flags=['orders.csv' in self.reads,self.written,
                   same([data.get('included_rows'),data.get('excluded_rows')],[3,2]),
                   same(data.get('total_cents'),self.expected['total_cents']),same(data.get('by_region'),self.expected['by_region'])]
            if set(data)!=set(self.expected):flags[1]=False
        elif self.profile=='agent-research':
            evidence=[{'page':k,**v} for k,v in sorted(self.pages.items())]
            got=data.get('evidence');got=sorted(got,key=lambda v:v.get('page','')) if isinstance(got,list) and all(isinstance(v,dict) and isinstance(v.get('page'),str) for v in got) else None
            flags=[self.pages_read==set(self.pages),self.written and set(data)=={'selected','monthly_cents','evidence'},
                   data.get('selected')==self.selected and same(data.get('monthly_cents'),self.pages[self.selected]['monthly_cents']),same(got,evidence)]
        else:
            expected={'request_id':self.request['request_id'],'reserved':self.request['quantity'],'remaining':self.initial_stock-self.request['quantity']}
            flags=['request.json' in self.reads,self.inventory_attempts>=2 and self.reserve_attempts>=2,
                   len(self.reservations)==1 and self.stock==expected['remaining'],self.receipt_read,self.written and same(data,expected)]
        return [{'id':key,'passed':bool(value)} for key,value in zip(CHECKS[self.profile],flags)]

    def evidence(self):
        return {'suite':SUITE,'checks':self.checks(),'retries':self.retries}

    def execute(self, content):
        self.calls+=1
        try:
            value=json.loads(content.strip())
            if not isinstance(value,dict):raise ValueError()
            if set(value)=={'done'} and value['done'] is True:
                self.calls-=1
                flags=self.checks()
                return None,'complete' if all(c['passed'] for c in flags) else 'partial' if any(c['passed'] for c in flags) else 'failure'
            if set(value)!={'tool','arguments'} or not isinstance(value['arguments'],dict):raise ValueError()
            name=value['tool'];args=value['arguments'];self.stage=1
            if name=='read_file' and set(args)=={'path'}:
                allowed={'agent-data':'orders.csv','agent-recovery':'request.json'}.get(self.profile)
                if not allowed or args['path']!=allowed:raise ValueError()
                self.reads.add(allowed)
                return {'content':(self.root/allowed).read_text(encoding='utf-8')},None
            if name=='write_json' and set(args)=={'path','data'} and args['path']=='result.json' and isinstance(args['data'],dict):
                text=json.dumps(args['data'],allow_nan=False)
                if len(text)>12000:raise ValueError()
                (self.root/'result.json').write_text(text,encoding='utf-8');self.written=True
                return {'written':True},None
            if self.profile=='agent-research' and name=='fetch_page' and set(args)=={'page'} and isinstance(args['page'],str) and args['page'] in self.pages:
                self.pages_read.add(args['page'])
                return {'page':args['page'],'html':(self.root/(args['page']+'.html')).read_text(encoding='utf-8')},None
            if self.profile=='agent-recovery':
                if name=='inventory' and args=={'sku':self.request['sku']}:
                    self.inventory_attempts+=1
                    if self.inventory_attempts==1:return {'error':'temporarily-unavailable','retryable':True},None
                    self.retries+=1
                    return {'available':self.stock},None
                if name=='reserve' and args=={'sku':self.request['sku'],'quantity':self.request['quantity'],'idempotency_key':self.request['request_id']} and type(args.get('quantity')) is int and self.inventory_attempts>=2:
                    self.reserve_attempts+=1
                    if not self.reservations:
                        self.stock-=args['quantity'];self.reservations[args['idempotency_key']]=args['quantity']
                        return {'error':'response-timeout','retryable':True,'commit_state':'unknown'},None
                    self.retries+=1
                    return {'reserved':self.reservations[args['idempotency_key']],'remaining':self.stock,'duplicate_prevented':True},None
                if name=='receipt' and args=={'idempotency_key':self.request['request_id']} and self.reservations:
                    self.receipt_read=True
                    return {'request_id':self.request['request_id'],'reserved':self.request['quantity'],'remaining':self.stock},None
            raise ValueError()
        except (ValueError,TypeError,KeyError,RecursionError):
            self.errors+=1
            return {'error':'invalid-tool-or-arguments','retryable':False},None
