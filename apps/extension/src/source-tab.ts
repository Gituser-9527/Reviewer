export interface BrowserTab { id?: number; url?: string; active?: boolean; lastAccessed?: number; }
export function selectSourceTab(tabs: readonly BrowserTab[]): BrowserTab | undefined {
  const valid = tabs.filter((tab) => tab.id !== undefined && /^https?:\/\//u.test(tab.url ?? ''));
  return valid.sort((left, right) => Number(Boolean(right.active)) - Number(Boolean(left.active)) || (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0))[0];
}
