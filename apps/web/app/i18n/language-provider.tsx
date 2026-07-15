'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { NextIntlClientProvider } from 'next-intl';
import zhMessages from '../../messages/zh-CN.json';
import enMessages from '../../messages/en-US.json';

export const locales = ['zh-CN', 'en-US'] as const;
export type AppLocale = (typeof locales)[number];

type Messages = typeof zhMessages;

const messagesByLocale: Record<AppLocale, Messages> = {
  'zh-CN': zhMessages,
  'en-US': enMessages,
};

const storageKey = 'job-compliance-locale';

interface LanguageContextValue {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  messages: Messages;
  formatDate: (value: string | number | Date) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatPercent: (value: number) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function normalizeLocale(value: string | null | undefined): AppLocale {
  return locales.includes(value as AppLocale) ? (value as AppLocale) : 'zh-CN';
}

function initialLocale(): AppLocale {
  if (typeof window === 'undefined') return 'zh-CN';
  return normalizeLocale(window.localStorage.getItem(storageKey));
}

export function LanguageProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [locale, setLocaleState] = useState<AppLocale>(initialLocale);
  const messages = messagesByLocale[locale];

  useEffect(() => {
    document.documentElement.lang = locale;
    window.localStorage.setItem(storageKey, locale);
  }, [locale]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      locale,
      setLocale: setLocaleState,
      messages,
      formatDate: (value) =>
        new Intl.DateTimeFormat(locale, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(value)),
      formatNumber: (value, options) => new Intl.NumberFormat(locale, options).format(value),
      formatPercent: (value) =>
        new Intl.NumberFormat(locale, {
          maximumFractionDigits: 1,
          style: 'percent',
        }).format(value),
    }),
    [locale, messages],
  );

  return (
    <LanguageContext.Provider value={value}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        {children}
      </NextIntlClientProvider>
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within LanguageProvider.');
  }
  return context;
}

export function getMessages(locale: AppLocale): Messages {
  return messagesByLocale[locale];
}
