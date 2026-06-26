import type { FastifyInstance } from 'fastify';
import {
  addRuleToRuleSetBodySchema,
  createRuleSetBodySchema,
  createRuleBodySchema,
  patchRuleBodySchema,
  publishRulesBodySchema,
  publishRuleSetBodySchema,
  rollbackRuleSetBodySchema,
  ruleListQuerySchema,
  ruleParamsSchema,
  ruleSetParamsSchema,
  ruleVersionsQuerySchema,
  runEvalRuleSetBodySchema,
  testRuleSetBodySchema,
  toggleRuleBodySchema,
  updateRuleBodySchema,
} from './schemas.js';
import type { AuthServices } from '../auth/service.js';
import { FileRuleManagementStore } from './store.js';

export interface RuleRoutesDependencies {
  store?: FileRuleManagementStore;
  authServices?: AuthServices;
}

export function registerRuleRoutes(
  app: FastifyInstance,
  dependencies: RuleRoutesDependencies = {},
): void {
  const store = dependencies.store ?? new FileRuleManagementStore();
  const auth = dependencies.authServices?.authService;

  app.get('/api/rulesets', async (request, reply) => {
    auth?.requirePermission(request, 'rule:read');
    const items = await store.listRuleSets();
    return reply.send({ items });
  });

  app.post('/api/rulesets', async (request, reply) => {
    auth?.requirePermission(request, 'rule:edit_draft');
    const body = createRuleSetBodySchema.parse(request.body);
    const item = await store.createRuleSet({
      ...(body.id === undefined ? {} : { id: body.id }),
      name: body.name,
      jurisdiction: body.jurisdiction,
      ...(body.description === undefined ? {} : { description: body.description }),
    });
    return reply.code(201).send(item);
  });

  app.get('/api/rulesets/:id', async (request, reply) => {
    auth?.requirePermission(request, 'rule:read');
    const params = ruleSetParamsSchema.parse(request.params);
    const item = await store.getRuleSet(params.id);
    const rules = await store.listRules(item.jurisdiction, 'draft');
    return reply.send({ ...item, rules });
  });

  app.post('/api/rulesets/:id/rules', async (request, reply) => {
    auth?.requirePermission(request, 'rule:edit_draft');
    const params = ruleSetParamsSchema.parse(request.params);
    const body = addRuleToRuleSetBodySchema.parse(request.body);
    const item = await store.addRuleToRuleSet(params.id, body.rule, body.fileName);
    return reply.code(201).send(item);
  });

  app.patch('/api/rules/:id', async (request, reply) => {
    auth?.requirePermission(request, 'rule:edit_draft');
    const params = ruleParamsSchema.parse(request.params);
    const body = patchRuleBodySchema.parse(request.body);
    const item = await store.patchRule(params.id, {
      jurisdiction: body.jurisdiction,
      ...(body.id === undefined ? {} : { id: body.id }),
      ...(body.category === undefined ? {} : { category: body.category }),
      ...(body.severity === undefined ? {} : { severity: body.severity }),
      ...(body.action === undefined ? {} : { action: body.action }),
      ...(body.containsAny === undefined ? {} : { containsAny: body.containsAny }),
      ...(body.regex === undefined ? {} : { regex: body.regex }),
      ...(body.patterns === undefined ? {} : { patterns: body.patterns }),
      ...(body.fields === undefined ? {} : { fields: body.fields }),
      ...(body.explanation === undefined ? {} : { explanation: body.explanation }),
      ...(body.suggestion === undefined ? {} : { suggestion: body.suggestion }),
      ...(body.enabled === undefined ? {} : { enabled: body.enabled }),
    });
    return reply.send(item);
  });

  app.post('/api/rulesets/:id/test', async (request, reply) => {
    auth?.requirePermission(request, 'rule:read');
    const params = ruleSetParamsSchema.parse(request.params);
    const body = testRuleSetBodySchema.parse(request.body);
    const result = await store.testRuleSet(params.id, {
      text: body.text,
      ...(body.ruleVersion === undefined ? {} : { ruleVersion: body.ruleVersion }),
    });
    return reply.send(result);
  });

  app.post('/api/rulesets/:id/run-eval', async (request, reply) => {
    auth?.requirePermission(request, 'rule:read');
    const params = ruleSetParamsSchema.parse(request.params);
    const body = runEvalRuleSetBodySchema.parse(request.body);
    const result = await store.runEvalForRuleSet(params.id, {
      ...(body.ruleVersion === undefined ? {} : { ruleVersion: body.ruleVersion }),
    });
    return reply.send(result);
  });

  app.post('/api/rulesets/:id/publish', async (request, reply) => {
    const actor = auth?.requirePermission(request, 'rule:approve_publish');
    const params = ruleSetParamsSchema.parse(request.params);
    const body = publishRuleSetBodySchema.parse(request.body);
    const approval =
      actor === undefined
        ? undefined
        : dependencies.authServices?.rulePublishApprovalService.approve({
            ruleSetId: params.id,
            ...(body.ruleVersion === undefined ? {} : { ruleVersion: body.ruleVersion }),
            action: 'publish',
            requestedBy: body.actorId,
            approvedBy: actor.userId,
            comment: 'Approved by compliance manager before publishing.',
          });
    const result = await store.publishRuleSet(params.id, {
      actorId: body.actorId,
      forcePublish: body.forcePublish,
      minDecisionAccuracy: body.minDecisionAccuracy,
      minCategoryRecall: body.minCategoryRecall,
      ...(body.ruleVersion === undefined ? {} : { ruleVersion: body.ruleVersion }),
    });
    if (actor !== undefined) {
      dependencies.authServices?.auditLogService.record({
        actor,
        operation: 'rule_publish',
        resourceType: 'ruleset',
        resourceId: params.id,
        after: { ...result, approvalId: approval?.id },
        requestId: request.id,
      });
    }
    return reply.send(result);
  });

  app.post('/api/rulesets/:id/rollback', async (request, reply) => {
    const actor = auth?.requirePermission(request, 'rule:rollback');
    const params = ruleSetParamsSchema.parse(request.params);
    const body = rollbackRuleSetBodySchema.parse(request.body);
    const approval =
      actor === undefined
        ? undefined
        : dependencies.authServices?.rulePublishApprovalService.approve({
            ruleSetId: params.id,
            ...(body.targetVersion === undefined ? {} : { ruleVersion: body.targetVersion }),
            action: 'rollback',
            requestedBy: body.actorId,
            approvedBy: actor.userId,
            comment: 'Approved by compliance manager before rollback.',
          });
    const result = await store.rollbackRuleSet(params.id, {
      actorId: body.actorId,
      ...(body.targetVersion === undefined ? {} : { targetVersion: body.targetVersion }),
    });
    if (actor !== undefined) {
      dependencies.authServices?.auditLogService.record({
        actor,
        operation: 'rule_rollback',
        resourceType: 'ruleset',
        resourceId: params.id,
        after: { ...result, approvalId: approval?.id },
        requestId: request.id,
      });
    }
    return reply.send(result);
  });

  app.get('/api/rule-publish-records', async (request, reply) => {
    auth?.requirePermission(request, 'rule:read');
    const items = await store.listPublishRecords();
    return reply.send({ items });
  });

  app.get('/api/rules', async (request, reply) => {
    auth?.requirePermission(request, 'rule:read');
    const query = ruleListQuerySchema.parse(request.query);
    const items = await store.listRules(query.jurisdiction, query.status);
    return reply.send({ items });
  });

  app.post('/api/rules', async (request, reply) => {
    auth?.requirePermission(request, 'rule:edit_draft');
    const body = createRuleBodySchema.parse(request.body);
    const item = await store.createRule(body.jurisdiction, body.rule, body.fileName);
    return reply.code(201).send(item);
  });

  app.put('/api/rules/:id', async (request, reply) => {
    auth?.requirePermission(request, 'rule:edit_draft');
    const params = ruleParamsSchema.parse(request.params);
    const body = updateRuleBodySchema.parse(request.body);
    const item = await store.updateRule(body.jurisdiction, params.id, body.rule);
    return reply.send(item);
  });

  app.post('/api/rules/:id/toggle', async (request, reply) => {
    auth?.requirePermission(request, 'rule:edit_draft');
    const params = ruleParamsSchema.parse(request.params);
    const body = toggleRuleBodySchema.parse(request.body);
    const item = await store.setRuleEnabled(body.jurisdiction, params.id, body.enabled);
    return reply.send(item);
  });

  app.get('/api/rules/versions', async (request, reply) => {
    auth?.requirePermission(request, 'rule:read');
    const query = ruleVersionsQuerySchema.parse(request.query);
    const items = await store.listVersions(query.jurisdiction);
    return reply.send({ items });
  });

  app.post('/api/rules/publish', async (request, reply) => {
    const actor = auth?.requirePermission(request, 'rule:approve_publish');
    const body = publishRulesBodySchema.parse(request.body);
    const approval =
      actor === undefined
        ? undefined
        : dependencies.authServices?.rulePublishApprovalService.approve({
            ruleSetId: body.jurisdiction,
            ...(body.ruleVersion === undefined ? {} : { ruleVersion: body.ruleVersion }),
            action: 'publish',
            requestedBy: body.actorId,
            approvedBy: actor.userId,
            comment: 'Approved by compliance manager before publishing.',
          });
    const result = await store.publishRules(body.jurisdiction, {
      actorId: body.actorId,
      ...(body.ruleVersion === undefined ? {} : { ruleVersion: body.ruleVersion }),
    });
    if (actor !== undefined) {
      dependencies.authServices?.auditLogService.record({
        actor,
        operation: 'rule_publish',
        resourceType: 'ruleset',
        resourceId: body.jurisdiction,
        after: { ...result, approvalId: approval?.id },
        requestId: request.id,
      });
    }
    return reply.send(result);
  });
}
