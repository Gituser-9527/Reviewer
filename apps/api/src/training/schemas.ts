import { z } from 'zod';

const nonEmptyText = z.string().trim().min(1);

export const trainingStatusQuerySchema = z
  .object({
    reviewerId: nonEmptyText.max(200),
    tenantId: nonEmptyText.max(200).optional(),
  })
  .strict();

export const completeTrainingBodySchema = z
  .object({
    reviewerId: nonEmptyText.max(200),
    tenantId: nonEmptyText.max(200).optional(),
    documentVersion: nonEmptyText.max(100).default('training-v1'),
  })
  .strict();
