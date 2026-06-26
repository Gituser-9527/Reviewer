import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { FileRuleManagementStore } from './store.js';

const apps = [] as ReturnType<typeof buildApp>[];
let workspace: string;

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'rule-admin-'));
  await mkdir(join(workspace, 'rules', 'cn-mainland'), { recursive: true });
  await writeFile(
    join(workspace, 'rules', 'cn-mainland', 'privacy.yml'),
    [
      'jurisdiction: CN_MAINLAND',
      "ruleVersion: '1.0.0'",
      'rules:',
      '  - id: CN_PRIVACY_PHONE_001',
      '    category: PRIVACY',
      '    severity: medium',
      '    action: manual_review',
      '    containsAny:',
      '      fields: [rawText, normalizedText]',
      '      values: [身份证号]',
      '    explanation: 岗位要求提供过度个人信息。',
      '    suggestion: 删除非必要个人信息收集要求。',
      '',
    ].join('\n'),
    'utf8',
  );
});

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await rm(workspace, { recursive: true, force: true });
});

function createApp() {
  const app = buildApp({
    ruleStore: new FileRuleManagementStore({
      rootDirectory: workspace,
      evalCommand: [process.execPath, '-e', 'process.stdout.write("eval ok")'],
    }),
  });
  apps.push(app);
  return app;
}

