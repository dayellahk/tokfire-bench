'use client';
/* eslint-disable @next/next/no-html-link-for-pages -- Full navigation keeps localized return paths intact. */
import {localizeTree,localizedPath} from '@/lib/i18n';
import {useLocale} from '@/components/language-switcher';
import {useEffect,useState} from 'react';
import {createAuthClient} from 'better-auth/react';
import {safeAuthReturn,socialSignInError} from '@/lib/auth-return';
const auth=createAuthClient();
export default function SignIn(){const locale=useLocale();
 const [create,setCreate]=useState(false),[name,setName]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [google,setGoogle]=useState<boolean|null>(null),[optionsFailed,setOptionsFailed]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();
  // The provider redirects back outside React; synchronize its error after mount.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  setError(socialSignInError(new URLSearchParams(location.search).get('error')));
  fetch('/api/signin-options',{signal:controller.signal,cache:'no-store'}).then(async response=>{
   if(!response.ok)throw new Error('Unavailable');
   const data=await response.json();setGoogle(typeof data==='object'&&data!==null&&'google' in data&&data.google===true);
  }).catch(()=>{if(!controller.signal.aborted){setGoogle(false);setOptionsFailed(true);}});
  return()=>controller.abort();
 },[]);
 function returnTo(){return safeAuthReturn(new URLSearchParams(location.search).get('return_to'),localizedPath('/',locale));}
 async function social(){if(!google||busy)return;setBusy(true);setError('');try{
  const callbackURL=returnTo();
  const result=await auth.signIn.social({provider:'google',callbackURL,newUserCallbackURL:callbackURL,errorCallbackURL:localizedPath('/signin',locale)+'?return_to='+encodeURIComponent(callbackURL)});
  if(result.error){setError(socialSignInError(result.error.code||'failed'));setBusy(false);}
 }catch{setError('Connection failed. Please try again.');setBusy(false);}}
 async function submit(e:React.FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');try{
  const result=create?await auth.signUp.email({name,email,password}):await auth.signIn.email({email,password});
  if(result.error){setError(result.error.message??'Unable to sign in.');return;}
  location.assign(returnTo());
 }catch{setError('Connection failed. Please try again.');}finally{setBusy(false);}}
 return localizeTree(<main className="signin-shell"><a href="/" className="signin-brand">← TokFire Bench</a><section className="signin-card"><p className="signin-kicker">YOUR AI. YOUR HARDWARE.</p><h1>{create?'Create your account':'Welcome back'}</h1><p className="signin-intro">Save and manage your local AI benchmark reports.</p>
 <button type="button" className="google-signin" onClick={social} disabled={!google||busy} aria-describedby="google-status">Continue with Google</button>
 <p id="google-status" className="signin-provider-status" aria-live="polite">{google===null?'Checking sign-in options…':optionsFailed?'Google sign-in is temporarily unavailable.':google?'Use your Google account. No new password needed.':'Google sign-in is coming soon.'}</p>
 <div className="signin-divider"><span>or use email</span></div>
 {error&&<p className="signin-error" role="alert">{error}</p>}
 <form onSubmit={submit} className="signin-form">
 {create&&<label>Name<input required maxLength={80} autoComplete="name" value={name} onChange={e=>setName(e.target.value)}/></label>}
 <label>Email<input type="email" required maxLength={254} autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
 <label>Password<input type="password" required minLength={12} maxLength={128} autoComplete={create?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)}/></label>
 <button className="signin-submit" disabled={busy}>{busy?'Please wait…':create?'Create account':'Sign in'}</button></form>
 <button className="signin-create" disabled={busy} onClick={()=>{setCreate(!create);setError('');}}>{create?'Already registered? Sign in':'New here? Create an account'}</button>
 <p className="signin-guest"><a href="/?tab=privacy">Continue as a guest</a><span>Benchmark uploads do not require an account.</span></p>
 <p className="signin-fineprint">Email verification and password recovery are not yet enabled. Keep your password in a password manager. Your email is not displayed in community comparisons.</p>
 </section></main>,locale);
}
