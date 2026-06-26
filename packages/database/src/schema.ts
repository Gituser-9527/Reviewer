import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type {
  AuditResult,
  Evidence,
  Finding,
  HumanReviewTicket,
  JobPostingInput,
  RuleImprovementSuggestion,
} from '@job-compliance/shared';

export interface RuleSetPayload {
  id: string;
  name: string;
  jurisdiction: string;
  status: string;
  currentVersion?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RulePublishRecordPayload {
  id: string;
  ruleSetId: string;
  ruleVersion: string;
  previousVersion?: string;
  action: 'publish' | 'rollback';
  actorId: string;
  evalPassed: boolean;
  forcePublished: boolean;
  ruleCount: number;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface RuntimeConfigPayload {
  key: string;
  stableVersion: string;
  candidateVersion?: string;
  description?: string;
  updatedBy?: string;
  updatedAt: string;
}

export interface RolloutPlanPayload {
  id: string;
  target: string;
  stableVersion: string;
  candidateVersion: string;
  tenantAllowList: string[];
  rolloutPercent: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  description?: string;
}

export interface AuditMetricsDailyPayload {
  id: string;
  metricDate: string;
  tenantId?: string;
  ruleVersion?: string;
  lawKbVersion?: string;
  modelVersion?: string;
  auditTotal: number;
  rejectTotal: number;
  manualReviewTotal: number;
  criticalFindingTotal: number;
  ruleHitByRuleId: Record<string, number>;
  llmErrorTotal: number;
  ragNoResultTotal: number;
  apiErrorTotal: number;
  p95Latency: number;
}

export interface AlertEventPayload {
  id: string;
  type: string;
  severity: string;
  status: string;
  metricKey: string;
  metricValue: number;
  threshold: number;
  message: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface TenantLevelModePayload {
  tenantId: string;
  mode: string;
  enabled: boolean;
  updatedBy?: string;
  updatedAt: string;
}

export interface BetaTrialRunPayload {
  id: string;
  tenantId: string;
  auditRunId: string;
  mode: string;
  agentDecision: string;
  agentRiskLevel: string;
  agentRuleIds: string[];
  agentEvidenceIds: string[];
  humanDecision?: string;
  feedbackType?: string;
  comparisonResult?: string;
  falsePositive: boolean;
  falseNegative: boolean;
  businessImpactApplied: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewerDecisionPayload {
  id: string;
  reviewTicketId: string;
  auditRunId: string;
  tenantId: string;
  reviewerId: string;
  finalDecision: string;
  normalizedDecision: string;
  categories: string[];
  severity: string;
  feedbackType: string;
  comment?: string;
  confidence: number;
  createdAt: string;
}

export interface ReviewerAgreementStatsPayload {
  reviewerId: string;
  totalLabeled: number;
  agreementCount: number;
  disagreementCount: number;
  agreementRate: number;
  updatedAt: string;
}

export interface DisputedCasePayload {
  id: string;
  reviewTicketId: string;
  auditRunId: string;
  tenantId: string;
  status: string;
  reason: string;
  reviewerDecisionIds: string[];
  finalDecision?: string;
  finalCategories?: string[];
  finalSeverity?: string;
  resolvedBy?: string;
  resolutionComment?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

export interface UserPayload {
  id: string;
  displayName: string;
  email?: string;
  status: string;
  createdAt: string;
}

export interface RolePayload {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
}

export interface PermissionPayload {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
}

export interface TenantMemberPayload {
  id: string;
  tenantId: string;
  userId: string;
  role: string;
  createdAt: string;
}

export interface AuditOperationLogPayload {
  id: string;
  actorUserId: string;
  actorRole: string;
  tenantId?: string;
  operation: string;
  resourceType: string;
  resourceId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  requestId?: string;
  createdAt: string;
}

export interface RulePublishApprovalPayload {
  id: string;
  ruleSetId: string;
  ruleVersion?: string;
  action: string;
  status: string;
  requestedBy: string;
  approvedBy?: string;
  comment?: string;
  createdAt: string;
  approvedAt?: string;
}

export interface DataRetentionJobPayload {
  id: string;
  tenantId?: string;
  resourceType: string;
  retentionDays: number;
  enabled: boolean;
  lastRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DataDeletionRequestPayload {
  id: string;
  tenantId: string;
  requesterId: string;
  targetType: string;
  targetId?: string;
  status: string;
  deletedRecords: number;
  reason?: string;
  createdAt: string;
  completedAt?: string;
}

export interface PrivacyExportRequestPayload {
  id: string;
  tenantId: string;
  requesterId: string;
  status: string;
  exportPayload?: Record<string, unknown>;
  createdAt: string;
  completedAt?: string;
}

export interface SecurityCheckResultPayload {
  id: string;
  status: string;
  summary: string;
  checks: Record<string, unknown>[];
  createdAt: string;
}

export interface AppealCasePayload {
  id: string;
  tenantId: string;
  auditRunId: string;
  status: string;
  reasonType: string;
  reasonText: string;
  supplementalText?: string;
  submitterId: string;
  originalDecision: string;
  originalRiskLevel: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppealMessagePayload {
  id: string;
  appealCaseId: string;
  tenantId: string;
  senderType: string;
  senderId: string;
  message: string;
  attachments: string[];
  createdAt: string;
}

export interface AppealReviewResultPayload {
  id: string;
  appealCaseId: string;
  tenantId: string;
  reviewerId: string;
  finalDecision: string;
  comment: string;
  createdAt: string;
}

export interface AppealAgentReportPayload {
  id: string;
  appealCaseId: string;
  tenantId: string;
  maintainReasons: string[];
  overturnReasons: string[];
  evidenceSummary: string;
  similarCases: Record<string, unknown>[];
  recommendation: string;
  confidence: number;
  createdAt: string;
}

export interface ApiKeyPayload {
  id: string;
  tenantId: string;
  name: string;
  keyPrefix: string;
  status: string;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

export interface UsageRecordPayload {
  id: string;
  tenantId: string;
  apiKeyId?: string;
  resourceType: string;
  quantity: number;
  period: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface SubscriptionPlanPayload {
  id: string;
  name: string;
  monthlyQuota: number;
  features: string[];
  priceLabel: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface TenantBillingProfilePayload {
  tenantId: string;
  tenantName: string;
  planId: string;
  monthlyQuota: number;
  usedQuota: number;
  period: string;
  brandConfig: Record<string, unknown>;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookPayload {
  id: string;
  tenantId: string;
  url: string;
  events: string[];
  status: string;
  createdAt: string;
  updatedAt: string;
  lastDeliveryAt?: string;
}

export interface BatchAuditJobPayload {
  id: string;
  tenantId: string;
  status: string;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  resultIds: string[];
  errors: Record<string, unknown>[];
  createdAt: string;
  updatedAt: string;
}

export interface TrustedKnowledgeSourcePayload {
  id: string;
  name: string;
  sourceType: string;
  baseUrl: string;
  jurisdiction: string;
  scope: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface LawKbDocumentPayload {
  id: string;
  sourceId: string;
  title: string;
  sourceUrl: string;
  sourceType: string;
  jurisdiction: string;
  scope: string;
  publishedAt: string;
  effectiveFrom: string;
  effectiveTo?: string;
  categories: string[];
  keywords: string[];
  createdAt: string;
  updatedAt: string;
}

export interface LawKbDocumentVersionPayload {
  id: string;
  documentId: string;
  version: string;
  content: string;
  contentHash: string;
  importedBy: string;
  createdAt: string;
}

export interface LawKbUpdateSuggestionPayload {
  id: string;
  documentId: string;
  fromVersion?: string;
  toVersion: string;
  status: string;
  diff: Record<string, unknown>;
  impactSummary: string;
  createdAt: string;
  approvedAt?: string;
}

export interface LawKbVersionRecordPayload {
  id: string;
  lawKbVersion: string;
  suggestionId: string;
  approvedBy: string;
  evalRunId?: string;
  createdAt: string;
}

export interface LawKbImpactReportPayload {
  id: string;
  suggestionId: string;
  affectedCategories: string[];
  affectedRules: string[];
  affectedEvidenceIds: string[];
  summary: string;
  createdAt: string;
}

export interface ReleaseCandidatePayload {
  id: string;
  name: string;
  target: string;
  targetVersion: string;
  ruleVersion?: string;
  lawKbVersion?: string;
  modelVersion?: string;
  promptVersion?: string;
  evalDatasetId?: string;
  status: string;
  createdBy: string;
  qualityMetrics: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ReleaseGateCheckPayload {
  id: string;
  candidateId: string;
  checkKey: string;
  title: string;
  status: string;
  required: boolean;
  threshold?: number;
  actual?: unknown;
  detail: string;
  durationMs: number;
  createdAt: string;
}

export interface ReleaseGateResultPayload {
  id: string;
  candidateId: string;
  status: string;
  thresholds: Record<string, number>;
  createdAt: string;
}

export interface ReleaseApprovalRecordPayload {
  id: string;
  candidateId: string;
  status: string;
  approvedBy: string;
  comment?: string;
  createdAt: string;
}

export interface AsyncJobPayload {
  id: string;
  type: string;
  tenantId: string;
  status: string;
  batchId?: string;
  batchItemId?: string;
  auditRunId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface BatchAuditItemPayload {
  id: string;
  batchId: string;
  tenantId: string;
  jobPostingId: string;
  status: string;
  auditRunId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LlmUsageRecordPayload {
  id: string;
  tenantId: string;
  auditRunId?: string;
  provider: string;
  model: string;
  promptVersion?: string;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  status: string;
  createdAt: string;
}

export interface CostUsageDailyPayload {
  id: string;
  tenantId: string;
  usageDate: string;
  auditCount: number;
  llmTokensIn: number;
  llmTokensOut: number;
  llmCost: number;
  ragCost: number;
  ruleCost: number;
  totalCost: number;
  updatedAt: string;
}

export interface RateLimitRecordPayload {
  id: string;
  tenantId: string;
  apiKeyId?: string;
  limitType: string;
  limitValue: number;
  usedValue: number;
  windowStart: string;
  windowEnd: string;
  createdAt: string;
}

export interface IntegrationClientPayload {
  id: string;
  tenantId: string;
  name: string;
  environment: string;
  status: string;
  createdAt: string;
}

export interface WebhookEndpointPayload {
  id: string;
  tenantId: string;
  url: string;
  events: string[];
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDeliveryLogPayload {
  id: string;
  tenantId: string;
  endpointId: string;
  event: string;
  attempt: number;
  status: string;
  statusCode?: number;
  error?: string;
  signature: string;
  createdAt: string;
}

export interface SandboxAuditRunPayload {
  id: string;
  tenantId: string;
  auditRunId: string;
  input: Record<string, unknown>;
  result: AuditResult;
  createdAt: string;
}

export interface QaInspectionJobPayload {
  id: string;
  tenantId: string;
  strategy: string;
  sampleSize: number;
  ruleVersion?: string;
  reviewerId?: string;
  includeAppeals: boolean;
  includeRewrites: boolean;
  includeEvidence: boolean;
  status: string;
  sampleCount: number;
  issueCount: number;
  summary: string;
  createdBy: string;
  createdAt: string;
  completedAt?: string;
}

export interface QaInspectionSamplePayload {
  id: string;
  jobId: string;
  tenantId: string;
  sourceType: string;
  sourceId: string;
  auditRunId?: string;
  reviewerId?: string;
  ruleVersion?: string;
  riskLevel?: string;
  decision?: string;
  createdAt: string;
}

export interface QaInspectionResultPayload {
  id: string;
  jobId: string;
  sampleId: string;
  passed: boolean;
  score: number;
  checks: Record<string, unknown>[];
  createdAt: string;
}

export interface QaQualityIssuePayload {
  id: string;
  jobId: string;
  sampleId: string;
  tenantId: string;
  sourceType: string;
  sourceId: string;
  issueType: string;
  severity: string;
  description: string;
  status: string;
  linkedEvalCaseId?: string;
  linkedRuleSuggestionId?: string;
  resolvedBy?: string;
  resolutionComment?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface PilotProjectPayload {
  id: string;
  tenantId: string;
  name: string;
  status: string;
  modes: string[];
  startDate: string;
  endDate: string;
  avgReviewTimeBefore: number;
  avgReviewTimeAfter: number;
  hourlyLaborCost: number;
  description?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PilotDailyMetricsPayload {
  id: string;
  pilotProjectId: string;
  tenantId: string;
  metricDate: string;
  mode: string;
  totalJobsAudited: number;
  autoPassRate: number;
  autoRejectRate: number;
  manualReviewRate: number;
  avgReviewTimeBefore: number;
  avgReviewTimeAfter: number;
  timeSavedHours: number;
  estimatedLaborCostSaved: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  appealRate: number;
  customerSatisfaction: number;
  topRiskCategories: Record<string, unknown>[];
  topRuleHits: Record<string, unknown>[];
  generatedAt: string;
}

export interface RoiReportPayload {
  id: string;
  pilotProjectId: string;
  tenantId: string;
  reportPeriodStart: string;
  reportPeriodEnd: string;
  totalJobsAudited: number;
  timeSavedHours: number;
  estimatedLaborCostSaved: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  appealRate: number;
  customerSatisfaction: number;
  modeComparison: Record<string, unknown>;
  risksAndLimitations: string[];
  markdown: string;
  createdAt: string;
}

export interface CustomerFeedbackPayload {
  id: string;
  pilotProjectId: string;
  tenantId: string;
  feedbackType: string;
  rating?: number;
  contactName?: string;
  comment: string;
  createdAt: string;
}

export interface BetaProgramPayload {
  id: string;
  tenantId: string;
  name: string;
  status: string;
  mode: string;
  startDate: string;
  endDate: string;
  scope: string;
  goals: string[];
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface BetaParticipantPayload {
  id: string;
  programId: string;
  tenantId: string;
  userId: string;
  displayName: string;
  role: string;
  email?: string;
  active: boolean;
  createdAt: string;
}

export interface BetaFeedbackPayload {
  id: string;
  programId: string;
  tenantId: string;
  reporterId: string;
  feedbackType: string;
  severity: string;
  status: string;
  title: string;
  description: string;
  relatedAuditRunId?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface BetaDailyReportPayload {
  id: string;
  programId: string;
  tenantId: string;
  reportDate: string;
  activeParticipants: number;
  auditsReviewed: number;
  manualReviewsCompleted: number;
  feedbackOpened: number;
  feedbackResolved: number;
  blockers: string[];
  summary: string;
  nextActions: string[];
  createdBy: string;
  createdAt: string;
}

export interface BetaGoNoGoCheckPayload {
  id: string;
  programId: string;
  tenantId: string;
  checkKey: string;
  title: string;
  required: boolean;
  status: string;
  ownerRole: string;
  evidence?: string;
  updatedAt: string;
}

export interface ReviewerTrainingCompletedPayload {
  id: string;
  reviewerId: string;
  tenantId?: string;
  completed: boolean;
  completedAt: string;
  documentVersion: string;
}

export interface IncidentEventPayload {
  id: string;
  tenantId?: string;
  incidentType: string;
  severity: string;
  status: string;
  title: string;
  description: string;
  relatedAuditRunId?: string;
  createdBy: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface IncidentActionPayload {
  id: string;
  incidentId: string;
  actionType: string;
  actorId: string;
  summary: string;
  createdAt: string;
}

export interface IncidentPostmortemPayload {
  id: string;
  incidentId: string;
  rootCause: string;
  impact: string;
  timeline: string[];
  correctiveActions: string[];
  preventionActions: string[];
  createdBy: string;
  createdAt: string;
}

export interface EmergencyRuntimeSwitchPayload {
  key: string;
  enabled: boolean;
  reason?: string;
  updatedBy: string;
  updatedAt: string;
}

export const jobPostings = pgTable(
  'job_postings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: text('tenant_id').notNull(),
    externalId: text('external_id'),
    title: text('title').notNull(),
    companyName: text('company_name'),
    location: text('location'),
    employmentType: text('employment_type'),
    salaryText: text('salary_text'),
    rawTextRedacted: text('raw_text_redacted').notNull(),
    inputHash: text('input_hash').notNull(),
    inputPayload: jsonb('input_payload').$type<JobPostingInput>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('job_postings_tenant_input_hash_idx').on(table.tenantId, table.inputHash),
    index('job_postings_tenant_created_at_idx').on(table.tenantId, table.createdAt),
  ],
);

export const auditRuns = pgTable(
  'audit_runs',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    jobPostingId: uuid('job_posting_id')
      .notNull()
      .references(() => jobPostings.id),
    decision: text('decision').notNull(),
    riskLevel: text('risk_level').notNull(),
    summary: text('summary').notNull(),
    ruleVersion: text('rule_version').notNull(),
    lawKbVersion: text('law_kb_version').notNull(),
    modelVersion: text('model_version'),
    inputHash: text('input_hash').notNull(),
    resultPayload: jsonb('result_payload').$type<AuditResult>().notNull(),
    evaluatedAt: timestamp('evaluated_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    persistedAt: timestamp('persisted_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('audit_runs_tenant_created_at_idx').on(table.tenantId, table.createdAt),
    index('audit_runs_tenant_decision_idx').on(table.tenantId, table.decision),
    index('audit_runs_tenant_risk_level_idx').on(table.tenantId, table.riskLevel),
  ],
);

export const auditFindings = pgTable(
  'audit_findings',
  {
    auditRunId: text('audit_run_id')
      .notNull()
      .references(() => auditRuns.id, { onDelete: 'cascade' }),
    findingId: text('finding_id').notNull(),
    tenantId: text('tenant_id').notNull(),
    category: text('category').notNull(),
    severity: text('severity').notNull(),
    decision: text('decision').notNull(),
    ruleId: text('rule_id'),
    evidenceId: text('evidence_id'),
    title: text('title').notNull(),
    message: text('message').notNull(),
    suggestion: text('suggestion'),
    payload: jsonb('payload').$type<Finding>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.auditRunId, table.findingId] }),
    index('audit_findings_tenant_run_idx').on(table.tenantId, table.auditRunId),
    index('audit_findings_tenant_category_idx').on(table.tenantId, table.category),
    index('audit_findings_tenant_rule_idx').on(table.tenantId, table.ruleId),
  ],
);

export const auditEvidenceLinks = pgTable(
  'audit_evidence_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    auditRunId: text('audit_run_id')
      .notNull()
      .references(() => auditRuns.id, { onDelete: 'cascade' }),
    findingId: text('finding_id'),
    tenantId: text('tenant_id').notNull(),
    evidenceId: text('evidence_id').notNull(),
    sourceType: text('source_type').notNull(),
    title: text('title').notNull(),
    url: text('url').notNull(),
    version: text('version').notNull(),
    quoteRedacted: text('quote_redacted'),
    payload: jsonb('payload').$type<Evidence>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('audit_evidence_links_tenant_run_idx').on(table.tenantId, table.auditRunId),
    index('audit_evidence_links_evidence_idx').on(table.evidenceId),
  ],
);

export const complianceRules = pgTable(
  'compliance_rules',
  {
    ruleId: text('rule_id').notNull(),
    ruleVersion: text('rule_version').notNull(),
    ruleSetId: text('rule_set_id'),
    category: text('category').notNull(),
    severity: text('severity').notNull(),
    action: text('action').notNull(),
    status: text('status').default('draft').notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    sourcePath: text('source_path'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ruleId, table.ruleVersion] }),
    index('compliance_rules_category_idx').on(table.category),
    index('compliance_rules_rule_set_idx').on(table.ruleSetId),
    index('compliance_rules_status_idx').on(table.status),
  ],
);

export const ruleSets = pgTable(
  'rule_sets',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    jurisdiction: text('jurisdiction').notNull(),
    status: text('status').notNull(),
    currentVersion: text('current_version'),
    description: text('description'),
    payload: jsonb('payload').$type<RuleSetPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('rule_sets_jurisdiction_status_idx').on(table.jurisdiction, table.status),
    index('rule_sets_updated_at_idx').on(table.updatedAt),
  ],
);

export const rulePublishRecords = pgTable(
  'rule_publish_records',
  {
    id: text('id').primaryKey(),
    ruleSetId: text('rule_set_id').notNull(),
    ruleVersion: text('rule_version').notNull(),
    previousVersion: text('previous_version'),
    action: text('action').notNull(),
    actorId: text('actor_id').notNull(),
    evalPassed: boolean('eval_passed').notNull(),
    forcePublished: boolean('force_published').default(false).notNull(),
    ruleCount: integer('rule_count').notNull(),
    payload: jsonb('payload').$type<RulePublishRecordPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('rule_publish_records_rule_set_idx').on(table.ruleSetId),
    index('rule_publish_records_version_idx').on(table.ruleVersion),
    index('rule_publish_records_created_at_idx').on(table.createdAt),
  ],
);

export const runtimeConfigs = pgTable(
  'runtime_configs',
  {
    key: text('key').primaryKey(),
    stableVersion: text('stable_version').notNull(),
    candidateVersion: text('candidate_version'),
    description: text('description'),
    updatedBy: text('updated_by'),
    payload: jsonb('payload').$type<RuntimeConfigPayload>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('runtime_configs_updated_at_idx').on(table.updatedAt)],
);

export const rolloutPlans = pgTable(
  'rollout_plans',
  {
    id: text('id').primaryKey(),
    target: text('target').notNull(),
    stableVersion: text('stable_version').notNull(),
    candidateVersion: text('candidate_version').notNull(),
    tenantAllowList: jsonb('tenant_allow_list').$type<string[]>().default([]).notNull(),
    rolloutPercent: real('rollout_percent').notNull(),
    status: text('status').notNull(),
    createdBy: text('created_by'),
    description: text('description'),
    payload: jsonb('payload').$type<RolloutPlanPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('rollout_plans_target_status_idx').on(table.target, table.status),
    index('rollout_plans_updated_at_idx').on(table.updatedAt),
  ],
);

export const auditMetricsDaily = pgTable(
  'audit_metrics_daily',
  {
    id: text('id').primaryKey(),
    metricDate: timestamp('metric_date', { withTimezone: true }).notNull(),
    tenantId: text('tenant_id'),
    ruleVersion: text('rule_version'),
    lawKbVersion: text('law_kb_version'),
    modelVersion: text('model_version'),
    auditTotal: integer('audit_total').default(0).notNull(),
    rejectTotal: integer('reject_total').default(0).notNull(),
    manualReviewTotal: integer('manual_review_total').default(0).notNull(),
    criticalFindingTotal: integer('critical_finding_total').default(0).notNull(),
    ruleHitByRuleId: jsonb('rule_hit_by_rule_id')
      .$type<Record<string, number>>()
      .default({})
      .notNull(),
    llmErrorTotal: integer('llm_error_total').default(0).notNull(),
    ragNoResultTotal: integer('rag_no_result_total').default(0).notNull(),
    apiErrorTotal: integer('api_error_total').default(0).notNull(),
    p95Latency: real('p95_latency').default(0).notNull(),
    payload: jsonb('payload').$type<AuditMetricsDailyPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('audit_metrics_daily_date_idx').on(table.metricDate),
    index('audit_metrics_daily_rule_version_idx').on(table.ruleVersion),
  ],
);

export const alertEvents = pgTable(
  'alert_events',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    severity: text('severity').notNull(),
    status: text('status').notNull(),
    metricKey: text('metric_key').notNull(),
    metricValue: real('metric_value').notNull(),
    threshold: real('threshold').notNull(),
    message: text('message').notNull(),
    payload: jsonb('payload').$type<AlertEventPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [
    index('alert_events_status_created_at_idx').on(table.status, table.createdAt),
    index('alert_events_metric_key_idx').on(table.metricKey),
  ],
);

export const tenantLevelModes = pgTable(
  'tenant_level_modes',
  {
    tenantId: text('tenant_id').primaryKey(),
    mode: text('mode').notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    updatedBy: text('updated_by'),
    payload: jsonb('payload').$type<TenantLevelModePayload>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('tenant_level_modes_mode_idx').on(table.mode)],
);

export const betaTrialRuns = pgTable(
  'beta_trial_runs',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    auditRunId: text('audit_run_id').notNull(),
    mode: text('mode').notNull(),
    agentDecision: text('agent_decision').notNull(),
    agentRiskLevel: text('agent_risk_level').notNull(),
    humanDecision: text('human_decision'),
    feedbackType: text('feedback_type'),
    comparisonResult: text('comparison_result'),
    falsePositive: boolean('false_positive').default(false).notNull(),
    falseNegative: boolean('false_negative').default(false).notNull(),
    businessImpactApplied: boolean('business_impact_applied').default(false).notNull(),
    agentRuleIds: jsonb('agent_rule_ids').$type<string[]>().default([]).notNull(),
    agentEvidenceIds: jsonb('agent_evidence_ids').$type<string[]>().default([]).notNull(),
    payload: jsonb('payload').$type<BetaTrialRunPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('beta_trial_runs_audit_run_idx').on(table.auditRunId),
    index('beta_trial_runs_tenant_created_at_idx').on(table.tenantId, table.createdAt),
    index('beta_trial_runs_mode_idx').on(table.mode),
    index('beta_trial_runs_comparison_idx').on(table.comparisonResult),
  ],
);

export const reviewTickets = pgTable(
  'review_tickets',
  {
    id: text('id').primaryKey(),
    auditRunId: text('audit_run_id')
      .notNull()
      .references(() => auditRuns.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id').notNull(),
    status: text('status').notNull(),
    agentDecision: text('agent_decision').notNull(),
    riskLevel: text('risk_level').notNull(),
    suggestedAction: text('suggested_action').notNull(),
    summaryRedacted: text('summary_redacted').notNull(),
    payload: jsonb('payload').$type<HumanReviewTicket>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('review_tickets_audit_run_idx').on(table.auditRunId),
    index('review_tickets_tenant_status_idx').on(table.tenantId, table.status),
    index('review_tickets_tenant_created_at_idx').on(table.tenantId, table.createdAt),
  ],
);

export const humanReviewFeedback = pgTable(
  'human_review_feedback',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    reviewTicketId: text('review_ticket_id').references(() => reviewTickets.id, {
      onDelete: 'cascade',
    }),
    auditRunId: text('audit_run_id')
      .notNull()
      .references(() => auditRuns.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id').notNull(),
    reviewerId: text('reviewer_id').notNull(),
    agentDecision: text('agent_decision'),
    finalDecision: text('final_decision'),
    feedbackType: text('feedback_type'),
    decision: text('decision').notNull(),
    commentRedacted: text('comment_redacted'),
    payload: jsonb('payload').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('human_review_feedback_tenant_run_idx').on(table.tenantId, table.auditRunId)],
);

export const reviewerDecisions = pgTable(
  'reviewer_decisions',
  {
    id: text('id').primaryKey(),
    reviewTicketId: text('review_ticket_id').notNull(),
    auditRunId: text('audit_run_id').notNull(),
    tenantId: text('tenant_id').notNull(),
    reviewerId: text('reviewer_id').notNull(),
    finalDecision: text('final_decision').notNull(),
    normalizedDecision: text('normalized_decision').notNull(),
    categories: jsonb('categories').$type<string[]>().default([]).notNull(),
    severity: text('severity').notNull(),
    feedbackType: text('feedback_type').notNull(),
    commentRedacted: text('comment_redacted'),
    confidence: real('confidence').default(1).notNull(),
    payload: jsonb('payload').$type<ReviewerDecisionPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('reviewer_decisions_ticket_reviewer_idx').on(
      table.reviewTicketId,
      table.reviewerId,
    ),
    index('reviewer_decisions_ticket_idx').on(table.reviewTicketId),
    index('reviewer_decisions_reviewer_idx').on(table.reviewerId),
  ],
);

export const reviewerAgreementStats = pgTable(
  'reviewer_agreement_stats',
  {
    reviewerId: text('reviewer_id').primaryKey(),
    totalLabeled: integer('total_labeled').default(0).notNull(),
    agreementCount: integer('agreement_count').default(0).notNull(),
    disagreementCount: integer('disagreement_count').default(0).notNull(),
    agreementRate: real('agreement_rate').default(0).notNull(),
    payload: jsonb('payload').$type<ReviewerAgreementStatsPayload>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('reviewer_agreement_stats_rate_idx').on(table.agreementRate)],
);

export const disputedCases = pgTable(
  'disputed_cases',
  {
    id: text('id').primaryKey(),
    reviewTicketId: text('review_ticket_id').notNull(),
    auditRunId: text('audit_run_id').notNull(),
    tenantId: text('tenant_id').notNull(),
    status: text('status').notNull(),
    reason: text('reason').notNull(),
    reviewerDecisionIds: jsonb('reviewer_decision_ids').$type<string[]>().default([]).notNull(),
    finalDecision: text('final_decision'),
    finalCategories: jsonb('final_categories').$type<string[]>(),
    finalSeverity: text('final_severity'),
    resolvedBy: text('resolved_by'),
    resolutionCommentRedacted: text('resolution_comment_redacted'),
    payload: jsonb('payload').$type<DisputedCasePayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('disputed_cases_review_ticket_idx').on(table.reviewTicketId),
    index('disputed_cases_tenant_status_idx').on(table.tenantId, table.status),
    index('disputed_cases_audit_run_idx').on(table.auditRunId),
  ],
);

export const ruleImprovementSuggestions = pgTable(
  'rule_improvement_suggestions',
  {
    id: text('id').primaryKey(),
    reviewTicketId: text('review_ticket_id')
      .notNull()
      .references(() => reviewTickets.id, { onDelete: 'cascade' }),
    auditRunId: text('audit_run_id')
      .notNull()
      .references(() => auditRuns.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id').notNull(),
    feedbackType: text('feedback_type').notNull(),
    category: text('category'),
    ruleId: text('rule_id'),
    title: text('title').notNull(),
    descriptionRedacted: text('description_redacted').notNull(),
    status: text('status').notNull(),
    createdBy: text('created_by').notNull(),
    resolvedBy: text('resolved_by'),
    resolutionCommentRedacted: text('resolution_comment_redacted'),
    payload: jsonb('payload').$type<RuleImprovementSuggestion>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [
    index('rule_suggestions_tenant_status_idx').on(table.tenantId, table.status),
    index('rule_suggestions_review_ticket_idx').on(table.reviewTicketId),
    index('rule_suggestions_rule_idx').on(table.ruleId),
  ],
);

export const evalDatasets = pgTable('eval_datasets', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  version: text('version').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').notNull(),
});

export const evalCases = pgTable(
  'eval_cases',
  {
    id: text('id').primaryKey(),
    datasetId: text('dataset_id').notNull(),
    source: text('source').notNull(),
    title: text('title'),
    description: text('description').notNull(),
    expectedDecision: text('expected_decision').notNull(),
    expectedCategories: jsonb('expected_categories').$type<string[]>().notNull(),
    expectedSeverity: text('expected_severity'),
    humanReason: text('human_reason'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [
    index('eval_cases_dataset_idx').on(table.datasetId),
    index('eval_cases_expected_decision_idx').on(table.expectedDecision),
  ],
);

export const evalRuns = pgTable(
  'eval_runs',
  {
    id: text('id').primaryKey(),
    datasetId: text('dataset_id').notNull(),
    ruleVersion: text('rule_version').notNull(),
    lawKbVersion: text('law_kb_version'),
    modelVersion: text('model_version'),
    totalCases: integer('total_cases').notNull(),
    passedCases: integer('passed_cases').notNull(),
    failedCases: integer('failed_cases').notNull(),
    decisionAccuracy: real('decision_accuracy').notNull(),
    categoryRecall: real('category_recall').notNull(),
    categoryPrecision: real('category_precision').notNull(),
    highRiskRecall: real('high_risk_recall').notNull(),
    criticalRecall: real('critical_recall').notNull(),
    falsePositiveRate: real('false_positive_rate').notNull(),
    falseNegativeRate: real('false_negative_rate').notNull(),
    manualReviewRate: real('manual_review_rate').notNull(),
    evidenceAccuracy: real('evidence_accuracy').notNull(),
    rewriteSafetyRate: real('rewrite_safety_rate').notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [
    index('eval_runs_dataset_created_at_idx').on(table.datasetId, table.createdAt),
    index('eval_runs_rule_version_idx').on(table.ruleVersion),
  ],
);

export const evalFailures = pgTable(
  'eval_failures',
  {
    id: text('id').primaryKey(),
    evalRunId: text('eval_run_id').notNull(),
    caseId: text('case_id').notNull(),
    expected: jsonb('expected').$type<Record<string, unknown>>().notNull(),
    actual: jsonb('actual').$type<Record<string, unknown>>().notNull(),
    failureType: text('failure_type').notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [
    index('eval_failures_run_idx').on(table.evalRunId),
    index('eval_failures_case_idx').on(table.caseId),
    index('eval_failures_failure_type_idx').on(table.failureType),
  ],
);

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    displayName: text('display_name').notNull(),
    email: text('email'),
    status: text('status').notNull(),
    payload: jsonb('payload').$type<UserPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('users_email_idx').on(table.email), index('users_status_idx').on(table.status)],
);

export const roles = pgTable(
  'roles',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    payload: jsonb('payload').$type<RolePayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('roles_name_idx').on(table.name)],
);

export const permissions = pgTable(
  'permissions',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    payload: jsonb('payload').$type<PermissionPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('permissions_name_idx').on(table.name)],
);

export const tenantMembers = pgTable(
  'tenant_members',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    role: text('role').notNull(),
    payload: jsonb('payload').$type<TenantMemberPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('tenant_members_tenant_user_idx').on(table.tenantId, table.userId),
    index('tenant_members_user_idx').on(table.userId),
    index('tenant_members_tenant_role_idx').on(table.tenantId, table.role),
  ],
);

export const auditOperationLogs = pgTable(
  'audit_operation_logs',
  {
    id: text('id').primaryKey(),
    actorUserId: text('actor_user_id').notNull(),
    actorRole: text('actor_role').notNull(),
    tenantId: text('tenant_id'),
    operation: text('operation').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id'),
    beforePayload: jsonb('before_payload').$type<Record<string, unknown>>(),
    afterPayload: jsonb('after_payload').$type<Record<string, unknown>>(),
    requestId: text('request_id'),
    payload: jsonb('payload').$type<AuditOperationLogPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('audit_operation_logs_actor_idx').on(table.actorUserId),
    index('audit_operation_logs_tenant_created_at_idx').on(table.tenantId, table.createdAt),
    index('audit_operation_logs_operation_idx').on(table.operation),
  ],
);

export const rulePublishApprovals = pgTable(
  'rule_publish_approvals',
  {
    id: text('id').primaryKey(),
    ruleSetId: text('rule_set_id').notNull(),
    ruleVersion: text('rule_version'),
    action: text('action').notNull(),
    status: text('status').notNull(),
    requestedBy: text('requested_by').notNull(),
    approvedBy: text('approved_by'),
    commentRedacted: text('comment_redacted'),
    payload: jsonb('payload').$type<RulePublishApprovalPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
  },
  (table) => [
    index('rule_publish_approvals_rule_set_idx').on(table.ruleSetId),
    index('rule_publish_approvals_status_idx').on(table.status),
  ],
);

export const dataRetentionJobs = pgTable(
  'data_retention_jobs',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id'),
    resourceType: text('resource_type').notNull(),
    retentionDays: integer('retention_days').notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    payload: jsonb('payload').$type<DataRetentionJobPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('data_retention_jobs_tenant_resource_idx').on(table.tenantId, table.resourceType),
    index('data_retention_jobs_enabled_idx').on(table.enabled),
  ],
);

export const dataDeletionRequests = pgTable(
  'data_deletion_requests',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    requesterId: text('requester_id').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    status: text('status').notNull(),
    deletedRecords: integer('deleted_records').default(0).notNull(),
    reasonRedacted: text('reason_redacted'),
    payload: jsonb('payload').$type<DataDeletionRequestPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    index('data_deletion_requests_tenant_status_idx').on(table.tenantId, table.status),
    index('data_deletion_requests_requester_idx').on(table.requesterId),
  ],
);

export const privacyExportRequests = pgTable(
  'privacy_export_requests',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    requesterId: text('requester_id').notNull(),
    status: text('status').notNull(),
    exportPayload: jsonb('export_payload').$type<Record<string, unknown>>(),
    payload: jsonb('payload').$type<PrivacyExportRequestPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    index('privacy_export_requests_tenant_status_idx').on(table.tenantId, table.status),
    index('privacy_export_requests_requester_idx').on(table.requesterId),
  ],
);

export const securityCheckResults = pgTable(
  'security_check_results',
  {
    id: text('id').primaryKey(),
    status: text('status').notNull(),
    summary: text('summary').notNull(),
    checks: jsonb('checks').$type<Record<string, unknown>[]>().notNull(),
    payload: jsonb('payload').$type<SecurityCheckResultPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('security_check_results_status_idx').on(table.status),
    index('security_check_results_created_at_idx').on(table.createdAt),
  ],
);

export const appealCases = pgTable(
  'appeal_cases',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    auditRunId: text('audit_run_id').notNull(),
    status: text('status').notNull(),
    reasonType: text('reason_type').notNull(),
    reasonTextRedacted: text('reason_text_redacted').notNull(),
    supplementalTextRedacted: text('supplemental_text_redacted'),
    submitterId: text('submitter_id').notNull(),
    originalDecision: text('original_decision').notNull(),
    originalRiskLevel: text('original_risk_level').notNull(),
    originalFindings: jsonb('original_findings').$type<Finding[]>().notNull(),
    originalEvidence: jsonb('original_evidence').$type<Evidence[]>().notNull(),
    payload: jsonb('payload').$type<AppealCasePayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('appeal_cases_tenant_status_idx').on(table.tenantId, table.status),
    index('appeal_cases_audit_run_idx').on(table.auditRunId),
    index('appeal_cases_reason_type_idx').on(table.reasonType),
  ],
);

export const appealMessages = pgTable(
  'appeal_messages',
  {
    id: text('id').primaryKey(),
    appealCaseId: text('appeal_case_id')
      .notNull()
      .references(() => appealCases.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id').notNull(),
    senderType: text('sender_type').notNull(),
    senderId: text('sender_id').notNull(),
    messageRedacted: text('message_redacted').notNull(),
    attachments: jsonb('attachments').$type<string[]>().default([]).notNull(),
    payload: jsonb('payload').$type<AppealMessagePayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('appeal_messages_case_created_at_idx').on(table.appealCaseId, table.createdAt),
    index('appeal_messages_tenant_idx').on(table.tenantId),
  ],
);

export const appealReviewResults = pgTable(
  'appeal_review_results',
  {
    id: text('id').primaryKey(),
    appealCaseId: text('appeal_case_id')
      .notNull()
      .references(() => appealCases.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id').notNull(),
    reviewerId: text('reviewer_id').notNull(),
    finalDecision: text('final_decision').notNull(),
    commentRedacted: text('comment_redacted').notNull(),
    payload: jsonb('payload').$type<AppealReviewResultPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('appeal_review_results_case_idx').on(table.appealCaseId),
    index('appeal_review_results_tenant_decision_idx').on(table.tenantId, table.finalDecision),
  ],
);

export const appealAgentReports = pgTable(
  'appeal_agent_reports',
  {
    id: text('id').primaryKey(),
    appealCaseId: text('appeal_case_id')
      .notNull()
      .references(() => appealCases.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id').notNull(),
    maintainReasons: jsonb('maintain_reasons').$type<string[]>().notNull(),
    overturnReasons: jsonb('overturn_reasons').$type<string[]>().notNull(),
    evidenceSummary: text('evidence_summary').notNull(),
    similarCases: jsonb('similar_cases').$type<Record<string, unknown>[]>().default([]).notNull(),
    recommendation: text('recommendation').notNull(),
    confidence: real('confidence').notNull(),
    payload: jsonb('payload').$type<AppealAgentReportPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('appeal_agent_reports_case_idx').on(table.appealCaseId),
    index('appeal_agent_reports_tenant_idx').on(table.tenantId),
  ],
);

export const apiKeys = pgTable(
  'api_keys',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    name: text('name').notNull(),
    keyHash: text('key_hash').notNull(),
    keyPrefix: text('key_prefix').notNull(),
    status: text('status').notNull(),
    payload: jsonb('payload').$type<ApiKeyPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('api_keys_hash_idx').on(table.keyHash),
    index('api_keys_tenant_status_idx').on(table.tenantId, table.status),
    index('api_keys_prefix_idx').on(table.keyPrefix),
  ],
);

export const usageRecords = pgTable(
  'usage_records',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    apiKeyId: text('api_key_id'),
    resourceType: text('resource_type').notNull(),
    quantity: integer('quantity').notNull(),
    period: text('period').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    payload: jsonb('payload').$type<UsageRecordPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('usage_records_tenant_period_idx').on(table.tenantId, table.period),
    index('usage_records_api_key_idx').on(table.apiKeyId),
  ],
);

export const subscriptionPlans = pgTable(
  'subscription_plans',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    monthlyQuota: integer('monthly_quota').notNull(),
    features: jsonb('features').$type<string[]>().default([]).notNull(),
    priceLabel: text('price_label').notNull(),
    status: text('status').notNull(),
    payload: jsonb('payload').$type<SubscriptionPlanPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('subscription_plans_status_idx').on(table.status)],
);

export const tenantBillingProfiles = pgTable(
  'tenant_billing_profiles',
  {
    tenantId: text('tenant_id').primaryKey(),
    tenantName: text('tenant_name').notNull(),
    planId: text('plan_id').notNull(),
    monthlyQuota: integer('monthly_quota').notNull(),
    usedQuota: integer('used_quota').default(0).notNull(),
    period: text('period').notNull(),
    brandConfig: jsonb('brand_config').$type<Record<string, unknown>>().default({}).notNull(),
    status: text('status').notNull(),
    payload: jsonb('payload').$type<TenantBillingProfilePayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('tenant_billing_profiles_plan_idx').on(table.planId),
    index('tenant_billing_profiles_status_idx').on(table.status),
  ],
);

export const webhooks = pgTable(
  'webhooks',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    url: text('url').notNull(),
    events: jsonb('events').$type<string[]>().default([]).notNull(),
    secretHash: text('secret_hash'),
    status: text('status').notNull(),
    payload: jsonb('payload').$type<WebhookPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastDeliveryAt: timestamp('last_delivery_at', { withTimezone: true }),
  },
  (table) => [
    index('webhooks_tenant_status_idx').on(table.tenantId, table.status),
    index('webhooks_events_idx').on(table.tenantId),
  ],
);

export const batchAuditJobs = pgTable(
  'batch_audit_jobs',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    status: text('status').notNull(),
    totalCount: integer('total_count').notNull(),
    completedCount: integer('completed_count').default(0).notNull(),
    failedCount: integer('failed_count').default(0).notNull(),
    resultIds: jsonb('result_ids').$type<string[]>().default([]).notNull(),
    errors: jsonb('errors').$type<Record<string, unknown>[]>().default([]).notNull(),
    payload: jsonb('payload').$type<BatchAuditJobPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('batch_audit_jobs_tenant_status_idx').on(table.tenantId, table.status),
    index('batch_audit_jobs_created_at_idx').on(table.createdAt),
  ],
);

export const asyncJobs = pgTable(
  'async_jobs',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    tenantId: text('tenant_id').notNull(),
    status: text('status').notNull(),
    batchId: text('batch_id'),
    batchItemId: text('batch_item_id'),
    auditRunId: text('audit_run_id'),
    errorRedacted: text('error_redacted'),
    payload: jsonb('payload').$type<AsyncJobPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    index('async_jobs_tenant_status_idx').on(table.tenantId, table.status),
    index('async_jobs_batch_idx').on(table.batchId),
  ],
);

export const batchAuditItems = pgTable(
  'batch_audit_items',
  {
    id: text('id').primaryKey(),
    batchId: text('batch_id').notNull(),
    tenantId: text('tenant_id').notNull(),
    jobPostingId: text('job_posting_id').notNull(),
    status: text('status').notNull(),
    auditRunId: text('audit_run_id'),
    errorRedacted: text('error_redacted'),
    payload: jsonb('payload').$type<BatchAuditItemPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    index('batch_audit_items_batch_idx').on(table.batchId),
    index('batch_audit_items_tenant_status_idx').on(table.tenantId, table.status),
  ],
);

export const llmUsageRecords = pgTable(
  'llm_usage_records',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    auditRunId: text('audit_run_id'),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    promptVersion: text('prompt_version'),
    tokensIn: integer('tokens_in').default(0).notNull(),
    tokensOut: integer('tokens_out').default(0).notNull(),
    cost: real('cost').default(0).notNull(),
    status: text('status').notNull(),
    payload: jsonb('payload').$type<LlmUsageRecordPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('llm_usage_records_tenant_created_at_idx').on(table.tenantId, table.createdAt),
    index('llm_usage_records_audit_run_idx').on(table.auditRunId),
  ],
);

export const costUsageDaily = pgTable(
  'cost_usage_daily',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    usageDate: timestamp('usage_date', { withTimezone: true }).notNull(),
    auditCount: integer('audit_count').default(0).notNull(),
    llmTokensIn: integer('llm_tokens_in').default(0).notNull(),
    llmTokensOut: integer('llm_tokens_out').default(0).notNull(),
    llmCost: real('llm_cost').default(0).notNull(),
    ragCost: real('rag_cost').default(0).notNull(),
    ruleCost: real('rule_cost').default(0).notNull(),
    totalCost: real('total_cost').default(0).notNull(),
    payload: jsonb('payload').$type<CostUsageDailyPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('cost_usage_daily_tenant_date_idx').on(table.tenantId, table.usageDate),
    index('cost_usage_daily_tenant_idx').on(table.tenantId),
  ],
);

export const rateLimitRecords = pgTable(
  'rate_limit_records',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    apiKeyId: text('api_key_id'),
    limitType: text('limit_type').notNull(),
    limitValue: integer('limit_value').notNull(),
    usedValue: integer('used_value').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    windowEnd: timestamp('window_end', { withTimezone: true }).notNull(),
    payload: jsonb('payload').$type<RateLimitRecordPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('rate_limit_records_tenant_window_idx').on(table.tenantId, table.windowStart),
    index('rate_limit_records_api_key_idx').on(table.apiKeyId),
  ],
);

export const integrationClients = pgTable(
  'integration_clients',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    name: text('name').notNull(),
    environment: text('environment').notNull(),
    status: text('status').notNull(),
    payload: jsonb('payload').$type<IntegrationClientPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('integration_clients_tenant_env_idx').on(table.tenantId, table.environment),
    index('integration_clients_status_idx').on(table.status),
  ],
);

export const webhookEndpoints = pgTable(
  'webhook_endpoints',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    url: text('url').notNull(),
    events: jsonb('events').$type<string[]>().default([]).notNull(),
    secretHash: text('secret_hash'),
    status: text('status').notNull(),
    payload: jsonb('payload').$type<WebhookEndpointPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('webhook_endpoints_tenant_status_idx').on(table.tenantId, table.status),
    index('webhook_endpoints_events_idx').on(table.tenantId),
  ],
);

export const webhookDeliveryLogs = pgTable(
  'webhook_delivery_logs',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    endpointId: text('endpoint_id').notNull(),
    event: text('event').notNull(),
    attempt: integer('attempt').notNull(),
    status: text('status').notNull(),
    statusCode: integer('status_code'),
    errorRedacted: text('error_redacted'),
    signature: text('signature').notNull(),
    payload: jsonb('payload').$type<WebhookDeliveryLogPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('webhook_delivery_logs_tenant_created_at_idx').on(table.tenantId, table.createdAt),
    index('webhook_delivery_logs_endpoint_idx').on(table.endpointId),
    index('webhook_delivery_logs_status_idx').on(table.status),
  ],
);

