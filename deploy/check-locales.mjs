import assert from 'node:assert/strict';
const origin=process.env.TEST_ORIGIN??'https://tokfires.com';
for(const [lang,prefix,heading] of [['en','','Big intelligence.'],['zh-Hant','/zh-Hant','強大智能，'],['zh-Hans','/zh-Hans','强大智能，']]){
 for(const page of ['','/methodology','/signin','/native-connect']){
  const url=origin+(prefix+page||'/');const response=await fetch(url);assert.equal(response.status,200,url);
  const html=(await response.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  assert(html.includes(`lang="${lang}"`),`${url}: document language`);
  const canonical=html.match(/rel="canonical" href="([^"]+)"/)?.[1];assert.equal(new URL(canonical).href,new URL(url).href,`${url}: canonical URL`);
  for(const alt of ['en','zh-Hant','zh-Hans'])assert(html.includes(`hrefLang="${alt}"`)||html.includes(`hreflang="${alt}"`),`${url}: ${alt} alternate`);
  if(!page)assert(html.includes(heading),`${url}: translated heading`);
  if(page==='/signin'||page==='/native-connect')assert(/name="robots" content="[^"]*noindex/.test(html),`${url}: private route noindex`);
 }
}
const sitemap=await fetch(origin+'/sitemap.xml');assert.equal(sitemap.status,200);assert((sitemap.headers.get('content-type')||'').includes('xml'));const xml=await sitemap.text();assert.equal((xml.match(/<loc>/g)||[]).length,27);assert(xml.includes('hreflang="zh-Hant"'));assert(!xml.includes('/signin'));
const robots=await fetch(origin+'/robots.txt');assert.equal(robots.status,200);const text=await robots.text();assert(text.includes('Sitemap: '+origin+'/sitemap.xml'));assert(text.includes('Disallow: /api/'));
for(const route of ['/references','/zh-Hant/references','/zh-Hans/references','/api/v1/references'])assert.equal((await fetch(origin+route)).status,404,route);
assert(!xml.includes('/references'));
const invalid=await fetch(origin+'/zh-Hant/not-a-page');assert.equal(invalid.status,404);
console.log('PASS: 12 translated routes, document languages, canonical/hreflang, private noindex, 27 sitemap URLs, robots and 404');
