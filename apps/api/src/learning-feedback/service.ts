import { randomUUID } from 'node:crypto';
import { hashSensitiveValue, pseudonymizeSensitiveValue, sanitizeSensitiveText } from '@job-compliance/core';
import type { LearningFeedbackRepository } from '@job-compliance/database';
import {
  learningFeedbackConsentNoticeVersion,
  learningFeedbackPurpose,
  learningFeedbackSource,
  type LearningConsentScope,
  type LearningFeedbackPreview,
  type LearningFeedbackStatus,
  type LearningFeedbackSubmission,
  type HumanReviewTicket,
} from '@job-compliance/shared';

export class LearningFeedbackError extends Error {
  constructor(readonly code: 'LEARNING_FEEDBACK_UNAVAILABLE' | 'GLOBAL_LEARNING_CONSENT_UNAVAILABLE' | 'REVIEW_DECISION_REQUIRED' | 'CONSENT_CONFIRMATION_REQUIRED' | 'PREVIEW_DIGEST_MISMATCH' | 'LEARNING_FEEDBACK_NOT_FOUND' | 'LEARNING_FEEDBACK_STATE_INVALID' | 'LEARNING_FEEDBACK_WITHDRAW_FORBIDDEN', message: string) {
    super(message);
    this.name = 'LearningFeedbackError';
  }
}

export interface LearningFeedbackInput {
  consentScope: LearningConsentScope;
  retentionDays: number;
  comment?: string;
  evidenceFragments?: string[];
}

interface SanitizedInput extends Omit<LearningFeedbackInput, 'consentScope' | 'comment' | 'evidenceFragments'> {
  source: typeof learningFeedbackSource;
  consentScope: 'TENANT_PRIVATE';
  consentNoticeVersion: string;
  purpose: typeof learningFeedbackPurpose;
  sanitizedComment: string;
  sanitizedEvidenceFragments: string[];
  redactionSummary: { redactionCount: number; needsPrivacyReview: boolean };
}

export class InMemoryLearningFeedbackRepository implements LearningFeedbackRepository {
  private readonly records = new Map<string, LearningFeedbackSubmission>();
  constructor(private readonly decisionOwners: Readonly<Record<string, string>> = {}) {}
  async createIdempotent(record: LearningFeedbackSubmission) { const existing = [...this.records.values()].find((candidate) => candidate.tenantId === record.tenantId && candidate.reviewerDecisionId === record.reviewerDecisionId && candidate.digest === record.digest && candidate.consentNoticeVersion === record.consentNoticeVersion); if (existing !== undefined) return structuredClone(existing); this.records.set(record.id, structuredClone(record)); return structuredClone(record); }
  async findById(id: string, tenantId: string) { const record = this.records.get(id); return record === undefined || record.tenantId !== tenantId ? undefined : structuredClone(record); }
  async findReviewerDecisionOwner(input: { tenantId: string; auditRunId: string; humanReviewTicketId: string; reviewerDecisionId: string }) { const record = [...this.records.values()].find((candidate) => candidate.tenantId === input.tenantId && candidate.auditRunId === input.auditRunId && candidate.humanReviewTicketId === input.humanReviewTicketId && candidate.reviewerDecisionId === input.reviewerDecisionId); return record === undefined ? undefined : this.decisionOwners[input.reviewerDecisionId]; }
  async list(options: { tenantId: string; status?: LearningFeedbackStatus | 'all'; limit?: number }) { return [...this.records.values()].filter((record) => record.tenantId === options.tenantId && (options.status === undefined || options.status === 'all' || record.status === options.status)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, options.limit ?? 50).map((record) => structuredClone(record)); }
  async update(record: LearningFeedbackSubmission, tenantId: string) { const current = this.records.get(record.id); if (current === undefined || current.tenantId !== tenantId) return undefined; this.records.set(record.id, structuredClone(record)); return structuredClone(record); }
  async updateIfStatus(record: LearningFeedbackSubmission, tenantId: string, expectedStatuses: LearningFeedbackStatus[]) { const current = this.records.get(record.id); if (current === undefined || current.tenantId !== tenantId || !expectedStatuses.includes(current.status)) return undefined; this.records.set(record.id, structuredClone(record)); return structuredClone(record); }
  async listExpired(options: { tenantId: string; now: Date }) { return [...this.records.values()].filter((record) => record.tenantId === options.tenantId && record.retentionExpiresAt <= options.now.toISOString() && ['RECEIVED', 'NEEDS_REVIEW', 'REJECTED'].includes(record.status)).map((record) => structuredClone(record)); }
  async close() { this.records.clear(); }
}

