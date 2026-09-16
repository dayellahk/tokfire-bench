import {NextRequest,NextResponse} from 'next/server';
export function proxy(request:NextRequest){const headers=new Headers(request.headers);const first=request.nextUrl.pathname.split('/')[1];headers.set('x-tokfire-locale',first==='zh-Hant'||first==='zh-Hans'?first:'en');headers.set('x-tokfire-path',request.nextUrl.pathname);return NextResponse.next({request:{headers}});}
export const config={matcher:['/((?!api|_next|.*\\..*).*)']};
