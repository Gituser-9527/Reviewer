export const learningConsentScopes = ['NONE', 'TENANT_PRIVATE', 'GLOBAL_ANONYMIZED'] as const;
export type LearningConsentScope = (typeof learningConsentScopes)[number];

/** V1 accepts feedback only through the authenticated API adapter. */
export const learningFeedbackSource = 'API' as const;
/** V1 purpose is server-controlled and cannot be supplied as free text. */
export const learningFeedbackPurpose = 'QUALITY_IMPROVEMENT_REVIEW' as const;
/** Consent text version currently approved for the V1 API flow. */
export const learningFeedbackConsentNoticeVersion = 'learning-feedback-v1' as const;

export const learningFeedbackStatuses = [
  'RECEIVED',
  'NEEDS_REVIEW',
  'PRIVACY_REJECTED',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
  'PROMOTED_TO_GOLD_SET',
] as const;
export type LearningFeedbackStatus = (typeof learningFeedbackStatuses)[number];

export const learningFeedbackReviewReasonCodes = [
  'QUALITY_VALIDATED',
  'INSUFFICIENT_QUALITY',
  'PRIVACY_CONCERN',
  'OUT_OF_SCOPE',
  'OTHER',
] as const;
export type LearningFeedbackReviewReasonCode = (typeof learningFeedbackReviewReasonCodes)[number];

export const learningFeedbackEventTypes = [
  'SUBMITTED',
  'WITHDRAWN',
  'REVIEW_APPROVED',
  'REVIEW_REJECTED',
] as const;
export type LearningFeedbackEventType = (typeof learningFeedbackEventTypes)[number];

export const learningFeedbackRetentionExpiryStatuses = [
  'RECEIVED',
  'NEEDS_REVIEW',
  'APPROVED',
  'REJECTED',
  'PRIVACY_REJECTED',
] as const satisfies readonly LearningFeedbackStatus[];

export function isLearningFeedbackReviewReasonAllowed(
  status: 'APPROVED' | 'REJECTED',
  reasonCode: LearningFeedbackReviewReasonCode,
): boolean {
  return status === 'APPROVED'
    ? reasonCode === 'QUALITY_VALIDATED'
    : reasonCode !== 'QUALITY_VALIDATED';
}

export interface LearningFeedbackPreview {
  digest: string;
  consentScope: Exclude<LearningConsentScope, 'NONE' | 'GLOBAL_ANONYMIZED'>;
  sanitizedComment: string;
  sanitizedEvidenceFragments: string[];
  redactionSummary: { redactionCount: number; needsPrivacyReview: boolean };
  noticeVersion: string;
  purpose: typeof learningFeedbackPurpose;
  retentionDays: number;
}

/** Privacy-quarantined feedback. It intentionally contains no raw audit input or reviewer identity. */
export interface LearningFeedbackSubmission {
  id: string;
  tenantId: string;
  auditRunId: string;
  humanReviewTicketId: string;
  reviewerDecisionId: string;
  source: typeof learningFeedbackSource;
  status: LearningFeedbackStatus;
  consentScope: 'TENANT_PRIVATE';
  consentNoticeVersion: string;
  consentedAt: string;
  purpose: typeof learningFeedbackPurpose;
  retentionDays: number;
  retentionExpiresAt: string;
  reviewerPseudonym: string;
  pseudonymKeyVersion: string;
  digest: string;
  sanitizedComment: string;
  sanitizedEvidenceFragments: string[];
  redactionSummary: { redactionCount: number; needsPrivacyReview: boolean };
  agentDecision: string;
  humanDecision: string;
  ruleVersion?: string;
  lawKbVersion?: string;
  createdAt: string;
  updatedAt: string;
  withdrawnAt?: string;
  supersededBy?: string;
}

export interface LearningFeedbackEvent {
  id: string;
  tenantId: string;
  learningFeedbackId: string;
  eventType: LearningFeedbackEventType;
  fromStatus?: LearningFeedbackStatus;
  toStatus: LearningFeedbackStatus;
  actorPseudonym: string;
  pseudonymKeyVersion: string;
  reasonCode?: LearningFeedbackReviewReasonCode;
  reasonNoteRedacted?: string;
  requestId?: string;
  occurredAt: string;
}

export type LearningFeedbackRetentionDisposition = 'CANDIDATE' | 'RETAIN' | 'ANOMALY';

/** Authoritative V1 retention policy shared by previews, execution and tests. */
export function classifyLearningFeedbackRetention(
  record: Pick<LearningFeedbackSubmission, 'status' | 'retentionExpiresAt' | 'withdrawnAt'>,
  cutoff: Date,
): LearningFeedbackRetentionDisposition {
  if (record.status === 'PROMOTED_TO_GOLD_SET') return 'ANOMALY';
  if (record.status === 'WITHDRAWN') {
    return record.withdrawnAt !== undefined && Date.parse(record.withdrawnAt) <= cutoff.getTime()
      ? 'CANDIDATE'
      : 'RETAIN';
  }
  return learningFeedbackRetentionExpiryStatuses.includes(
    record.status as (typeof learningFeedbackRetentionExpiryStatuses)[number],
  ) && Date.parse(record.retentionExpiresAt) <= cutoff.getTime()
    ? 'CANDIDATE'
    : 'RETAIN';
}

export interface LearningFeedbackRetentionSummary {
  tenantId: string;
  mode: 'DRY_RUN' | 'EXECUTE';
  cutoff: string;
  batchLimit: number;
  candidateCount: number;
  deletedCount: number;
  countsByStatus: Partial<Record<LearningFeedbackStatus, number>>;
  candidateIds: string[];
  anomalyCount: number;
  occurredAt: string;
}
