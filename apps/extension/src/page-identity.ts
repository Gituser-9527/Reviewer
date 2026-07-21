import type { PageBinding, PageIdentity, WebJobCapture } from './types.js';

const separator = '\u001f';

export function normalizePageUrl(value: string): string {
  try {
    const url = new URL(value);
    url.searchParams.sort();
    return `${url.protocol}//${url.host}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return `invalid:${stableHash(value)}`;
  }
}

export function captureFingerprint(capture: WebJobCapture): string {
  const job = capture.job;
  return stableHash([
    job.title,
    job.companyName,
    job.location,
    job.salary,
    job.employmentType,
    job.description,
    job.requirements.join(separator),
  ].map(normalizeText).join(separator));
}

export function identityForCapture(capture: WebJobCapture): PageIdentity {
  return { normalizedUrl:normalizePageUrl(capture.sourceUrl), captureFingerprint:captureFingerprint(capture) };
}

export function createPageBinding(tabId: number, capture: WebJobCapture): PageBinding {
  return { tabId, identity:identityForCapture(capture), generation:crypto.randomUUID(), boundAt:new Date().toISOString() };
}

export function samePageIdentity(left: PageIdentity, right: PageIdentity): boolean {
  return left.normalizedUrl === right.normalizedUrl && left.captureFingerprint === right.captureFingerprint;
}

function normalizeText(value: string | undefined): string { return (value ?? '').trim().replace(/\s+/gu, ' '); }
export function stableHash(value: string): string { let first = 0x811c9dc5; let second = 0x01000193; for (let index = 0; index < value.length; index += 1) { const code = value.charCodeAt(index); first = Math.imul(first ^ code, 0x01000193); second = Math.imul(second ^ code, 0x85ebca6b); } return `${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}`; }
