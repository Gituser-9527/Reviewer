export const reviewDecisions = ['PASS', 'BLOCK', 'REVIEW'] as const;
export type ReviewDecision = (typeof reviewDecisions)[number];

export const riskLevels = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type RiskLevel = (typeof riskLevels)[number];

export const reviewStatuses = [
  'RECEIVED',
  'PROCESSING',
  'NEEDS_REVIEW',
  'COMPLETED',
  'FAILED',
] as const;
export type ReviewStatus = (typeof reviewStatuses)[number];

import type { JobPostingInput } from './audit.js';

export interface TenantContext {
  /** Tenant that owns the current operation. */
  tenantId: string;
}

/** Backward-compatible name for a raw job posting. */
export type JobPosting = JobPostingInput;
