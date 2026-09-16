'use client';
import {Moon,Sun} from 'lucide-react';
import {translate,type Locale} from '@/lib/i18n';
// The shared theme script owns the root attribute. React renders stable markup
// so the pre-paint preference and static mirror use exactly the same control.
export function ThemeSwitcher({locale}:{locale:Locale}){return <button type="button" className="theme-switcher" data-theme-toggle="true" title={translate('Switch color theme',locale)}><span className="theme-to-light"><Sun aria-hidden="true" size={16}/>{translate('Light mode',locale)}</span><span className="theme-to-dark"><Moon aria-hidden="true" size={16}/>{translate('Dark mode',locale)}</span></button>;}
