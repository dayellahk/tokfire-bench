/* eslint-disable @next/next/no-sync-scripts -- Tiny shared theme bootstrap must apply the saved preference before first paint, including the static mirror. */
import type {Metadata} from 'next';
import {headers} from 'next/headers';
import {LanguageSwitcher} from '@/components/language-switcher';
import {CyberEffects} from '@/components/cyber-effects';
import {localeFromPath,localizedPath,withoutLocale,translate} from '@/lib/i18n';
import './globals.css';
import './fit.css';
import './landing.css';
import './theme.css';
import './blog.css';
import './cyber.css';
import {getPost,blogText} from '@/lib/blog';
export async function generateMetadata():Promise<Metadata>{const h=await headers();const path=h.get('x-tokfire-path')||'/';const locale=localeFromPath(path);const plain=withoutLocale(path);const article=plain.startsWith('/blog/')?getPost(plain.slice(6)):undefined;const title=article?article.title[locale]:plain==='/blog'?blogText(locale).all:plain==='/methodology'?'Read the methodology & limitations':plain==='/signin'?'Sign in':plain==='/native-connect'?'Connect TokFire Bench':'TokFire Bench';const description=article?article.dek[locale]:plain==='/blog'?blogText(locale).intro:translate('Benchmark GGUF or MLX models, choose 1–3 concurrent jobs calling one model, and upload results without signing in.',locale);return {metadataBase:new URL('https://tokfires.com'),title:translate(title,locale)+' | TokFire Labs',description,applicationName:'TokFire Bench',authors:[{name:'TokFire Labs'}],alternates:{canonical:localizedPath(plain,locale),languages:{en:localizedPath(plain,'en'),'zh-Hant':localizedPath(plain,'zh-Hant'),'zh-Hans':localizedPath(plain,'zh-Hans'),'x-default':localizedPath(plain,'en')}},robots:plain==='/signin'||plain==='/native-connect'?{index:false,follow:false}:undefined,openGraph:{title,description,siteName:'TokFire',images:[{url:'/images/tokfire-local-ai.jpg',width:1536,height:1024,alt:'TokFire Bench — local AI on your hardware'}],type:article?'article':'website',...(article?{publishedTime:article.published,modifiedTime:article.published,authors:['TokFire Labs']}:{}),locale:locale==='zh-Hant'?'zh_TW':locale==='zh-Hans'?'zh_CN':'en_US'},icons:{icon:'/favicon.svg',shortcut:'/favicon.svg'}};}
export default async function RootLayout({children}:{children:React.ReactNode}){const h=await headers();const locale=localeFromPath(h.get('x-tokfire-path')||'/');return <html lang={locale} suppressHydrationWarning><head><script src="/theme.js"/></head><body className="antialiased"><LanguageSwitcher/>{children}<CyberEffects/></body></html>;}
