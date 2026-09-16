import {twoFactor} from 'better-auth/plugins';
import {APIError,createAuthMiddleware,getSessionFromCtx} from 'better-auth/api';
import {safeAuthReturn} from './auth-return.ts';
import {turnstileAction,verifyTurnstile,type TurnstileAction} from './turnstile.ts';
export function twoFactorReturn(location:string|null,baseURL:string){
 const origin=new URL(baseURL).origin;
 let target='/';
 try{const url=new URL(location??'/',origin);if(url.origin===origin)target=safeAuthReturn(url.pathname+url.search+url.hash);}catch{/* keep local fallback */}
 const locale=target.match(/^\/(zh-Hant|zh-Hans)(?=\/|\?|#|$)/)?.[1];
 return `${origin}${locale?'/'+locale:''}/signin?two_factor=1&return_to=${encodeURIComponent(target)}`;
}
export function portalAuthPlugins(verify:(token:unknown,action:TurnstileAction)=>Promise<boolean>=verifyTurnstile){
 const factors=twoFactor({issuer:'TokFire Bench',allowPasswordless:true,twoFactorCookieMaxAge:600,accountLockout:{enabled:true,maxFailedAttempts:10,durationSeconds:900}});
 const credentialHook=factors.hooks.after[0];
 // Better Auth 1.7.3 only gates password logins by default. Apply the same
 // pending-session mechanism to OAuth callbacks, then redirect to our code UI.
 factors.hooks.after=[{
  ...credentialHook,
  matcher:ctx=>credentialHook.matcher(ctx)||!!ctx.path?.startsWith('/callback/'),
 },{
  matcher:ctx=>!!ctx.path?.startsWith('/callback/'),
  handler:createAuthMiddleware(async ctx=>{
   const result=ctx.context.returned as {twoFactorRedirect?:boolean}|undefined;
   if(result?.twoFactorRedirect)throw ctx.redirect(twoFactorReturn(ctx.context.responseHeaders?.get('location')??null,ctx.context.baseURL));
   return undefined;
  }),
 }];
 return [factors,{
  id:'tokfire-auth-security',
  hooks:{before:[{
   matcher:(ctx:{path?:string})=>turnstileAction(ctx.path??'')!==null,
   handler:createAuthMiddleware(async ctx=>{
    const action=turnstileAction(ctx.path??'')!;
    if(!await verify(ctx.headers?.get('x-turnstile-token'),action))throw new APIError('FORBIDDEN',{code:'HUMAN_VERIFICATION_REQUIRED',message:'Please complete the security check and try again.'});
    if(action==='security'){
     const session=await getSessionFromCtx(ctx);
     if(!session)throw new APIError('UNAUTHORIZED',{code:'UNAUTHORIZED',message:'Sign in to manage security.'});
     if(Date.now()-new Date(session.session.createdAt).getTime()>5*60_000)throw new APIError('FORBIDDEN',{code:'FRESH_SIGN_IN_REQUIRED',message:'Please sign out and sign in again before changing security settings.'});
    }
   }),
  }]},
 }];
}
