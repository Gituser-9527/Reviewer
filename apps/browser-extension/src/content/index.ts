import type { ExtensionMessage, PageSnapshot } from '../messaging/protocol.js';

const highlightedClass = 'job-compliance-audit-highlight';
function snapshot(): PageSnapshot {
  return { pageUrl: location.href, pageTitle: document.title, mainText: (document.querySelector('main')?.textContent ?? document.body.innerText).trim(), jsonLdTexts: [...document.querySelectorAll('script[type="application/ld+json"]')].map((node) => node.textContent ?? '').filter(Boolean), embeddedJsonTexts: [] };
}
function clearHighlights(): void { document.querySelectorAll(`.${highlightedClass}`).forEach((node) => node.classList.remove(highlightedClass)); }
function highlight(locators: Array<{ selector?: string; textQuote?: string }>): void { clearHighlights(); locators.forEach((locator) => { if (locator.selector) document.querySelectorAll(locator.selector).forEach((node) => node.classList.add(highlightedClass)); }); }
const installedKey = '__jobComplianceCaptureListenerInstalled__';
if (!(globalThis as Record<string, unknown>)[installedKey]) {
  (globalThis as Record<string, unknown>)[installedKey] = true;
  chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
    if (message.type === 'WEB_CAPTURE_READ_CURRENT_PAGE') { sendResponse({ type: 'WEB_CAPTURE_PAGE_SNAPSHOT', payload: snapshot() }); return; }
    if (message.type === 'WEB_CAPTURE_HIGHLIGHT') highlight(message.locators);
    if (message.type === 'WEB_CAPTURE_CLEAR_HIGHLIGHTS') clearHighlights();
  });
}
