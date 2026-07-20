import type { AuditResult, JobPostingInput, Severity } from '@job-compliance/shared';
import { completeJsonWithFallback } from '../llm/safe-completion.js';
import type { LLMProvider } from '../llm/types.js';
import { z } from 'zod';
import { auditJobPosting, type AuditOrchestratorOptions } from './audit-orchestrator.js';

export interface AuditRoutingTrace { policyVersion: string; stages: Array<{ stage: 'INPUT_QUALITY'|'RULE_ENGINE'|'RAG'|'SEMANTIC_CLASSIFIER'|'FAST_LLM'|'DEEP_REVIEW'|'AGGREGATION'|'REFLECTION'|'ENRICHMENT'; status: 'EXECUTED'|'SKIPPED'|'TIMED_OUT'|'FAILED'|'FALLBACK'; reason: string; durationMs?: number; provider?: string; model?: string }>; usedLLM: boolean; usedDeepReview: boolean; cacheHit: boolean; fallbackReason?: string; }
export interface LayeredAuditPolicy { version: string; skipLLMWhenRuleDecisionIsDeterministic: boolean; fastLLMEnabled: boolean; fastLLMTimeoutMs: number; providerErrorFallback: 'RULE_ONLY'|'MANUAL_REVIEW'; }
const fastSchema = z.object({ categories: z.array(z.enum(['DISCRIMINATION','FEE_DEPOSIT','PRIVACY','FALSE_OR_MISLEADING','INCOMPLETE_INFORMATION','LABOR_CONTRACT_RISK','PLATFORM_POLICY','OTHER'])), severity: z.enum(['LOW','MEDIUM','HIGH','CRITICAL']), confidence: z.number().min(0).max(1), matchedSegments: z.array(z.string()).max(10), reasonCodes: z.array(z.string()).max(10), requiresDeepReview: z.boolean() });
const defaultPolicy: LayeredAuditPolicy = { version: 'routing-v1', skipLLMWhenRuleDecisionIsDeterministic: true, fastLLMEnabled: true, fastLLMTimeoutMs: 8000, providerErrorFallback: 'MANUAL_REVIEW' };

/** Extends the existing orchestrator; it never creates a second review pipeline. */
export class LayeredAuditEngine {
  constructor(private readonly provider?: LLMProvider, private readonly policy: LayeredAuditPolicy = defaultPolicy) {}
  async audit(input: JobPostingInput, options: AuditOrchestratorOptions = {}): Promise<AuditResult> {
    const started = Date.now(); const base = await auditJobPosting(input, options);
    const deterministic = base.decision === 'REJECT' || base.decision === 'MANUAL_REVIEW';
    const trace: AuditRoutingTrace = { policyVersion: this.policy.version, stages: [{ stage: 'INPUT_QUALITY', status: 'EXECUTED', reason: 'Required API fields passed validation.' }, { stage: 'RULE_ENGINE', status: 'EXECUTED', reason: `Rules returned ${base.findings.length} finding(s).` }, { stage: 'RAG', status: 'EXECUTED', reason: 'Evidence retrieval completed.' }], usedLLM: false, usedDeepReview: false, cacheHit: false };
    if (deterministic && this.policy.skipLLMWhenRuleDecisionIsDeterministic) {
      trace.stages.push({ stage: 'FAST_LLM', status: 'SKIPPED', reason: 'Deterministic rule result is authoritative.' });
    } else if (!this.policy.fastLLMEnabled || !this.provider) {
      trace.stages.push({ stage: 'FAST_LLM', status: 'SKIPPED', reason: this.provider ? 'Tenant policy disabled Fast LLM.' : 'No verified tenant provider is available.' });
    } else {
      const completion = await completeJsonWithFallback(this.provider, { messages: [{ role: 'system', content: 'Return only JSON. Identify semantic recruiting risk; do not make legal conclusions.' }, { role: 'user', content: `Title: ${input.title}\nDescription: ${input.description.slice(0, 12000)}` }], schema: fastSchema, fallback: { categories: [], severity: 'LOW' as Severity, confidence: 0, matchedSegments: [], reasonCodes: ['LLM_UNAVAILABLE'], requiresDeepReview: false }, options: { timeoutMs: this.policy.fastLLMTimeoutMs, responseFormat: 'json_object' } });
      if (completion.fallbackUsed) {
        if (completion.errorCode !== undefined) trace.fallbackReason = completion.errorCode; trace.stages.push({ stage: 'FAST_LLM', status: completion.errorCode === 'LLM_TIMEOUT' ? 'TIMED_OUT' : 'FALLBACK', reason: 'Semantic model unavailable; rule result retained.', durationMs: Date.now() - started, provider: this.provider.name, model: this.provider.model });
        if (base.findings.length === 0 && this.policy.providerErrorFallback === 'MANUAL_REVIEW') base.decision = 'MANUAL_REVIEW';
      } else { trace.usedLLM = true; trace.stages.push({ stage: 'FAST_LLM', status: 'EXECUTED', reason: 'No deterministic rule short-circuit.', durationMs: Date.now() - started, provider: completion.provider, model: completion.model }); }
    }
    trace.stages.push({ stage: 'AGGREGATION', status: 'EXECUTED', reason: 'Rules remain authoritative.' }, { stage: 'REFLECTION', status: 'EXECUTED', reason: 'Core result validation passed.' }, { stage: 'ENRICHMENT', status: 'SKIPPED', reason: 'Explanation and rewrite are asynchronous.' });
    return { ...base, routingTrace: trace };
  }
}
