import { describe, expect, it } from 'vitest';
import {
  learningFeedbackConsentNoticeVersion,
  learningFeedbackPurpose,
  learningFeedbackSource,
  type LearningFeedbackEvent,
  type LearningFeedbackStatus,
} from '@job-compliance/shared';
import { InMemoryLearningFeedbackRepository, LearningFeedbackError, LearningFeedbackService } from './service.js';
import { ticket } from './test-fixture.js';

const input = (comment = 'safe comment') => ({
  consentScope: 'TENANT_PRIVATE' as const,
  retentionDays: 30,
  comment,
  evidenceFragments: [] as string[],
});

function setup(noticeVersion = learningFeedbackConsentNoticeVersion) {
  const repository = new InMemoryLearningFeedbackRepository({
    [ticket.feedback!.id]: ticket.feedback!.reviewerId,
  });
  return {
    repository,
    subject: new LearningFeedbackService(
      repository,
      'test-pseudonym-key',
      'test-v1',
      noticeVersion,
    ),
  };
}

describe('LearningFeedbackService', () => {
  it('uses server-controlled metadata and the canonical security sanitizer', () => {
    const { subject } = setup();
    const marker = 'LEARNING_SECRET_MARKER_173';
    const sensitive = `Authorization: Bearer ${marker} access_token=${marker} 手机13800138000 邮箱person@example.com 身份证110101199001011234 https://example.test/${marker} 地址北京市朝阳区幸福路88号 postgresql://user:${marker}@localhost/db`;
    const preview = subject.preview(ticket, {
      ...input(sensitive),
      evidenceFragments: [sensitive],
    });

    expect(preview).toMatchObject({
      noticeVersion: learningFeedbackConsentNoticeVersion,
      purpose: learningFeedbackPurpose,
      consentScope: 'TENANT_PRIVATE',
    });
    expect(learningFeedbackSource).toBe('API');
    expect(JSON.stringify(preview)).not.toContain(marker);
    expect(JSON.stringify(preview)).not.toContain('13800138000');
    expect(JSON.stringify(preview)).not.toContain('person@example.com');
    expect(JSON.stringify(preview)).not.toContain('110101199001011234');
    expect(preview.redactionSummary.needsPrivacyReview).toBe(true);
    expect(preview.redactionSummary.redactionCount).toBeGreaterThan(0);
  });

  it('fails closed when the server consent notice is missing', () => {
    const { subject } = setup('');
    expect(() => subject.preview(ticket, input())).toThrowError(
      expect.objectContaining({ code: 'LEARNING_FEEDBACK_UNAVAILABLE' }),
    );
  });

  it('requires explicit confirmation and atomically preserves idempotency', async () => {
    const { subject } = setup();
    const preview = subject.preview(ticket, input());
    await expect(subject.submit(ticket, 'reviewer-a', { ...input(), digest: preview.digest, explicitConfirmation: false })).rejects.toMatchObject({ code: 'CONSENT_CONFIRMATION_REQUIRED' });
    const results = await Promise.all(Array.from({ length: 20 }, () => subject.submit(ticket, 'reviewer-a', { ...input(), digest: preview.digest, explicitConfirmation: true })));
    expect(new Set(results.map((record) => record.id)).size).toBe(1);
    expect(results[0]).toMatchObject({ source: 'API', purpose: learningFeedbackPurpose, consentNoticeVersion: learningFeedbackConsentNoticeVersion, status: 'RECEIVED' });
    expect(results[0]?.reviewerPseudonym).not.toContain('reviewer-a');
    const events = await subject.listEvents(results[0]!.id, 'tenant-a');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ eventType: 'SUBMITTED', toStatus: 'RECEIVED' });
  });

  it('orders InMemory lifecycle events by occurredAt and id like PostgreSQL', async () => {
    const { repository, subject } = setup();
    const preview = subject.preview(ticket, input('event-order'));
    const record = await subject.submit(ticket, 'reviewer-a', { ...input('event-order'), digest: preview.digest, explicitConfirmation: true });
    const occurredAt = '2026-08-22T00:00:00.000Z';
    const events = repository as unknown as { events: Map<string, LearningFeedbackEvent[]> };
    events.events.set(record.id, [
      { id: 'event-z', tenantId: 'tenant-a', learningFeedbackId: record.id, eventType: 'SUBMITTED', toStatus: 'RECEIVED', actorPseudonym: 'a'.repeat(64), pseudonymKeyVersion: 'test-v1', occurredAt },
      { id: 'event-a', tenantId: 'tenant-a', learningFeedbackId: record.id, eventType: 'WITHDRAWN', fromStatus: 'RECEIVED', toStatus: 'WITHDRAWN', actorPseudonym: 'a'.repeat(64), pseudonymKeyVersion: 'test-v1', occurredAt },
    ]);

    await expect(subject.listEvents(record.id, 'tenant-a')).resolves.toMatchObject([
      { id: 'event-a', occurredAt },
      { id: 'event-z', occurredAt },
    ]);
  });

  it('fails closed for global consent, a wrong reviewer and a changed preview', async () => {
    const { subject } = setup();
    expect(() => subject.preview(ticket, { ...input(), consentScope: 'GLOBAL_ANONYMIZED' })).toThrow(LearningFeedbackError);
    const preview = subject.preview(ticket, input('one'));
    await expect(subject.submit(ticket, 'other-reviewer', { ...input('one'), digest: preview.digest, explicitConfirmation: true })).rejects.toMatchObject({ code: 'REVIEW_DECISION_REQUIRED' });
    await expect(subject.submit(ticket, 'reviewer-a', { ...input('changed'), digest: preview.digest, explicitConfirmation: true })).rejects.toMatchObject({ code: 'PREVIEW_DIGEST_MISMATCH' });
  });

  it('allows only the decision owner to withdraw unreviewed quarantine states', async () => {
    const { subject } = setup();
    const receivedPreview = subject.preview(ticket, input('received'));
    const received = await subject.submit(ticket, 'reviewer-a', { ...input('received'), digest: receivedPreview.digest, explicitConfirmation: true });
    await expect(subject.withdraw(received.id, 'tenant-a', 'reviewer-b')).rejects.toMatchObject({ code: 'LEARNING_FEEDBACK_WITHDRAW_FORBIDDEN' });
    const withdrawn = await subject.withdraw(received.id, 'tenant-a', 'reviewer-a');
    expect(withdrawn.status).toBe('WITHDRAWN');
    await expect(subject.withdraw(received.id, 'tenant-a', 'reviewer-a')).resolves.toMatchObject({ status: 'WITHDRAWN' });
    expect((await subject.listEvents(received.id, 'tenant-a')).map((event) => event.eventType)).toEqual(['SUBMITTED', 'WITHDRAWN']);

    const needsReviewInput = input('地址北京市朝阳区幸福路88号');
    const needsReviewPreview = subject.preview(ticket, needsReviewInput);
    const needsReview = await subject.submit(ticket, 'reviewer-a', { ...needsReviewInput, digest: needsReviewPreview.digest, explicitConfirmation: true });
    expect(needsReview.status).toBe('NEEDS_REVIEW');
    await expect(subject.withdraw(needsReview.id, 'tenant-a', 'reviewer-a')).resolves.toMatchObject({ status: 'WITHDRAWN' });
  });

  it('does not let the submitter withdraw reviewed or reserved states', async () => {
    const { repository, subject } = setup();
    for (const status of ['APPROVED', 'REJECTED'] as const) {
      const candidateInput = input(`candidate-${status}`);
      const preview = subject.preview(ticket, candidateInput);
      const record = await subject.submit(ticket, 'reviewer-a', { ...candidateInput, digest: preview.digest, explicitConfirmation: true });
      await subject.review(record.id, 'tenant-a', 'manager-a', status, status === 'APPROVED' ? 'QUALITY_VALIDATED' : 'INSUFFICIENT_QUALITY');
      await expect(subject.withdraw(record.id, 'tenant-a', 'reviewer-a')).rejects.toMatchObject({ code: 'LEARNING_FEEDBACK_STATE_INVALID' });
    }
    for (const status of ['PRIVACY_REJECTED', 'PROMOTED_TO_GOLD_SET'] as LearningFeedbackStatus[]) {
      const candidateInput = input(`candidate-${status}`);
      const preview = subject.preview(ticket, candidateInput);
      const record = await subject.submit(ticket, 'reviewer-a', { ...candidateInput, digest: preview.digest, explicitConfirmation: true });
      repository.seedForTest({ ...record, status });
      await expect(subject.withdraw(record.id, 'tenant-a', 'reviewer-a')).rejects.toMatchObject({ code: 'LEARNING_FEEDBACK_STATE_INVALID' });
    }
  });

  it('allows one atomic review, rejects repeats and sanitizes the immutable reason event', async () => {
    const { subject } = setup();
    const preview = subject.preview(ticket, input('review-candidate'));
    const record = await subject.submit(ticket, 'reviewer-a', { ...input('review-candidate'), digest: preview.digest, explicitConfirmation: true });
    const marker = 'LEARNING_REASON_SECRET_174';
    const [approved, rejected] = await Promise.allSettled([
      subject.review(record.id, 'tenant-a', 'manager-a', 'APPROVED', 'QUALITY_VALIDATED', `Authorization: Bearer ${marker}`),
      subject.review(record.id, 'tenant-a', 'manager-b', 'REJECTED', 'INSUFFICIENT_QUALITY', `access_token=${marker}`),
    ]);
    expect([approved, rejected].filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect([approved, rejected].filter((result) => result.status === 'rejected')).toHaveLength(1);
    const events = await subject.listEvents(record.id, 'tenant-a');
    expect(events.filter((event) => event.eventType.startsWith('REVIEW_'))).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain(marker);
    expect(JSON.stringify(events)).not.toContain('manager-a');
    await expect(subject.review(record.id, 'tenant-a', 'manager-a', 'APPROVED', 'QUALITY_VALIDATED')).rejects.toMatchObject({ code: 'LEARNING_FEEDBACK_STATE_CONFLICT' });
    await expect(subject.listEvents(record.id, 'tenant-b')).resolves.toEqual([]);
  });

  it('enforces review reason compatibility', async () => {
    const { subject } = setup();
    await expect(subject.review('missing', 'tenant-a', 'manager-a', 'APPROVED', 'PRIVACY_CONCERN')).rejects.toMatchObject({ code: 'LEARNING_FEEDBACK_REVIEW_REASON_INVALID' });
  });
});
