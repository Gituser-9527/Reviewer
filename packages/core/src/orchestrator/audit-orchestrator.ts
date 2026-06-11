import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import {
  auditResultSchema,
  jobPostingInputSchema,
  type AuditResult,
  type CheckerResult,
  type Evidence,
  type Finding,
  type JobPostingInput,
} from '@job-compliance/shared';
import { basicExtractor } from '../extractor/basic-extractor.js';
import type { JobFactsExtractor } from '../extractor/types.js';
import type { ComplianceKnowledgePort, KnowledgeResult } from '../ports/knowledge.js';
import type { RuleEngine } from '../ports/rule-engine.js';
import type { RuleHit } from '../rules/types.js';
import { YamlRuleEngine } from '../rules/yaml-rule-engine.js';
import { MockEvidenceRetriever } from './mock-evidence-retriever.js';
import { ReflectionChecker } from './reflection-checker.js';
import { RiskAggregator } from './risk-aggregator.js';

/** Runtime settings and dependency overrides for audit orchestration. */
export interface AuditOrchestratorOptions {
  /** Extractor used to produce JobFacts. */
  extractor?: JobFactsExtractor;
  /** Rule engine used to scan normalized text and facts. */
  ruleEngine?: RuleEngine;
  /** Evidence retriever used to supplement rule evidence. */
  evidenceRetriever?: ComplianceKnowledgePort;
  /** Risk aggregator used to derive the final decision. */
  riskAggregator?: RiskAggregator;
  /** Reflection checker used to validate the final result. */
  reflectionChecker?: ReflectionChecker;
  /** Directory containing the default YAML rule set. */
  rulesDirectory?: string;
  /** Jurisdiction used by the default rule engine. */
  jurisdiction?: string;
  /** Exact rule version used by the default rule engine. */
  ruleVersion?: string;
  /** Version label for the mock or real knowledge base. */
  lawKbVersion?: string;
  /** Locale used for evidence retrieval. */
  locale?: string;
  /** Platform policy scope used for evidence retrieval. */
  platform?: string;
  /** Tenant recorded in the audit context. */
  tenantId?: string;
  /** ID generator used by the orchestrator. */
  generateId?: () => string;
  /** Clock used by the orchestrator. */
  now?: () => Date;
}

interface ResolvedOptions {
  extractor: JobFactsExtractor;
  ruleEngine: RuleEngine;
  evidenceRetriever: ComplianceKnowledgePort;
  riskAggregator: RiskAggregator;
  reflectionChecker: ReflectionChecker;
  jurisdiction: string;
  ruleVersion: string;
  lawKbVersion: string;
  locale: string;
  platform: string;
  tenantId: string;
  generateId: () => string;
  now: () => Date;
}

const defaultRulesDirectory = resolve(process.cwd(), 'rules', 'cn-mainland');
const ruleEngineCache = new Map<string, Promise<YamlRuleEngine>>();

function getDefaultRuleEngine(directory: string): Promise<YamlRuleEngine> {
  const cached = ruleEngineCache.get(directory);
  if (cached) return cached;
  const loading = YamlRuleEngine.fromDirectory(directory);
  ruleEngineCache.set(directory, loading);
  return loading;
}

/** Normalizes source text before extraction and rule evaluation. */
export function normalizeAuditText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/\r\n?/gu, '\n')
    .replace(/[\t\f\v]+/gu, ' ')
    .replace(/[ ]{2,}/gu, ' ')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function composeRawText(input: JobPostingInput): string {
  const sections = [input.title, input.description];
  if (input.responsibilities?.length) {
    sections.push(`岗位职责:\n${input.responsibilities.join('\n')}`);
  }
  if (input.requirements?.length) {
    sections.push(`任职要求:\n${input.requirements.join('\n')}`);
  }
  if (input.companyName) sections.push(`公司名称:${input.companyName}`);
  if (input.location) sections.push(`工作地点:${input.location}`);
  if (input.employmentType) sections.push(`工作性质:${input.employmentType}`);
  if (input.salary?.text) sections.push(`薪资:${input.salary.text}`);
  return sections.join('\n');
}

function knowledgeResultToEvidence(result: KnowledgeResult): Evidence {
  return {
    id: result.evidenceId,
    sourceType: result.sourceType,
    sourceName: result.sourceName,
    sourceVersion: result.sourceVersion,
    quote: result.content,
    ...(result.effectiveFrom === undefined ? {} : { effectiveFrom: result.effectiveFrom }),
    ...(result.effectiveTo === undefined ? {} : { effectiveTo: result.effectiveTo }),
    metadata: {
      retrievedAt: result.retrievedAt,
      score: result.score,
    },
  };
}

function ruleHitToFinding(hit: RuleHit, index: number, retrieved: Evidence[]): Finding {
  const evidence = [...hit.evidence, ...retrieved];
  return {
    id: `finding-${index + 1}-${hit.ruleId}`,
    category: hit.category,
    severity: hit.severity,
    decision: hit.decision,
    title: hit.ruleId,
    message: hit.message,
    evidence,
    ruleId: hit.ruleId,
    ...(retrieved[0] === undefined ? {} : { evidenceId: retrieved[0].id }),
    ...(hit.suggestion === undefined ? {} : { suggestion: hit.suggestion }),
    metadata: {
      ruleVersion: hit.ruleVersion,
      action: hit.action,
      matchedText: hit.matchedText,
    },
  };
}

