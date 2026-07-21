import { extractDocument } from './extractor.js';
import { applyFindingHighlights, clearFindingHighlights } from './finding-highlighter.js';
import { identityForCapture, normalizePageUrl } from './page-identity.js';
import type { ExtensionMessage } from './types.js';

let identityTimer: number | undefined;
let observer: MutationObserver | undefined;
let failedIdentityChecks = 0;
const navigationEvent = 'job-compliance:navigation';

function scheduleIdentityVerification(): void {
  if (identityTimer !== undefined) window.clearTimeout(identityTimer);
  identityTimer = window.setTimeout(() => {
    identityTimer = undefined;
    const capture = extractDocument(document, location.href);
    if (capture) {
      failedIdentityChecks = 0;
      void chrome.runtime.sendMessage({ type: 'PAGE_IDENTITY_SIGNAL', identity: identityForCapture(capture) }).catch(() => undefined);
      return;
    }
    failedIdentityChecks += 1;
    const identity = { normalizedUrl: normalizePageUrl(location.href), captureFingerprint: null };
    void chrome.runtime.sendMessage({ type: 'PAGE_IDENTITY_SIGNAL', identity, stableExtractionFailure: failedIdentityChecks > 1 }).catch(() => undefined);
    if (failedIdentityChecks === 1) scheduleIdentityVerification();
  }, 120);
}

function extensionOwned(node: Node): boolean {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  return element?.closest('[data-job-compliance-highlight]') !== null;
}

function extensionOwnedMutation(mutation: MutationRecord): boolean {
  if (mutation.type === 'characterData') return extensionOwned(mutation.target);
  return Array.from(mutation.addedNodes).concat(Array.from(mutation.removedNodes)).every(extensionOwned);
}

function installObserver(): void {
  if (observer || !document.body) return;
  observer = new MutationObserver((mutations) => {
    if (mutations.every(extensionOwnedMutation)) return;
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
  if (m.type === 'GET_PAGE_IDENTITY') {
    const capture = extractDocument(document, location.href);
    respond({ type: 'PAGE_IDENTITY_RESOLVED', identity: capture ? identityForCapture(capture) : { normalizedUrl: normalizePageUrl(location.href), captureFingerprint: null } });
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
