import { z } from 'zod';

const nonEmptyText = z.string().trim().min(1);

export const emergencySwitchParamsSchema = z
  .object({
    key: z.enum(['force_manual_review', 'disable_llm', 'disable_auto_reject']),
  })
  .strict();

export const updateEmergencySwitchSchema = z
  .object({
    enabled: z.boolean(),
    reason: z.string().trim().max(2_000).optional(),
    updatedBy: nonEmptyText.max(200).default('incident_commander'),
  })
  .strict();

export const createIncidentSchema = z
  .object({
    tenantId: nonEmptyText.max(200).optional(),
    incidentType: z.enum([
      'false_positive_spike',
      'false_negative',
      'system_error',
      'llm_failure',
      'rag_bad_citation',
      'data_leak',
      'rule_regression',
      'other',
    ]),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    title: nonEmptyText.max(300),
    description: nonEmptyText.max(5_000),
    relatedAuditRunId: z.string().trim().max(200).optional(),
    createdBy: nonEmptyText.max(200).default('incident_commander'),
  })
  .strict();

export const incidentListQuerySchema = z
  .object({
    tenantId: nonEmptyText.max(200).optional(),
    status: z.enum(['open', 'mitigating', 'resolved', 'all']).default('all'),
  })
  .strict();

export const incidentParamsSchema = z
  .object({
    id: nonEmptyText.max(200),
  })
  .strict();

export const createIncidentActionSchema = z
  .object({
    actionType: z.enum([
      'trigger_switch',
      'rollback_rule',
      'disable_llm',
      'force_manual_review',
      'notify_owner',
      'run_eval',
      'other',
    ]),
    actorId: nonEmptyText.max(200).default('incident_commander'),
    summary: nonEmptyText.max(5_000),
  })
  .strict();

export const createPostmortemSchema = z
  .object({
    rootCause: nonEmptyText.max(5_000),
    impact: nonEmptyText.max(5_000),
    timeline: z.array(nonEmptyText.max(1_000)).default([]),
    correctiveActions: z.array(nonEmptyText.max(1_000)).default([]),
    preventionActions: z.array(nonEmptyText.max(1_000)).default([]),
    createdBy: nonEmptyText.max(200).default('incident_commander'),
  })
  .strict();

export const ruleRollbackDrillSchema = z
  .object({
    actorId: nonEmptyText.max(200).default('drill_operator'),
    ruleVersion: z.string().trim().max(100).optional(),
  })
  .strict();