function uniqueEvidence(findings: readonly Finding[]): Evidence[] {
  const seen = new Set<string>();
  return findings.flatMap((finding) =>
    finding.evidence.filter((evidence) => {
      if (seen.has(evidence.id)) return false;
      seen.add(evidence.id);
      return true;
    }),
  );
}

function summaryFor(findings: readonly Finding[], decision: AuditResult['decision']): string {
  if (findings.length === 0) return '未发现当前规则集可识别的岗位合规风险。';
  const categories = [...new Set(findings.map((finding) => finding.category))].join('、');
  return `发现 ${findings.length} 个风险项，涉及 ${categories}，建议处置为 ${decision}。`;
}

async function resolveOptions(options: AuditOrchestratorOptions): Promise<ResolvedOptions> {
  const riskAggregator = options.riskAggregator ?? new RiskAggregator();
  return {
    extractor: options.extractor ?? basicExtractor,
    ruleEngine:
      options.ruleEngine ??
      (await getDefaultRuleEngine(options.rulesDirectory ?? defaultRulesDirectory)),
    evidenceRetriever: options.evidenceRetriever ?? new MockEvidenceRetriever(),
    riskAggregator,
    reflectionChecker: options.reflectionChecker ?? new ReflectionChecker(riskAggregator),
    jurisdiction: options.jurisdiction ?? 'CN_MAINLAND',
    ruleVersion: options.ruleVersion ?? '1.0.0',
    lawKbVersion: options.lawKbVersion ?? 'mock-1.0.0',
    locale: options.locale ?? 'zh-CN',
    platform: options.platform ?? 'DEFAULT',
    tenantId: options.tenantId ?? 'SYSTEM',
    generateId: options.generateId ?? randomUUID,
    now: options.now ?? (() => new Date()),
  };
}

/** Coordinates deterministic extraction, rule evaluation, evidence retrieval and result generation. */
export async function auditJobPosting(
  input: JobPostingInput,
  options: AuditOrchestratorOptions = {},
): Promise<AuditResult> {
  const validInput = jobPostingInputSchema.parse(input);
  const dependencies = await resolveOptions(options);
  const rawText = composeRawText(validInput);
  const normalizedText = normalizeAuditText(rawText);
  const facts = await dependencies.extractor.extract({
    rawText: normalizedText,
    structuredInput: validInput,
  });

  const ruleStartedAt = Date.now();
  const hits = dependencies.ruleEngine.evaluate({
    rawText,
    normalizedText,
    extractedFacts: facts,
    jurisdiction: dependencies.jurisdiction,
    ruleVersion: dependencies.ruleVersion,
  });
  const evaluatedAt = dependencies.now().toISOString();
  const retrievedEvidence = await Promise.all(
    hits.map(async (hit) => {
      const results = await dependencies.evidenceRetriever.retrieve({
        text: `${hit.ruleId} ${hit.category} ${hit.message}`,
        jurisdiction: dependencies.jurisdiction,
        platform: dependencies.platform,
        locale: dependencies.locale,
        asOf: evaluatedAt,
        topK: 3,
      });
      return results.map(knowledgeResultToEvidence);
    }),
  );
  const findings = hits.map((hit, index) =>
    ruleHitToFinding(hit, index, retrievedEvidence[index] ?? []),
  );
  const aggregation = dependencies.riskAggregator.aggregate(findings);
  const auditId = dependencies.generateId();
  const evidence = uniqueEvidence(findings);
  const suggestions = [
    ...new Set(
      findings.flatMap((finding) => (finding.suggestion === undefined ? [] : [finding.suggestion])),
    ),
  ];
  const checkerResults: CheckerResult[] = [
    {
      checkerId: 'yaml-rule-engine',
      checkerVersion: dependencies.ruleVersion,
      status: 'COMPLETED',
      decision: aggregation.decision,
      ...(aggregation.riskLevel === 'NONE' ? {} : { severity: aggregation.riskLevel }),
      findings,
      evidence,
      summary: `规则引擎命中 ${findings.length} 项。`,
      durationMs: Math.max(0, Date.now() - ruleStartedAt),
    },
  ];

  const result: AuditResult = {
    auditId,
    decision: aggregation.decision,
    ...(aggregation.riskLevel === 'NONE' ? {} : { severity: aggregation.riskLevel }),
    riskLevel: aggregation.riskLevel,
    summary: summaryFor(findings, aggregation.decision),
    findings,
    evidence,
    suggestions,
    compliantRewrite: null,
    context: {
      auditId,
      tenantId: dependencies.tenantId,
      requestId: dependencies.generateId(),
      jurisdiction: dependencies.jurisdiction,
      locale: dependencies.locale,
      platform: dependencies.platform,
      ruleVersion: dependencies.ruleVersion,
      lawKbVersion: dependencies.lawKbVersion,
      evaluatedAt,
    },
    checkerResults,
    createdAt: evaluatedAt,
  };

  dependencies.reflectionChecker.assertValid(result);
  return auditResultSchema.parse(result);
}
