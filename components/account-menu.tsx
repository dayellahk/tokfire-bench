'use client';
/* eslint-disable @next/next/no-html-link-for-pages -- Full navigation initializes the home query tab and also works in native web views. */
import {localizeTree,localizedPath} from '@/lib/i18n';
import {useLocale} from '@/components/language-switcher';
import {createAuthClient} from 'better-auth/react';
const auth=createAuthClient();
export function AccountMenu(){const locale=useLocale();
 const {data:session,isPending}=auth.useSession();
 if(isPending)return localizeTree(<span>Account…</span>,locale);
 if(!session)return localizeTree(<a className="text-link" href="/?tab=privacy">Guest · My data</a>,locale);
 return localizeTree(<div style={{display:'flex',gap:12,alignItems:'center'}}><span data-no-translate>{session.user.name}</span><button className="text-link" onClick={async()=>{await auth.signOut();location.assign(localizedPath('/',locale));}}>Sign out</button></div>,locale);
}