describe('rule management routes', () => {
  it('manages rule sets, tests draft rules, publishes versions and rolls back', async () => {
    const app = createApp();

    const createdSet = await app.inject({
      method: 'POST',
      url: '/api/rulesets',
      payload: {
        id: 'CN_MAINLAND',
        name: '中国大陆招聘合规规则',
        jurisdiction: 'CN_MAINLAND',
      },
    });

    expect(createdSet.statusCode).toBe(201);
    expect(createdSet.json()).toMatchObject({
      id: 'CN_MAINLAND',
      status: 'draft',
    });

    const added = await app.inject({
      method: 'POST',
      url: '/api/rulesets/CN_MAINLAND/rules',
      payload: {
        fileName: 'fee-deposit.yml',
        rule: {
          id: 'CN_FEE_DEPOSIT_TEST_001',
          category: 'FEE_DEPOSIT',
          severity: 'critical',
          action: 'reject',
          containsAny: {
            fields: ['rawText', 'normalizedText'],
            values: ['保证金'],
          },
          explanation: '岗位疑似收取保证金。',
          suggestion: '删除收费表述。',
          enabled: true,
        },
      },
    });

    expect(added.statusCode).toBe(201);

    const patched = await app.inject({
      method: 'PATCH',
      url: '/api/rules/CN_FEE_DEPOSIT_TEST_001',
      payload: {
        jurisdiction: 'CN_MAINLAND',
        explanation: '岗位疑似要求劳动者缴纳保证金。',
        suggestion: '删除保证金、押金等收费表述。',
      },
    });

    expect(patched.statusCode).toBe(200);
    expect(patched.json()).toMatchObject({
      id: 'CN_FEE_DEPOSIT_TEST_001',
      explanation: '岗位疑似要求劳动者缴纳保证金。',
    });

    const testResult = await app.inject({
      method: 'POST',
      url: '/api/rulesets/CN_MAINLAND/test',
      payload: {
        text: '招聘文员，入职需缴纳保证金500元。',
      },
    });

    expect(testResult.statusCode).toBe(200);
    expect(testResult.json()).toMatchObject({
      finalDecision: 'REJECT',
      hits: [
        expect.objectContaining({
          ruleId: 'CN_FEE_DEPOSIT_TEST_001',
          matchedText: ['保证金'],
          category: 'FEE_DEPOSIT',
          severity: 'CRITICAL',
          action: 'reject',
        }),
      ],
    });

    const evalResult = await app.inject({
      method: 'POST',
      url: '/api/rulesets/CN_MAINLAND/run-eval',
      payload: {
        ruleVersion: '1.0.1',
      },
    });

    expect(evalResult.statusCode).toBe(200);
    expect(evalResult.json()).toMatchObject({
      ruleSetId: 'CN_MAINLAND',
      ruleVersion: '1.0.1',
      evalPassed: true,
    });

    const firstPublish = await app.inject({
      method: 'POST',
      url: '/api/rulesets/CN_MAINLAND/publish',
      payload: {
        ruleVersion: '1.0.1',
        actorId: 'tester',
      },
    });

    expect(firstPublish.statusCode).toBe(200);
    expect(firstPublish.json()).toMatchObject({
      ruleVersion: '1.0.1',
      evalPassed: true,
    });

    await app.inject({
      method: 'POST',
      url: '/api/rulesets/CN_MAINLAND/rules',
      payload: {
        fileName: 'privacy.yml',
        rule: {
          id: 'CN_PRIVACY_TEST_002',
          category: 'PRIVACY',
          severity: 'medium',
          action: 'manual_review',
          containsAny: {
            fields: ['rawText', 'normalizedText'],
            values: ['家庭住址'],
          },
          explanation: '岗位要求提供家庭住址。',
          enabled: true,
        },
      },
    });

    const secondPublish = await app.inject({
      method: 'POST',
      url: '/api/rulesets/CN_MAINLAND/publish',
      payload: {
        ruleVersion: '1.0.2',
        actorId: 'tester',
      },
    });
    expect(secondPublish.statusCode).toBe(200);

    const records = await app.inject({
      method: 'GET',
      url: '/api/rule-publish-records',
    });
    expect(records.statusCode).toBe(200);
    expect(records.json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleVersion: '1.0.1', action: 'publish' }),
        expect.objectContaining({ ruleVersion: '1.0.2', action: 'publish' }),
      ]),
    );

    const rollback = await app.inject({
      method: 'POST',
      url: '/api/rulesets/CN_MAINLAND/rollback',
      payload: {
        actorId: 'tester',
        targetVersion: '1.0.1',
      },
    });

    expect(rollback.statusCode).toBe(200);
    expect(rollback.json()).toMatchObject({
      ruleVersion: '1.0.1',
      previousVersion: '1.0.2',
    });

    const detail = await app.inject({
      method: 'GET',
      url: '/api/rulesets/CN_MAINLAND',
    });

    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({
      id: 'CN_MAINLAND',
      currentVersion: '1.0.1',
    });
  }, 10_000);

  it('lists published and draft rules with placeholder hit counts', async () => {
    const app = createApp();

    const response = await app.inject({
      method: 'GET',
      url: '/api/rules?jurisdiction=CN_MAINLAND&status=all',
    });
    const payload = response.json();

    expect(response.statusCode).toBe(200);
    expect(payload.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'CN_PRIVACY_PHONE_001',
          status: 'published',
          ruleVersion: '1.0.0',
          hitCount: 0,
        }),
        expect.objectContaining({
          id: 'CN_PRIVACY_PHONE_001',
          status: 'draft',
          ruleVersion: '1.0.0',
          hitCount: 0,
        }),
      ]),
    );
  });

  it('creates and toggles draft rules without changing published rules', async () => {
    const app = createApp();

    const created = await app.inject({
      method: 'POST',
      url: '/api/rules',
      payload: {
        jurisdiction: 'CN_MAINLAND',
        fileName: 'privacy.yml',
        rule: {
          id: 'CN_PRIVACY_WECHAT_002',
          category: 'PRIVACY',
          severity: 'medium',
          action: 'manual_review',
          containsAny: {
            fields: ['rawText', 'normalizedText'],
            values: ['微信号'],
          },
          explanation: '岗位要求提供微信号，需要确认收集必要性。',
          suggestion: '删除非必要联系方式要求。',
          enabled: true,
        },
      },
    });

    expect(created.statusCode).toBe(201);

    const toggled = await app.inject({
      method: 'POST',
      url: '/api/rules/CN_PRIVACY_WECHAT_002/toggle',
      payload: {
        jurisdiction: 'CN_MAINLAND',
        enabled: false,
      },
    });

    expect(toggled.statusCode).toBe(200);
    expect(toggled.json()).toMatchObject({
      id: 'CN_PRIVACY_WECHAT_002',
      status: 'draft',
      enabled: false,
    });

    const published = await app.inject({
      method: 'GET',
      url: '/api/rules?jurisdiction=CN_MAINLAND&status=published',
    });

    expect(published.json().items).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'CN_PRIVACY_WECHAT_002' })]),
    );
  });

  it('publishes draft rules only after eval passes and records the version', async () => {
    const app = createApp();

    await app.inject({
      method: 'POST',
      url: '/api/rules',
      payload: {
        jurisdiction: 'CN_MAINLAND',
        fileName: 'privacy.yml',
        rule: {
          id: 'CN_PRIVACY_WECHAT_002',
          category: 'PRIVACY',
          severity: 'medium',
          action: 'manual_review',
          containsAny: {
            fields: ['rawText', 'normalizedText'],
            values: ['微信号'],
          },
          explanation: '岗位要求提供微信号，需要确认收集必要性。',
          enabled: true,
        },
      },
    });

    const published = await app.inject({
      method: 'POST',
      url: '/api/rules/publish',
      payload: {
        jurisdiction: 'CN_MAINLAND',
        ruleVersion: '1.0.1',
        actorId: 'tester',
      },
    });

    expect(published.statusCode).toBe(200);
    expect(published.json()).toMatchObject({
      ruleVersion: '1.0.1',
      evalPassed: true,
      ruleCount: 2,
    });

    const publishedFile = await readFile(
      join(workspace, 'rules', 'cn-mainland', 'privacy.yml'),
      'utf8',
    );
    expect(publishedFile).toContain('ruleVersion: 1.0.1');
    expect(publishedFile).toContain('CN_PRIVACY_WECHAT_002');

    const versions = await app.inject({
      method: 'GET',
      url: '/api/rules/versions?jurisdiction=CN_MAINLAND',
    });

    expect(versions.json().items).toEqual([
      expect.objectContaining({
        ruleVersion: '1.0.1',
        actorId: 'tester',
        evalPassed: true,
      }),
    ]);
  });
});
