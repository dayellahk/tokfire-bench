'use client';
import {localizeTree,localizedPath} from '@/lib/i18n';
import {useLocale} from '@/components/language-switcher';
import {createAuthClient} from 'better-auth/react';
const auth=createAuthClient();
export function AccountMenu(){const locale=useLocale();
 const {data:session,isPending}=auth.useSession();
 if(isPending)return localizeTree(<span>Account…</span>,locale);
 if(!session)return localizeTree(<a className="text-link" href="/signin">Sign in / Register</a>,locale);
 return localizeTree(<div style={{display:'flex',gap:12,alignItems:'center'}}><span data-no-translate>{session.user.name}</span><button className="text-link" onClick={async()=>{await auth.signOut();location.assign(localizedPath('/',locale));}}>Sign out</button></div>,locale);
}
