import { extractDocument } from './extractor.js';
import { applyFindingHighlights, clearFindingHighlights } from './finding-highlighter.js';
import { identityForCapture } from './page-identity.js';
import type { ExtensionMessage } from './types.js';

let identityTimer: number | undefined;
let observer: MutationObserver | undefined;
const navigationEvent = 'job-compliance:navigation';

function scheduleIdentityVerification(): void {
  if (identityTimer !== undefined) window.clearTimeout(identityTimer);
  identityTimer = window.setTimeout(() => {
    identityTimer = undefined;
    const capture = extractDocument(document, location.href);
    if (capture) void chrome.runtime.sendMessage({ type: 'PAGE_IDENTITY_SIGNAL', identity: identityForCapture(capture) }).catch(() => undefined);
  }, 120);
}

function extensionOwned(node: Node): boolean {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  return element?.closest('[data-job-compliance-highlight]') !== null;
}

function installObserver(): void {
  if (observer || !document.body) return;
  observer = new MutationObserver((mutations) => {
    if (mutations.every((mutation) => Array.from(mutation.addedNodes).concat(Array.from(mutation.removedNodes)).every(extensionOwned))) return;
    scheduleIdentityVerification();
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

window.addEventListener(navigationEvent, scheduleIdentityVerification);
if (document.body) installObserver(); else window.addEventListener('DOMContentLoaded', installObserver, { once: true });
scheduleIdentityVerification();

chrome.runtime.onMessage.addListener((message: unknown, _sender, respond) => {
  const m = message as Partial<ExtensionMessage>;
  if (m.type === 'EXTRACT_CURRENT_JOB') {
    const capture = extractDocument(document, location.href);
    respond(capture ? { type: 'JOB_EXTRACTION_SUCCEEDED', capture } : { type: 'JOB_EXTRACTION_FAILED', code: 'NO_JOB_FOUND' });
    return true;
  }
  if (m.type === 'APPLY_FINDING_HIGHLIGHTS') {
    if (!Array.isArray(m.findings) || m.findings.some((finding) => typeof finding?.id !== 'string' || typeof finding.text !== 'string' || typeof finding.severity !== 'string')) {
      respond({ type: 'FINDING_HIGHLIGHTS_FAILED', code: 'INVALID_HIGHLIGHT_REQUEST' });
      return true;
    }
    respond({ type: 'FINDING_HIGHLIGHTS_APPLIED', ...applyFindingHighlights(document, m.findings) });
    return true;
  }
  if (m.type === 'CLEAR_FINDING_HIGHLIGHTS') {
    respond({ type: 'FINDING_HIGHLIGHTS_CLEARED', clearedCount: clearFindingHighlights(document) });
    return true;
  }
  respond({ type: 'JOB_EXTRACTION_FAILED', code: 'INVALID_PAGE' });
  return true;
});
