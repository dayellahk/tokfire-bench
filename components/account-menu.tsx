'use client';
import {createAuthClient} from 'better-auth/react';
const auth=createAuthClient();
export function AccountMenu(){
 const {data:session,isPending}=auth.useSession();
 if(isPending)return <span>Account…</span>;
 if(!session)return <a className="text-link" href="/signin">Sign in / Register</a>;
 return <div style={{display:'flex',gap:12,alignItems:'center'}}><span>{session.user.name}</span><button className="text-link" onClick={async()=>{await auth.signOut();location.assign('/');}}>Sign out</button></div>;
}