export const sandboxAuditRuns = pgTable(
  'sandbox_audit_runs',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    auditRunId: text('audit_run_id').notNull(),
    inputPayload: jsonb('input_payload').$type<Record<string, unknown>>().notNull(),
    resultPayload: jsonb('result_payload').$type<AuditResult>().notNull(),
    payload: jsonb('payload').$type<SandboxAuditRunPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('sandbox_audit_runs_tenant_created_at_idx').on(table.tenantId, table.createdAt),
    index('sandbox_audit_runs_audit_run_idx').on(table.auditRunId),
  ],
);

export const qaInspectionJobs = pgTable(
  'qa_inspection_jobs',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    strategy: text('strategy').notNull(),
    sampleSize: integer('sample_size').notNull(),
    ruleVersion: text('rule_version'),
    reviewerId: text('reviewer_id'),
    includeAppeals: boolean('include_appeals').default(true).notNull(),
    includeRewrites: boolean('include_rewrites').default(true).notNull(),
    includeEvidence: boolean('include_evidence').default(true).notNull(),
    status: text('status').notNull(),
    sampleCount: integer('sample_count').default(0).notNull(),
    issueCount: integer('issue_count').default(0).notNull(),
    summary: text('summary').notNull(),
    createdBy: text('created_by').notNull(),
    payload: jsonb('payload').$type<QaInspectionJobPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    index('qa_inspection_jobs_tenant_created_at_idx').on(table.tenantId, table.createdAt),
    index('qa_inspection_jobs_rule_version_idx').on(table.ruleVersion),
    index('qa_inspection_jobs_status_idx').on(table.status),
  ],
);

