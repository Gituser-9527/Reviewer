import { describe, expect, it } from 'vitest';
import { EnrichmentWorker, MockEnrichmentProvider } from './enrichment-worker.js';
import type { AuditEnrichmentContext } from './enrichment-context-loader.js';

describe('EnrichmentWorker', () => {
  it('completes a mock explanation and records mock usage', async () => {
    const events: string[] = [];
    const job = {
      id: 'j1',
      tenantId: 'tenant-a',
      type: 'AUDIT_GENERATE_EXPLANATIONS',
      status: 'RUNNING',
      auditRunId: 'audit-a',
      attemptCount: 1,
      maxAttempts: 3,
      payload: {
        tenantId: 'tenant-a',
        auditRunId: 'audit-a',
        jobType: 'AUDIT_GENERATE_EXPLANATIONS',
        promptVersion: 'v1',
        idempotencyKey: 'audit-a:explanation:v1',
      },
    };
    const worker = new EnrichmentWorker(
      {
        releaseExpiredLocks: async () => 0,
        claimNext: async () => job,
        completeJob: async () => {
          events.push('complete');
        },
        retryJob: async () => {
          events.push('retry');
        },
        deadLetter: async () => {
          events.push('dead');
        },
        createUsage: async (input) => {
          expect(input.isMock).toBe(true);
          events.push('usage');
        },
      },
      new MockEnrichmentProvider(),
    );
    expect(await worker.runOnce()).toBe(true);
    expect(events).toEqual(['complete', 'usage']);
  });

  it('loads persisted context through the injected loader instead of job payload content', async () => {
    const loaded: Array<{ tenantId: string; auditRunId: string }> = [];
    const job = {
      id: 'j2',
      tenantId: 'tenant-a',
      type: 'AUDIT_GENERATE_EXPLANATIONS',
      status: 'RUNNING',
      auditRunId: 'audit-a',
      attemptCount: 1,
      maxAttempts: 3,
      payload: {
        tenantId: 'tenant-a',
        auditRunId: 'audit-a',
        jobType: 'AUDIT_GENERATE_EXPLANATIONS',
        promptVersion: 'v1',
        idempotencyKey: 'audit-a:explanation:v1',
      },
    };
    const context: AuditEnrichmentContext = {
      tenantId: 'tenant-a',
      auditRunId: 'audit-a',
      jurisdiction: 'CN_MAINLAND',
      ruleVersion: '1.0.0',
      decision: 'REVIEW',
      riskLevel: 'HIGH',
      language: 'zh-CN',
      originalJob: { description: '仅限男性' },
      findings: [
        {
          id: 'finding-a',
          category: 'DISCRIMINATION',
          severity: 'HIGH',
          title: '性别限制',
          evidenceIds: [],
        },
      ],
      evidence: [],
    };
    const worker = new EnrichmentWorker(
      {
        releaseExpiredLocks: async () => 0,
        claimNext: async () => job,
        completeJob: async () => undefined,
        retryJob: async () => undefined,
        deadLetter: async () => undefined,
        createUsage: async () => undefined,
      },
      new MockEnrichmentProvider(),
      'worker-a',
      undefined,
      {
        load: async (input) => {
          loaded.push(input);
          return context;
        },
      },
    );

    await expect(worker.runOnce()).resolves.toBe(true);
    expect(loaded).toEqual([{ tenantId: 'tenant-a', auditRunId: 'audit-a' }]);
  });

  it('persists rejected rewrite coverage calculated from loader findings and provider changes', async () => {
    const saved: unknown[] = [];
    let ruleReviewCalls = 0;
    const job = {
      id: 'rewrite-1',
      tenantId: 'tenant-a',
      type: 'AUDIT_GENERATE_REWRITE',
      status: 'RUNNING',
      auditRunId: 'audit-a',
      attemptCount: 1,
      maxAttempts: 3,
      payload: {
        tenantId: 'tenant-a',
        auditRunId: 'audit-a',
        jobType: 'AUDIT_GENERATE_REWRITE',
        promptVersion: 'v1',
        idempotencyKey: 'audit-a:rewrite:v1',
      },
    };
    class RewriteProvider extends MockEnrichmentProvider {
      override async generate(): Promise<Record<string, unknown>> {
        return {
          description: '欢迎符合岗位要求的候选人',
          changes: [],
          preservedFacts: [],
          warnings: [],
        };
      }
    }
    const context: AuditEnrichmentContext = {
      tenantId: 'tenant-a',
      auditRunId: 'audit-a',
      jurisdiction: 'CN_MAINLAND',
      ruleVersion: '1.0.0',
      decision: 'REVIEW',
      riskLevel: 'HIGH',
      language: 'zh-CN',
      originalJob: { description: '仅限男性' },
      findings: [
        {
          id: 'finding-a',
          category: 'DISCRIMINATION',
          severity: 'HIGH',
          title: '性别限制',
          matchedText: '仅限男性',
          evidenceIds: [],
        },
      ],
      evidence: [],
    };
    const worker = new EnrichmentWorker(
      {
        releaseExpiredLocks: async () => 0,
        claimNext: async () => job,
        completeJob: async () => undefined,
        retryJob: async () => undefined,
        deadLetter: async () => undefined,
        createUsage: async () => undefined,
        saveEnrichment: async (input) => {
          saved.push(input);
        },
      },
      new RewriteProvider(),
      'worker-a',
      undefined,
      { load: async () => context },
      {
        review: async () => {
          ruleReviewCalls += 1;
          return {
            status: 'COMPLETED',
            ruleVersion: '1.0.0',
            rewrittenFindings: [],
            residualFindingKeys: [],
            introducedFindingKeys: [],
            hasCriticalOrHighFindings: false,
          };
        },
      },
    );

    await expect(worker.runOnce()).resolves.toBe(true);
    expect(ruleReviewCalls).toBe(1);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      status: 'COMPLETED',
      safetyResult: {
        findingCoverage: { unaddressedFindingIds: ['finding-a'] },
        ruleEngineReview: { status: 'COMPLETED' },
        secondaryReview: { decision: 'REJECTED' },
      },
    });
  });
});
