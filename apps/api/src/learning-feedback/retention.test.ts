import { describe, expect, it } from 'vitest';
import { parseRetentionArgs } from './retention-cli.js';
import { validateRetentionCommand } from './retention.js';

describe('learning feedback retention command safety', () => {
  it('requires tenant, actor, bounded batch, confirm and the execute guard', () => {
    expect(() => validateRetentionCommand({ mode: 'EXECUTE', tenantId: 'tenant-a', cutoff: new Date(), batchLimit: 10, actorUserId: 'operator-a', confirm: false, executeEnabled: true })).toThrow();
    expect(() => validateRetentionCommand({ mode: 'EXECUTE', tenantId: 'tenant-a', cutoff: new Date(), batchLimit: 10, actorUserId: 'operator-a', confirm: true, executeEnabled: false })).toThrow();
    expect(() => validateRetentionCommand({ mode: 'DRY_RUN', tenantId: '', cutoff: new Date(), batchLimit: 10, actorUserId: 'operator-a', confirm: false, executeEnabled: false })).toThrow();
    expect(() => validateRetentionCommand({ mode: 'DRY_RUN', tenantId: 'tenant-a', cutoff: new Date(), batchLimit: 501, actorUserId: 'operator-a', confirm: false, executeEnabled: false })).toThrow();
  });

  it('parses only explicit tenant-scoped commands without an all-tenants default', () => {
    expect(parseRetentionArgs(['dry-run', '--tenant-id', 'tenant-a', '--limit', '25', '--cutoff', '2026-01-01T00:00:00.000Z'], { LEARNING_FEEDBACK_RETENTION_ACTOR_ID: 'operator-a' })).toMatchObject({ mode: 'DRY_RUN', tenantId: 'tenant-a', batchLimit: 25, actorUserId: 'operator-a' });
    expect(parseRetentionArgs(['execute', '--tenant-id', 'tenant-a', '--confirm'], { LEARNING_FEEDBACK_RETENTION_ACTOR_ID: 'operator-a', LEARNING_FEEDBACK_RETENTION_EXECUTE_ENABLED: 'true' })).toMatchObject({ mode: 'EXECUTE', confirm: true, executeEnabled: true });
  });
});
