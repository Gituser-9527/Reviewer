import { invalidateState, loadState } from './storage.js';
import { invalidationReason } from './page-lifecycle.js';
import { isPageIdentity } from './types.js';

chrome.tabs.onActivated.addListener((info) => {
  void chrome.tabs.get(info.tabId).then((tab) => {
    if (tab.id !== undefined && /^https?:\/\//u.test(tab.url ?? '')) void chrome.storage.session.set({ recentSourceTabId: tab.id });
  });
});
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.status === 'complete' && /^https?:\/\//u.test(tab.url ?? '')) void chrome.storage.session.set({ recentSourceTabId: tabId });
});
chrome.tabs.onRemoved.addListener((tabId) => {
  void loadState().then((state) => {
    if (state?.binding?.tabId === tabId && state.lifecycle.status === 'CURRENT') return invalidateState('PAGE_BINDING_CHANGED');
    return undefined;
  });
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (typeof message === 'object' && message !== null && (message as { type?: unknown }).type === 'PAGE_IDENTITY_SIGNAL') {
    const identity = (message as { identity?: unknown }).identity;
    const stableExtractionFailure = (message as { stableExtractionFailure?: unknown }).stableExtractionFailure === true;
    const tabId = sender.tab?.id;
    if (tabId === undefined || !isPageIdentity(identity)) { respond({ type: 'PAGE_IDENTITY_CHECKED', lifecycle: { status: 'CURRENT' } }); return true; }
    void loadState().then(async (state) => {
      if (!state?.binding || state.binding.tabId !== tabId || state.lifecycle.status === 'STALE') return state?.lifecycle ?? { status: 'CURRENT' };
      const reason = invalidationReason(state.binding, identity) ?? (stableExtractionFailure && state.binding.identity.captureFingerprint !== null ? 'JOB_CONTENT_CHANGED' : undefined);
      if (!reason) return state.lifecycle;
      const invalidated = await invalidateState(reason);
      await chrome.tabs.sendMessage(tabId, { type: 'CLEAR_FINDING_HIGHLIGHTS' }).catch(() => undefined);
      return invalidated?.lifecycle ?? { status: 'CURRENT' };
    }).then((lifecycle) => respond({ type: 'PAGE_IDENTITY_CHECKED', lifecycle })).catch(() => respond({ type: 'PAGE_IDENTITY_CHECKED', lifecycle: { status: 'CURRENT' } }));
    return true;
  }
  respond({ extensionId: chrome.runtime.id });
  return true;
});
