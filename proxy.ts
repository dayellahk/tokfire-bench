import {NextRequest,NextResponse} from 'next/server';
import {GUEST_COOKIE,GUEST_MAX_AGE,newGuestToken,validGuestToken} from './lib/guest';
export function proxy(request:NextRequest){
 const headers=new Headers(request.headers);const first=request.nextUrl.pathname.split('/')[1];
 headers.set('x-tokfire-locale',first==='zh-Hant'||first==='zh-Hans'?first:'en');headers.set('x-tokfire-path',request.nextUrl.pathname);
 const response=NextResponse.next({request:{headers}});
 if(!validGuestToken(request.cookies.get(GUEST_COOKIE)?.value)){
  response.cookies.set(GUEST_COOKIE,newGuestToken(),{httpOnly:true,secure:new URL(process.env.BETTER_AUTH_URL??request.url).protocol==='https:',sameSite:'strict',path:'/',maxAge:GUEST_MAX_AGE});
  response.headers.set('Cache-Control','private, no-store');
 }
 return response;
}
export const config={matcher:['/((?!api|_next|.*\\..*).*)']};
