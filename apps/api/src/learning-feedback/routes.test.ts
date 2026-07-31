import { afterEach, describe, expect, it } from 'vitest';
import type { HumanReviewStore } from '../reviews/store.js';
import { buildApp } from '../app.js';
import { InMemoryLearningFeedbackRepository, LearningFeedbackService } from './service.js';
import { ticket } from './test-fixture.js';

const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

function store(): HumanReviewStore {
  return {
    createFromAuditResult: () => undefined, findById: (id) => id === ticket.id ? structuredClone(ticket) : undefined, list: () => [structuredClone(ticket)], submitDecision: () => structuredClone(ticket), createRuleSuggestion: () => undefined, listRuleSuggestions: () => [], resolveRuleSuggestion: () => undefined, clear: () => undefined,
  };
}
function headers() { return { 'x-user-role': 'REVIEWER', 'x-user-id': 'reviewer-a', 'x-tenant-id': 'tenant-a' }; }

describe('learning feedback routes', () => {
  it('requires preview then explicit confirmed submission and keeps identifiers out of payload', async () => {
    const app = buildApp({ reviewStore: store(), learningFeedbackService: new LearningFeedbackService(new InMemoryLearningFeedbackRepository(), 'test-key') }); apps.push(app);
    const body = { consentScope: 'TENANT_PRIVATE', consentNoticeVersion: 'notice-v1', purpose: 'quality review', retentionDays: 30, comment: 'call 13800138000', evidenceFragments: ['safe'] };
    const preview = await app.inject({ method: 'POST', url: `/api/reviews/${ticket.id}/learning-feedback/preview`, headers: headers(), payload: body });
    expect(preview.statusCode).toBe(200); const payload = preview.json(); expect(payload.sanitizedComment).not.toContain('13800138000');
    const submitted = await app.inject({ method: 'POST', url: `/api/reviews/${ticket.id}/learning-feedback`, headers: headers(), payload: { ...body, digest: payload.digest, explicitConfirmation: true } });
    expect(submitted.statusCode).toBe(201); expect(submitted.body).not.toContain('reviewer-a'); expect(submitted.body).not.toContain('13800138000');
  });

  it('rejects global consent and cross-tenant calls without persisting', async () => {
    const app = buildApp({ reviewStore: store(), learningFeedbackService: new LearningFeedbackService(new InMemoryLearningFeedbackRepository(), 'test-key') }); apps.push(app);
    const invalid = await app.inject({ method: 'POST', url: `/api/reviews/${ticket.id}/learning-feedback/preview`, headers: headers(), payload: { consentScope: 'GLOBAL_ANONYMIZED', consentNoticeVersion: 'notice-v1', purpose: 'quality', retentionDays: 30 } });
    expect(invalid.statusCode).toBe(409); expect(invalid.json().error.code).toBe('GLOBAL_LEARNING_CONSENT_UNAVAILABLE');
    const denied = await app.inject({ method: 'POST', url: `/api/reviews/${ticket.id}/learning-feedback/preview`, headers: { ...headers(), 'x-tenant-id': 'tenant-b' }, payload: { consentScope: 'TENANT_PRIVATE', consentNoticeVersion: 'notice-v1', purpose: 'quality', retentionDays: 30 } });
    expect(denied.statusCode).toBe(403);
  });
});
