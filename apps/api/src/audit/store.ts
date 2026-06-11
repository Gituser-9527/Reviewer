import type { AuditResult } from '@job-compliance/shared';

/** Storage contract for completed audit runs. */
export interface AuditRunStore {
  /** Stores or replaces a run by its audit identifier. */
  save(result: AuditResult): void;
  /** Finds a run by audit identifier. */
  findById(id: string): AuditResult | undefined;
  /** Removes all runs, primarily for controlled tests. */
  clear(): void;
}

/** Process-local audit storage used until PostgreSQL persistence is implemented. */
export class InMemoryAuditRunStore implements AuditRunStore {
  private readonly runs = new Map<string, AuditResult>();

  /** Stores a defensive copy of the result. */
  save(result: AuditResult): void {
    this.runs.set(result.auditId, structuredClone(result));
  }

  /** Returns a defensive copy to prevent accidental store mutation. */
  findById(id: string): AuditResult | undefined {
    const result = this.runs.get(id);
    return result === undefined ? undefined : structuredClone(result);
  }

  /** Clears all in-memory audit runs. */
  clear(): void {
    this.runs.clear();
  }
}
