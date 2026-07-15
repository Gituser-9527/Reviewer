import type { ExtensionMessage } from '../messaging/protocol.js';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type !== 'WEB_CAPTURE_READ_CURRENT_PAGE') return;
  void (async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.id === undefined) throw new Error('ACTIVE_TAB_NOT_FOUND');
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/index.js'] });
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content/styles.css'] });
    sendResponse(await chrome.tabs.sendMessage(tab.id, message));
  })().catch((error: unknown) => sendResponse({ type: 'WEB_CAPTURE_ERROR', message: error instanceof Error ? error.message : 'WEB_CAPTURE_FAILED' }));
  return true;
});
