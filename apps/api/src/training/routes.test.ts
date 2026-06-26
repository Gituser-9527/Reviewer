import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';

const apps = [] as ReturnType<typeof buildApp>[];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('training and help center API routes', () => {
  it('serves help center content and records reviewer training completion', async () => {
    const app = buildApp();
    apps.push(app);

    const helpResponse = await app.inject({
      method: 'GET',
      url: '/api/help-center',
    });
    const help = helpResponse.json<{
      documents: unknown[];
      riskLevels: unknown[];
      feedbackTypes: Array<{ type: string; meaning: string }>;
      videoPlaceholders: unknown[];
      onboardingChecklist: unknown[];
      commonMisjudgmentCases: unknown[];
    }>();

    expect(helpResponse.statusCode).toBe(200);
    expect(help.documents).toHaveLength(5);
    expect(help.riskLevels.length).toBeGreaterThan(0);
    expect(help.feedbackTypes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'FALSE_POSITIVE',
        }),
        expect.objectContaining({
          type: 'VALID_RESULT',
        }),
      ]),
    );
    expect(help.videoPlaceholders.length).toBeGreaterThan(0);
    expect(help.onboardingChecklist.length).toBeGreaterThan(0);
    expect(help.commonMisjudgmentCases.length).toBeGreaterThan(0);

    const statusBeforeResponse = await app.inject({
      method: 'GET',
      url: '/api/training/status?reviewerId=reviewer_training_001&tenantId=tenant_training_001',
    });
    expect(statusBeforeResponse.statusCode).toBe(200);
    expect(statusBeforeResponse.json()).toMatchObject({
      reviewerId: 'reviewer_training_001',
      tenantId: 'tenant_training_001',
      completed: false,
    });

    const completeResponse = await app.inject({
      method: 'POST',
      url: '/api/training/complete',
      payload: {
        reviewerId: 'reviewer_training_001',
        tenantId: 'tenant_training_001',
        documentVersion: 'training-v1',
      },
    });
    expect(completeResponse.statusCode).toBe(201);
    expect(completeResponse.json()).toMatchObject({
      reviewerId: 'reviewer_training_001',
      tenantId: 'tenant_training_001',
      completed: true,
      documentVersion: 'training-v1',
    });

    const statusAfterResponse = await app.inject({
      method: 'GET',
      url: '/api/training/status?reviewerId=reviewer_training_001&tenantId=tenant_training_001',
    });
    expect(statusAfterResponse.statusCode).toBe(200);
    expect(statusAfterResponse.json()).toMatchObject({
      completed: true,
      completion: {
        reviewerId: 'reviewer_training_001',
        documentVersion: 'training-v1',
      },
    });
  });
});
