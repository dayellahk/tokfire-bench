'use client';
import Script from 'next/script';
import {useCallback,useEffect,useRef,useState} from 'react';
import {translate} from '@/lib/i18n';
import {useLocale} from './language-switcher';
type Api={render:(element:HTMLElement,options:Record<string,unknown>)=>string;remove:(id:string)=>void};
declare global{interface Window{turnstile?:Api}}
export function TurnstileWidget({siteKey,action,onToken}:{siteKey:string;action:string;onToken:(token:string)=>void}){
 const locale=useLocale(),container=useRef<HTMLDivElement>(null),widget=useRef<string|null>(null),callback=useRef(onToken);
 const [failed,setFailed]=useState(false),[ready,setReady]=useState(false);
 useEffect(()=>{callback.current=onToken;},[onToken]);
 const render=useCallback(()=>{
  if(!container.current||!window.turnstile||widget.current!==null)return;
  widget.current=window.turnstile.render(container.current,{sitekey:siteKey,action,theme:'auto',size:'flexible',language:locale==='zh-Hant'?'zh-tw':locale==='zh-Hans'?'zh-cn':'en',callback:(token:string)=>{setReady(true);setFailed(false);callback.current(token);},'expired-callback':()=>{setReady(false);callback.current('');},'error-callback':()=>{setFailed(true);setReady(false);callback.current('');return true;},'timeout-callback':()=>{setReady(false);callback.current('');}});
 },[siteKey,action,locale]);
 useEffect(()=>{
  render();
  return()=>{if(widget.current!==null){window.turnstile?.remove(widget.current);widget.current=null;}callback.current('');};
 },[render]);
 return <div className="auth-challenge"><Script id="tokfire-turnstile" src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={render} onError={()=>setFailed(true)}/><div ref={container}/><p role="status">{translate(failed?'Security check could not load. Please reload or check your connection.':ready?'Security check complete.':'Completing security check…',locale)}</p></div>;
}
