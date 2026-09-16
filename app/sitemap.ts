import type {MetadataRoute} from 'next';
const origin='https://tokfires.com';
export default function sitemap():MetadataRoute.Sitemap{return ['','/methodology','/references'].flatMap(path=>{const languages={en:origin+(path||'/'),'zh-Hant':origin+'/zh-Hant'+path,'zh-Hans':origin+'/zh-Hans'+path,'x-default':origin+(path||'/')};return ['en','zh-Hant','zh-Hans'].map(locale=>({url:languages[locale as keyof typeof languages],alternates:{languages},changeFrequency:'weekly' as const,priority:path?0.6:1}));});}