export const qaInspectionSamples = pgTable(
  'qa_inspection_samples',
  {
    id: text('id').primaryKey(),
    jobId: text('job_id')
      .notNull()
      .references(() => qaInspectionJobs.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id').notNull(),
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id').notNull(),
    auditRunId: text('audit_run_id'),
    reviewerId: text('reviewer_id'),
    ruleVersion: text('rule_version'),
    riskLevel: text('risk_level'),
    decision: text('decision'),
    payload: jsonb('payload').$type<QaInspectionSamplePayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('qa_inspection_samples_job_idx').on(table.jobId),
    index('qa_inspection_samples_tenant_source_idx').on(table.tenantId, table.sourceType),
    index('qa_inspection_samples_audit_run_idx').on(table.auditRunId),
    index('qa_inspection_samples_reviewer_idx').on(table.reviewerId),
    index('qa_inspection_samples_rule_version_idx').on(table.ruleVersion),
  ],
);

export const qaInspectionResults = pgTable(
  'qa_inspection_results',
  {
    id: text('id').primaryKey(),
    jobId: text('job_id')
      .notNull()
      .references(() => qaInspectionJobs.id, { onDelete: 'cascade' }),
    sampleId: text('sample_id')
      .notNull()
      .references(() => qaInspectionSamples.id, { onDelete: 'cascade' }),
    passed: boolean('passed').notNull(),
    score: integer('score').notNull(),
    checks: jsonb('checks').$type<Record<string, unknown>[]>().default([]).notNull(),
    payload: jsonb('payload').$type<QaInspectionResultPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('qa_inspection_results_job_idx').on(table.jobId),
    index('qa_inspection_results_sample_idx').on(table.sampleId),
    index('qa_inspection_results_passed_idx').on(table.passed),
  ],
);

export const qaQualityIssues = pgTable(
  'qa_quality_issues',
  {
    id: text('id').primaryKey(),
    jobId: text('job_id')
      .notNull()
      .references(() => qaInspectionJobs.id, { onDelete: 'cascade' }),
    sampleId: text('sample_id')
      .notNull()
      .references(() => qaInspectionSamples.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id').notNull(),
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id').notNull(),
    issueType: text('issue_type').notNull(),
    severity: text('severity').notNull(),
    description: text('description').notNull(),
    status: text('status').notNull(),
    linkedEvalCaseId: text('linked_eval_case_id'),
    linkedRuleSuggestionId: text('linked_rule_suggestion_id'),
    resolvedBy: text('resolved_by'),
    resolutionCommentRedacted: text('resolution_comment_redacted'),
    payload: jsonb('payload').$type<QaQualityIssuePayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [
    index('qa_quality_issues_tenant_status_idx').on(table.tenantId, table.status),
    index('qa_quality_issues_job_idx').on(table.jobId),
    index('qa_quality_issues_source_idx').on(table.sourceType, table.sourceId),
    index('qa_quality_issues_issue_type_idx').on(table.issueType),
  ],
);

export const pilotProjects = pgTable(
  'pilot_projects',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    name: text('name').notNull(),
    status: text('status').notNull(),
    modes: jsonb('modes').$type<string[]>().default([]).notNull(),
    startDate: timestamp('start_date', { withTimezone: true }).notNull(),
    endDate: timestamp('end_date', { withTimezone: true }).notNull(),
    avgReviewTimeBefore: real('avg_review_time_before').notNull(),
    avgReviewTimeAfter: real('avg_review_time_after').notNull(),
    hourlyLaborCost: real('hourly_labor_cost').notNull(),
    descriptionRedacted: text('description_redacted'),
    createdBy: text('created_by').notNull(),
    payload: jsonb('payload').$type<PilotProjectPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('pilot_projects_tenant_status_idx').on(table.tenantId, table.status),
    index('pilot_projects_period_idx').on(table.startDate, table.endDate),
  ],
);

export const pilotDailyMetrics = pgTable(
  'pilot_daily_metrics',
  {
    id: text('id').primaryKey(),
    pilotProjectId: text('pilot_project_id')
      .notNull()
      .references(() => pilotProjects.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id').notNull(),
    metricDate: timestamp('metric_date', { withTimezone: true }).notNull(),
    mode: text('mode').notNull(),
    totalJobsAudited: integer('total_jobs_audited').default(0).notNull(),
    autoPassRate: real('auto_pass_rate').default(0).notNull(),
    autoRejectRate: real('auto_reject_rate').default(0).notNull(),
    manualReviewRate: real('manual_review_rate').default(0).notNull(),
    avgReviewTimeBefore: real('avg_review_time_before').default(0).notNull(),
    avgReviewTimeAfter: real('avg_review_time_after').default(0).notNull(),
    timeSavedHours: real('time_saved_hours').default(0).notNull(),
    estimatedLaborCostSaved: real('estimated_labor_cost_saved').default(0).notNull(),
    falsePositiveRate: real('false_positive_rate').default(0).notNull(),
    falseNegativeRate: real('false_negative_rate').default(0).notNull(),
    appealRate: real('appeal_rate').default(0).notNull(),
    customerSatisfaction: real('customer_satisfaction').default(0).notNull(),
    topRiskCategories: jsonb('top_risk_categories').$type<Record<string, unknown>[]>().default([]).notNull(),
    topRuleHits: jsonb('top_rule_hits').$type<Record<string, unknown>[]>().default([]).notNull(),
    payload: jsonb('payload').$type<PilotDailyMetricsPayload>().notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('pilot_daily_metrics_project_date_mode_idx').on(
      table.pilotProjectId,
      table.metricDate,
      table.mode,
    ),
    index('pilot_daily_metrics_tenant_date_idx').on(table.tenantId, table.metricDate),
  ],
);

export const roiReports = pgTable(
  'roi_reports',
  {
    id: text('id').primaryKey(),
    pilotProjectId: text('pilot_project_id')
      .notNull()
      .references(() => pilotProjects.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id').notNull(),
    reportPeriodStart: timestamp('report_period_start', { withTimezone: true }).notNull(),
    reportPeriodEnd: timestamp('report_period_end', { withTimezone: true }).notNull(),
    totalJobsAudited: integer('total_jobs_audited').default(0).notNull(),
    timeSavedHours: real('time_saved_hours').default(0).notNull(),
    estimatedLaborCostSaved: real('estimated_labor_cost_saved').default(0).notNull(),
    falsePositiveRate: real('false_positive_rate').default(0).notNull(),
    falseNegativeRate: real('false_negative_rate').default(0).notNull(),
    appealRate: real('appeal_rate').default(0).notNull(),
    customerSatisfaction: real('customer_satisfaction').default(0).notNull(),
    risksAndLimitations: jsonb('risks_and_limitations').$type<string[]>().default([]).notNull(),
    markdownRedacted: text('markdown_redacted').notNull(),
    payload: jsonb('payload').$type<RoiReportPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('roi_reports_project_created_at_idx').on(table.pilotProjectId, table.createdAt),
    index('roi_reports_tenant_idx').on(table.tenantId),
  ],
);

export const customerFeedback = pgTable(
  'customer_feedback',
  {
    id: text('id').primaryKey(),
    pilotProjectId: text('pilot_project_id')
      .notNull()
      .references(() => pilotProjects.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id').notNull(),
    feedbackType: text('feedback_type').notNull(),
    rating: real('rating'),
    contactNameRedacted: text('contact_name_redacted'),
    commentRedacted: text('comment_redacted').notNull(),
    payload: jsonb('payload').$type<CustomerFeedbackPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('customer_feedback_project_idx').on(table.pilotProjectId),
    index('customer_feedback_tenant_created_at_idx').on(table.tenantId, table.createdAt),
  ],
);

export const betaPrograms = pgTable(
  'beta_programs',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    name: text('name').notNull(),
    status: text('status').notNull(),
    mode: text('mode').notNull(),
    startDate: timestamp('start_date', { withTimezone: true }).notNull(),
    endDate: timestamp('end_date', { withTimezone: true }).notNull(),
    scopeRedacted: text('scope_redacted').notNull(),
    goals: jsonb('goals').$type<string[]>().default([]).notNull(),
    ownerId: text('owner_id').notNull(),
    payload: jsonb('payload').$type<BetaProgramPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('beta_programs_tenant_status_idx').on(table.tenantId, table.status),
    index('beta_programs_mode_idx').on(table.mode),
    index('beta_programs_period_idx').on(table.startDate, table.endDate),
  ],
);

export const betaParticipants = pgTable(
  'beta_participants',
  {
    id: text('id').primaryKey(),
    programId: text('program_id')
      .notNull()
      .references(() => betaPrograms.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    displayName: text('display_name').notNull(),
    role: text('role').notNull(),
    emailRedacted: text('email_redacted'),
    active: boolean('active').default(true).notNull(),
    payload: jsonb('payload').$type<BetaParticipantPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('beta_participants_program_idx').on(table.programId),
    index('beta_participants_tenant_role_idx').on(table.tenantId, table.role),
    uniqueIndex('beta_participants_program_user_idx').on(table.programId, table.userId),
  ],
);

export const betaFeedback = pgTable(
  'beta_feedback',
  {
    id: text('id').primaryKey(),
    programId: text('program_id')
      .notNull()
      .references(() => betaPrograms.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id').notNull(),
    reporterId: text('reporter_id').notNull(),
    feedbackType: text('feedback_type').notNull(),
    severity: text('severity').notNull(),
    status: text('status').notNull(),
    titleRedacted: text('title_redacted').notNull(),
    descriptionRedacted: text('description_redacted').notNull(),
    relatedAuditRunId: text('related_audit_run_id'),
    payload: jsonb('payload').$type<BetaFeedbackPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [
    index('beta_feedback_program_status_idx').on(table.programId, table.status),
    index('beta_feedback_tenant_created_at_idx').on(table.tenantId, table.createdAt),
    index('beta_feedback_type_idx').on(table.feedbackType),
  ],
);

export const betaDailyReports = pgTable(
  'beta_daily_reports',
  {
    id: text('id').primaryKey(),
    programId: text('program_id')
      .notNull()
      .references(() => betaPrograms.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id').notNull(),
    reportDate: timestamp('report_date', { withTimezone: true }).notNull(),
    activeParticipants: integer('active_participants').default(0).notNull(),
    auditsReviewed: integer('audits_reviewed').default(0).notNull(),
    manualReviewsCompleted: integer('manual_reviews_completed').default(0).notNull(),
    feedbackOpened: integer('feedback_opened').default(0).notNull(),
    feedbackResolved: integer('feedback_resolved').default(0).notNull(),
    blockers: jsonb('blockers').$type<string[]>().default([]).notNull(),
    summaryRedacted: text('summary_redacted').notNull(),
    nextActions: jsonb('next_actions').$type<string[]>().default([]).notNull(),
    createdBy: text('created_by').notNull(),
    payload: jsonb('payload').$type<BetaDailyReportPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('beta_daily_reports_program_date_idx').on(table.programId, table.reportDate),
    index('beta_daily_reports_tenant_date_idx').on(table.tenantId, table.reportDate),
  ],
);

export const betaGoNoGoChecks = pgTable(
  'beta_go_no_go_checks',
  {
    id: text('id').primaryKey(),
    programId: text('program_id')
      .notNull()
      .references(() => betaPrograms.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id').notNull(),
    checkKey: text('check_key').notNull(),
    title: text('title').notNull(),
    required: boolean('required').default(true).notNull(),
    status: text('status').notNull(),
    ownerRole: text('owner_role').notNull(),
    evidenceRedacted: text('evidence_redacted'),
    payload: jsonb('payload').$type<BetaGoNoGoCheckPayload>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('beta_go_no_go_checks_program_key_idx').on(table.programId, table.checkKey),
    index('beta_go_no_go_checks_tenant_status_idx').on(table.tenantId, table.status),
  ],
);

export const reviewerTrainingCompleted = pgTable(
  'reviewer_training_completed',
  {
    id: text('id').primaryKey(),
    reviewerId: text('reviewer_id').notNull(),
    tenantId: text('tenant_id'),
    completed: boolean('completed').default(true).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }).defaultNow().notNull(),
    documentVersion: text('document_version').notNull(),
    payload: jsonb('payload').$type<ReviewerTrainingCompletedPayload>().notNull(),
  },
  (table) => [
    uniqueIndex('reviewer_training_completed_reviewer_tenant_idx').on(
      table.reviewerId,
      table.tenantId,
    ),
    index('reviewer_training_completed_tenant_idx').on(table.tenantId),
  ],
);

export const incidentEvents = pgTable(
  'incident_events',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id'),
    incidentType: text('incident_type').notNull(),
    severity: text('severity').notNull(),
    status: text('status').notNull(),
    titleRedacted: text('title_redacted').notNull(),
    descriptionRedacted: text('description_redacted').notNull(),
    relatedAuditRunId: text('related_audit_run_id'),
    createdBy: text('created_by').notNull(),
    payload: jsonb('payload').$type<IncidentEventPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [
    index('incident_events_tenant_status_idx').on(table.tenantId, table.status),
    index('incident_events_type_severity_idx').on(table.incidentType, table.severity),
    index('incident_events_created_at_idx').on(table.createdAt),
  ],
);

export const incidentActions = pgTable(
  'incident_actions',
  {
    id: text('id').primaryKey(),
    incidentId: text('incident_id')
      .notNull()
      .references(() => incidentEvents.id, { onDelete: 'cascade' }),
    actionType: text('action_type').notNull(),
    actorId: text('actor_id').notNull(),
    summaryRedacted: text('summary_redacted').notNull(),
    payload: jsonb('payload').$type<IncidentActionPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('incident_actions_incident_idx').on(table.incidentId),
    index('incident_actions_action_type_idx').on(table.actionType),
  ],
);

export const incidentPostmortems = pgTable(
  'incident_postmortems',
  {
    id: text('id').primaryKey(),
    incidentId: text('incident_id')
      .notNull()
      .references(() => incidentEvents.id, { onDelete: 'cascade' }),
    rootCauseRedacted: text('root_cause_redacted').notNull(),
    impactRedacted: text('impact_redacted').notNull(),
    timeline: jsonb('timeline').$type<string[]>().default([]).notNull(),
    correctiveActions: jsonb('corrective_actions').$type<string[]>().default([]).notNull(),
    preventionActions: jsonb('prevention_actions').$type<string[]>().default([]).notNull(),
    createdBy: text('created_by').notNull(),
    payload: jsonb('payload').$type<IncidentPostmortemPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('incident_postmortems_incident_idx').on(table.incidentId),
    index('incident_postmortems_created_at_idx').on(table.createdAt),
  ],
);

export const emergencyRuntimeSwitches = pgTable(
  'emergency_runtime_switches',
  {
    key: text('key').primaryKey(),
    enabled: boolean('enabled').default(false).notNull(),
    reasonRedacted: text('reason_redacted'),
    updatedBy: text('updated_by').notNull(),
    payload: jsonb('payload').$type<EmergencyRuntimeSwitchPayload>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('emergency_runtime_switches_enabled_idx').on(table.enabled),
    index('emergency_runtime_switches_updated_at_idx').on(table.updatedAt),
  ],
);

export const trustedKnowledgeSources = pgTable(
  'trusted_knowledge_sources',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    sourceType: text('source_type').notNull(),
    baseUrl: text('base_url').notNull(),
    jurisdiction: text('jurisdiction').notNull(),
    scope: text('scope').notNull(),
    status: text('status').notNull(),
    payload: jsonb('payload').$type<TrustedKnowledgeSourcePayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('trusted_sources_jurisdiction_scope_idx').on(table.jurisdiction, table.scope),
    index('trusted_sources_status_idx').on(table.status),
  ],
);

export const lawKbDocuments = pgTable(
  'law_kb_documents',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id').notNull(),
    title: text('title').notNull(),
    sourceUrl: text('source_url').notNull(),
    sourceType: text('source_type').notNull(),
    jurisdiction: text('jurisdiction').notNull(),
    scope: text('scope').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull(),
    effectiveTo: timestamp('effective_to', { withTimezone: true }),
    categories: jsonb('categories').$type<string[]>().default([]).notNull(),
    keywords: jsonb('keywords').$type<string[]>().default([]).notNull(),
    payload: jsonb('payload').$type<LawKbDocumentPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('law_kb_documents_source_idx').on(table.sourceId),
    index('law_kb_documents_scope_idx').on(table.jurisdiction, table.scope),
  ],
);

export const lawKbDocumentVersions = pgTable(
  'law_kb_document_versions',
  {
    id: text('id').primaryKey(),
    documentId: text('document_id').notNull(),
    version: text('version').notNull(),
    contentRedacted: text('content_redacted').notNull(),
    contentHash: text('content_hash').notNull(),
    importedBy: text('imported_by').notNull(),
    payload: jsonb('payload').$type<LawKbDocumentVersionPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('law_kb_document_versions_doc_version_idx').on(table.documentId, table.version),
    index('law_kb_document_versions_hash_idx').on(table.contentHash),
  ],
);

export const lawKbUpdateSuggestions = pgTable(
  'law_kb_update_suggestions',
  {
    id: text('id').primaryKey(),
    documentId: text('document_id').notNull(),
    fromVersion: text('from_version'),
    toVersion: text('to_version').notNull(),
    status: text('status').notNull(),
    diff: jsonb('diff').$type<Record<string, unknown>>().notNull(),
    impactSummary: text('impact_summary').notNull(),
    payload: jsonb('payload').$type<LawKbUpdateSuggestionPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
  },
  (table) => [
    index('law_kb_update_suggestions_status_idx').on(table.status),
    index('law_kb_update_suggestions_document_idx').on(table.documentId),
  ],
);

export const lawKbVersionRecords = pgTable(
  'law_kb_version_records',
  {
    id: text('id').primaryKey(),
    lawKbVersion: text('law_kb_version').notNull(),
    suggestionId: text('suggestion_id').notNull(),
    approvedBy: text('approved_by').notNull(),
    evalRunId: text('eval_run_id'),
    payload: jsonb('payload').$type<LawKbVersionRecordPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('law_kb_version_records_version_idx').on(table.lawKbVersion),
    index('law_kb_version_records_suggestion_idx').on(table.suggestionId),
  ],
);

export const lawKbImpactReports = pgTable(
  'law_kb_impact_reports',
  {
    id: text('id').primaryKey(),
    suggestionId: text('suggestion_id').notNull(),
    affectedCategories: jsonb('affected_categories').$type<string[]>().default([]).notNull(),
    affectedRules: jsonb('affected_rules').$type<string[]>().default([]).notNull(),
    affectedEvidenceIds: jsonb('affected_evidence_ids').$type<string[]>().default([]).notNull(),
    summary: text('summary').notNull(),
    payload: jsonb('payload').$type<LawKbImpactReportPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('law_kb_impact_reports_suggestion_idx').on(table.suggestionId)],
);

export const releaseCandidates = pgTable(
  'release_candidates',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    target: text('target').notNull(),
    targetVersion: text('target_version').notNull(),
    ruleVersion: text('rule_version'),
    lawKbVersion: text('law_kb_version'),
    modelVersion: text('model_version'),
    promptVersion: text('prompt_version'),
    evalDatasetId: text('eval_dataset_id'),
    description: text('description'),
    status: text('status').notNull(),
    createdBy: text('created_by').notNull(),
    qualityMetrics: jsonb('quality_metrics').$type<Record<string, unknown>>().default({}).notNull(),
    payload: jsonb('payload').$type<ReleaseCandidatePayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('release_candidates_target_status_idx').on(table.target, table.status),
    index('release_candidates_versions_idx').on(
      table.ruleVersion,
      table.lawKbVersion,
      table.modelVersion,
    ),
    index('release_candidates_updated_at_idx').on(table.updatedAt),
  ],
);

export const releaseGateResults = pgTable(
  'release_gate_results',
  {
    id: text('id').primaryKey(),
    candidateId: text('candidate_id')
      .notNull()
      .references(() => releaseCandidates.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    thresholds: jsonb('thresholds').$type<Record<string, number>>().notNull(),
    payload: jsonb('payload').$type<ReleaseGateResultPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('release_gate_results_candidate_idx').on(table.candidateId),
    index('release_gate_results_status_idx').on(table.status),
  ],
);

export const releaseGateChecks = pgTable(
  'release_gate_checks',
  {
    id: text('id').primaryKey(),
    candidateId: text('candidate_id')
      .notNull()
      .references(() => releaseCandidates.id, { onDelete: 'cascade' }),
    gateResultId: text('gate_result_id')
      .notNull()
      .references(() => releaseGateResults.id, { onDelete: 'cascade' }),
    checkKey: text('check_key').notNull(),
    title: text('title').notNull(),
    status: text('status').notNull(),
    required: boolean('required').default(true).notNull(),
    threshold: real('threshold'),
    actual: jsonb('actual'),
    detail: text('detail').notNull(),
    durationMs: integer('duration_ms').default(0).notNull(),
    payload: jsonb('payload').$type<ReleaseGateCheckPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('release_gate_checks_candidate_idx').on(table.candidateId),
    index('release_gate_checks_result_idx').on(table.gateResultId),
    index('release_gate_checks_status_idx').on(table.status),
  ],
);

export const releaseApprovalRecords = pgTable(
  'release_approval_records',
  {
    id: text('id').primaryKey(),
    candidateId: text('candidate_id')
      .notNull()
      .references(() => releaseCandidates.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    approvedBy: text('approved_by').notNull(),
    commentRedacted: text('comment_redacted'),
    payload: jsonb('payload').$type<ReleaseApprovalRecordPayload>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('release_approval_records_candidate_idx').on(table.candidateId),
    index('release_approval_records_approver_idx').on(table.approvedBy),
  ],
);
