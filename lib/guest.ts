import {ApiError} from './access.ts';
export const GUEST_COOKIE='tokfire_guest';
export const GUEST_MAX_AGE=365*24*60*60;
export function validGuestToken(value:unknown):value is string{return typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);}
export function newGuestToken(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');}
export function guestTokenFromCookie(cookie:string|null){
 const values=(cookie??'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(GUEST_COOKIE+'='));
 if(values.length!==1)return null;const value=values[0].slice(GUEST_COOKIE.length+1);return validGuestToken(value)?value:null;
}
export async function guestOwner(token:string){
 if(!validGuestToken(token))throw new ApiError(401,'Open TokFire in this browser to start a guest session.');
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('tokfire-guest-v1:'+token));
 return 'guest:'+Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
}
