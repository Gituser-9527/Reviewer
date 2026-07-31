import { createHmac, createHash, randomUUID } from 'node:crypto';
import { redactSensitiveText, type LearningFeedbackRepository } from '@job-compliance/database';
import {
  redactLearningFeedbackText,
  type LearningConsentScope,
  type LearningFeedbackPreview,
  type LearningFeedbackStatus,
  type LearningFeedbackSubmission,
  type HumanReviewTicket,
} from '@job-compliance/shared';

export class LearningFeedbackError extends Error {
  constructor(readonly code: 'LEARNING_FEEDBACK_UNAVAILABLE' | 'GLOBAL_LEARNING_CONSENT_UNAVAILABLE' | 'REVIEW_DECISION_REQUIRED' | 'CONSENT_CONFIRMATION_REQUIRED' | 'PREVIEW_DIGEST_MISMATCH' | 'LEARNING_FEEDBACK_NOT_FOUND' | 'LEARNING_FEEDBACK_STATE_INVALID', message: string) {
    super(message);
    this.name = 'LearningFeedbackError';
  }
}

export interface LearningFeedbackInput {
  source: 'WEB' | 'EXTENSION' | 'API';
  consentScope: LearningConsentScope;
  consentNoticeVersion: string;
  purpose: string;
  retentionDays: number;
  comment?: string;
  evidenceFragments?: string[];
}

interface SanitizedInput extends Omit<LearningFeedbackInput, 'consentScope' | 'comment' | 'evidenceFragments'> {
  consentScope: 'TENANT_PRIVATE';
  sanitizedComment: string;
  sanitizedEvidenceFragments: string[];
  redactionSummary: { redactionCount: number; needsPrivacyReview: boolean };
}

export class InMemoryLearningFeedbackRepository implements LearningFeedbackRepository {
  private readonly records = new Map<string, LearningFeedbackSubmission>();
  async findIdempotent(input: { tenantId: string; reviewerDecisionId: string; digest: string; consentNoticeVersion: string }) { return [...this.records.values()].find((record) => record.tenantId === input.tenantId && record.reviewerDecisionId === input.reviewerDecisionId && record.digest === input.digest && record.consentNoticeVersion === input.consentNoticeVersion); }
  async create(record: LearningFeedbackSubmission) { this.records.set(record.id, structuredClone(record)); return structuredClone(record); }
  async findById(id: string, tenantId?: string) { const record = this.records.get(id); return record === undefined || (tenantId !== undefined && record.tenantId !== tenantId) ? undefined : structuredClone(record); }
  async list(options: { tenantId: string; status?: LearningFeedbackStatus | 'all'; limit?: number }) { return [...this.records.values()].filter((record) => record.tenantId === options.tenantId && (options.status === undefined || options.status === 'all' || record.status === options.status)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, options.limit ?? 50).map((record) => structuredClone(record)); }
  async update(record: LearningFeedbackSubmission) { this.records.set(record.id, structuredClone(record)); return structuredClone(record); }
  async listExpired(now: Date) { return [...this.records.values()].filter((record) => record.retentionExpiresAt <= now.toISOString() && ['RECEIVED', 'NEEDS_REVIEW', 'REJECTED'].includes(record.status)).map((record) => structuredClone(record)); }
  async close() { this.records.clear(); }
}

export class LearningFeedbackService {
  constructor(private readonly repository: LearningFeedbackRepository | undefined, private readonly pseudonymKey = process.env.LEARNING_FEEDBACK_PSEUDONYM_KEY, private readonly keyVersion = process.env.LEARNING_FEEDBACK_PSEUDONYM_KEY_VERSION ?? 'v1') {}

  preview(ticket: HumanReviewTicket, input: LearningFeedbackInput): LearningFeedbackPreview {
    this.requireRepository();
    this.requireKey();
    const sanitized = this.sanitize(input);
    const digest = this.digest(ticket, sanitized);
    return { digest, consentScope: sanitized.consentScope, sanitizedComment: sanitized.sanitizedComment, sanitizedEvidenceFragments: sanitized.sanitizedEvidenceFragments, redactionSummary: sanitized.redactionSummary, noticeVersion: sanitized.consentNoticeVersion, purpose: sanitized.purpose, retentionDays: sanitized.retentionDays };
  }

