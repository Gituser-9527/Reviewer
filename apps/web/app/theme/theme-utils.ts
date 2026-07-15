export const themes = ['light', 'dark', 'system'] as const;
export type Theme = (typeof themes)[number];
export type ResolvedTheme = Exclude<Theme, 'system'>;

export function normalizeTheme(value: string | null | undefined): Theme {
  return themes.includes(value as Theme) ? (value as Theme) : 'system';
}

export function resolveTheme(theme: Theme, prefersDark: boolean): ResolvedTheme {
  return theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme;
}
