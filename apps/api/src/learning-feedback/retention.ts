import { pseudonymizeSensitiveValue } from '@job-compliance/core';
import type { LearningFeedbackRepository } from '@job-compliance/database';
import type { LearningFeedbackRetentionSummary } from '@job-compliance/shared';
import { LearningFeedbackError } from './service.js';

export interface RetentionCommand {
  mode: 'DRY_RUN' | 'EXECUTE';
  tenantId: string;
  cutoff: Date;
  batchLimit: number;
  actorUserId: string;
  confirm: boolean;
  executeEnabled: boolean;
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
      tenantId: command.tenantId,
      cutoff: command.cutoff,
      batchLimit: command.batchLimit,
      actorPseudonym: pseudonymizeSensitiveValue({ tenantId: command.tenantId, actorUserId: command.actorUserId }, this.pseudonymKey),
      pseudonymKeyVersion: this.pseudonymKeyVersion,
      auditActorId: command.actorUserId,
      occurredAt,
    };
    try {
      return command.mode === 'DRY_RUN'
        ? await this.repository.previewRetention(input)
        : await this.repository.executeRetention(input);
    } catch (error) {
      if (error instanceof Error && error.message === 'LEARNING_FEEDBACK_RETENTION_GOLD_SET_ANOMALY') {
        throw new LearningFeedbackError('LEARNING_FEEDBACK_RETENTION_ANOMALY', 'Retention stopped because an unavailable Gold Set state was found.');
      }
      throw error;
    }
  }
}

export function validateRetentionCommand(command: RetentionCommand): void {
  if (!command.tenantId.trim()) throw new LearningFeedbackError('LEARNING_FEEDBACK_UNAVAILABLE', 'Retention requires an explicit tenant.');
  if (!Number.isInteger(command.batchLimit) || command.batchLimit < 1 || command.batchLimit > 500) throw new LearningFeedbackError('LEARNING_FEEDBACK_UNAVAILABLE', 'Retention batch limit must be between 1 and 500.');
  if (!Number.isFinite(command.cutoff.getTime())) throw new LearningFeedbackError('LEARNING_FEEDBACK_UNAVAILABLE', 'Retention cutoff is invalid.');
  if (!command.actorUserId.trim()) throw new LearningFeedbackError('LEARNING_FEEDBACK_UNAVAILABLE', 'Retention requires an authenticated maintenance actor.');
  if (command.mode === 'EXECUTE' && (!command.confirm || !command.executeEnabled)) throw new LearningFeedbackError('LEARNING_FEEDBACK_UNAVAILABLE', 'Retention execute requires confirmation and an explicit environment guard.');
}
