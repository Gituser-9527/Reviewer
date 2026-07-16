import {
  basicExtractor,
  normalizeAuditText,
  type JobPostingRewriteResult,
  type RuleEngine,
  type RuleHit,
  YamlRuleEngine,
} from '@job-compliance/core';
import type { JobPostingInput } from '@job-compliance/shared';
import { FileRuleManagementStore } from '../rules/store.js';
import type { AuditEnrichmentContext } from './enrichment-context-loader.js';

export interface RewriteRuleEngineReview {
  status: 'COMPLETED';
  ruleVersion: string;
  rewrittenFindings: readonly RuleHit[];
  residualFindingKeys: string[];
  introducedFindingKeys: string[];
  hasCriticalOrHighFindings: boolean;
}

export interface RewriteRuleEngineAdapter {
  review(input: {
    context: AuditEnrichmentContext;
    rewrite: JobPostingRewriteResult;
  }): Promise<RewriteRuleEngineReview>;
}

export interface RuleEngineResolver {
  resolve(input: { jurisdiction: string; ruleVersion: string }): Promise<RuleEngine>;
}
export interface RuleVersionStore {
  getCurrentRuleVersion(jurisdiction: string): Promise<string>;
  getRulesDirectoryForVersion(jurisdiction: string, ruleVersion: string): Promise<string>;
}

function normalized(value: string): string {
  return value
    .replace(/[\s\u3000]+/gu, ' ')
    .trim()
    .toLocaleLowerCase('en-US');
}

function findingKey(input: { ruleId?: string; category: string; matchedText?: string }): string {
  return `${input.ruleId ?? 'NO_RULE'}|${input.category}|${normalized(input.matchedText ?? '')}`;
}

function keysForRuleHit(hit: RuleHit): string[] {
  const texts = hit.matchedText.length === 0 ? [''] : hit.matchedText;
  return texts.map((matchedText) =>
    findingKey({ ruleId: hit.ruleId, category: hit.category, matchedText }),
  );
}

function stable(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function rewrittenPosting(
  context: AuditEnrichmentContext,
  rewrite: JobPostingRewriteResult,
): JobPostingInput {
  return {
    title: rewrite.title ?? context.originalJob.title ?? '',
    description: rewrite.description,
    companyName: context.originalJob.companyName ?? '',
    ...(context.originalJob.location === undefined
      ? {}
      : { location: context.originalJob.location }),
    ...(context.originalJob.employmentType === undefined
      ? {}
      : { employmentType: context.originalJob.employmentType }),
    ...(context.originalJob.salary === undefined
      ? {}
      : { salary: { text: context.originalJob.salary } }),
    ...(rewrite.responsibilities === undefined
      ? {}
      : { responsibilities: rewrite.responsibilities }),
    ...(rewrite.requirements === undefined ? {} : { requirements: rewrite.requirements }),
    metadata: {},
  };
}

/** Uses the same published YAML rule engine as the production audit route, without audit persistence or enqueue side effects. */
export class ProductionRewriteRuleEngineAdapter implements RewriteRuleEngineAdapter {
  private readonly resolver: RuleEngineResolver;

  constructor(
    private readonly ruleStore: RuleVersionStore = new FileRuleManagementStore(),
    resolver?: RuleEngineResolver,
  ) {
    this.resolver = resolver ?? {
      resolve: async ({ jurisdiction, ruleVersion }) => {
        const directory = await this.ruleStore.getRulesDirectoryForVersion(
          jurisdiction,
          ruleVersion,
        );
        return YamlRuleEngine.fromDirectory(directory);
      },
    };
  }

  async review(input: {
    context: AuditEnrichmentContext;
    rewrite: JobPostingRewriteResult;
  }): Promise<RewriteRuleEngineReview> {
    const jurisdiction = input.context.jurisdiction;
    const ruleVersion = await this.ruleStore.getCurrentRuleVersion(jurisdiction);
    const engine = await this.resolver.resolve({ jurisdiction, ruleVersion });
    const posting = rewrittenPosting(input.context, input.rewrite);
    const rawText = [
      posting.title,
      posting.description,
      ...(posting.responsibilities ?? []),
      ...(posting.requirements ?? []),
    ].join('\n');
    const normalizedText = normalizeAuditText(rawText);
    const extractedFacts = await basicExtractor.extract({
      rawText: normalizedText,
      structuredInput: posting,
    });
    const rewrittenFindings = engine.evaluate({
      rawText,
      normalizedText,
      extractedFacts,
      jurisdiction,
      ruleVersion,
    });
    const originalKeys = new Set(input.context.findings.map((finding) => findingKey(finding)));
    const rewriteKeys = stable(rewrittenFindings.flatMap(keysForRuleHit));
    const residualFindingKeys = rewriteKeys.filter((key) => originalKeys.has(key));
    const introducedFindingKeys = rewriteKeys.filter((key) => !originalKeys.has(key));
    return {
      status: 'COMPLETED',
      ruleVersion,
      rewrittenFindings,
      residualFindingKeys,
      introducedFindingKeys,
      hasCriticalOrHighFindings: rewrittenFindings.some(
        (finding) => finding.severity === 'CRITICAL' || finding.severity === 'HIGH',
      ),
    };
  }
}
