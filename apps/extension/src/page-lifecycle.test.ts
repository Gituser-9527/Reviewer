import { describe, expect, it } from 'vitest';
import { acceptsAuditResponse, invalidationReason } from './page-lifecycle.js';
import type { PageBinding } from './types.js';

const binding: PageBinding = { tabId: 7, generation: 'first', boundAt: 'now', identity: { normalizedUrl: 'https://jobs.example.test/job?id=1', captureFingerprint: 'fingerprint-a' } };

describe('page lifecycle', () => {
  it('does not invalidate an identical identity, but distinguishes URL and job-content changes', () => {
    expect(invalidationReason(binding, binding.identity)).toBeUndefined();
    expect(invalidationReason(binding, { ...binding.identity, normalizedUrl: 'https://jobs.example.test/job?id=2' })).toBe('URL_CHANGED');
    expect(invalidationReason(binding, { ...binding.identity, captureFingerprint: 'fingerprint-b' })).toBe('JOB_CONTENT_CHANGED');
  });
  it('only accepts an audit response for the current tab, generation, and page identity', () => {
    expect(acceptsAuditResponse({ binding, lifecycle: { status: 'CURRENT' } }, binding)).toBe(true);
    expect(acceptsAuditResponse({ binding: { ...binding, generation: 'second' }, lifecycle: { status: 'CURRENT' } }, binding)).toBe(false);
    expect(acceptsAuditResponse({ binding, lifecycle: { status: 'STALE', reason: 'URL_CHANGED', invalidatedAt: 'now' } }, binding)).toBe(false);
    expect(acceptsAuditResponse({ binding: { ...binding, tabId: 8 }, lifecycle: { status: 'CURRENT' } }, binding)).toBe(false);
    expect(acceptsAuditResponse({ binding: { ...binding, identity: { ...binding.identity, normalizedUrl: 'https://jobs.example.test/job?id=2' } }, lifecycle: { status: 'CURRENT' } }, binding)).toBe(false);
    expect(acceptsAuditResponse({ binding: { ...binding, identity: { ...binding.identity, captureFingerprint: 'fingerprint-b' } }, lifecycle: { status: 'CURRENT' } }, binding)).toBe(false);
  });
});
