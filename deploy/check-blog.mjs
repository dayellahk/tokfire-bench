import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const origin=process.env.TEST_ORIGIN||'https://tokfires.com';
const {posts}=JSON.parse(await readFile(new URL('../lib/blog-posts.json',import.meta.url),'utf8'));
assert.equal(posts.length,6);assert.equal(new Set(posts.map(p=>p.slug)).size,6);
for(const locale of ['en','zh-Hant','zh-Hans']){
 const prefix=locale==='en'?'':'/'+locale;
 for(const post of [null,...posts]){
  const path=prefix+'/blog'+(post?'/'+post.slug:'');
  const response=await fetch(origin+path);assert.equal(response.status,200,path);
  const html=(await response.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  assert(html.includes('lang="'+locale+'"'),path+' language');
  assert(html.includes('rel="canonical" href="https://tokfires.com'+path+'"'),path+' canonical');
  assert(html.includes('hrefLang="zh-Hant"')||html.includes('hreflang="zh-Hant"'),path+' alternate');
  if(post){
   assert(html.includes(post.title[locale]),path+' translated heading');
   assert(html.includes('https://schema.org/BlogPosting'),path+' article schema');
   for(const s of post.sections){assert(html.includes('id="'+s.id+'"'),path+' section '+s.id);assert(s.body[locale].length>0);}
   for(const key of ['title','dek','outcome'])assert.notEqual(post[key]['zh-Hant'],post[key].en);
   if(post.example){assert.equal(post.example,await readFile(new URL('../public'+post.download,import.meta.url),'utf8'));assert.equal((await fetch(origin+post.download)).status,200);}
  }else for(const p of posts)assert(html.includes(prefix+'/blog/'+p.slug),path+' article link');
 }
 assert.equal((await fetch(origin+prefix+'/blog/missing-post')).status,404);
}
console.log('PASS: 21 blog pages, localized content, canonical/hreflang, article schema, downloads and missing-article 404s');
