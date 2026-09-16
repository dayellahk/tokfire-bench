// Export public marketing pages with only the small, shared theme script. Account/data operations stay on the live portal.
import {mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const origin='https://tokfires.com';
const {posts}=JSON.parse(await readFile(new URL('../lib/blog-posts.json',import.meta.url),'utf8'));
const publicRoutes=['','/methodology','/blog',...posts.map(p=>'/blog/'+p.slug)];
const output=path.resolve('dist/cloudflare-static');
await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
const variants=[{prefix:'',notice:'Static site · Upload as a guest and view live comparisons on the main portal.',open:'Open the live portal',account:'Guest · My data',nav:['Benchmark','Comparisons','My data']},{prefix:'/zh-Hant',notice:'靜態網站 · 訪客上傳報告及即時比較請前往主站。',open:'開啟完整網站',account:'訪客 · 我的資料',nav:['效能測試','效能比較','我的資料']},{prefix:'/zh-Hans',notice:'静态网站 · 访客上传报告及实时比较请前往主站。',open:'打开完整网站',account:'访客 · 我的数据',nav:['效能测试','效能比较','我的资料']}];
const themeResponse=await fetch(origin+'/theme.js');if(!themeResponse.ok)throw Error('Theme script missing');
const themeSource=await themeResponse.text();const themeIntegrity='sha256-'+createHash('sha256').update(themeSource).digest('base64');
const assets=new Set(['/favicon.svg','/theme.js']);
for(const variant of variants){for(const suffix of publicRoutes){
 const route=variant.prefix+suffix||'/';const response=await fetch(origin+route);if(!response.ok)throw Error(`Source ${route}: ${response.status}`);
 let html=await response.text();
 html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*(?:as="script"|rel="modulepreload")[^>]*>/gi,'');
 const live=origin+(variant.prefix||'/');
 html=html.replace(/<button([^>]*)>([\s\S]*?)<\/button>/g,(_,attrs,content)=>{if(/data-theme-toggle="true"/.test(attrs))return `<button${attrs}>${content}</button>`;const label=attrs.match(/aria-label="([^"]+)"/)?.[1];const index=variant.nav.indexOf(label);if(index<0)throw Error('Unexpected interactive button in static page');const href=index===0?variant.prefix||'/':live+'?tab='+(index===1?'rankings':'privacy');return `<a${attrs} href="${href}">${content}</a>`;});
 html=html.replace(/<span>(?:Account…|帳戶…|帐户…)<\/span>/g,`<a class="text-link" href="${origin+(variant.prefix||'/')}?tab=privacy">${variant.account}</a>`);
 html=html.replace(/<aside class="panel run-panel">[\s\S]*?<\/aside>/,`<aside class="panel run-panel"><span class="panel-index">TOKFIRE BENCH</span><h2>${variant.open}</h2><p>${variant.notice}</p><a class="download-link" href="${live}">${variant.open} →</a></aside>`);
 html=html.replace(/href="(\/[^"#]*)"/g,(all,href)=>{const u=new URL(href,origin);const plain=u.pathname.replace(/^\/(zh-Hant|zh-Hans)(?=\/|$)/,'')||'/';if(u.searchParams.has('tab')||['/signin','/native-connect','/signin-with-chatgpt'].includes(plain)||/\.(?:zip|dmg|apk|gz|sha256)$/.test(plain))return `href="${origin+href}"`;return all;});
 html=html.replace(/<body([^>]*)>/,`<body$1><div class="static-notice">${variant.notice} <a href="${live}">${variant.open} →</a></div>`);
 html=html.replace('</head>','<style>.sidebar nav a{display:flex;align-items:center;gap:12px;padding:12px 15px;border-radius:6px;color:#a3978f;text-decoration:none;font-size:14px}.sidebar nav a svg{width:18px;height:18px}.sidebar nav a.active{background:#282019;color:#fff;border-left:3px solid #ff9a52}@media(max-width:900px){.sidebar nav a{font-size:0;width:42px;padding:12px;gap:0}}</style></head>');
 if(/<script\b|<button\b|<input\b/i.test(html.replace(/<button[^>]*data-theme-toggle="true"[^>]*>[\s\S]*?<\/button>/g,'')))throw Error('Interactive control leaked into static output');
 for(const m of html.matchAll(/(?:href|src)="([^\"]+)"/g))if(m[1].startsWith('/_next/static/')||m[1].startsWith('/images/')||m[1].startsWith('/tutorials/'))assets.add(m[1]);
 html=html.replace('</head>',`<script src="/theme.js" integrity="${themeIntegrity}"></script></head>`);
 const file=path.join(output,route,'index.html');await mkdir(path.dirname(file),{recursive:true});await writeFile(file,html);
}}
for(const asset of assets){const response=await fetch(origin+asset);if(!response.ok)throw Error(`Asset ${asset}: ${response.status}`);const bytes=Buffer.from(await response.arrayBuffer());const file=path.join(output,asset);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,bytes);if(asset.endsWith('.css')){for(const match of bytes.toString().matchAll(/url\(["']?([^)'"\s]+)["']?\)/g)){const u=new URL(match[1],origin+asset);if(u.origin===origin&&u.pathname.startsWith('/_next/static/'))assets.add(u.pathname);}}}
const redirects=variants.flatMap(v=>['signin','native-connect'].map(p=>`${v.prefix}/${p} ${origin+v.prefix}/${p} 302`));
await writeFile(path.join(output,'_redirects'),redirects.join('\n')+'\n');
await writeFile(path.join(output,'_headers'),`/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Content-Security-Policy: script-src '${themeIntegrity}'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'\n`);
for(const file of ['sitemap.xml','robots.txt']){const response=await fetch(origin+'/'+file);if(!response.ok)throw Error(file);await writeFile(path.join(output,file),await response.text());}
await writeFile(path.join(output,'404.html'),'<!doctype html><html lang="en"><meta charset="utf-8"><title>Page not found | TokFire</title><h1>Page not found</h1><a href="/">TokFire Bench</a></html>');
console.log(`Exported ${publicRoutes.length*variants.length} public pages and ${assets.size} assets to ${output}. Downloads and account/data operations use ${origin}.`);
