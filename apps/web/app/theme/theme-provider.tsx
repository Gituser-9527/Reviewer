'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { normalizeTheme, resolveTheme, type ResolvedTheme, type Theme } from './theme-utils';

export const themeStorageKey = 'job-compliance-theme';
export { normalizeTheme, resolveTheme, type ResolvedTheme, type Theme } from './theme-utils';

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function applyTheme(theme: Theme) {
  const resolved = resolveTheme(theme, window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  return resolved;
}

export function ThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');

  useEffect(() => {
    const storedTheme = normalizeTheme(window.localStorage.getItem(themeStorageKey));
    setThemeState(storedTheme);
    setResolvedTheme(applyTheme(storedTheme));
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const syncSystemTheme = () => {
      if (theme === 'system') setResolvedTheme(applyTheme(theme));
    };
    media.addEventListener('change', syncSystemTheme);
    return () => media.removeEventListener('change', syncSystemTheme);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      setTheme: (nextTheme) => {
        window.localStorage.setItem(themeStorageKey, nextTheme);
        setThemeState(nextTheme);
        setResolvedTheme(applyTheme(nextTheme));
      },
      toggleTheme: () => {
        const nextTheme: Theme = resolvedTheme === 'dark' ? 'light' : 'dark';
        window.localStorage.setItem(themeStorageKey, nextTheme);
        setThemeState(nextTheme);
        setResolvedTheme(applyTheme(nextTheme));
      },
    }),
    [resolvedTheme, theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) throw new Error('useTheme must be used within ThemeProvider.');
  return context;
}
