import { describe, expect, it } from 'vitest';
import { parseRetentionArgs } from './retention-cli.js';
import { buildRetentionConfirmationTarget, validateRetentionCommand, type RetentionCommand } from './retention.js';

const base = (mode: 'DRY_RUN' | 'EXECUTE' = 'DRY_RUN'): RetentionCommand => ({
  mode,
  tenantId: 'tenant-a',
  cutoff: new Date('2026-01-01T00:00:00.000Z'),
  batchLimit: 10,
  actorUserId: 'operator-a',
  environment: 'test',
  databaseName: 'job_compliance_test',
  databaseEndpoint: '127.0.0.1:5432',
  confirm: false,
  executeEnabled: false,
});

const env = { LEARNING_FEEDBACK_RETENTION_ACTOR_ID: 'operator-a', LEARNING_FEEDBACK_RETENTION_ENVIRONMENT: 'test' };

describe('learning feedback retention command safety', () => {
  it('binds execute confirmation to tenant, database, cutoff, batch and environment', () => {
    const command = { ...base('EXECUTE'), confirm: true, executeEnabled: true };
    expect(() => validateRetentionCommand(command)).toThrowError(/confirmation/u);
    expect(() => validateRetentionCommand({ ...command, confirmationTarget: buildRetentionConfirmationTarget(command) })).not.toThrow();
    expect(() => validateRetentionCommand({ ...command, environment: 'production', confirmationTarget: buildRetentionConfirmationTarget({ ...command, environment: 'production' }) })).toThrowError(/Production/u);
  });

  it('requires tenant, actor, verified database and bounded values', () => {
    for (const invalid of [
      { ...base(), tenantId: '' },
      { ...base(), actorUserId: '' },
      { ...base(), databaseName: '' },
      { ...base(), batchLimit: 501 },
      { ...base(), cutoff: new Date('invalid') },
    ]) expect(() => validateRetentionCommand(invalid)).toThrow();
  });

  it('strictly rejects unknown, repeated, missing, ambiguous and invalid arguments', () => {
    const invalidArgs = [
      [], ['unknown'], ['dry-run', '--unknown'], ['dry-run', '--tenant-id'],
      ['dry-run', '--tenant-id', '--limit', '3'], ['dry-run', '--tenant-id', 'tenant-a', '--tenant-id', 'tenant-b'],
      ['dry-run', '--tenant-id', ' tenant-a'], ['dry-run', '--tenant-id', 'tenant-a '],
      ['dry-run', '--tenant-id', 'tenant-a', '--confirm', '--confirm'],
      ['dry-run', '--tenant-id', 'tenant-a', '--limit', '3', '--limit', '4'],
      ['dry-run', '--tenant-id', 'tenant-a', '--cutoff', '2026-01-01T00:00:00.000Z', '--cutoff', '2026-02-01T00:00:00.000Z'],
      ['dry-run', '--tenant-id', 'tenant-a', '--confirm-target', 'one', '--confirm-target', 'two'],
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
    expect(parseRetentionArgs(['dry-run', '--tenant-id', 'tenant-a', '--limit', '25', '--cutoff', '2026-01-01T00:00:00.000Z'], env)).toMatchObject({ mode: 'DRY_RUN', tenantId: 'tenant-a', batchLimit: 25, actorUserId: 'operator-a', environment: 'test' });
  });
});
