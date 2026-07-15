'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/auth-provider';
import { useLanguage } from '../i18n/language-provider';
import { Badge } from './ui';

type OnboardingStatus = 'not_started' | 'dismissed' | 'completed';

interface OnboardingRecord {
  status: OnboardingStatus;
}

interface GuideTask {
  title: string;
  description: string;
  action: string;
  href: string;
}

const guideIcons = ['01', '02', '03'] as const;

/** A resumable, role-aware first-run guide. Completion is stored by the API for the tenant user. */
export function OnboardingGuide() {
  const auth = useAuth();
  const { messages } = useLanguage();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = messages.onboarding;
  const tasks = t.tasks[auth.role] as readonly GuideTask[];

  useEffect(() => {
    const load = async () => {
      try {
        const response = await auth.fetchWithAuth('/api/onboarding/status');
        if (!response.ok) throw new Error(t.loadFailed);
        const payload = (await response.json()) as OnboardingRecord;
        setStatus(payload.status);
        setIsOpen(payload.status === 'not_started');
      } catch {
        setError(t.loadFailed);
      }
    };
    void load();
  }, [auth, t.loadFailed]);

  const updateStatus = async (action: 'dismiss' | 'complete') => {
    setIsSaving(true);
    setError(null);
    try {
      const response = await auth.fetchWithAuth(`/api/onboarding/${action}`, { method: 'POST' });
      if (!response.ok) throw new Error(t.saveFailed);
      const payload = (await response.json()) as OnboardingRecord;
      setStatus(payload.status);
      setIsOpen(false);
    } catch {
      setError(t.saveFailed);
    } finally {
      setIsSaving(false);
    }
  };

  if (status === null && error === null) return null;

  return (
    <>
      {status !== 'completed' ? (
        <button
          aria-label={t.continueLabel}
          className="onboarding-launcher"
          type="button"
          onClick={() => setIsOpen(true)}
        >
          <span aria-hidden="true">?</span>
          {t.continue}
        </button>
      ) : null}

      {isOpen ? (
        <div className="onboarding-backdrop" role="presentation">
          <section aria-labelledby="onboarding-title" aria-modal="true" className="onboarding-guide" role="dialog">
            <header className="onboarding-guide__hero">
              <div>
                <p>{t.eyebrow}</p>
                <h2 id="onboarding-title">{t.title}</h2>
                <span>{t.description}</span>
              </div>
              <Badge tone="info">{messages.permissions.roles[auth.role]}</Badge>
            </header>

            <div className="onboarding-guide__flow" aria-label={t.flowLabel}>
              <span>{t.flow.input}</span><i aria-hidden="true">→</i><span>{t.flow.audit}</span><i aria-hidden="true">→</i><span>{t.flow.evidence}</span><i aria-hidden="true">→</i><span>{t.flow.action}</span>
            </div>

            <ol className="onboarding-guide__tasks">
              {tasks.map((task, index) => (
                <li key={task.href}>
                  <span aria-hidden="true">{guideIcons[index] ?? String(index + 1).padStart(2, '0')}</span>
                  <div><strong>{task.title}</strong><p>{task.description}</p></div>
                  <Link className="ghost-button" href={task.href} onClick={() => setIsOpen(false)}>{task.action}</Link>
                </li>
              ))}
            </ol>

            <footer>
              <Link className="text-link" href="/help-center" onClick={() => setIsOpen(false)}>{t.helpCenter}</Link>
              <div>
                <button className="ghost-button" disabled={isSaving} type="button" onClick={() => void updateStatus('dismiss')}>{t.skip}</button>
                <button className="submit-button submit-button--inline" disabled={isSaving} type="button" onClick={() => void updateStatus('complete')}>{isSaving ? t.saving : t.complete}</button>
              </div>
            </footer>
            {error ? <p className="onboarding-guide__error" role="alert">{error}</p> : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
