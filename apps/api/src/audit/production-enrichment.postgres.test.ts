import { randomUUID } from 'node:crypto';
import { PostgresLLMPersistenceRepository } from '@job-compliance/database';
import { SecretEncryptionService, type LLMProvider } from '@job-compliance/core';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { InMemoryAuditRunStore } from './store.js';
import { InMemoryHumanReviewStore } from '../reviews/store.js';
import { InMemoryEvalStore } from '../evals/store.js';
import { LLMSettingsService } from '../settings/service.js';
import { EnrichmentWorker, type RuntimeProviderResolver } from './enrichment-worker.js';
import { PostgresAuditEnrichmentContextLoader } from './enrichment-context-loader.js';
import { ProductionRewriteRuleEngineAdapter } from './rewrite-rule-engine-adapter.js';
import { RewriteSemanticClassifierAdapter } from './rewrite-semantic-classifier-adapter.js';
import { RewriteReflectionAdapter } from './rewrite-reflection-adapter.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('TEST_DATABASE_URL is required for PostgreSQL production enrichment E2E');
}

function assertNoSensitiveFields(value: unknown): void {
  const forbidden = new Set([
    'apikey', 'secret', 'authorization', 'encryptedcredential', 'decryptedcredential',
    'prompt', 'fullprompt', 'jobpayload', 'rawpayload', 'databaseurl', 'test_database_url',
  ]);
  if (Array.isArray(value)) {
    value.forEach(assertNoSensitiveFields);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    expect(forbidden.has(key.toLowerCase())).toBe(false);
    assertNoSensitiveFields(child);
  }
}

