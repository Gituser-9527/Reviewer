import { afterEach, describe, expect, it } from 'vitest';
import type { HumanReviewStore } from '../reviews/store.js';
import { complianceManagerIdentity, reviewerIdentity } from '../test-helpers/auth.js';
import { buildApp } from '../app.js';
import { InMemoryLearningFeedbackRepository, LearningFeedbackService } from './service.js';
import { ticket } from './test-fixture.js';

const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

function store(): HumanReviewStore {
  return {
    createFromAuditResult: () => undefined,
    findById: (id) => id === ticket.id ? structuredClone(ticket) : undefined,
    findByIdForTenant: (id, tenantId) => id === ticket.id && tenantId === ticket.tenantId ? structuredClone(ticket) : undefined,
    list: () => [structuredClone(ticket)],
    submitDecision: () => structuredClone(ticket),
    createRuleSuggestion: () => undefined,
    listRuleSuggestions: () => [],
    resolveRuleSuggestion: () => undefined,
    clear: () => undefined,
  };
}

function app() {
  const repository = new InMemoryLearningFeedbackRepository({ [ticket.feedback!.id]: ticket.feedback!.reviewerId });
  const instance = buildApp({ reviewStore: store(), learningFeedbackService: new LearningFeedbackService(repository, 'test-key') });
  apps.push(instance);
  return { instance, repository };
}

const body = { consentScope: 'TENANT_PRIVATE', retentionDays: 30, comment: 'call 13800138000', evidenceFragments: ['safe'] };
const ownerHeaders = { 'x-user-role': 'REVIEWER', 'x-user-id': 'reviewer-a', 'x-tenant-id': 'tenant-a' };

describe('learning feedback routes', () => {
  it('requires a server preview and persists only server-controlled metadata', async () => {
    const { instance } = app();
    const headers = ownerHeaders;
    const preview = await instance.inject({ method: 'POST', url: `/api/reviews/${ticket.id}/learning-feedback/preview`, headers, payload: body });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({ noticeVersion: 'learning-feedback-v1', purpose: 'QUALITY_IMPROVEMENT_REVIEW' });
    const submitted = await instance.inject({ method: 'POST', url: `/api/reviews/${ticket.id}/learning-feedback`, headers, payload: { ...body, digest: preview.json().digest, explicitConfirmation: true } });
    expect(submitted.statusCode).toBe(201);
    expect(submitted.json()).toMatchObject({ source: 'API', purpose: 'QUALITY_IMPROVEMENT_REVIEW', consentNoticeVersion: 'learning-feedback-v1' });
    expect(submitted.body).not.toContain('test_reviewer');
    expect(submitted.body).not.toContain('13800138000');
  });

  it('rejects client-controlled source, purpose and notice metadata', async () => {
    const { instance } = app();
    for (const injected of [{ source: 'EXTENSION' }, { purpose: 'Authorization: Bearer secret' }, { consentNoticeVersion: 'secret' }]) {
      const response = await instance.inject({ method: 'POST', url: `/api/reviews/${ticket.id}/learning-feedback/preview`, headers: ownerHeaders, payload: { ...body, ...injected } });
      expect(response.statusCode).toBe(400);
      expect(response.body).not.toContain('Authorization: Bearer secret');
    }
  });

  it('returns the same not-found error for an unknown and a cross-tenant review id', async () => {
    const { instance } = app();
    const unknown = await instance.inject({ method: 'POST', url: '/api/reviews/unknown/learning-feedback/preview', headers: reviewerIdentity('tenant-b'), payload: body });
    const crossTenant = await instance.inject({ method: 'POST', url: `/api/reviews/${ticket.id}/learning-feedback/preview`, headers: reviewerIdentity('tenant-b'), payload: body });
    expect(unknown.statusCode).toBe(404);
    expect(crossTenant.statusCode).toBe(404);
    expect(crossTenant.json().error).toEqual(unknown.json().error);
    const submitBody = { ...body, digest: '0'.repeat(64), explicitConfirmation: true };
    const unknownSubmit = await instance.inject({ method: 'POST', url: '/api/reviews/unknown/learning-feedback', headers: reviewerIdentity('tenant-b'), payload: submitBody });
    const crossTenantSubmit = await instance.inject({ method: 'POST', url: `/api/reviews/${ticket.id}/learning-feedback`, headers: reviewerIdentity('tenant-b'), payload: submitBody });
    expect(unknownSubmit.statusCode).toBe(404);
    expect(crossTenantSubmit.statusCode).toBe(404);
    expect(crossTenantSubmit.json().error).toEqual(unknownSubmit.json().error);
  });

  it('keeps global consent unavailable', async () => {
    const { instance } = app();
    const response = await instance.inject({ method: 'POST', url: `/api/reviews/${ticket.id}/learning-feedback/preview`, headers: ownerHeaders, payload: { ...body, consentScope: 'GLOBAL_ANONYMIZED' } });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('GLOBAL_LEARNING_CONSENT_UNAVAILABLE');
  });

  it('allows only the trusted decision owner to withdraw through the API', async () => {
    const { instance } = app();
    const preview = await instance.inject({ method: 'POST', url: `/api/reviews/${ticket.id}/learning-feedback/preview`, headers: ownerHeaders, payload: body });
    const submitted = await instance.inject({ method: 'POST', url: `/api/reviews/${ticket.id}/learning-feedback`, headers: ownerHeaders, payload: { ...body, digest: preview.json().digest, explicitConfirmation: true } });
    const id = submitted.json().id as string;
    const otherReviewer = await instance.inject({ method: 'POST', url: `/api/learning-feedback/${id}/withdraw`, headers: reviewerIdentity('tenant-a') });
    expect(otherReviewer.statusCode).toBe(403);
    const manager = await instance.inject({ method: 'POST', url: `/api/learning-feedback/${id}/withdraw`, headers: complianceManagerIdentity('tenant-a') });
    expect(manager.statusCode).toBe(403);
    const crossTenant = await instance.inject({ method: 'POST', url: `/api/learning-feedback/${id}/withdraw`, headers: reviewerIdentity('tenant-b') });
    expect(crossTenant.statusCode).toBe(404);
    const owner = await instance.inject({ method: 'POST', url: `/api/learning-feedback/${id}/withdraw`, headers: ownerHeaders });
    expect(owner.statusCode).toBe(200);
    expect(owner.json().status).toBe('WITHDRAWN');
  });

  it('authenticates and authorizes the unavailable gold-set boundary', async () => {
    const { instance, repository } = app();
    const url = '/api/learning-feedback/unused/promote-to-gold-set';
    await expect(instance.inject({ method: 'POST', url })).resolves.toMatchObject({ statusCode: 401 });
    await expect(instance.inject({ method: 'POST', url, headers: reviewerIdentity('tenant-a') })).resolves.toMatchObject({ statusCode: 403 });
    const authorized = await instance.inject({ method: 'POST', url, headers: complianceManagerIdentity('tenant-a') });
    expect(authorized.statusCode).toBe(409);
    expect(authorized.json().error.code).toBe('GOLD_SET_PROMOTION_UNAVAILABLE');
    await expect(repository.list({ tenantId: 'tenant-a', status: 'all' })).resolves.toEqual([]);
  });
});
