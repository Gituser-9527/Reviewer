import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { createAuthServices } from '../auth/service.js';
import { createRuntimeServices } from '../runtime/services.js';
import { ReleaseQualityGateService, type CommandRunner } from './service.js';

const apps = [] as ReturnType<typeof buildApp>[];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

const passingRunner: CommandRunner = async () => ({
  exitCode: 0,
  stdout: 'ok',
  stderr: '',
  durationMs: 1,
});

function passingMetrics() {
  return {
    criticalRecall: 0.98,
    falseNegativeRate: 0.01,
    falsePositiveRate: 0.04,
    evidenceAccuracy: 0.94,
    rewriteSafetyRate: 0.98,
    redTeamRecall: 0.9,
    predictedRejectRateChange: 0.03,
  };
}

describe('release quality gate API routes', () => {
  it('blocks ordinary publish when gates fail, then publishes a passed approved candidate into rollout', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'release-gate-'));
    const runtimeServices = createRuntimeServices();
    const releaseGateService = new ReleaseQualityGateService({
      cwd,
      runtimeServices,
      commandRunner: passingRunner,
    });
    const app = buildApp({ runtimeServices, releaseGateService });
    apps.push(app);

    const candidateResponse = await app.inject({
      method: 'POST',
      url: '/api/releases/candidates',
      payload: {
        name: 'Rules 2.0.0',
        target: 'ruleVersion',
        ruleVersion: '2.0.0',
        qualityMetrics: passingMetrics(),
      },
    });
    expect(candidateResponse.statusCode).toBe(201);
    const candidate = candidateResponse.json<{ id: string }>();

    const failedGateResponse = await app.inject({
      method: 'POST',
      url: `/api/releases/candidates/${candidate.id}/run-gates`,
    });
    expect(failedGateResponse.statusCode).toBe(200);
    expect(failedGateResponse.json()).toMatchObject({ status: 'failed' });

    const blockedPublishResponse = await app.inject({
      method: 'POST',
      url: `/api/releases/candidates/${candidate.id}/publish`,
      payload: {},
    });
    expect(blockedPublishResponse.statusCode).toBe(422);
    expect(blockedPublishResponse.json()).toMatchObject({
      error: { code: 'RELEASE_APPROVAL_REQUIRED' },
    });

    const approvalResponse = await app.inject({
      method: 'POST',
      url: `/api/releases/candidates/${candidate.id}/approve`,
      payload: { approvedBy: 'compliance_manager_001' },
    });
    expect(approvalResponse.statusCode).toBe(200);

    const passedGateResponse = await app.inject({
      method: 'POST',
      url: `/api/releases/candidates/${candidate.id}/run-gates`,
    });
    expect(passedGateResponse.statusCode).toBe(200);
    expect(passedGateResponse.json()).toMatchObject({ status: 'passed' });

    const publishResponse = await app.inject({
      method: 'POST',
      url: `/api/releases/candidates/${candidate.id}/publish`,
      payload: {},
    });
    expect(publishResponse.statusCode).toBe(200);
    expect(publishResponse.json()).toMatchObject({
      candidate: { status: 'published', ruleVersion: '2.0.0' },
      forcePublished: false,
    });
    expect(publishResponse.json<{ rolloutPlanIds: string[] }>().rolloutPlanIds).toHaveLength(1);
    expect(runtimeServices.rolloutService.listRollouts()[0]).toMatchObject({
      target: 'ruleVersion',
      candidateVersion: '2.0.0',
      rolloutPercent: 0,
    });
  });

  it('requires compliance manager role for force publish and writes audit operation logs', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'release-gate-'));
    const runtimeServices = createRuntimeServices();
    const authServices = createAuthServices();
    const releaseGateService = new ReleaseQualityGateService({
      cwd,
      runtimeServices,
      commandRunner: passingRunner,
    });
    const app = buildApp({ runtimeServices, authServices, releaseGateService });
    apps.push(app);

    const candidateResponse = await app.inject({
      method: 'POST',
      url: '/api/releases/candidates',
      payload: {
        name: 'Model config canary',
        target: 'modelVersion',
        modelVersion: 'model-2026-06-26',
        qualityMetrics: {
          ...passingMetrics(),
          redTeamRecall: 0.1,
        },
      },
    });
    const candidate = candidateResponse.json<{ id: string }>();

    await app.inject({
      method: 'POST',
      url: `/api/releases/candidates/${candidate.id}/approve`,
      payload: { approvedBy: 'compliance_manager_001' },
    });
    const gateResponse = await app.inject({
      method: 'POST',
      url: `/api/releases/candidates/${candidate.id}/run-gates`,
    });
    expect(gateResponse.json()).toMatchObject({ status: 'failed' });

    const forcedPublishResponse = await app.inject({
      method: 'POST',
      url: `/api/releases/candidates/${candidate.id}/publish`,
      headers: {
        'x-user-id': 'manager_001',
        'x-user-role': 'COMPLIANCE_MANAGER',
      },
      payload: { forcePublish: true },
    });
    expect(forcedPublishResponse.statusCode).toBe(200);
    expect(forcedPublishResponse.json()).toMatchObject({ forcePublished: true });

    const logsResponse = await app.inject({
      method: 'GET',
      url: '/api/audit-operation-logs',
    });
    expect(logsResponse.statusCode).toBe(200);
    expect(logsResponse.json<{ items: Array<{ operation: string }> }>().items).toEqual(
      expect.arrayContaining([expect.objectContaining({ operation: 'release_force_publish' })]),
    );
  });
});
