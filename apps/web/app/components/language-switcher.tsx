'use client';

import { locales, useLanguage, type AppLocale } from '../i18n/language-provider';

export function LanguageSwitcher() {
  const { locale, setLocale, messages } = useLanguage();

  return (
    <label className="language-switcher">
      <span>{messages.language.label}</span>
      <select
        aria-label={messages.language.label}
        value={locale}
        onChange={(event) => setLocale(event.target.value as AppLocale)}
      >
        {locales.map((item) => (
          <option key={item} value={item}>
            {messages.language[item]}
          </option>
        ))}
      </select>
    </label>
  );
}
