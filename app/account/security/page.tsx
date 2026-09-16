'use client';
/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-img-element -- Full auth navigation and a locally generated, private QR data URL. */
import {useEffect,useState} from 'react';
import {ShieldCheck} from 'lucide-react';
import {authClient as auth} from '@/lib/auth-client';
import {localizeTree,localizedPath} from '@/lib/i18n';
import {useLocale} from '@/components/language-switcher';
import {TurnstileWidget} from '@/components/turnstile-widget';
export default function AccountSecurity(){
 const locale=useLocale(),{data:session,isPending}=auth.useSession();
 const [password,setPassword]=useState(''),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [hasPassword,setHasPassword]=useState<boolean|null>(null),[siteKey,setSiteKey]=useState<string|null>(null);
 const [setup,setSetup]=useState<{uri:string;qr:string;codes:string[]}|null>(null),[codes,setCodes]=useState<string[]>([]),[saved,setSaved]=useState(false);
 const [token,setToken]=useState(''),[challenge,setChallenge]=useState(0),[confirmDisable,setConfirmDisable]=useState(false);
 useEffect(()=>{
  if(!session?.user.id)return;let active=true;
  Promise.all([fetch('/api/signin-options',{cache:'no-store'}).then(r=>r.json() as Promise<{turnstile?:{ready?:boolean;siteKey?:string}}>),auth.listAccounts()]).then(([options,accounts])=>{
   if(!active)return;
   setSiteKey(options.turnstile?.ready&&options.turnstile.siteKey?options.turnstile.siteKey:null);
   if(accounts.error||!options.turnstile?.ready){setError('Security verification is temporarily unavailable. Please reload to try again.');return;}
   setHasPassword(accounts.data?.some(a=>a.providerId==='credential')??false);
  }).catch(()=>{if(active)setError('Connection failed. Please try again.');});
  return()=>{active=false;};
 },[session?.user.id]);
 function reset(){setToken('');setChallenge(n=>n+1);}
 const fetchOptions={headers:{'x-turnstile-token':token}};
 const credentials=hasPassword?{password}:{};
 async function perform(kind:'enable'|'verify'|'disable'|'codes'){
  if(busy||!token||hasPassword===null)return;
  setBusy(true);setError('');setMessage('');
  try{
   if(kind==='enable'){
    const result=await auth.twoFactor.enable({...credentials,method:'totp',fetchOptions});
    if(result.error)throw Error(result.error.message);
    const data=result.data;
    if(!data||data.method!=='totp'||!data.totpURI||!data.backupCodes)throw Error('Unable to prepare two-factor setup.');
    const qr=await (await import('qrcode')).toDataURL(data.totpURI,{width:220,margin:2,errorCorrectionLevel:'M'});
    setSetup({uri:data.totpURI,qr,codes:data.backupCodes});setSaved(false);setCode('');setCodes([]);
   }else if(kind==='verify'){
    if(!saved)return;
    const result=await auth.twoFactor.verifyTotp({code:code.trim(),trustDevice:false,fetchOptions});
    if(result.error)throw Error(result.error.message);
    setSetup(null);setCode('');setPassword('');setMessage('Two-factor authentication is now enabled. Keep your recovery codes safe.');
   }else if(kind==='disable'){
    const result=await auth.twoFactor.disable({...credentials,fetchOptions});
    if(result.error)throw Error(result.error.message);
    setConfirmDisable(false);setCodes([]);setPassword('');setMessage('Two-factor authentication is disabled.');
   }else{
    const result=await auth.twoFactor.generateBackupCodes({...credentials,fetchOptions});
    if(result.error)throw Error(result.error.message);
    setCodes(result.data?.backupCodes??[]);setMessage('New recovery codes replace all previous codes. Save them now.');
   }
  }catch(e){setError(e instanceof Error?e.message:'Connection failed. Please try again.');}
  finally{reset();setBusy(false);}
 }
 async function reauthenticate(){await auth.signOut();location.assign(localizedPath('/signin',locale)+'?return_to='+encodeURIComponent(localizedPath('/account/security',locale)));}
 function downloadCodes(values:string[]){const url=URL.createObjectURL(new Blob(['TokFire Bench recovery codes\nKeep private. Each code can be used once.\n\n'+values.join('\n')],{type:'text/plain'}));const a=document.createElement('a');a.href=url;a.download='tokfire-recovery-codes.txt';a.click();URL.revokeObjectURL(url);}
 if(isPending)return localizeTree(<main className="signin-shell"><p>Loading account security…</p></main>,locale);
 if(!session)return localizeTree(<main className="signin-shell"><section className="signin-card"><h1>Account security</h1><p>Sign in to manage security.</p><a className="signin-submit" href={'/signin?return_to='+encodeURIComponent(localizedPath('/account/security',locale))}>Sign in</a></section></main>,locale);
 const enabled=session.user.twoFactorEnabled===true;
 return localizeTree(<main className="signin-shell security-shell"><a className="signin-brand" href="/?tab=privacy">← My data</a><section className="signin-card security-card"><ShieldCheck size={30}/><p className="signin-kicker">ACCOUNT SECURITY</p><h1>Protect your account.</h1><p className="signin-intro">Use an authenticator app for a second verification step after password or Google sign-in.</p><p className={`security-status ${enabled?'enabled':''}`}>{enabled?'Two-factor authentication is on':'Two-factor authentication is off'}</p>
 {error&&<p className="signin-error" role="alert">{error}</p>}{message&&<p className="security-message" role="status">{message}</p>}
 {setup?<><h2>Connect your authenticator</h2><p>Scan this QR code with Google Authenticator, Microsoft Authenticator, 1Password or another TOTP app.</p><img className="security-qr" src={setup.qr} width={220} height={220} alt="Private authenticator setup QR code"/><details><summary>Enter a setup key manually</summary><code className="security-secret" data-no-translate>{new URL(setup.uri).searchParams.get('secret')}</code><p>Time-based · 6 digits · 30 seconds</p></details><h2>Save your recovery codes</h2><p>Each code works once if you lose your authenticator. Store them somewhere private, outside this device.</p><div className="security-codes" data-no-translate>{setup.codes.map(c=><code key={c}>{c}</code>)}</div><button className="secondary-button" onClick={()=>downloadCodes(setup.codes)}>Download recovery codes</button><label className="checkbox-line"><input type="checkbox" checked={saved} onChange={e=>setSaved(e.target.checked)}/>I have saved my recovery codes.</label><form className="signin-form" onSubmit={e=>{e.preventDefault();void perform('verify');}}><label>Authenticator code<input required autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} value={code} onChange={e=>setCode(e.target.value)}/></label>{siteKey&&<TurnstileWidget key={'verify-'+challenge} siteKey={siteKey} action="two_factor" onToken={setToken}/>}<button className="signin-submit" disabled={busy||!token||!saved}>{busy?'Please wait…':'Verify and enable 2FA'}</button></form><button className="signin-create" disabled={busy} onClick={()=>{setSetup(null);setCode('');reset();}}>Cancel setup</button><p className="signin-fineprint">Protection starts only after you verify your first code.</p></>:<>
 <p>Security changes require a sign-in within the last 5 minutes. Password accounts also require the current password.</p><button className="signin-create" disabled={busy} onClick={reauthenticate}>Sign in again to verify your identity</button>
 <form className="signin-form" onSubmit={e=>{e.preventDefault();void perform(enabled?'codes':'enable');}}>
 {hasPassword&&<label>Current password<input type="password" required autoComplete="current-password" maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></label>}
 {siteKey&&<TurnstileWidget key={'security-'+challenge} siteKey={siteKey} action="security" onToken={setToken}/>}
 <button className="signin-submit" disabled={busy||!token||hasPassword===null}>{busy?'Please wait…':enabled?'Generate new recovery codes':'Set up two-factor authentication'}</button></form>
 {enabled&&<div className="security-disable"><button className="signin-create" disabled={busy} onClick={()=>setConfirmDisable(!confirmDisable)}>Turn off two-factor authentication</button>{confirmDisable&&<div role="alert"><p>Turning off 2FA removes the extra verification step and invalidates your recovery codes.</p><button className="secondary-button" disabled={busy||!token||(hasPassword===true&&!password)} onClick={()=>perform('disable')}>Confirm turn off</button></div>}</div>}
 {codes.length>0&&<section><h2>Save your new recovery codes</h2><div className="security-codes" data-no-translate>{codes.map(c=><code key={c}>{c}</code>)}</div><button className="secondary-button" onClick={()=>downloadCodes(codes)}>Download recovery codes</button><button className="signin-create" onClick={()=>setCodes([])}>I saved them. Hide codes.</button></section>}
 </>}
 <p className="signin-fineprint">TokFire will never ask you to send an authenticator secret or recovery code by email or chat. Email-based account recovery is not available.</p>
 </section></main>,locale);
}
