import type {
  AuditDecision,
  AuditResult,
  Finding,
  JobPostingInput,
  RiskCategory,
} from './audit.js';

/** Human reviewer decision values accepted by the review API. */
export const humanReviewDecisions = ['APPROVE', 'REJECT', 'REQUEST_REVISION'] as const;

/** Final decision submitted by a human reviewer. */
export type HumanReviewDecision = (typeof humanReviewDecisions)[number];

/** Human feedback labels used to improve eval data and rules. */
export const humanReviewFeedbackTypes = [
  'FALSE_POSITIVE',
  'FALSE_NEGATIVE',
  'WRONG_CATEGORY',
  'WRONG_SEVERITY',
  'WRONG_EVIDENCE',
  'BAD_REWRITE',
  'RULE_TOO_BROAD',
  'RULE_TOO_NARROW',
  'NEEDS_NEW_RULE',
  'VALID_RESULT',
] as const;

/** Feedback type selected by a human reviewer. */
export type HumanReviewFeedbackType = (typeof humanReviewFeedbackTypes)[number];

/** Review ticket lifecycle status exposed by the API. */
export type HumanReviewStatus = 'pending' | 'completed';

/** Feedback recorded when a human reviewer closes a ticket. */
export interface HumanReviewFeedback {
  /** Stable feedback identifier. */
  id: string;
  /** Reviewer identifier. MVP uses a mock reviewer id. */
  reviewerId: string;
  /** Agent decision captured before human review. */
  agentDecision: AuditDecision;
  /** Final human review decision. */
  finalDecision: HumanReviewDecision;
  /** Structured feedback label for eval and rule improvement. */
  feedbackType: HumanReviewFeedbackType;
  /** Reviewer comment, redacted before persistent storage. */
  comment: string;
  /** Whether the agent result appears to be a false positive. */
  falsePositive: boolean;
  /** Whether the agent result appears to be a false negative. */
  falseNegative: boolean;
  /** Feedback creation timestamp. */
  createdAt: string;
}

/** Ticket created for audit results requiring manual review. */
export interface HumanReviewTicket {
  /** Ticket id. MVP uses the auditRunId as the ticket id. */
  id: string;
  /** Associated audit run id. */
  auditRunId: string;
  /** Tenant that owns the audit and ticket. */
  tenantId: string;
  /** Current ticket status. */
  status: HumanReviewStatus;
  /** Findings that caused the ticket to require review. */
  findings: Finding[];
  /** Audit risk level at ticket creation time. */
  riskLevel: AuditResult['riskLevel'];
  /** Agent-suggested action before human review. */
  suggestedAction: AuditResult['decision'];
  /** Agent decision captured at ticket creation time. */
  agentDecision: AuditResult['decision'];
  /** Agent summary shown to reviewers. */
  summary: string;
  /** Redacted job input snapshot used to create eval cases. */
  jobPosting?: JobPostingInput;
  /** Full audit result used for review detail. */
  auditResult: AuditResult;
  /** Human feedback when the ticket is completed. */
  feedback?: HumanReviewFeedback;
  /** Ticket creation timestamp. */
  createdAt: string;
}

/** Request used to submit a human review decision. */
export interface SubmitHumanReviewDecisionInput {
  /** Reviewer identifier. */
  reviewerId: string;
  /** Final human decision. */
  finalDecision: HumanReviewDecision;
  /** Structured feedback type for downstream eval/rule loops. */
  feedbackType: HumanReviewFeedbackType;
  /** Human-readable reviewer comment. */
  comment: string;
  /** Whether the agent result appears to be a false positive. */
  falsePositive: boolean;
  /** Whether the agent result appears to be a false negative. */
  falseNegative: boolean;
}

/** Lifecycle status for rule improvement suggestions. */
export type RuleImprovementSuggestionStatus = 'open' | 'resolved';

/** Rule improvement item derived from human review feedback. */
export interface RuleImprovementSuggestion {
  /** Stable suggestion id. */
  id: string;
  /** Review ticket that generated the suggestion. */
  reviewTicketId: string;
  /** Associated audit run id. */
  auditRunId: string;
  /** Tenant that owns the review. */
  tenantId: string;
  /** Feedback type that motivated this suggestion. */
  feedbackType: HumanReviewFeedbackType;
  /** Risk category involved, when known. */
  category?: RiskCategory;
  /** Existing rule id involved, when known. */
  ruleId?: string;
  /** Short reviewer-facing title. */
  title: string;
  /** Redacted suggestion description. */
  description: string;
  /** Current suggestion status. */
  status: RuleImprovementSuggestionStatus;
  /** Actor who created the suggestion. */
  createdBy: string;
  /** Actor who resolved the suggestion. */
  resolvedBy?: string;
  /** Redacted resolution comment. */
  resolutionComment?: string;
  /** Creation timestamp. */
  createdAt: string;
  /** Last update timestamp. */
  updatedAt: string;
  /** Resolution timestamp. */
  resolvedAt?: string;
}
