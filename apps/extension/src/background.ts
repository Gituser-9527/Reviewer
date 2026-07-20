chrome.tabs.onActivated.addListener((info) => {
  void chrome.tabs.get(info.tabId).then((tab) => {
    if (tab.id !== undefined && /^https?:\/\//u.test(tab.url ?? '')) {
      void chrome.storage.session.set({ recentSourceTabId: tab.id });
    }
  });
});
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.status === 'complete' && /^https?:\/\//u.test(tab.url ?? '')) {
    void chrome.storage.session.set({ recentSourceTabId: tabId });
  }
});
/** Keeps a real MV3 extension context available for browser-level verification. */
chrome.runtime.onMessage.addListener((_message, _sender, respond) => {
  respond({ extensionId: chrome.runtime.id });
});
