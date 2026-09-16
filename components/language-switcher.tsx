'use client';
import {ThemeSwitcher} from './theme-switcher';
import {usePathname} from 'next/navigation';
import {localeFromPath,localizedPath,translate,withoutLocale} from '@/lib/i18n';
export function useLocale(){return localeFromPath(usePathname()||'/');}
export function LanguageSwitcher(){const path=usePathname()||'/';const locale=localeFromPath(path);if(withoutLocale(path)==='/native-connect')return null;return <div className="display-controls"><ThemeSwitcher locale={locale}/><nav className="language-switcher" aria-label={translate('Language',locale)}>{([['en','English'],['zh-Hant','繁體中文'],['zh-Hans','简体中文']] as const).map(([code,label])=><a key={code} href={localizedPath(path,code)} hrefLang={code} lang={code} aria-current={locale===code?'page':undefined} onClick={e=>{e.preventDefault();location.assign(localizedPath(path,code)+location.search+location.hash);}}>{label}</a>)}</nav></div>;}
