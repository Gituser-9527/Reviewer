import { randomUUID } from 'node:crypto';

export interface ReviewerTrainingCompletion {
  id: string;
  reviewerId: string;
  tenantId?: string;
  completed: boolean;
  completedAt: string;
  documentVersion: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function keyFor(reviewerId: string, tenantId?: string): string {
  return `${tenantId ?? 'global'}:${reviewerId}`;
}

export class TrainingService {
  private readonly completions = new Map<string, ReviewerTrainingCompletion>();

  getCompletion(input: { reviewerId: string; tenantId?: string }): ReviewerTrainingCompletion | undefined {
    const completion = this.completions.get(keyFor(input.reviewerId, input.tenantId));
    return completion === undefined ? undefined : structuredClone(completion);
  }

  markCompleted(input: {
    reviewerId: string;
    tenantId?: string;
    documentVersion?: string;
  }): ReviewerTrainingCompletion {
    const record: ReviewerTrainingCompletion = {
      id: `reviewer_training_completed_${randomUUID()}`,
      reviewerId: input.reviewerId,
      ...(input.tenantId === undefined ? {} : { tenantId: input.tenantId }),
      completed: true,
      completedAt: nowIso(),
      documentVersion: input.documentVersion ?? 'training-v1',
    };
    this.completions.set(keyFor(input.reviewerId, input.tenantId), structuredClone(record));
    return structuredClone(record);
  }
}
