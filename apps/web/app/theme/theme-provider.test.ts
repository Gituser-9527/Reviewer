import { describe, expect, it } from 'vitest';
import { normalizeTheme, resolveTheme } from './theme-utils';

describe('theme preference policy', () => {
  it('defaults unknown persisted values to system', () => {
    expect(normalizeTheme(null)).toBe('system');
    expect(normalizeTheme('unexpected')).toBe('system');
  });

  it('preserves supported persisted values', () => {
    expect(normalizeTheme('light')).toBe('light');
    expect(normalizeTheme('dark')).toBe('dark');
    expect(normalizeTheme('system')).toBe('system');
  });

  it('resolves system preference without changing an explicit user choice', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});
