import assert from 'node:assert/strict';
const origin=process.env.TEST_ORIGIN ?? 'https://tokfires.com';
const page=await fetch(origin);
assert.equal(page.status,200,'Homepage must load');
const html=await page.text();
const assets=[...new Set([...html.matchAll(/(?:href|src)="([^\"]+)"/g)].map(x=>x[1]))].filter(p=>p.startsWith('/_next/static/')||p==='/favicon.svg'||p==='/theme.js'||p.startsWith('/images/'));
assert(assets.includes('/images/tokfire-local-ai.jpg'),'Homepage hero image must be present');
assert(assets.some(p=>p.endsWith('.css')),'Homepage must reference a stylesheet');
assert(assets.some(p=>p.endsWith('.js')),'Homepage must reference JavaScript');
for(const path of assets){
 const response=await fetch(new URL(path,origin));
 assert.equal(response.status,200,`${path} must load`);
 const type=response.headers.get('content-type')??'';
 assert(type.includes(path.endsWith('.css')?'text/css':path.endsWith('.js')?'javascript':path.endsWith('.jpg')?'image/jpeg':'image/svg+xml'),`${path} must have the correct content type`);
 await response.arrayBuffer();
}
console.log(`PASS: homepage and ${assets.length} CSS, JavaScript and icon assets`);
