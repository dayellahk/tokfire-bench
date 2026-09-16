'use client';
import {usePathname} from 'next/navigation';
import {localeFromPath,localizedPath,translate} from '@/lib/i18n';
export function useLocale(){return localeFromPath(usePathname()||'/');}
export function LanguageSwitcher(){const path=usePathname()||'/';const locale=localeFromPath(path);return <nav className="language-switcher" aria-label={translate('Language',locale)}>{([['en','English'],['zh-Hant','繁體中文'],['zh-Hans','简体中文']] as const).map(([code,label])=><a key={code} href={localizedPath(path,code)} hrefLang={code} lang={code} aria-current={locale===code?'page':undefined} onClick={e=>{e.preventDefault();location.assign(localizedPath(path,code)+location.search+location.hash);}}>{label}</a>)}</nav>;}
