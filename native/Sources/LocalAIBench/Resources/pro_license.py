"""Lemon Squeezy License API. No seller API token or customer identity is stored."""
import json, urllib.request, urllib.parse, urllib.error, uuid
from pathlib import Path

def config():
    return json.loads(Path(__file__).with_name('lemon-squeezy.json').read_text())

def validate_response(value, cfg, credential):
    license=value.get('license_key',{});meta=value.get('meta',{});instance=value.get('instance') or {}
    if (value.get('valid') is not True or value.get('error') is not None
        or license.get('status') != 'active' or license.get('key') != credential['key']
        or 'expires_at' not in license or license['expires_at'] is not None
        or instance.get('id') != credential['instanceID']):
        raise ValueError('An active perpetual Pro license instance is required.')
    for field,setting in [('store_id','storeId'),('product_id','productId'),('variant_id','variantId')]:
        expected=cfg.get(setting)
        if type(expected) is not int or expected<=0 or type(meta.get(field)) is not int or meta[field]!=expected:
            raise ValueError('This license is not for TokFire Bench Pro.')
    return True

def verify_license(serialized):
    cfg=config()
    if any(type(cfg.get(k)) is not int or cfg[k]<=0 for k in ['storeId','productId','variantId']):
        raise ValueError('Lemon Squeezy Pro product is not configured in this build.')
    credential=json.loads(serialized)
    try: uuid.UUID(credential['key']);uuid.UUID(credential['instanceID'])
    except (KeyError,ValueError,TypeError):raise ValueError('Invalid Pro activation.') from None
    body=urllib.parse.urlencode({'license_key':credential['key'],'instance_id':credential['instanceID']}).encode()
    req=urllib.request.Request('https://api.lemonsqueezy.com/v1/licenses/validate',body,headers={'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'})
    try:
        with urllib.request.urlopen(req,timeout=20) as response:
            raw=response.read(65537)
            if len(raw)>65536:raise ValueError('Invalid license response.')
            return validate_response(json.loads(raw),cfg,credential)
    except (urllib.error.URLError,TimeoutError):
        raise ValueError('Unable to verify Pro with Lemon Squeezy. Check your activation and internet connection.') from None

def authorize(count, key=None):
    if type(count) is not int or not 1<=count<=20:raise ValueError('Select 1–20 concurrent jobs.')
    if count>3:
        if not key:raise ValueError('More than three jobs requires a Lemon Squeezy Pro license.')
        verify_license(key)
