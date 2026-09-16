import {NextResponse} from 'next/server';
import {authorizeOrigin} from '@/lib/access';
import {failure} from '@/lib/api';
import {GUEST_COOKIE,GUEST_MAX_AGE,guestTokenFromCookie,newGuestToken} from '@/lib/guest';
export async function POST(request:Request){try{
 authorizeOrigin(request,process.env.BETTER_AUTH_URL);
 const response=NextResponse.json({ready:true,mode:'guest'},{headers:{'Cache-Control':'no-store'}});
 response.cookies.set(GUEST_COOKIE,guestTokenFromCookie(request.headers.get('cookie'))??newGuestToken(),{httpOnly:true,secure:new URL(process.env.BETTER_AUTH_URL??request.url).protocol==='https:',sameSite:'strict',path:'/',maxAge:GUEST_MAX_AGE});
 return response;
}catch(e){return failure(e);}}
