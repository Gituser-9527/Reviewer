import type { AuditRunRepository } from '@job-compliance/database';
import type { AuditResult } from '@job-compliance/shared';
import type { AuditRunSaveContext, AuditRunStore } from './store.js';

/** API storage adapter backed by the database package repository. */
export class DatabaseAuditRunStore implements AuditRunStore {
  constructor(private readonly repository: AuditRunRepository) {}

  /** Persists the run, redacted input snapshot, findings and evidence links. */
  async save(result: AuditResult, context: AuditRunSaveContext): Promise<void> {
    await this.repository.saveAuditRun({
      tenantId: context.tenantId,
      jobPosting: context.jobPosting,
      result,
    });
  }

  /** Fetches one stored audit result. */
  async findById(id: string, tenantId?: string): Promise<AuditResult | undefined> {
    return this.repository.findAuditRunById(id, tenantId);
  }

  /** Lists recent stored audit results for one tenant. */
  async listByTenant(tenantId: string): Promise<AuditResult[]> {
    return this.repository.listAuditRuns({ tenantId });
  }

  /** Persistent storage is not cleared by API tests unless they inject a test repository. */
  clear(): void {
    return undefined;
  }

  /** Closes the underlying repository resources. */
  async close(): Promise<void> {
    await this.repository.close();
  }
}
