import type { JobPostingRewriteResult } from '@job-compliance/core';
import type { AuditEnrichmentContext } from './enrichment-context-loader.js';

export interface RewriteFindingCoverage {
  addressedFindingIds: string[];
  unaddressedFindingIds: string[];
  unknownFindingIds: string[];
}

type OriginalJob = AuditEnrichmentContext['originalJob'];
type Finding = AuditEnrichmentContext['findings'][number];

function normalizeText(value: string): string {
  return value
    .replace(/[\s\u3000]+/gu, ' ')
    .trim()
    .toLocaleLowerCase('en-US');
}

/** A stable business-text representation shared by pre- and post-rewrite checks. */
export function canonicalJobText(job: OriginalJob | JobPostingRewriteResult): string {
  if ('description' in job && 'changes' in job) {
    return normalizeText(
      [
        job.title,
        job.description,
        ...(job.responsibilities ?? []),
        ...(job.requirements ?? []),
        ...(job.benefits ?? []),
      ]
        .filter((value): value is string => typeof value === 'string')
        .join('\n'),
    );
  }
  return normalizeText(
    [job.title, job.companyName, job.location, job.salary, job.employmentType, job.description]
      .filter((value): value is string => typeof value === 'string')
      .join('\n'),
  );
}

function stableUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

/**
 * Deterministically proves whether each persisted finding was explicitly
 * referenced and removed. It intentionally makes no semantic inference.
 */
export function calculateRewriteFindingCoverage(input: {
  findings: readonly Finding[];
  originalJob: OriginalJob;
  rewrite: JobPostingRewriteResult;
}): RewriteFindingCoverage {
  const knownFindings = new Map<string, Finding>();
  for (const finding of input.findings) knownFindings.set(finding.id, finding);
  const referencedIds = stableUnique(input.rewrite.changes.map((change) => change.findingId));
  const unknownFindingIds = referencedIds.filter((id) => !knownFindings.has(id));
  const originalText = canonicalJobText(input.originalJob);
  const rewrittenText = canonicalJobText(input.rewrite);
  const addressedFindingIds: string[] = [];
  const unaddressedFindingIds: string[] = [];

  for (const findingId of stableUnique(knownFindings.keys())) {
    const finding = knownFindings.get(findingId);
    const matchedText =
      finding?.matchedText === undefined ? '' : normalizeText(finding.matchedText);
    const explicitlyReferenced = referencedIds.includes(findingId);
    const isRemoved =
      matchedText.length > 0 &&
      originalText.includes(matchedText) &&
      !rewrittenText.includes(matchedText);
    if (explicitlyReferenced && isRemoved) addressedFindingIds.push(findingId);
    else unaddressedFindingIds.push(findingId);
  }

  return { addressedFindingIds, unaddressedFindingIds, unknownFindingIds };
}
