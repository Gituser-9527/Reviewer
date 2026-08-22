import { describe, expect, it } from 'vitest';
import { parseRetentionArgs } from './retention-cli.js';
import { validateRetentionCommand, type RetentionCommand } from './retention.js';

const base = (): RetentionCommand => ({
  mode: 'DRY_RUN',
  tenantId: 'tenant-a',
  cutoff: new Date('2026-01-01T00:00:00.000Z'),
  batchLimit: 10,
  actorUserId: 'operator-a',
});

const env = { LEARNING_FEEDBACK_RETENTION_ACTOR_ID: 'operator-a' };

describe('learning feedback retention command safety', () => {
  it('supports only tenant-scoped dry-run commands', () => {
    expect(() => validateRetentionCommand(base())).not.toThrow();
    expect(() => parseRetentionArgs(['execute', '--tenant-id', 'tenant-a'], env)).toThrowError(/execute is intentionally unavailable/u);
  });

  it('requires tenant, actor, cutoff and bounded values', () => {
    for (const invalid of [
      { ...base(), tenantId: '' },
      { ...base(), actorUserId: '' },
      { ...base(), batchLimit: 501 },
      { ...base(), cutoff: new Date('invalid') },
    ]) expect(() => validateRetentionCommand(invalid)).toThrow();
  });

  it('strictly rejects unknown, repeated, missing, ambiguous and invalid arguments', () => {
    const invalidArgs = [
      [], ['unknown'], ['dry-run', '--unknown'], ['dry-run', '--tenant-id'], ['dry-run', '--tenant-id', 'tenant-a'],
      ['dry-run', '--tenant-id', '--limit', '3'], ['dry-run', '--tenant-id', 'tenant-a', '--tenant-id', 'tenant-b'],
      ['dry-run', '--tenant-id', ' tenant-a'], ['dry-run', '--tenant-id', 'tenant-a '],
      ['dry-run', '--tenant-id', 'tenant-a', '--limit', '3', '--limit', '4'],
      ['dry-run', '--tenant-id', 'tenant-a', '--cutoff', '2026-01-01T00:00:00.000Z', '--cutoff', '2026-02-01T00:00:00.000Z'],
      ['dry-run', '--tenant-id', 'tenant-a', '--confirm-target', 'one'],
      ['dry-run', '--tenant-id', ''],
      ['dry-run', '--tenant-id', 'tenant-a', '--limit', '0'], ['dry-run', '--tenant-id', 'tenant-a', '--limit', '-1'],
      ['dry-run', '--tenant-id', 'tenant-a', '--limit', '1.5'], ['dry-run', '--tenant-id', 'tenant-a', '--limit', 'NaN'],
      ['dry-run', '--tenant-id', 'tenant-a', '--limit', 'Infinity'],
      ['dry-run', '--tenant-id', 'tenant-a', '--limit', '501'], ['dry-run', '--tenant-id', 'tenant-a', '--cutoff', 'not-a-date'],
      ['dry-run', '--tenant-id', 'tenant-a', 'extra'],
    ];
    for (const args of invalidArgs) expect(() => parseRetentionArgs(args, env)).toThrow();
  });

  it('parses one explicit tenant-scoped command', () => {
    expect(parseRetentionArgs(['dry-run', '--tenant-id', 'tenant-a', '--limit', '25', '--cutoff', '2026-01-01T00:00:00.000Z'], env)).toMatchObject({ mode: 'DRY_RUN', tenantId: 'tenant-a', batchLimit: 25, actorUserId: 'operator-a' });
  });
});
