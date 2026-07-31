import { describe, expect, it } from 'vitest';
import { InMemoryLearningFeedbackRepository, LearningFeedbackError, LearningFeedbackService } from './service.js';
import { ticket } from './test-fixture.js';

function service() { return new LearningFeedbackService(new InMemoryLearningFeedbackRepository(), 'test-pseudonym-key', 'test-v1'); }

describe('LearningFeedbackService', () => {
  it('previews with deterministic double-redaction and does not persist', async () => {
    const subject = service();
    const preview = subject.preview(ticket, { source: 'WEB', consentScope: 'TENANT_PRIVATE', consentNoticeVersion: 'notice-v1', purpose: 'quality review', retentionDays: 30, comment: 'contact 13800138000 and Bearer secret-value', evidenceFragments: ['https://example.test/path?x=1'] });
    expect(preview.sanitizedComment).not.toContain('13800138000');
    expect(preview.sanitizedComment).not.toContain('secret-value');
    expect(preview.sanitizedEvidenceFragments[0]).not.toContain('example.test');
    expect(preview.redactionSummary.redactionCount).toBeGreaterThan(0);
  });

  it('requires explicit confirmation and preserves idempotency', async () => {
    const subject = service();
    const input = { source: 'WEB' as const, consentScope: 'TENANT_PRIVATE' as const, consentNoticeVersion: 'notice-v1', purpose: 'quality review', retentionDays: 30, comment: 'safe comment', evidenceFragments: [] };
    const preview = subject.preview(ticket, input);
    await expect(subject.submit(ticket, 'reviewer-a', { ...input, digest: preview.digest, explicitConfirmation: false })).rejects.toMatchObject({ code: 'CONSENT_CONFIRMATION_REQUIRED' });
    const first = await subject.submit(ticket, 'reviewer-a', { ...input, digest: preview.digest, explicitConfirmation: true });
    const second = await subject.submit(ticket, 'reviewer-a', { ...input, digest: preview.digest, explicitConfirmation: true });
    expect(second.id).toBe(first.id);
    expect(first.reviewerPseudonym).not.toContain('reviewer-a');
    expect(first.status).toBe('RECEIVED');
  });

  it('fails closed for unavailable global consent, wrong reviewer, and changed preview', async () => {
    const subject = service();
    expect(() => subject.preview(ticket, { source: 'WEB', consentScope: 'GLOBAL_ANONYMIZED', consentNoticeVersion: 'notice-v1', purpose: 'quality', retentionDays: 30 })).toThrow(LearningFeedbackError);
    const input = { source: 'WEB' as const, consentScope: 'TENANT_PRIVATE' as const, consentNoticeVersion: 'notice-v1', purpose: 'quality', retentionDays: 30, comment: 'one', evidenceFragments: [] };
    const preview = subject.preview(ticket, input);
    await expect(subject.submit(ticket, 'other-reviewer', { ...input, digest: preview.digest, explicitConfirmation: true })).rejects.toMatchObject({ code: 'REVIEW_DECISION_REQUIRED' });
    await expect(subject.submit(ticket, 'reviewer-a', { ...input, comment: 'changed', digest: preview.digest, explicitConfirmation: true })).rejects.toMatchObject({ code: 'PREVIEW_DIGEST_MISMATCH' });
  });

  it('produces tenant-scoped pseudonyms and supports withdrawal without promotion', async () => {
    const subject = service();
    const input = { source: 'WEB' as const, consentScope: 'TENANT_PRIVATE' as const, consentNoticeVersion: 'notice-v1', purpose: 'quality', retentionDays: 1, comment: '', evidenceFragments: [] };
    const preview = subject.preview(ticket, input);
    const record = await subject.submit(ticket, 'reviewer-a', { ...input, digest: preview.digest, explicitConfirmation: true });
    const withdrawn = await subject.withdraw(record.id, 'tenant-a');
    expect(withdrawn.status).toBe('WITHDRAWN');
  });
});
