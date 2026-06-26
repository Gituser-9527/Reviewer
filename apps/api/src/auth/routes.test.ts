import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AuditResult } from '@job-compliance/shared';
import { buildApp } from '../app.js';
import { FileRuleManagementStore } from '../rules/store.js';
import { createAuthServices } from './service.js';

const apps = [] as ReturnType<typeof buildApp>[];
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function requestForTenant(tenantId: string) {
  return {
    tenantId,
    jobPostingId: `job_${tenantId}`,
    company: { name: '某某科技有限公司' },
    job: {
      title: '行政专员',
      description: '岗位职责清晰。',
      location: '北京',
      salary: '8k-15k',
      employmentType: 'full_time',
    },
    options: {
      jurisdiction: 'CN_MAINLAND',
      enableRewrite: false,
      enableRag: false,
    },
  };
}

function resultForTenant(tenantId: string): AuditResult {
  const now = '2026-06-23T00:00:00.000Z';
  return {
    auditId: `audit_${tenantId}`,
    decision: 'PASS',
    riskLevel: 'NONE',
    summary: '未发现当前规则集可识别的岗位合规风险。',
    findings: [],
    evidence: [],
    suggestions: [],
    compliantRewrite: null,
    context: {
      auditId: `audit_${tenantId}`,
      tenantId,
      requestId: `request_${tenantId}`,
      jurisdiction: 'CN_MAINLAND',
      locale: 'zh-CN',
      platform: 'DEFAULT',
      ruleVersion: '1.0.0',
      lawKbVersion: 'local-test',
      modelVersion: 'mock-none',
      evaluatedAt: now,
    },
    checkerResults: [],
    createdAt: now,
  };
}

describe('auth, tenant isolation and audit operation logs', () => {
  it('restricts tenant data access by role and tenant scope', async () => {
    const app = buildApp({
      auditJob: async (_input, request) => resultForTenant(request.tenantId),
    });
    apps.push(app);

    await app.inject({
      method: 'POST',
      url: '/api/audit/job',
      payload: requestForTenant('tenant_a'),
    });

    const ownTenantResponse = await app.inject({
      method: 'GET',
      url: '/api/audit/runs?tenantId=tenant_a',
      headers: {
        'x-user-id': 'tenant_admin_a',
        'x-user-role': 'TENANT_ADMIN',
        'x-tenant-id': 'tenant_a',
      },
    });
    expect(ownTenantResponse.statusCode).toBe(200);
    expect(ownTenantResponse.json<{ items: AuditResult[] }>().items).toHaveLength(1);

    const otherTenantResponse = await app.inject({
      method: 'GET',
      url: '/api/audit/runs?tenantId=tenant_b',
      headers: {
        'x-user-id': 'tenant_admin_a',
        'x-user-role': 'TENANT_ADMIN',
        'x-tenant-id': 'tenant_a',
      },
    });
    expect(otherTenantResponse.statusCode).toBe(403);
    expect(otherTenantResponse.json()).toMatchObject({
      error: { code: 'TENANT_FORBIDDEN' },
    });
  });

  it('blocks unauthorized sensitive operations and logs authorized runtime changes', async () => {
    const authServices = createAuthServices();
    const app = buildApp({ authServices });
    apps.push(app);

    const forbiddenRuntimeResponse = await app.inject({
      method: 'PATCH',
      url: '/api/runtime-configs/ruleVersion',
      headers: {
        'x-user-id': 'viewer_001',
        'x-user-role': 'VIEWER',
        'x-tenant-id': 'tenant_a',
      },
      payload: {
        stableVersion: '1.0.1',
      },
    });
    expect(forbiddenRuntimeResponse.statusCode).toBe(403);

    const allowedRuntimeResponse = await app.inject({
      method: 'PATCH',
      url: '/api/runtime-configs/ruleVersion',
      headers: {
        'x-user-id': 'super_001',
        'x-user-role': 'SUPER_ADMIN',
      },
      payload: {
        stableVersion: '1.0.1',
      },
    });
    expect(allowedRuntimeResponse.statusCode).toBe(200);

    const logsResponse = await app.inject({
      method: 'GET',
      url: '/api/audit-operation-logs',
      headers: {
        'x-user-id': 'super_001',
        'x-user-role': 'SUPER_ADMIN',
      },
    });
    expect(logsResponse.statusCode).toBe(200);
    expect(logsResponse.json<{ items: Array<{ operation: string }> }>().items).toEqual(
      expect.arrayContaining([expect.objectContaining({ operation: 'runtime_config_update' })]),
    );
  });

  it('prevents RULE_OPERATOR from publishing rules and allows COMPLIANCE_MANAGER approval', async () => {
    const authServices = createAuthServices();
    const tempRoot = await mkdtemp(join(tmpdir(), 'job-compliance-auth-'));
    tempDirs.push(tempRoot);
    const rulesDirectory = join(tempRoot, 'rules', 'cn-mainland');
    await mkdir(rulesDirectory, { recursive: true });
    await writeFile(
      join(rulesDirectory, 'privacy.yml'),
      [
        'jurisdiction: CN_MAINLAND',
        'ruleVersion: 1.0.0',
        'rules:',
        '  - id: CN_PRIVACY_TEST',
        '    category: PRIVACY',
        '    severity: medium',
        '    action: manual_review',
        '    patterns:',
        '      - "身份证"',
        '    explanation: "岗位疑似过度收集个人信息。"',
        '    suggestion: "删除与招聘无关的个人信息要求。"',
        '',
      ].join('\n'),
      'utf8',
    );
    const ruleStore = new FileRuleManagementStore({
      rootDirectory: tempRoot,
      evalCommand: ['node', '-e', 'console.log("{}")'],
    });
    const app = buildApp({ authServices, ruleStore });
    apps.push(app);

    const operatorPublishResponse = await app.inject({
      method: 'POST',
      url: '/api/rulesets/CN_MAINLAND/publish',
      headers: {
        'x-user-id': 'rule_operator_001',
        'x-user-role': 'RULE_OPERATOR',
      },
      payload: {
        actorId: 'rule_operator_001',
        ruleVersion: '1.0.0-auth-test',
        forcePublish: true,
      },
    });
    expect(operatorPublishResponse.statusCode).toBe(403);

    const managerPublishResponse = await app.inject({
      method: 'POST',
      url: '/api/rulesets/CN_MAINLAND/publish',
      headers: {
        'x-user-id': 'compliance_manager_001',
        'x-user-role': 'COMPLIANCE_MANAGER',
      },
      payload: {
        actorId: 'rule_operator_001',
        ruleVersion: '1.0.0-auth-test',
        forcePublish: true,
      },
    });
    expect(managerPublishResponse.statusCode).toBe(200);

    const approvalsResponse = await app.inject({
      method: 'GET',
      url: '/api/rule-publish-approvals',
      headers: {
        'x-user-id': 'compliance_manager_001',
        'x-user-role': 'COMPLIANCE_MANAGER',
      },
    });
    expect(approvalsResponse.statusCode).toBe(200);
    expect(approvalsResponse.json<{ items: Array<{ approvedBy: string }> }>().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ approvedBy: 'compliance_manager_001' }),
      ]),
    );
  });
});
