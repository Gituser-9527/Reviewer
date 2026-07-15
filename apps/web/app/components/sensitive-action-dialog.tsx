'use client';

import { useState } from 'react';
import { useLanguage } from '../i18n/language-provider';

export interface SensitiveActionConfig {
  title: string;
  description: string;
  impact: string[];
  confirmText: string;
  confirmButtonLabel: string;
  tone?: 'danger' | 'warning';
}

export function SensitiveActionDialog({
  config,
  busy = false,
  onCancel,
  onConfirm,
}: Readonly<{
  config: SensitiveActionConfig;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}>) {
  const { messages } = useLanguage();
  const [value, setValue] = useState('');
  const t = messages.permissions.sensitiveAction;
  const confirmed = value.trim() === config.confirmText;

  return (
    <div className="feedback-dialog-backdrop" role="presentation">
      <section
        aria-labelledby="sensitive-action-title"
        aria-modal="true"
        className={`sensitive-dialog sensitive-dialog--${config.tone ?? 'warning'}`}
        role="dialog"
      >
        <div className="audit-workbench-card__head">
          <div>
            <p className="section-label">{t.eyebrow}</p>
            <h2 id="sensitive-action-title">{config.title}</h2>
          </div>
          <button className="ghost-button" type="button" onClick={onCancel}>
            {t.cancel}
          </button>
        </div>

        <p>{config.description}</p>
        <div className="sensitive-dialog__impact">
          <strong>{t.impactScope}</strong>
          <ul>
            {config.impact.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <label>
          <span>
            {t.confirmInput.replace('{text}', config.confirmText)}
          </span>
          <input
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <div className="audit-workbench-form__actions">
          <button
            className="submit-button submit-button--inline"
            disabled={!confirmed || busy}
            type="button"
            onClick={onConfirm}
          >
            {busy ? t.processing : config.confirmButtonLabel}
          </button>
          <button className="ghost-button" type="button" onClick={onCancel}>
            {t.cancel}
          </button>
        </div>
      </section>
    </div>
  );
}
