import { randomUUID } from 'node:crypto';
import { hashSensitiveValue, pseudonymizeSensitiveValue } from '@job-compliance/core';
import type { LearningFeedbackRepository, LearningFeedbackRetentionMaintenanceAdapter } from '@job-compliance/database';
import type { LearningFeedbackRetentionSummary } from '@job-compliance/shared';
import { LearningFeedbackError } from './service.js';

export interface RetentionCommand {
  mode: 'DRY_RUN' | 'EXECUTE';
  tenantId: string;
  cutoff: Date;
  batchLimit: number;
  actorUserId: string;
  environment: 'test' | 'development' | 'production';
  databaseName: string;
  databaseEndpoint: string;
  confirm: boolean;
  confirmationTarget?: string;
  executeEnabled: boolean;
}

export function buildRetentionConfirmationTarget(command: Pick<RetentionCommand, 'tenantId' | 'cutoff' | 'batchLimit' | 'environment' | 'databaseName' | 'databaseEndpoint'>): string {
  return `retention:${hashSensitiveValue({ tenantId: command.tenantId, cutoff: command.cutoff.toISOString(), batchLimit: command.batchLimit, environment: command.environment, databaseName: command.databaseName, databaseEndpoint: command.databaseEndpoint })}`;
}

export class LearningFeedbackRetentionService {
  constructor(
    private readonly repository: LearningFeedbackRepository,
    private readonly pseudonymKey: string,
    private readonly pseudonymKeyVersion = 'v1',
    private readonly maintenanceAdapter?: LearningFeedbackRetentionMaintenanceAdapter,
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
    return command.mode === 'DRY_RUN'
      ? await this.repository.previewRetention(input)
      : await this.maintenanceAdapter?.executeRetention(input) ?? Promise.reject(new LearningFeedbackError('LEARNING_FEEDBACK_UNAVAILABLE', 'Retention execute requires a maintenance adapter.'));
  }
}

export function validateRetentionCommand(command: RetentionCommand): void {
  if (!command.tenantId.trim()) throw new LearningFeedbackError('LEARNING_FEEDBACK_UNAVAILABLE', 'Retention requires an explicit tenant.');
  if (!Number.isInteger(command.batchLimit) || command.batchLimit < 1 || command.batchLimit > 500) throw new LearningFeedbackError('LEARNING_FEEDBACK_UNAVAILABLE', 'Retention batch limit must be between 1 and 500.');
  if (!Number.isFinite(command.cutoff.getTime())) throw new LearningFeedbackError('LEARNING_FEEDBACK_UNAVAILABLE', 'Retention cutoff is invalid.');
  if (!command.actorUserId.trim()) throw new LearningFeedbackError('LEARNING_FEEDBACK_UNAVAILABLE', 'Retention requires an authenticated maintenance actor.');
  if (!command.databaseName.trim()) throw new LearningFeedbackError('LEARNING_FEEDBACK_UNAVAILABLE', 'Retention requires a verified database target.');
  if (!command.databaseEndpoint.trim()) throw new LearningFeedbackError('LEARNING_FEEDBACK_UNAVAILABLE', 'Retention requires a verified database instance.');
  if (command.mode === 'EXECUTE' && command.environment === 'production') throw new LearningFeedbackError('LEARNING_FEEDBACK_RETENTION_PRODUCTION_DISABLED', 'Production Retention execute is unavailable until separate authorization and a runbook exist.');
  if (command.mode === 'EXECUTE' && (!command.confirm || !command.executeEnabled)) throw new LearningFeedbackError('LEARNING_FEEDBACK_UNAVAILABLE', 'Retention execute requires confirmation and an explicit environment guard.');
  if (command.mode === 'EXECUTE' && command.confirmationTarget !== buildRetentionConfirmationTarget(command)) throw new LearningFeedbackError('LEARNING_FEEDBACK_RETENTION_TARGET_MISMATCH', 'Retention confirmation does not match the verified target.');
}
