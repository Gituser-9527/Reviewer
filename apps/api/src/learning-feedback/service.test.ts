import { describe, expect, it } from 'vitest';
import {
  learningFeedbackConsentNoticeVersion,
  learningFeedbackPurpose,
  learningFeedbackSource,
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
      await subject.review(record.id, 'tenant-a', status);
      await expect(subject.withdraw(record.id, 'tenant-a', 'reviewer-a')).rejects.toMatchObject({ code: 'LEARNING_FEEDBACK_STATE_INVALID' });
    }
    for (const status of ['PRIVACY_REJECTED', 'PROMOTED_TO_GOLD_SET'] as LearningFeedbackStatus[]) {
      const candidateInput = input(`candidate-${status}`);
      const preview = subject.preview(ticket, candidateInput);
      const record = await subject.submit(ticket, 'reviewer-a', { ...candidateInput, digest: preview.digest, explicitConfirmation: true });
      await repository.update({ ...record, status }, 'tenant-a');
      await expect(subject.withdraw(record.id, 'tenant-a', 'reviewer-a')).rejects.toMatchObject({ code: 'LEARNING_FEEDBACK_STATE_INVALID' });
    }
  });
});
