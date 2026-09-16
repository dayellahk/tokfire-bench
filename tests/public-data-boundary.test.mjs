import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GET,POST} from '../app/api/v1/references/route.ts';

test('retired reference endpoint returns no data for anonymous or authenticated callers',async()=>{
 for(const handler of [GET,POST]){
  const r=await handler();assert.equal(r.status,404);assert.equal(r.headers.get('cache-control'),'no-store');
  assert.deepEqual(await r.json(),{error:'Not found'});
 }
});
test('public comparison no longer fetches the private reference API',async()=>{
 const source=await readFile(new URL('../components/comparison-data.tsx',import.meta.url),'utf8');
 assert(!source.includes('/api/v1/references'));assert(!source.includes('sourceUrl'));assert(!source.includes('rowJson'));
 assert(source.includes('/api/v2/leaderboard'));
});
