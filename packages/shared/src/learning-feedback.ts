export const learningConsentScopes = ['NONE', 'TENANT_PRIVATE', 'GLOBAL_ANONYMIZED'] as const;
export type LearningConsentScope = (typeof learningConsentScopes)[number];

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

export interface LearningFeedbackPreview {
  digest: string;
  consentScope: Exclude<LearningConsentScope, 'NONE' | 'GLOBAL_ANONYMIZED'>;
  sanitizedComment: string;
  sanitizedEvidenceFragments: string[];
  redactionSummary: { redactionCount: number; needsPrivacyReview: boolean };
  noticeVersion: string;
  purpose: string;
  retentionDays: number;
}

/** Privacy-quarantined feedback. It intentionally contains no raw audit input or reviewer identity. */
export interface LearningFeedbackSubmission {
  id: string;
  tenantId: string;
  auditRunId: string;
  humanReviewTicketId: string;
  reviewerDecisionId: string;
  source: 'WEB' | 'EXTENSION' | 'API';
  status: LearningFeedbackStatus;
  consentScope: 'TENANT_PRIVATE';
  consentNoticeVersion: string;
  consentedAt: string;
  purpose: string;
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
