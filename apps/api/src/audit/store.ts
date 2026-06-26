import type { AuditResult, JobPostingInput } from '@job-compliance/shared';

/** Context required by persistent stores when saving a completed run. */
export interface AuditRunSaveContext {
  /** Tenant that owns the submitted job posting. */
  tenantId: string;
  /** Core input used to produce the result. */
  jobPosting: JobPostingInput;
}

/** Storage contract for completed audit runs. */
export interface AuditRunStore {
  /** Stores or replaces a run by its audit identifier. */
  save(result: AuditResult, context: AuditRunSaveContext): Promise<void> | void;
  /** Finds a run by audit identifier. */
  findById(id: string, tenantId?: string): Promise<AuditResult | undefined> | AuditResult | undefined;
  /** Lists recent runs owned by a tenant. */
  listByTenant(tenantId: string): Promise<AuditResult[]> | AuditResult[];
  /** Deletes all runs owned by a tenant when a privacy deletion request is approved. */
  deleteByTenant?(tenantId: string): Promise<number> | number;
  /** Removes all runs, primarily for controlled tests. */
  clear(): Promise<void> | void;
  /** Releases any backing resources owned by the store. */
  close?(): Promise<void>;
}

/** Process-local audit storage used until PostgreSQL persistence is implemented. */
export class InMemoryAuditRunStore implements AuditRunStore {
  private readonly runs = new Map<string, AuditResult>();

  /** Stores a defensive copy of the result. */
  save(result: AuditResult): void {
    this.runs.set(result.auditId, structuredClone(result));
  }

  /** Returns a defensive copy to prevent accidental store mutation. */
  findById(id: string, tenantId?: string): AuditResult | undefined {
    const result = this.runs.get(id);
    if (result === undefined) return undefined;
    if (tenantId !== undefined && result.context.tenantId !== tenantId) return undefined;
    return structuredClone(result);
  }

  /** Returns defensive copies of runs scoped to one tenant. */
  listByTenant(tenantId: string): AuditResult[] {
    return [...this.runs.values()]
      .filter((result) => result.context.tenantId === tenantId)
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .map((result) => structuredClone(result));
  }

  /** Deletes all stored runs for a tenant and returns the number of removed runs. */
  deleteByTenant(tenantId: string): number {
    let deleted = 0;
    for (const [id, result] of this.runs.entries()) {
      if (result.context.tenantId === tenantId) {
        this.runs.delete(id);
        deleted += 1;
      }
    }
    return deleted;
  }

  /** Clears all in-memory audit runs. */
  clear(): void {
    this.runs.clear();
  }
}
