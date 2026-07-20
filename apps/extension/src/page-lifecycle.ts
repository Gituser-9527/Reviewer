import type { PageBinding, PageIdentity, PageLifecycle } from './types.js';

export function invalidationReason(binding: PageBinding, identity: PageIdentity): Extract<PageLifecycle, { status: 'STALE' }>['reason'] | undefined {
  if (binding.identity.normalizedUrl !== identity.normalizedUrl) return 'URL_CHANGED';
  if (binding.identity.captureFingerprint !== null && identity.captureFingerprint !== null && binding.identity.captureFingerprint !== identity.captureFingerprint) return 'JOB_CONTENT_CHANGED';
  return undefined;
}

export function acceptsAuditResponse(current: { binding?: PageBinding; lifecycle: PageLifecycle }, request: PageBinding): boolean {
  return current.lifecycle.status === 'CURRENT' && current.binding?.tabId === request.tabId && current.binding.generation === request.generation;
}
