import type { ReviewRepository } from '@job-compliance/core';
export * from './persistence-model.js';
export * from './privacy.js';
export * from './eval-repository.js';
export * from './repository.js';
export * from './llm-persistence-repository.js';
export * from './learning-feedback-repository.js';
export * from './audit-log-writer.js';
export * from './schema.js';

export interface DatabaseHealth {
  status: 'up' | 'down';
}

export interface DatabasePort {
  reviews: ReviewRepository;
  healthCheck(): Promise<DatabaseHealth>;
  close(): Promise<void>;
}
