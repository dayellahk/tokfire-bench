"""TokFire workload definitions and measured-data summaries (no runtime dependencies)."""
import hashlib
import json
import math
import statistics

VERSION = '0.7.0'
SPEC = 'tokfire-workloads-v1'
PROFILES = {
    'short-chat': {'label': 'Short Q&A', 'maxOutputTokens': 512, 'contextTokens': 4096,
                   'prompt': 'Explain how a small business can back up its files. Cover three practical steps, a recovery test, and common mistakes. Use clear examples.\n' +
                   'Context: A team of five uses laptops, shares invoices and product photos, works remotely twice a week, and has no dedicated IT employee. They need a simple process that they can check monthly.\n' * 6},
    'business': {'label': 'Business writing and translation', 'maxOutputTokens': 1024, 'contextTokens': 8192,
                 'prompt': 'Write a structured customer update in English, then translate it into Traditional Chinese. Include decisions, risks and next actions. Do not invent facts.\n' +
                 '\n'.join(f'Note {i}: The store is piloting local AI for invoice summaries. Staff review every draft. Customer records stay on the device. Delivery dates depend on supplier confirmation. The pilot uses three concurrent jobs and weekly quality checks.' for i in range(1, 21))},
    'long-summary': {'label': 'Long document summary', 'maxOutputTokens': 1536, 'contextTokens': 32768,
                     'prompt': 'Summarize the following operations log into decisions, recurring risks, and a prioritized action plan. Cite entry numbers and distinguish observations from recommendations.\n' +
                     '\n'.join(f'Entry {i}: The local AI pilot processes support drafts and inventory notes. Week {(i-1)//12+1}: staff review outputs before publication; no autonomous payments are allowed. Requests slow down when long documents arrive together. The team schedules backups, records incident counts, compares quality on a fixed rubric, and reviews memory capacity before adding a model. The next meeting will review the queue and revise the rollout plan.' for i in range(1, 141))},
    'agent-tools': {'label': 'Agent tool workflow (local fixture)', 'maxOutputTokens': 256, 'contextTokens': 8192,
                    'prompt': 'You are testing a local order workflow. Reply with exactly one JSON object per turn, without markdown. First call {"tool":"lookup","arguments":{"table":"orders"}}. Read its records, calculate each quantity * unit_price, then call {"tool":"sum","arguments":{"values":[the three line totals]}}. After receiving the sum, finish with {"answer":the total}. Do not invent tool results. Only lookup and sum exist.'},
}

def fingerprint(profile):
    return hashlib.sha256(json.dumps(PROFILES[profile], sort_keys=True, separators=(',', ':')).encode()).hexdigest()

def levels(maximum, sweep):
    if type(maximum) is not int or not 1 <= maximum <= 20:
        raise ValueError('Select 1–20 concurrent jobs.')
    return sorted(set([n for n in (1, 2, 3, 4, 8, 12, 16, 20) if n <= maximum] + [maximum])) if sweep else [maximum]

def percentile(values, p):
    """Nearest rank; never imply statistically reliable tails from a small sample."""
    values = sorted(x for x in values if x is not None)
    return values[max(0, math.ceil(len(values)*p)-1)] if values else None

def med(values):
    values = [v for v in values if v is not None]
    return statistics.median(values) if values else None

def summaries(report):
    result = []
    for count in report['settings']['concurrencyLevels']:
        rows = [s for s in report['models'][0]['samples'] if s['concurrency'] == count]
        requests = [r for s in rows for r in s['requests']]
        good = [s for s in rows if s['status'] == 'complete']
        speeds = [r['decodeTps'] for r in requests]
        waits = [r['ttftMs'] for r in requests]
        slow = min((x for x in speeds if x is not None), default=None)
        visible_waits = [r['firstVisibleMs'] for r in requests]
        longest = max((x for x in visible_waits if x is not None), default=None)
        full_visible = bool(requests) and all(x is not None for x in visible_waits)
        full_decode = bool(requests) and all(x is not None for x in speeds)
        reliable = len(rows) >= 100
        smooth = len(good) == len(rows) and full_decode and full_visible and slow >= 30 and longest <= 3000
        target = len(good) == len(rows) and full_decode and full_visible and slow >= report['settings']['targetTps'][0] and longest <= 3000
        result.append({'concurrency': count, 'samples': len(rows), 'complete': len(good),
                       'partial': sum(s['status'] == 'partial' for s in rows),
                       'failed': sum(s['status'] in ('failure', 'error') for s in rows),
                       'successRate': len(good)/len(rows), 'decodeTps': med(speeds), 'ttftMs': med(waits), 'firstVisibleMs': med(visible_waits),
                       'p95TtftMs': percentile(waits, .95), 'p99TtftMs': percentile(waits, .99),
                       'p95TaskMs': percentile([s['elapsedMs'] for s in rows], .95),
                       'p99TaskMs': percentile([s['elapsedMs'] for s in rows], .99),
                       'aggregateTps': med([g['aggregateTps'] for g in report['groups'] if g['concurrency'] == count]),
                       'tailReliable': reliable, 'smooth': smooth, 'targetMet': target})
    return result