  async submit(ticket: HumanReviewTicket, reviewerId: string, input: LearningFeedbackInput & { digest: string; explicitConfirmation: boolean }): Promise<LearningFeedbackSubmission> {
    this.requireRepository();
    if (ticket.feedback === undefined) throw new LearningFeedbackError('REVIEW_DECISION_REQUIRED', 'A completed human reviewer decision is required.');
    if (ticket.feedback.reviewerId !== reviewerId) throw new LearningFeedbackError('REVIEW_DECISION_REQUIRED', 'Only the reviewer who submitted the decision may submit learning feedback.');
    if (!input.explicitConfirmation) throw new LearningFeedbackError('CONSENT_CONFIRMATION_REQUIRED', 'Explicit confirmation is required before feedback enters quarantine.');
    const sanitized = this.sanitize(input);
    const digest = this.digest(ticket, sanitized);
    if (digest !== input.digest) throw new LearningFeedbackError('PREVIEW_DIGEST_MISMATCH', 'The sanitized preview has changed; generate and confirm a new preview.');
    const existing = await this.repository!.findIdempotent({ tenantId: ticket.tenantId, reviewerDecisionId: ticket.feedback.id, digest, consentNoticeVersion: sanitized.consentNoticeVersion });
    if (existing !== undefined) return existing;
    const now = new Date();
    const record: LearningFeedbackSubmission = {
      id: `learning_feedback_${randomUUID()}`, tenantId: ticket.tenantId, auditRunId: ticket.auditRunId, humanReviewTicketId: ticket.id,
      reviewerDecisionId: ticket.feedback.id, source: sanitized.source, status: sanitized.redactionSummary.needsPrivacyReview ? 'NEEDS_REVIEW' : 'RECEIVED',
      consentScope: sanitized.consentScope, consentNoticeVersion: sanitized.consentNoticeVersion, consentedAt: now.toISOString(), purpose: sanitized.purpose,
      retentionDays: sanitized.retentionDays, retentionExpiresAt: new Date(now.getTime() + sanitized.retentionDays * 86_400_000).toISOString(),
      reviewerPseudonym: this.pseudonym(ticket.tenantId, reviewerId), pseudonymKeyVersion: this.keyVersion, digest, sanitizedComment: sanitized.sanitizedComment,
      sanitizedEvidenceFragments: sanitized.sanitizedEvidenceFragments, redactionSummary: sanitized.redactionSummary, agentDecision: ticket.agentDecision,
      humanDecision: ticket.feedback.finalDecision, ...(ticket.auditResult === undefined ? {} : { ruleVersion: ticket.auditResult.context.ruleVersion }),
      ...(ticket.auditResult === undefined ? {} : { lawKbVersion: ticket.auditResult.context.lawKbVersion }), createdAt: now.toISOString(), updatedAt: now.toISOString(),
    };
    return this.repository!.create(record);
  }

  async list(tenantId: string, status?: LearningFeedbackStatus | 'all') { this.requireRepository(); return this.repository!.list({ tenantId, ...(status === undefined ? {} : { status }) }); }
  async find(id: string, tenantId: string) { this.requireRepository(); const record = await this.repository!.findById(id, tenantId); if (record === undefined) throw new LearningFeedbackError('LEARNING_FEEDBACK_NOT_FOUND', 'Learning feedback was not found.'); return record; }
  async withdraw(id: string, tenantId: string): Promise<LearningFeedbackSubmission> { const record = await this.find(id, tenantId); if (record.status === 'WITHDRAWN') return record; return this.repository!.update({ ...record, status: 'WITHDRAWN', withdrawnAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); }
  async review(id: string, tenantId: string, status: 'APPROVED' | 'REJECTED'): Promise<LearningFeedbackSubmission> { const record = await this.find(id, tenantId); if (!['RECEIVED', 'NEEDS_REVIEW'].includes(record.status)) throw new LearningFeedbackError('LEARNING_FEEDBACK_STATE_INVALID', 'Only quarantined feedback can be reviewed.'); return this.repository!.update({ ...record, status, updatedAt: new Date().toISOString() }); }
  async close(): Promise<void> { await this.repository?.close(); }

  private sanitize(input: LearningFeedbackInput): SanitizedInput {
    if (input.consentScope === 'GLOBAL_ANONYMIZED') throw new LearningFeedbackError('GLOBAL_LEARNING_CONSENT_UNAVAILABLE', 'Global anonymized learning is not available.');
    if (input.consentScope !== 'TENANT_PRIVATE') throw new LearningFeedbackError('CONSENT_CONFIRMATION_REQUIRED', 'Tenant-private consent is required.');
    const values = [input.comment ?? '', ...(input.evidenceFragments ?? [])];
    const results = values.map((value) => {
      const first = redactLearningFeedbackText(value);
      const second = redactLearningFeedbackText(redactSensitiveText(first.value));
      return { value: second.value, redactionCount: first.redactionCount + second.redactionCount, needsPrivacyReview: first.needsPrivacyReview || second.needsPrivacyReview };
    });
    return { source: input.source, consentScope: 'TENANT_PRIVATE', consentNoticeVersion: input.consentNoticeVersion, purpose: input.purpose, retentionDays: input.retentionDays, sanitizedComment: results[0]?.value ?? '', sanitizedEvidenceFragments: results.slice(1).map((item) => item.value), redactionSummary: { redactionCount: results.reduce((sum, item) => sum + item.redactionCount, 0), needsPrivacyReview: results.some((item) => item.needsPrivacyReview) } };
  }
  private digest(ticket: HumanReviewTicket, input: SanitizedInput): string { return createHash('sha256').update(JSON.stringify({ tenantId: ticket.tenantId, auditRunId: ticket.auditRunId, decisionId: ticket.feedback?.id, ...input })).digest('hex'); }
  private pseudonym(tenantId: string, reviewerId: string): string { this.requireKey(); return createHmac('sha256', this.pseudonymKey!).update(`${tenantId}:${reviewerId}`).digest('hex'); }
  private requireKey(): void { if (!this.pseudonymKey) throw new LearningFeedbackError('LEARNING_FEEDBACK_UNAVAILABLE', 'Learning feedback is unavailable until its pseudonym key is configured.'); }
  private requireRepository(): void { if (this.repository === undefined) throw new LearningFeedbackError('LEARNING_FEEDBACK_UNAVAILABLE', 'Learning feedback requires persistent PostgreSQL storage.'); }
}
