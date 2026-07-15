'use client';

import Link from 'next/link';
import { useLanguage } from '../i18n/language-provider';
import { LanguageSwitcher } from './language-switcher';

export function PublicSiteHeader({ active }: Readonly<{ active: 'home' | 'docs' }>) {
  const { messages } = useLanguage();
  const nav = messages.landing.nav;

  return (
    <header className="public-site-header">
      <Link aria-label={messages.app.name} className="public-brand" href="/landing">
        <span>JC</span>
        <strong>{messages.landing.brand}</strong>
      </Link>
      <nav aria-label={messages.landing.navigationLabel} className="public-nav">
        <Link href={active === 'home' ? '#features' : '/landing#features'}>{nav.features}</Link>
        <Link href={active === 'home' ? '#security' : '/landing#security'}>{nav.security}</Link>
        <Link aria-current={active === 'docs' ? 'page' : undefined} href="/api-docs">
          {nav.apiDocs}
        </Link>
      </nav>
      <div className="public-site-header__actions">
        <LanguageSwitcher />
        <Link className="public-login" href="/">
          {messages.landing.login}
        </Link>
        <Link className="public-cta public-cta--small" href={active === 'home' ? '#request-demo' : '/landing#request-demo'}>
          {messages.landing.requestDemo}
        </Link>
      </div>
    </header>
  );
}