def assessment(report):
    def fmt(value, unit=''):
        return 'unavailable' if value is None else f'{value:.1f}{unit}'
    lines = ['# TokFire Bench 0.7 — workload assessment', '',
             f"{report['hardware']['platform']} · {report['hardware']['chip']} · {report['runtime']['name']}",
             f"Workload: {PROFILES[report['settings']['workload']]['label']}",
             'One selected model; jobs call it concurrently. Warm-up requests are excluded.', '',
             '| Jobs | Complete / attempts | Decode tok/s¹ | Median first output ms | P95 / P99 task ms | Aggregate tok/s |',
             '|---|---|---|---|---|---|']
    rows = summaries(report)
    for row in rows:
        lines.append(f"| {row['concurrency']} | {row['complete']} / {row['samples']} | {fmt(row['decodeTps'])} | {fmt(row['ttftMs'])} | {fmt(row['p95TaskMs'])} / {fmt(row['p99TaskMs'])} | {fmt(row['aggregateTps'])} |")
        if row['failed'] or row['partial']:
            comment = 'Some jobs failed or completed only part of the tool workflow; inspect success rate before judging speed.'
        elif row['smooth']:
            comment = 'Meets the configured interactive guideline (every measured request ≥30 decode tok/s and first visible output ≤3 s).'
        elif row['decodeTps'] is None:
            comment = 'Server decode timing is unavailable. Use measured first-output and visible-output delay and end-to-end speed; decode comfort is unclassified.'
        else:
            comment = 'Below the interactive guideline in at least one request. Consider fewer jobs or a smaller model; long-context and agent tasks may be better suited to background work.'
        lines += ['', f"**{row['concurrency']} jobs:** {comment}",
                  'Median first visible output: ' + fmt(row['firstVisibleMs'], ' ms') + '.',
                  '100–200 tok/s comparison target: ' + ('every measured request meets the 100 tok/s lower bound.' if row['targetMet'] else 'not met by every measured request, or insufficient decode timing.'),
                  'P95/P99 use nearest rank; this sample is too small for an SLA or a stable tail-latency claim.' if not row['tailReliable'] else 'Tail percentiles describe this run only, not an SLA.']
    candidates = [r for r in rows if r['smooth']]
    lines += ['', ('Highest measured concurrency meeting the interactive guideline: ' + str(max(r['concurrency'] for r in candidates))) if candidates else 'No tested concurrency met the full interactive guideline.',
              '¹ Decode is reported only when supplied by the runtime. Client stream throughput and end-to-end throughput are separate metrics. Missing metrics remain null.',
              'Aggregate throughput is total output tokens divided by the measured wall time of the whole concurrent round, including failures and tool time. It is not per-job speed.',
              'Chat completion means a valid measured response, not a correct answer. Agent success is the deterministic lookup → sum → answer fixture, not Hermes/OpenClaw, browser automation, or general intelligence.',
              '100–200 tok/s is a user-selected target, not a guaranteed speed for any ChatGPT or Claude subscription.',
              'Prompt lengths are fixed text with a unique request prefix; actual tokens are runtime-counted. Different tokenizers and cache behavior belong to separate comparisons.',
              'No sustained thermal, energy, total GPU-memory, or synthetic llama-bench performance claim is made. Optional battery snapshots are observations, not energy measurements.']
    return '\n'.join(lines) + '\n'

class AgentTools:
    """Bounded in-memory fixture. Model output can never run code, files, or network tools."""
    def __init__(self):
        self.stage = 0
        self.calls = 0
        self.errors = 0

    def execute(self, content):
        try:
            value = json.loads(content.strip())
            if not isinstance(value, dict): raise ValueError()
            if set(value) == {'answer'}:
                return None, 'complete' if self.stage == 2 and type(value['answer']) in (int, float) and value['answer'] == 774 else ('partial' if self.stage else 'failure')
            self.calls += 1
            if set(value) != {'tool', 'arguments'}: raise ValueError()
            if self.stage == 0 and value == {'tool': 'lookup', 'arguments': {'table': 'orders'}}:
                self.stage = 1
                return {'records': [{'quantity': 2, 'unit_price': 129}, {'quantity': 1, 'unit_price': 249}, {'quantity': 3, 'unit_price': 89}]}, None
            if self.stage == 1 and value.get('tool') == 'sum' and value.get('arguments') == {'values': [258, 249, 267]}:
                # Require numeric types: True compares equal to 1 in Python.
                if any(type(x) not in (int, float) for x in value['arguments']['values']): raise ValueError()
                self.stage = 2
                return {'total': 774}, None
            raise ValueError()
        except (ValueError, TypeError, KeyError):
            self.errors += 1
            return None, 'partial' if self.stage else 'failure'
