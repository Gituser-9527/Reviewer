import type { ReviewResult } from '../review/types.js';

export interface ReviewRepository {
  save(result: ReviewResult): Promise<void>;
  findById(tenantId: string, reviewId: string): Promise<ReviewResult | null>;
}
