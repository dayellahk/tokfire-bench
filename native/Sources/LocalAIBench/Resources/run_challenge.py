"""Server-issued cache-busting request identifiers; not hardware attestation."""
import hashlib
import json
import time
import uuid
from pathlib import Path


def load_ticket(path, config):
    if not path:
        return None
    ticket = json.loads(Path(path).read_text(encoding='utf-8'))
    for key in ('id', 'runId'):
        uuid.UUID(ticket[key])
    nonce = ticket['nonce']
    if len(nonce) != 64 or any(c not in '0123456789abcdef' for c in nonce):
        raise ValueError('Invalid challenge nonce')
    if ticket['config'] != config or time.time()*1000 > ticket['expiresAt']:
        raise ValueError('Challenge expired or test configuration changed. Start the test again.')
    return ticket


def request_id(ticket, count, repeat, job):
    return f"{ticket['nonce']}:{ticket['runId']}:{count}:{repeat}:{job}" if ticket else str(uuid.uuid4())


def evidence(ticket):
    cfg = ticket['config']
    identifiers = [request_id(ticket, n, r, j) for n in cfg['concurrencyLevels']
                   for r in range(1, cfg['repeats']+1) for j in range(1, n+1)]
    return {'id': ticket['id'], 'nonce': ticket['nonce'],
            'requestDigest': hashlib.sha256('\n'.join(identifiers).encode()).hexdigest()}
