'use client';
import {localizeTree,localizedPath} from '@/lib/i18n';
import {useLocale} from '@/components/language-switcher';
import {useState} from 'react';
import {createAuthClient} from 'better-auth/react';
const auth=createAuthClient();
export default function SignIn(){const locale=useLocale();
 const [create,setCreate]=useState(false),[name,setName]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{
  const result=create?await auth.signUp.email({name,email,password}):await auth.signIn.email({email,password});
  if(result.error){setError(result.error.message??'Unable to sign in.');return;}
  const raw=new URLSearchParams(location.search).get('return_to')??localizedPath('/',locale);const u=new URL(raw,location.origin);location.assign(u.origin===location.origin&&!/^\/(signin|api\/auth)/.test(u.pathname)?u.pathname+u.search:'/');
 }catch{setError('Connection failed. Please try again.');}finally{setBusy(false);}}
 return localizeTree(<main style={{maxWidth:480,margin:'60px auto',padding:24}}><a href="/">← TokFire Bench</a><h1>{create?'Create your account':'Welcome back'}</h1><p>Save and manage your local AI benchmark reports.</p><form onSubmit={submit} style={{display:'grid',gap:16}}>
 {create&&<label>Name<input style={{display:'block',width:'100%',padding:12}} required maxLength={80} autoComplete="name" value={name} onChange={e=>setName(e.target.value)}/></label>}
 <label>Email<input style={{display:'block',width:'100%',padding:12}} type="email" required maxLength={254} autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
 <label>Password<input style={{display:'block',width:'100%',padding:12}} type="password" required minLength={12} maxLength={128} autoComplete={create?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)}/></label>
 {error&&<p role="alert">{error}</p>}<button style={{padding:14,background:'#ff9a52',color:'#211916'}} disabled={busy}>{busy?'Please wait…':create?'Create account':'Sign in'}</button></form>
 <button style={{marginTop:20}} onClick={()=>{setCreate(!create);setError('');}}>{create?'Already registered? Sign in':'New here? Create an account'}</button>
 <p style={{fontSize:12,marginTop:28}}>Email verification and password recovery are not yet enabled. Keep your password in a password manager. Your email is not displayed in community comparisons.</p></main>,locale);
}