describe('production enrichment SAFE PostgreSQL E2E', () => {
  it('runs the persisted rewrite safety path with explicit test-only model boundaries', async () => {
    const tenantId = `e2e-tenant-${randomUUID()}`;
    const otherTenantId = `e2e-other-${randomUUID()}`;
    const postingId = randomUUID();
    const auditRunId = `e2e-audit-${randomUUID()}`;
    const findingId = `e2e-finding-${randomUUID()}`;
    const evidenceId = `e2e-evidence-${randomUUID()}`;
    const pool = new pg.Pool({ connectionString: databaseUrl });
    const repository = new PostgresLLMPersistenceRepository(databaseUrl, pool);
    const encryption = new SecretEncryptionService(Buffer.alloc(32, 7), 'test-e2e-v1');
    let app: ReturnType<typeof buildApp> | undefined;

    try {
      const connection = await repository.createConnection({
        tenantId,
        displayName: 'PostgreSQL E2E mock connection',
        provider: 'OPENAI_COMPATIBLE',
        encryptedApiKey: await encryption.encrypt('test-only-placeholder'),
        apiKeyLastFour: 'lder',
        auditModel: 'e2e-rewrite-model',
        timeoutMs: 5_000,
        maxOutputTokens: 512,
        temperature: 0,
        maxRetries: 0,
        status: 'ACTIVE',
        isDefault: true,
        createdBy: 'postgres-e2e',
      });
      expect((await repository.findDefault(tenantId))?.id).toBe(connection.id);

      const originalDescription = 'Acme 北京 10k-15k FULL_TIME 岗位职责：协助招聘流程。限女性。';
      await pool.query(
        `INSERT INTO job_postings
          (id, tenant_id, external_id, title, company_name, location, employment_type, salary_text, raw_text_redacted, input_hash, input_payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [postingId, tenantId, `e2e-${postingId}`, '招聘专员', 'Acme', '北京', 'FULL_TIME', '10k-15k', originalDescription, `hash-${postingId}`, JSON.stringify({ description: originalDescription, language: 'zh-CN' })],
      );
      await pool.query(
        `INSERT INTO audit_runs
          (id, tenant_id, job_posting_id, decision, risk_level, summary, rule_version, law_kb_version, input_hash, result_payload, evaluated_at, created_at)
         VALUES ($1,$2,$3,'REVIEW','HIGH',$4,'1.0.0','law-kb-e2e',$5,$6,NOW(),NOW())`,
        [auditRunId, tenantId, postingId, 'Requires compliant rewrite.', `audit-${postingId}`, JSON.stringify({ context: { jurisdiction: 'CN_MAINLAND' } })],
      );
      await pool.query(
        `INSERT INTO audit_findings
          (audit_run_id, finding_id, tenant_id, category, severity, decision, rule_id, evidence_id, title, message, suggestion, payload)
         VALUES ($1,$2,$3,'DISCRIMINATION','HIGH','REVIEW','CN_DISCRIMINATION_GENDER_001',$4,$5,$6,$7,$8)`,
        [auditRunId, findingId, tenantId, evidenceId, 'Gender restriction', '限女性', '删除性别限制。', JSON.stringify({ metadata: { matchedText: '限女性' } })],
      );
      await pool.query(
        `INSERT INTO audit_evidence_links
          (id, audit_run_id, finding_id, tenant_id, evidence_id, source_type, title, url, version, quote_redacted, payload)
         VALUES ($1,$2,$3,$4,$5,'RULE','CN gender rule','https://example.invalid/rule','1.0.0',$6,$7)`,
        [randomUUID(), auditRunId, findingId, tenantId, evidenceId, '限女性', JSON.stringify({ ruleId: 'CN_DISCRIMINATION_GENDER_001' })],
      );

      const job = await repository.enqueue({
        tenantId,
        type: 'AUDIT_GENERATE_REWRITE',
        auditRunId,
        payload: {
          tenantId,
          auditRunId,
          jobType: 'AUDIT_GENERATE_REWRITE',
          promptVersion: 'postgres-e2e-v1',
          connectionId: connection.id,
          idempotencyKey: `${auditRunId}:rewrite:postgres-e2e-v1`,
        },
        idempotencyKey: `${auditRunId}:rewrite:postgres-e2e-v1`,
      });
      const storedJob = await pool.query<Record<string, unknown>>('SELECT payload, status FROM async_jobs WHERE id=$1', [job.id]);
      expect(storedJob.rows[0]?.status).toBe('PENDING');
      expect(Object.keys(storedJob.rows[0]?.payload as Record<string, unknown>).sort()).toEqual([
        'auditRunId', 'connectionId', 'idempotencyKey', 'jobType', 'promptVersion', 'tenantId',
      ]);

      let providerCalls = 0;
      let resolverCalls = 0;
      let contextCalls = 0;
      let ruleEngineCalls = 0;
      let semanticCalls = 0;
      let reflectionCalls = 0;
      const rewriteProvider: LLMProvider = {
        name: 'TEST_POSTGRES_PROVIDER',
        model: 'e2e-rewrite-model',
        async complete() {
          providerCalls += 1;
          return {
            provider: 'TEST_POSTGRES_PROVIDER',
            model: 'e2e-rewrite-model',
            fallbackUsed: false,
            content: JSON.stringify({
              description: 'Acme 北京 10k-15k FULL_TIME 岗位职责：协助招聘流程。欢迎符合岗位要求的候选人。',
              responsibilities: ['协助招聘流程'],
              changes: [{ findingId, originalText: '限女性', rewrittenText: '欢迎符合岗位要求的候选人', reason: '移除性别限制' }],
              preservedFacts: ['Acme', '北京', '10k-15k', 'FULL_TIME'],
              warnings: [],
            }),
            usage: { promptTokens: 31, completionTokens: 17, totalTokens: 48 },
          };
        },
      };
      const resolver: RuntimeProviderResolver = {
        async resolve(input) {
          resolverCalls += 1;
          expect(input).toEqual({ tenantId, taskType: 'REWRITE', connectionId: connection.id });
          return { provider: rewriteProvider, connectionId: connection.id, providerName: rewriteProvider.name, model: rewriteProvider.model, isMock: true };
        },
      };
      const postgresLoader = new PostgresAuditEnrichmentContextLoader(pool);
      const contextLoader = {
        async load(input: { tenantId: string; auditRunId: string }) {
          contextCalls += 1;
          return postgresLoader.load(input);
        },
      };
      const productionRuleEngine = new ProductionRewriteRuleEngineAdapter();
      const ruleEngineAdapter = {
        async review(input: Parameters<ProductionRewriteRuleEngineAdapter['review']>[0]) {
          ruleEngineCalls += 1;
          return productionRuleEngine.review(input);
        },
      };
      const semanticAdapter = new RewriteSemanticClassifierAdapter({
        async classify(input) {
          semanticCalls += 1;
          expect(input.context.auditRunId).toBe(auditRunId);
          expect(input.rewrite.changes[0]?.findingId).toBe(findingId);
          expect(input.findingCoverage.addressedFindingIds).toEqual([findingId]);
          expect(input.rewriteSafety.passed).toBe(true);
          expect(input.ruleEngineReview.rewrittenFindings).toEqual([]);
          return { status: 'PASSED', reasonCodes: [], summary: 'Explicit PostgreSQL E2E semantic test result.', risks: [], originalRiskLikelyRemains: false, newRiskLikelyIntroduced: false, unsupportedFactsDetected: false, semanticDriftDetected: false };
        },
      });
      const reflectionAdapter = new RewriteReflectionAdapter({
        async reflect(input) {
          reflectionCalls += 1;
          expect(input.context.originalJob.description).toBe(originalDescription);
          expect(input.rewrite.changes[0]?.findingId).toBe(findingId);
          expect(input.findingCoverage.addressedFindingIds).toEqual([findingId]);
          expect(input.rewriteSafety.passed).toBe(true);
          expect(input.ruleEngineReview.rewrittenFindings).toEqual([]);
          expect(input.semanticReview.status).toBe('PASSED');
          return { status: 'PASSED', reasonCodes: [], summary: 'Explicit PostgreSQL E2E reflection test result.', conflicts: [], unresolvedIssues: [], potentialRiskOmission: false, checksConflict: false, requiresHumanReview: false };
        },
      });
      const worker = new EnrichmentWorker(repository, undefined, 'postgres-e2e-worker', resolver, contextLoader, ruleEngineAdapter, semanticAdapter, reflectionAdapter);

      expect(await worker.runOnce()).toBe(true);
      expect(await worker.runOnce()).toBe(false);
      expect({ providerCalls, resolverCalls, contextCalls, ruleEngineCalls, semanticCalls, reflectionCalls }).toEqual({ providerCalls: 1, resolverCalls: 1, contextCalls: 1, ruleEngineCalls: 1, semanticCalls: 1, reflectionCalls: 1 });

      const completedJob = await pool.query<Record<string, unknown>>('SELECT status, attempt_count FROM async_jobs WHERE id=$1', [job.id]);
      expect(completedJob.rows[0]).toMatchObject({ status: 'COMPLETED', attempt_count: 1 });
      const enrichments = await repository.listEnrichment(tenantId, auditRunId);
      expect(enrichments).toHaveLength(1);
      const enrichment = enrichments[0] as { status: string; result: { description: string }; safety_result: Record<string, unknown>; is_mock: boolean };
      expect(enrichment.status).toBe('COMPLETED');
      expect(enrichment.result.description).not.toContain('限女性');
      expect(enrichment.is_mock).toBe(true);
      expect(enrichment.safety_result).toMatchObject({
        findingCoverage: { addressedFindingIds: [findingId], unaddressedFindingIds: [], unknownFindingIds: [] },
        rewriteSafety: { passed: true },
        ruleEngineReview: { rewrittenFindings: [], residualFindingKeys: [], introducedFindingKeys: [], hasCriticalOrHighFindings: false },
        semanticReview: { status: 'PASSED', isMock: true },
        reflectionReview: { status: 'PASSED', isMock: true },
        secondaryReview: { decision: 'SAFE_TO_RECOMMEND' },
      });

      const usage = await repository.listUsage(tenantId, auditRunId);
      expect(usage).toHaveLength(1);
      expect(usage[0]).toMatchObject({ asyncJobId: job.id, connectionId: connection.id, provider: 'TEST_POSTGRES_PROVIDER', model: 'e2e-rewrite-model', taskType: 'AUDIT_GENERATE_REWRITE', inputTokens: 31, outputTokens: 17, isMock: true, success: true });
      const jobCounts = await pool.query<{ type: string; count: string }>('SELECT type, COUNT(*)::text AS count FROM async_jobs WHERE tenant_id=$1 GROUP BY type', [tenantId]);
      expect(jobCounts.rows).toEqual([{ type: 'AUDIT_GENERATE_REWRITE', count: '1' }]);
      const originalAudit = await pool.query<Record<string, unknown>>('SELECT decision, risk_level FROM audit_runs WHERE tenant_id=$1 AND id=$2', [tenantId, auditRunId]);
      const originalFinding = await pool.query<Record<string, unknown>>('SELECT severity, rule_id, payload FROM audit_findings WHERE tenant_id=$1 AND audit_run_id=$2 AND finding_id=$3', [tenantId, auditRunId, findingId]);
      expect(originalAudit.rows[0]).toMatchObject({ decision: 'REVIEW', risk_level: 'HIGH' });
      expect(originalFinding.rows[0]).toMatchObject({ severity: 'HIGH', rule_id: 'CN_DISCRIMINATION_GENDER_001', payload: { metadata: { matchedText: '限女性' } } });

      app = buildApp({
        auditRunStore: new InMemoryAuditRunStore(),
        reviewStore: new InMemoryHumanReviewStore(),
        evalStore: new InMemoryEvalStore(),
        llmSettingsService: new LLMSettingsService(),
        observabilityRepository: repository,
      });
      const response = await app.inject({ method: 'GET', url: `/api/audit/runs/${auditRunId}/enrichment?tenantId=${tenantId}`, headers: { 'x-user-role': 'TENANT_ADMIN', 'x-tenant-id': tenantId } });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toMatchObject({ rewrite: { status: 'COMPLETED', safety_result: { secondaryReview: { decision: 'SAFE_TO_RECOMMEND' }, semanticReview: { status: 'PASSED' }, reflectionReview: { status: 'PASSED' } } } });
      assertNoSensitiveFields(body);
      const denied = await app.inject({ method: 'GET', url: `/api/audit/runs/${auditRunId}/enrichment?tenantId=${tenantId}`, headers: { 'x-user-role': 'TENANT_ADMIN', 'x-tenant-id': otherTenantId } });
      expect(denied.statusCode).toBe(403);
    } finally {
      await app?.close();
      await pool.query('DELETE FROM llm_usage_records WHERE tenant_id=$1', [tenantId]);
      await pool.query('DELETE FROM audit_enrichment_records WHERE tenant_id=$1', [tenantId]);
      await pool.query('DELETE FROM async_jobs WHERE tenant_id=$1', [tenantId]);
      await pool.query('DELETE FROM audit_evidence_links WHERE tenant_id=$1', [tenantId]);
      await pool.query('DELETE FROM audit_findings WHERE tenant_id=$1', [tenantId]);
      await pool.query('DELETE FROM audit_runs WHERE tenant_id=$1', [tenantId]);
      await pool.query('DELETE FROM job_postings WHERE tenant_id=$1', [tenantId]);
      await pool.query('DELETE FROM llm_connections WHERE tenant_id=$1', [tenantId]);
      await pool.end();
    }
  });
});
