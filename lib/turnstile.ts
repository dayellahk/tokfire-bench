export type TurnstileAction='auth'|'two_factor'|'security';
export function turnstileAction(path:string):TurnstileAction|null {
 if(['/sign-in/email','/sign-up/email','/sign-in/social'].includes(path))return 'auth';
 if(['/two-factor/verify-totp','/two-factor/verify-backup-code'].includes(path))return 'two_factor';
 if(['/two-factor/enable','/two-factor/disable','/two-factor/generate-backup-codes','/two-factor/get-totp-uri'].includes(path))return 'security';
 return null;
}
export function turnstileOptions(env:NodeJS.ProcessEnv=process.env){
 const ready=Boolean(env.TURNSTILE_SITE_KEY?.trim()&&env.TURNSTILE_SECRET?.trim()&&env.TURNSTILE_HOSTNAMES?.trim());
 return {ready,siteKey:ready?env.TURNSTILE_SITE_KEY!.trim():null};
}
export async function verifyTurnstile(token:unknown,action:TurnstileAction,env:NodeJS.ProcessEnv=process.env,fetcher:typeof fetch=fetch):Promise<boolean>{
 const secret=env.TURNSTILE_SECRET?.trim();
 const hosts=(env.TURNSTILE_HOSTNAMES??'').split(',').map(s=>s.trim()).filter(Boolean);
 if(!secret||!hosts.length||typeof token!=='string'||!token.trim()||token.length>2048)return false;
 // Production cannot accept challenges solved on a developer's localhost.
 if(env.NODE_ENV==='production'&&hosts.some(h=>['localhost','127.0.0.1','::1'].includes(h)))return false;
 try{
  const response=await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
   method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},signal:AbortSignal.timeout(10_000),
   body:new URLSearchParams({secret,response:token}),
  });
  if(!response.ok)return false;
  const result=await response.json() as {success?:unknown;action?:unknown;hostname?:unknown}|null;
  return result?.success===true&&result.action===action&&typeof result.hostname==='string'&&hosts.includes(result.hostname);
 }catch{return false;}
}
