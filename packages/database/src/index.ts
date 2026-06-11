import type { ReviewRepository } from '@job-compliance/core';

export interface DatabaseHealth {
  status: 'up' | 'down';
}

export interface DatabasePort {
  reviews: ReviewRepository;
  healthCheck(): Promise<DatabaseHealth>;
  close(): Promise<void>;
}