export class LearningFeedbackService {
  constructor(private readonly repository: LearningFeedbackRepository | undefined, private readonly pseudonymKey = process.env.LEARNING_FEEDBACK_PSEUDONYM_KEY, private readonly keyVersion = process.env.LEARNING_FEEDBACK_PSEUDONYM_KEY_VERSION ?? 'v1', private readonly noticeVersion = learningFeedbackConsentNoticeVersion) {}

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
    return this.repository!.createIdempotent(record);
  }

  async list(tenantId: string, status?: LearningFeedbackStatus | 'all') { this.requireRepository(); return this.repository!.list({ tenantId, ...(status === undefined ? {} : { status }) }); }
  async find(id: string, tenantId: string) { this.requireRepository(); const record = await this.repository!.findById(id, tenantId); if (record === undefined) throw new LearningFeedbackError('LEARNING_FEEDBACK_NOT_FOUND', 'Learning feedback was not found.'); return record; }
  async withdraw(id: string, tenantId: string, reviewerId: string): Promise<LearningFeedbackSubmission> {
    const record = await this.find(id, tenantId);
    const owner = await this.repository!.findReviewerDecisionOwner({ tenantId, auditRunId: record.auditRunId, humanReviewTicketId: record.humanReviewTicketId, reviewerDecisionId: record.reviewerDecisionId });
    if (owner !== reviewerId) throw new LearningFeedbackError('LEARNING_FEEDBACK_WITHDRAW_FORBIDDEN', 'Only the reviewer who submitted the decision may withdraw this feedback.');
    if (record.status === 'WITHDRAWN') return record;
    if (!['RECEIVED', 'NEEDS_REVIEW'].includes(record.status)) throw new LearningFeedbackError('LEARNING_FEEDBACK_STATE_INVALID', 'Only unreviewed quarantined feedback can be withdrawn.');
    const now = new Date().toISOString();
    const updated = { ...record, status: 'WITHDRAWN' as const, withdrawnAt: now, updatedAt: now };
    const saved = await this.repository!.updateIfStatus(updated, tenantId, ['RECEIVED', 'NEEDS_REVIEW']);
    if (saved !== undefined) return saved;
    const latest = await this.find(id, tenantId);
    if (latest.status === 'WITHDRAWN') return latest;
    throw new LearningFeedbackError('LEARNING_FEEDBACK_STATE_INVALID', 'Learning feedback changed state before it could be withdrawn.');
  }
  async review(id: string, tenantId: string, status: 'APPROVED' | 'REJECTED'): Promise<LearningFeedbackSubmission> { const record = await this.find(id, tenantId); if (!['RECEIVED', 'NEEDS_REVIEW'].includes(record.status)) throw new LearningFeedbackError('LEARNING_FEEDBACK_STATE_INVALID', 'Only quarantined feedback can be reviewed.'); const updated = await this.repository!.update({ ...record, status, updatedAt: new Date().toISOString() }, tenantId); if (updated === undefined) throw new LearningFeedbackError('LEARNING_FEEDBACK_NOT_FOUND', 'Learning feedback was not found.'); return updated; }
  async close(): Promise<void> { await this.repository?.close(); }

  private sanitize(input: LearningFeedbackInput): SanitizedInput {
    if (input.consentScope === 'GLOBAL_ANONYMIZED') throw new LearningFeedbackError('GLOBAL_LEARNING_CONSENT_UNAVAILABLE', 'Global anonymized learning is not available.');
    if (input.consentScope !== 'TENANT_PRIVATE') throw new LearningFeedbackError('CONSENT_CONFIRMATION_REQUIRED', 'Tenant-private consent is required.');
    const values = [input.comment ?? '', ...(input.evidenceFragments ?? [])];
    const results = values.map((value) => sanitizeSensitiveText(value));
    return { source: learningFeedbackSource, consentScope: 'TENANT_PRIVATE', consentNoticeVersion: this.requireNoticeVersion(), purpose: learningFeedbackPurpose, retentionDays: input.retentionDays, sanitizedComment: results[0]?.value ?? '', sanitizedEvidenceFragments: results.slice(1).map((item) => item.value), redactionSummary: { redactionCount: results.reduce((sum, item) => sum + item.redactionCount, 0), needsPrivacyReview: results.some((item) => item.needsPrivacyReview) } };
  }
  private digest(ticket: HumanReviewTicket, input: SanitizedInput): string { return hashSensitiveValue({ tenantId: ticket.tenantId, auditRunId: ticket.auditRunId, humanReviewTicketId: ticket.id, decisionId: ticket.feedback?.id, ...input }); }
  private pseudonym(tenantId: string, reviewerId: string): string { this.requireKey(); return pseudonymizeSensitiveValue({ tenantId, reviewerId }, this.pseudonymKey!); }
  private requireKey(): void { if (!this.pseudonymKey) throw new LearningFeedbackError('LEARNING_FEEDBACK_UNAVAILABLE', 'Learning feedback is unavailable until its pseudonym key is configured.'); }
  private requireNoticeVersion(): string { if (!this.noticeVersion.trim()) throw new LearningFeedbackError('LEARNING_FEEDBACK_UNAVAILABLE', 'Learning feedback is unavailable until its consent notice is configured.'); return this.noticeVersion; }
  private requireRepository(): void { if (this.repository === undefined) throw new LearningFeedbackError('LEARNING_FEEDBACK_UNAVAILABLE', 'Learning feedback requires persistent PostgreSQL storage.'); }
}
