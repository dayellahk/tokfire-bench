'use client';
/* eslint-disable @next/next/no-html-link-for-pages -- Full navigation keeps localized return paths intact. */
import {localizeTree,localizedPath} from '@/lib/i18n';
import {useLocale} from '@/components/language-switcher';
import {useEffect,useState} from 'react';
import {authClient as auth} from '@/lib/auth-client';
import {TurnstileWidget} from '@/components/turnstile-widget';
import {safeAuthReturn,socialSignInError} from '@/lib/auth-return';
export default function SignIn(){const locale=useLocale();
 const [create,setCreate]=useState(false),[name,setName]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [google,setGoogle]=useState<boolean|null>(null),[optionsFailed,setOptionsFailed]=useState(false),[siteKey,setSiteKey]=useState<string|null>(null);
 const [twoFactor,setTwoFactor]=useState(false),[backup,setBackup]=useState(false),[code,setCode]=useState('');
 const [token,setToken]=useState(''),[challenge,setChallenge]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();
  // External OAuth callbacks carry challenge state in the URL.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  setError(socialSignInError(new URLSearchParams(location.search).get('error')));
  setTwoFactor(new URLSearchParams(location.search).get('two_factor')==='1');
  fetch('/api/signin-options',{signal:controller.signal,cache:'no-store'}).then(async response=>{
   if(!response.ok)throw new Error('Unavailable');
   const data=await response.json() as {google?:boolean;turnstile?:{ready?:boolean;siteKey?:string}};
   setGoogle(data.google===true);setSiteKey(data.turnstile?.ready&&data.turnstile.siteKey?data.turnstile.siteKey:null);
   if(!data.turnstile?.ready)setOptionsFailed(true);
  }).catch(()=>{if(!controller.signal.aborted){setGoogle(false);setOptionsFailed(true);}});
  return()=>controller.abort();
 },[]);
 function returnTo(){return safeAuthReturn(new URLSearchParams(location.search).get('return_to'),localizedPath('/',locale));}
 function resetChallenge(){setToken('');setChallenge(n=>n+1);}
 const fetchOptions={headers:{'x-turnstile-token':token}};
 async function social(){if(!google||busy||!token)return;setBusy(true);setError('');try{
  const callbackURL=returnTo();
  const result=await auth.signIn.social({provider:'google',callbackURL,newUserCallbackURL:callbackURL,errorCallbackURL:localizedPath('/signin',locale)+'?return_to='+encodeURIComponent(callbackURL),fetchOptions});
  if(result.error)setError(socialSignInError(result.error.code||'failed'));
 }catch{setError('Connection failed. Please try again.');}finally{resetChallenge();setBusy(false);}}
 async function submit(e:React.FormEvent){e.preventDefault();if(busy||!token)return;setBusy(true);setError('');try{
  if(twoFactor){
   const result=backup?await auth.twoFactor.verifyBackupCode({code:code.trim(),trustDevice:false,fetchOptions}):await auth.twoFactor.verifyTotp({code:code.trim(),trustDevice:false,fetchOptions});
   if(result.error){setError(result.error.message??'Verification failed. Try a new code.');return;}
  }else{
   const result=create?await auth.signUp.email({name,email,password,fetchOptions}):await auth.signIn.email({email,password,fetchOptions});
   if(result.error){setError(result.error.message??'Unable to sign in.');return;}
   if(result.data&&'twoFactorRedirect' in result.data&&result.data.twoFactorRedirect){setTwoFactor(true);setPassword('');return;}
  }
  location.assign(returnTo());
 }catch{setError('Connection failed. Please try again.');}finally{resetChallenge();setBusy(false);}}
 return localizeTree(<main className="signin-shell"><a href="/" className="signin-brand">← TokFire Bench</a><section className="signin-card"><p className="signin-kicker">YOUR AI. YOUR HARDWARE.</p><h1>{twoFactor?'Verify it’s you':create?'Create your account':'Welcome back'}</h1><p className="signin-intro">{twoFactor?'Enter your authenticator code to finish signing in.':'Save and manage your local AI benchmark reports.'}</p>
 {!twoFactor&&<><button type="button" className="google-signin" onClick={social} disabled={!google||busy||!token} aria-describedby="google-status">Continue with Google</button><p id="google-status" className="signin-provider-status" aria-live="polite">{google===null?'Checking sign-in options…':google?'Use your Google account. No new password needed.':'Google sign-in is temporarily unavailable.'}</p><div className="signin-divider"><span>or use email</span></div></>}
 {error&&<p className="signin-error" role="alert">{error}</p>}
 {optionsFailed&&<p className="signin-error" role="alert">Security verification is temporarily unavailable. Please reload to try again.</p>}
 <form onSubmit={submit} className="signin-form">
 {twoFactor?<label>{backup?'Recovery code':'Authenticator code'}<input required type="text" inputMode={backup?'text':'numeric'} autoComplete="one-time-code" minLength={backup?1:6} maxLength={backup?64:6} pattern={backup?undefined:'[0-9]{6}'} value={code} onChange={e=>setCode(e.target.value)}/></label>:<>{create&&<label>Name<input required maxLength={80} autoComplete="name" value={name} onChange={e=>setName(e.target.value)}/></label>}<label>Email<input type="email" required maxLength={254} autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" required minLength={12} maxLength={128} autoComplete={create?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)}/></label></>}
 {siteKey&&<TurnstileWidget key={`${twoFactor}-${challenge}`} siteKey={siteKey} action={twoFactor?'two_factor':'auth'} onToken={setToken}/>}
 <button className="signin-submit" disabled={busy||!token}>{busy?'Please wait…':twoFactor?'Verify and sign in':create?'Create account':'Sign in'}</button></form>
 {twoFactor?<><button className="signin-create" disabled={busy} onClick={()=>{setBackup(!backup);setCode('');setError('');resetChallenge();}}>{backup?'Use authenticator instead':'Use a recovery code'}</button><a className="signin-create" href={'/signin?return_to='+encodeURIComponent(returnTo())}>Start sign-in again</a></>:<button className="signin-create" disabled={busy} onClick={()=>{setCreate(!create);setError('');resetChallenge();}}>{create?'Already registered? Sign in':'New here? Create an account'}</button>}
 <p className="signin-guest"><a href="/?tab=privacy">Continue as a guest</a><span>Benchmark uploads do not require an account.</span></p>
 <p className="signin-fineprint">Protected by Cloudflare Turnstile. Two-factor authentication is available in Account security.</p>
 {!twoFactor&&<p className="signin-fineprint">Email verification and password recovery are not yet enabled. Keep your password in a password manager. Your email is not displayed in community comparisons.</p>}
 </section></main>,locale);
}
