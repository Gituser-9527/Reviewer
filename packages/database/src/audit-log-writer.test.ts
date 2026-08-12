import { describe, expect, it, vi } from 'vitest';
import { PostgresAuditLogWriter } from './audit-log-writer.js';

const summary = {
  runId: 'run-176',
  mode: 'DRY_RUN' as const,
  status: 'SUCCEEDED' as const,
  cutoff: '2026-01-01T00:00:00.000Z',
  operationStartedAt: '2026-01-01T00:00:00.000Z',
  batchLimit: 10,
  candidateCount: 2,
  deletedCount: 0,
  countsByStatus: { RECEIVED: 2 },
  anomalyCount: 0,
};

describe('PostgresAuditLogWriter', () => {
  it('writes only the allowlisted, sanitized retention summary', async () => {
    const query = vi.fn().mockResolvedValue({});
    await new PostgresAuditLogWriter().recordRetentionWithClient({ query } as never, { actorUserId: 'operator', tenantId: 'tenant-a', summary, occurredAt: new Date() });
    const serializedParameters = JSON.stringify(query.mock.calls[0]?.[1]);
    expect(serializedParameters).not.toContain('candidateIds');
    expect(serializedParameters).not.toContain('payload');
    expect(serializedParameters).toContain('run-176');
  });

  it('rejects fields outside the audit contract before issuing SQL', async () => {
    const query = vi.fn();
    const unsafe = { ...summary, candidateIds: ['secret-id'], comment: 'Authorization: Bearer secret' };
    await expect(new PostgresAuditLogWriter().recordRetentionWithClient({ query } as never, { actorUserId: 'operator', tenantId: 'tenant-a', summary: unsafe, occurredAt: new Date() })).rejects.toThrow('AUDIT_LOG_FIELD_NOT_ALLOWED');
    expect(query).not.toHaveBeenCalled();
  });
});
