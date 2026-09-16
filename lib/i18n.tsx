import {Children,cloneElement,isValidElement,type ReactNode,type ReactElement} from 'react';
import hant from './locales/zh-Hant.json';
import hans from './locales/zh-Hans.json';
export const locales=['en','zh-Hant','zh-Hans'] as const;
export type Locale=typeof locales[number];
export function localeFromPath(path:string):Locale {const value=path.split('/')[1];return value==='zh-Hant'||value==='zh-Hans'?value:'en';}
export function withoutLocale(path:string){return path.replace(/^\/(zh-Hant|zh-Hans)(?=\/|\?|#|$)/,'')||'/';}
export function localizedPath(path:string,locale:Locale){const plain=withoutLocale(path);return locale==='en'?plain:`/${locale}${plain==='/'?'':plain}`;}
export function translate(text:string,locale:Locale):string {
 if(locale==='en')return text;
 const key=text.replace(/\s+/g,' ').trim();const dict:Record<string,string>=locale==='zh-Hant'?hant:hans;
 let value=dict[key];
 const count=key.match(/^(\d+) imported reference records$/);if(count)value=locale==='zh-Hant'?`已匯入 ${count[1]} 筆參考紀錄`:`已导入 ${count[1]} 条参考记录`;
 return value?text.replace(/\S[\s\S]*\S|\S/,value):text;
}
export function localizeHref(href:string,locale:Locale){
 if(!href.startsWith('/')||href.startsWith('//'))return href;
 const url=new URL(href,'https://tokfires.com');
 if(url.pathname==='/signin-with-chatgpt')return localizedPath('/signin',locale)+'?return_to='+encodeURIComponent(localizedPath(url.searchParams.get('return_to')||'/',locale));
 if(['/','/signin','/native-connect','/methodology'].includes(withoutLocale(url.pathname)))return localizedPath(url.pathname,locale)+url.search+url.hash;
 return href;
}
// Translate rendered UI text during React rendering (including SSR), never mutate the DOM.
// Code, raw reports and marked user/source content retain their exact original bytes.
export function localizeTree(node:ReactNode,locale:Locale):ReactNode {
 if(typeof node==='string')return translate(node,locale);
 if(Array.isArray(node))return Children.map(node,child=>localizeTree(child,locale));
 if(!isValidElement(node))return node;
 const element=node as ReactElement<Record<string,unknown>>;const props=element.props;
 if(['pre','code','script','style'].includes(String(element.type))||props['data-no-translate'])return element;
 const next:Record<string,unknown>={};
 for(const key of ['aria-label','title','placeholder','alt'])if(typeof props[key]==='string')next[key]=translate(props[key] as string,locale);
 if(typeof props.href==='string')next.href=localizeHref(props.href,locale);
 if(props.children!==undefined)next.children=localizeTree(props.children as ReactNode,locale);
 return cloneElement(element,next);
}
