'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useLanguage } from '../i18n/language-provider';
import { PublicSiteHeader } from '../components/public-site-header';

interface TrialForm {
  companyName: string;
  contactName: string;
  email: string;
  companySize: string;
  useCase: string;
}

const initialForm: TrialForm = {
  companyName: '',
  contactName: '',
  email: '',
  companySize: '',
  useCase: '',
};

export default function LandingPage() {
  const { messages } = useLanguage();
  const content = messages.landing;
  const [form, setForm] = useState<TrialForm>(initialForm);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

  const submitTrial = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus('submitting');
    try {
      const response = await fetch('/api/trial-requests', {
        body: JSON.stringify({
          companyName: form.companyName,
          contactName: form.contactName,
          email: form.email,
          ...(form.companySize ? { companySize: form.companySize } : {}),
          ...(form.useCase ? { useCase: form.useCase } : {}),
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      if (!response.ok) throw new Error('trial-request-failed');
      setForm(initialForm);
      setStatus('success');
    } catch {
      setStatus('error');
    }
  };

  return (
    <main className="public-site">
      <PublicSiteHeader active="home" />
      <section className="landing-hero">
        <div className="landing-hero__copy">
          <p className="public-eyebrow">{content.hero.eyebrow}</p>
          <h1>{content.hero.title}</h1>
          <p className="landing-hero__description">{content.hero.description}</p>
          <div className="landing-hero__actions">
            <a className="public-cta" href="#request-demo">{content.hero.primaryAction}</a>
            <Link className="public-text-link" href="/api-docs">{content.hero.secondaryAction}</Link>
          </div>
          <p className="landing-hero__note">{content.hero.note}</p>
        </div>
        <div aria-label={content.hero.visualLabel} className="landing-console" role="img">
          <div className="landing-console__top"><span>{content.hero.consoleLabel}</span><i /></div>
          <div className="landing-console__decision">
            <small>{content.hero.decisionLabel}</small><strong>REVIEW</strong><span>{content.hero.decisionNote}</span>
          </div>
          <div className="landing-console__signals">
            <article><b>01</b><span>{content.hero.signalRule}</span><em>RULE</em></article>
            <article><b>02</b><span>{content.hero.signalEvidence}</span><em>RAG</em></article>
            <article><b>03</b><span>{content.hero.signalHuman}</span><em>HITL</em></article>
          </div>
        </div>
      </section>

      <section className="landing-trust-strip" aria-label={content.trustLabel}>
        {content.trust.map((item) => <span key={item}>{item}</span>)}
      </section>

      <section className="landing-section" id="features">
        <div className="landing-section__heading"><p className="public-eyebrow">{content.features.eyebrow}</p><h2>{content.features.title}</h2></div>
        <div className="landing-feature-grid">
          {content.features.items.map((item, index) => (
            <article className="landing-feature-card" key={item.title}>
              <span>0{index + 1}</span><h3>{item.title}</h3><p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-section--tinted" id="how-it-works">
        <div className="landing-section__heading"><p className="public-eyebrow">{content.howItWorks.eyebrow}</p><h2>{content.howItWorks.title}</h2></div>
        <ol className="landing-flow">
          {content.howItWorks.steps.map((item, index) => <li key={item.title}><b>{index + 1}</b><div><h3>{item.title}</h3><p>{item.description}</p></div></li>)}
        </ol>
      </section>

      <section className="landing-section" id="use-cases">
        <div className="landing-section__heading"><p className="public-eyebrow">{content.useCases.eyebrow}</p><h2>{content.useCases.title}</h2></div>
        <div className="landing-use-cases">
          {content.useCases.items.map((item) => <article key={item.title}><h3>{item.title}</h3><p>{item.description}</p><span>{item.outcome}</span></article>)}
        </div>
      </section>

      <section className="landing-security" id="security">
        <div><p className="public-eyebrow">{content.security.eyebrow}</p><h2>{content.security.title}</h2><p>{content.security.description}</p></div>
        <ul>{content.security.items.map((item) => <li key={item}><span>+</span>{item}</li>)}</ul>
      </section>

      <section className="landing-section landing-api" id="api">
        <div className="landing-section__heading"><p className="public-eyebrow">{content.api.eyebrow}</p><h2>{content.api.title}</h2><p>{content.api.description}</p><Link className="public-text-link" href="/api-docs">{content.api.action}</Link></div>
        <pre aria-label={content.api.codeLabel}>{content.api.code}</pre>
      </section>

      <section className="landing-pricing" id="pricing"><p className="public-eyebrow">{content.pricing.eyebrow}</p><h2>{content.pricing.title}</h2><p>{content.pricing.description}</p><span>{content.pricing.note}</span></section>

      <section className="landing-request" id="request-demo">
        <div><p className="public-eyebrow">{content.request.eyebrow}</p><h2>{content.request.title}</h2><p>{content.request.description}</p><small>{content.request.privacyNote}</small></div>
        <form onSubmit={submitTrial}>
          <label>{content.request.companyName}<input required value={form.companyName} onChange={(event) => setForm({ ...form, companyName: event.target.value })} /></label>
          <label>{content.request.contactName}<input required value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value })} /></label>
          <label>{content.request.email}<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
          <label>{content.request.companySize}<input value={form.companySize} onChange={(event) => setForm({ ...form, companySize: event.target.value })} /></label>
          <label className="landing-request__wide">{content.request.useCase}<textarea rows={3} value={form.useCase} onChange={(event) => setForm({ ...form, useCase: event.target.value })} /></label>
          <div className="landing-request__wide"><button className="public-cta" disabled={status === 'submitting'} type="submit">{status === 'submitting' ? content.request.submitting : content.request.submit}</button>{status === 'success' ? <p className="form-notice form-notice--success">{content.request.success}</p> : null}{status === 'error' ? <p className="form-notice form-notice--error">{content.request.error}</p> : null}</div>
        </form>
      </section>

      <footer className="public-footer"><span>{content.footer.disclaimer}</span><div><Link href="/api-docs">{content.footer.apiDocs}</Link><Link href="/">{content.footer.login}</Link></div></footer>
    </main>
  );
}
