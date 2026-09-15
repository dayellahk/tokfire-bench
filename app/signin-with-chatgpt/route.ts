import {NextResponse} from 'next/server';
import {safeReturn} from '../chatgpt-auth';
export function GET(request:Request){const source=new URL(request.url);const url=new URL('/signin',source);url.searchParams.set('return_to',safeReturn(source.searchParams.get('return_to')??'/'));return NextResponse.redirect(url);}
