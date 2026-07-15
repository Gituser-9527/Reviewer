'use client';

import Link from 'next/link';
import { useLanguage } from '../i18n/language-provider';
import { PublicSiteHeader } from '../components/public-site-header';

export default function ApiDocsPage() {
  const { messages } = useLanguage();
  const docs = messages.apiPortal;

  return (
    <main className="public-site api-portal">
      <PublicSiteHeader active="docs" />
      <section className="api-portal__hero"><p className="public-eyebrow">{docs.eyebrow}</p><h1>{docs.title}</h1><p>{docs.description}</p><div><a className="public-cta" href="#quickstart">{docs.quickstart}</a><Link className="public-text-link" href="/landing#request-demo">{docs.requestDemo}</Link></div></section>
      <section className="api-portal__layout" id="quickstart">
        <aside><p>{docs.contents}</p><a href="#authentication">{docs.authentication}</a><a href="#endpoints">{docs.endpointsTitle}</a><a href="#sdk">{docs.sdkTitle}</a><a href="#sandbox">{docs.sandboxTitle}</a></aside>
        <div className="api-portal__content">
          <section id="authentication"><p className="public-eyebrow">01</p><h2>{docs.authentication}</h2><p>{docs.authenticationDescription}</p><pre>{docs.authenticationCode}</pre></section>
          <section id="endpoints"><p className="public-eyebrow">02</p><h2>{docs.endpointsTitle}</h2><div className="api-endpoint-list">{docs.endpoints.map((endpoint) => <article key={endpoint.path}><span className={`api-method api-method--${endpoint.method.toLowerCase()}`}>{endpoint.method}</span><code>{endpoint.path}</code><p>{endpoint.description}</p></article>)}</div></section>
          <section id="sdk"><p className="public-eyebrow">03</p><h2>{docs.sdkTitle}</h2><p>{docs.sdkDescription}</p><pre>{docs.sdkCode}</pre></section>
          <section id="sandbox" className="api-sandbox"><p className="public-eyebrow">04</p><h2>{docs.sandboxTitle}</h2><p>{docs.sandboxDescription}</p><Link className="public-cta" href="/landing#request-demo">{docs.sandboxAction}</Link></section>
        </div>
      </section>
      <footer className="public-footer"><span>{docs.footer}</span><Link href="/landing">{docs.backHome}</Link></footer>
    </main>
  );
}
