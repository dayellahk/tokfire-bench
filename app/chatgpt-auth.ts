import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {getAuth} from '@/lib/auth';
// Compatibility facade for the existing report API; never trust Sites headers on a VM.
export async function getChatGPTUser(){
 const session=await getAuth().api.getSession({headers:await headers()});
 return session?{userId:session.user.id,email:session.user.email,displayName:session.user.name,fullName:session.user.name}:null;
}
export async function requireChatGPTUser(returnTo:string){const user=await getChatGPTUser();if(!user)redirect(chatGPTSignInPath(returnTo));return user;}
export function chatGPTSignInPath(returnTo:string){return '/signin?return_to='+encodeURIComponent(safeReturn(returnTo));}
export function safeReturn(value:string){if(!value.startsWith('/')||value.startsWith('//'))return '/';try{const u=new URL(value,'https://local.invalid');return u.origin==='https://local.invalid'&&!/^\/(signin|api\/auth)/.test(u.pathname)?u.pathname+u.search:'/';}catch{return '/';}}
