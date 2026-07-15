'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../theme/theme-provider';
import { themes, type Theme } from '../theme/theme-utils';
import { useLanguage } from '../i18n/language-provider';

const icons: Record<Theme, string> = { light: '☀', dark: '☾', system: '◉' };

export function ThemeSwitcher() {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
  const { messages } = useLanguage();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const labels = messages.theme;

  useEffect(() => {
    const closeOnOutsidePress = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsidePress);
    return () => document.removeEventListener('mousedown', closeOnOutsidePress);
  }, []);

  return (
    <div className="theme-switcher" ref={rootRef}>
      <button
        aria-label={labels.switchTheme}
        className="theme-switcher__toggle"
        title={labels.switchTheme}
        type="button"
        onClick={toggleTheme}
      >
        <span aria-hidden="true">{icons[resolvedTheme]}</span>
      </button>
      <button
        aria-controls="theme-options"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={labels.currentTheme.replace('{theme}', labels[theme])}
        className="theme-switcher__menu-button"
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">⌄</span>
      </button>
      {open ? (
        <div className="theme-switcher__menu" id="theme-options" role="menu">
          {themes.map((item) => (
            <button
              aria-checked={theme === item}
              className={theme === item ? 'theme-switcher__option theme-switcher__option--selected' : 'theme-switcher__option'}
              key={item}
              role="menuitemradio"
              type="button"
              onClick={() => {
                setTheme(item);
                setOpen(false);
              }}
            >
              <span aria-hidden="true">{icons[item]}</span>
              {labels[item]}
              {theme === item ? <b aria-label={labels.selected}>✓</b> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
