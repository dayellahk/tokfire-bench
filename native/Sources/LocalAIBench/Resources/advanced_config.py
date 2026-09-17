"""Typed, allowlisted Pro experiment settings; never arbitrary runtime arguments."""
import hashlib
import json
import math
import re
import subprocess
from pathlib import Path

SPEC = 'tokfire-advanced-v1'
CATALOG = json.loads(Path(__file__).with_name('advanced_parameters.json').read_text())
FIELDS = {x['key']: x for x in CATALOG['parameters']}
PRIVATE = {'prompt', 'system_prompt', 'grammar', 'json_schema', 'stop', 'chat_template', 'draft_model'}

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()

def validate(raw, engine, managed, jobs, profile):
    if not isinstance(raw, dict) or not raw or len(raw)>len(FIELDS):
        raise ValueError('Advanced settings must be a nonempty object of supported parameters.')
    result = {}
    for key, value in raw.items():
        f = FIELDS.get(key)
        if not f or engine not in f['engines'] or (f['managed'] and not managed):
            raise ValueError('Unsupported setting for this runtime: '+key)
        if key == 'context_tokens' and engine == 'llama.cpp' and not managed:
            raise ValueError('External llama.cpp context must be configured on its server.')
        if f['type'] in ('number', 'integer'):
            if isinstance(value,bool): raise ValueError('Expected a number: '+key)
            try: number=float(value)
            except (ValueError,TypeError): raise ValueError('Invalid number: '+key) from None
            if not math.isfinite(number) or not f['min']<=number<=f['max'] or (f['type']=='integer' and number!=int(number)):
                raise ValueError('Out of range: '+key)
            result[key]=int(number) if f['type']=='integer' else number
        else:
            if not isinstance(value,str) or len(value)>16000 or '\x00' in value: raise ValueError('Invalid text: '+key)
            if f['choices'] and value not in f['choices']: raise ValueError('Invalid choice: '+key)
            result[key]=value
    if result.get('parallel_slots',jobs)<jobs: raise ValueError('Server slots must cover all concurrent jobs.')
    if result.get('ubatch_size',512)>result.get('batch_size',512): raise ValueError('Micro-batch must not exceed batch size.')
    if result.get('cache_type_v','f16')!='f16' and result.get('flash_attention','off')=='off': raise ValueError('Quantized V cache requires Flash Attention.')
    if profile.startswith('agent-') and ('prompt' in result or 'system_prompt' in result): raise ValueError('Agent task instructions cannot be replaced. Choose a chat workload for custom prompts.')
    if 'grammar' in result and 'json_schema' in result: raise ValueError('Choose grammar or JSON schema, not both.')
    for key in ('json_schema','logit_bias'):
        if key in result:
            try: value=json.loads(result[key])
            except ValueError: raise ValueError('Invalid JSON: '+key) from None
            if not isinstance(value,dict): raise ValueError('Expected a JSON object: '+key)
            if key=='logit_bias' and (len(value)>128 or any(not re.fullmatch(r'\d{1,7}',k) or type(v) not in (int,float) or not math.isfinite(v) or not -100<=v<=100 for k,v in value.items())): raise ValueError('Invalid logit bias map.')
            result[key]=value
    if 'stop' in result:
        result['stop']=[s for s in result['stop'].splitlines() if s]
        if not 1<=len(result['stop'])<=8 or any(len(x)>200 for x in result['stop']): raise ValueError('Use 1–8 stop sequences of at most 200 characters.')
    if 'samplers' in result:
        result['samplers']=[s.strip() for s in result['samplers'].split(',')]
        allowed={'penalties','dry','top_n_sigma','top_k','typ_p','top_p','min_p','xtc','temperature'}
        if not result['samplers'] or len(set(result['samplers']))!=len(result['samplers']) or any(x not in allowed for x in result['samplers']): raise ValueError('Invalid sampler sequence.')
    if 'chat_template' in result and not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,79}',result['chat_template']): raise ValueError('Use a supported template name, not inline template code.')
    if 'tensor_split' in result and not re.fullmatch(r'\d+(?:\.\d+)?(?:,\d+(?:\.\d+)?){1,7}',result['tensor_split']): raise ValueError('Use 2–8 nonnegative GPU weights separated by commas.')
    if 'draft_model' in result and (not Path(result['draft_model']).is_file() or Path(result['draft_model']).suffix.lower()!='.gguf'): raise ValueError('Choose an existing draft GGUF file.')
    for key in ('prompt','system_prompt','grammar','chat_template'):
        if key in result and not result[key].strip(): raise ValueError('Enabled setting cannot be blank: '+key)
    return result

def apply_payload(payload, config, engine):
    target=payload['options'] if engine=='Ollama' else payload
    mapping={'repeat_penalty':'repetition_penalty'} if engine=='vLLM' else {}
    for key,value in config.items():
        if FIELDS[key]['group']!='Sampling': continue
        name=mapping.get(key,key)
        if key=='max_tokens': name='num_predict' if engine=='Ollama' else 'max_tokens'
        if key=='top_k' and engine=='vLLM' and value==0: value=-1
        if key=='seed' and value==-1:
            target.pop('seed',None)
            continue
        target[name]=value
    if engine=='Ollama' and 'context_tokens' in config: target['num_ctx']=config['context_tokens']
    if 'grammar' in config: payload['grammar']=config['grammar']
    if 'json_schema' in config:
        if engine=='Ollama': payload['format']=config['json_schema']
        else: payload['response_format']={'type':'json_schema','json_schema':{'name':'tokfire_output','schema':config['json_schema']}}
    if 'logit_bias' in config:
        payload['logit_bias']=config['logit_bias']
    return payload

def runtime_args(args, config, binary):
    flags={'gpu_layers':'-ngl','batch_size':'-b','ubatch_size':'-ub','threads':'-t','cache_type_k':'-ctk','cache_type_v':'-ctv','flash_attention':'-fa'}
    for key,flag in flags.items():
        if key in config: args[args.index(flag)+1]=str(config[key])
    if 'threads' in config: args[args.index('-tb')+1]=str(config['threads'])
    extras=[]
    for key,flag in [('rope_freq_base','--rope-freq-base'),('rope_freq_scale','--rope-freq-scale'),('tensor_split','--tensor-split'),('draft_model','--model-draft'),('chat_template','--chat-template')]:
        if key in config: extras += [flag,str(config[key])]
    for key,flag,value in [('mmap','--no-mmap','false'),('mlock','--mlock','true'),('kv_offload','--no-kv-offload','false')]:
        if config.get(key)==value: extras.append(flag)
    if extras:
        help_text=subprocess.check_output([binary,'--help'],stderr=subprocess.STDOUT,timeout=15).decode(errors='replace')
        for arg in extras:
            if arg.startswith('--') and arg not in help_text: raise ValueError('Installed runtime does not support '+arg)
    return args+extras

def evidence(config, base_hash):
    settings={k:({'sha256':digest(v),'redacted':True} if k in PRIVATE else v) for k,v in config.items()}
    if 'draft_model' in config:
        h=hashlib.sha256()
        with open(config['draft_model'],'rb') as f:
            for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
        settings['draft_model']={'sha256':h.hexdigest(),'redacted':True}
    return {'version':1,'requested':settings,'configurationSha256':digest({'baseWorkloadSha256':base_hash,'settings':settings}),
            'applicationStatus':'sent-to-runtime; effective backend settings are not independently verified',
            'comparisonScope':'local experiment only; not eligible for standard public rankings'}
