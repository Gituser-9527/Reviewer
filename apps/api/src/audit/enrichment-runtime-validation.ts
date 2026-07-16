import {
  auditExplanationResultSchema,
  jobPostingRewriteResultSchema,
  type JobPostingRewriteResult,
} from '@job-compliance/core';
import {
  validateRewriteSafety,
  type ProtectedJobFacts,
  type RewriteSafetyResult,
} from './rewrite-safety.js';

export function validateExplanationRuntime(
  value: unknown,
  auditRunId: string,
  findingIds: ReadonlySet<string>,
  evidenceIds: ReadonlySet<string>,
): { ok: true; value: unknown } | { ok: false; code: string } {
  const parsed = auditExplanationResultSchema.safeParse(value);
  if (!parsed.success) return { ok: false, code: 'EXPLANATION_SCHEMA_VALIDATION_FAILED' };
  if (parsed.data.auditRunId !== auditRunId)
    return { ok: false, code: 'EXPLANATION_UNGROUNDED_CONTENT' };
  for (const finding of parsed.data.findings) {
    if (!findingIds.has(finding.findingId))
      return { ok: false, code: 'EXPLANATION_UNKNOWN_FINDING' };
    if (finding.evidenceRefs.some((id) => !evidenceIds.has(id)))
      return { ok: false, code: 'EXPLANATION_UNKNOWN_EVIDENCE' };
  }
  return { ok: true, value: parsed.data };
}
export function validateRewriteRuntime(
  value: unknown,
  facts: ProtectedJobFacts,
  findingIds: ReadonlySet<string>,
):
  | {
      ok: true;
      value: JobPostingRewriteResult;
      safety: RewriteSafetyResult;
    }
  | { ok: false; code: string; safety: RewriteSafetyResult } {
  const parsed = jobPostingRewriteResultSchema.safeParse(value);
  if (!parsed.success)
    return {
      ok: false,
      code: 'REWRITE_SCHEMA_VALIDATION_FAILED',
      safety: {
        passed: false,
        decision: 'REJECTED',
        protectedFactViolations: [],
        warnings: ['REWRITE_SCHEMA_VALIDATION_FAILED'],
      },
    };
  const checked = validateRewriteSafety(parsed.data, facts, findingIds);
  return { ok: true, value: checked.rewrite!, safety: checked.safety };
}
