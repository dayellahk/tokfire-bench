'use client';
/* eslint-disable @next/next/no-html-link-for-pages -- Full navigation initializes the home query tab and also works in native web views. */
import {localizeTree,localizedPath} from '@/lib/i18n';
import {useLocale} from '@/components/language-switcher';
import {authClient as auth} from '@/lib/auth-client';
export function AccountMenu(){const locale=useLocale();
 const {data:session,isPending}=auth.useSession();
 if(isPending)return localizeTree(<span>Account…</span>,locale);
 if(!session)return localizeTree(<div style={{display:'flex',gap:12,alignItems:'center'}}><a className="text-link" href="/?tab=privacy">Guest · My data</a><a className="text-link" href="/signin">Sign in</a></div>,locale);
 return localizeTree(<div style={{display:'flex',gap:12,alignItems:'center'}}><span data-no-translate>{session.user.name}</span><a href="/account/security" className="text-link">Account security</a><button className="text-link" onClick={async()=>{await auth.signOut();location.assign(localizedPath('/',locale));}}>Sign out</button></div>,locale);
}
