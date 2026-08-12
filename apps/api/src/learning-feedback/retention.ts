import { randomUUID } from 'node:crypto';
import { pseudonymizeSensitiveValue } from '@job-compliance/core';
import type { LearningFeedbackRepository } from '@job-compliance/database';
import type { LearningFeedbackRetentionSummary } from '@job-compliance/shared';
import { LearningFeedbackError } from './service.js';

export interface RetentionCommand {
  mode: 'DRY_RUN';
  tenantId: string;
  cutoff: Date;
  batchLimit: number;
  actorUserId: string;
}

export class LearningFeedbackRetentionService {
  constructor(
    private readonly repository: LearningFeedbackRepository,
    private readonly pseudonymKey: string,
    private readonly pseudonymKeyVersion = 'v1',
  ) {
    if (!pseudonymKey) throw new LearningFeedbackError('LEARNING_FEEDBACK_UNAVAILABLE', 'Retention requires a pseudonym key.');
  }

  async run(command: RetentionCommand): Promise<LearningFeedbackRetentionSummary> {
    validateRetentionCommand(command);
    const occurredAt = new Date();
    const input = {
      runId: `learning_feedback_retention_${randomUUID()}`,
      tenantId: command.tenantId,
      cutoff: command.cutoff,
      batchLimit: command.batchLimit,
      actorPseudonym: pseudonymizeSensitiveValue({ tenantId: command.tenantId, actorUserId: command.actorUserId }, this.pseudonymKey),
      pseudonymKeyVersion: this.pseudonymKeyVersion,
      auditActorId: command.actorUserId,
      occurredAt,
    };
    return this.repository.previewRetention(input);
  }
}

export function validateRetentionCommand(command: RetentionCommand): void {
  if (!command.tenantId.trim()) throw new LearningFeedbackError('LEARNING_FEEDBACK_UNAVAILABLE', 'Retention requires an explicit tenant.');
  if (!Number.isInteger(command.batchLimit) || command.batchLimit < 1 || command.batchLimit > 500) throw new LearningFeedbackError('LEARNING_FEEDBACK_UNAVAILABLE', 'Retention batch limit must be between 1 and 500.');
  if (!Number.isFinite(command.cutoff.getTime())) throw new LearningFeedbackError('LEARNING_FEEDBACK_UNAVAILABLE', 'Retention cutoff is invalid.');
  if (!command.actorUserId.trim()) throw new LearningFeedbackError('LEARNING_FEEDBACK_UNAVAILABLE', 'Retention requires an authenticated maintenance actor.');
}
