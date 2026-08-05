import { pathToFileURL } from 'node:url';
import { PostgresLearningFeedbackRepository } from '@job-compliance/database';
import { LearningFeedbackError } from './service.js';
import { buildRetentionConfirmationTarget, LearningFeedbackRetentionService, type RetentionCommand } from './retention.js';

export function parseRetentionArgs(args: string[], env: NodeJS.ProcessEnv = process.env): RetentionCommand {
  const mode = args[0] === 'execute' ? 'EXECUTE' : args[0] === 'dry-run' ? 'DRY_RUN' : undefined;
  if (mode === undefined) throw new LearningFeedbackError('LEARNING_FEEDBACK_UNAVAILABLE', 'Retention mode must be dry-run or execute.');
  const values = new Map<string, string>();
  const switches = new Set<string>();
  const valueFlags = new Set(['--tenant-id', '--limit', '--cutoff', '--confirm-target']);
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === '--confirm') {
      if (switches.has(argument)) throw new LearningFeedbackError('LEARNING_FEEDBACK_UNAVAILABLE', 'Retention flags cannot be repeated.');
      switches.add(argument);
      continue;
    }
    if (!valueFlags.has(argument)) throw new LearningFeedbackError('LEARNING_FEEDBACK_UNAVAILABLE', 'Retention received an unknown argument.');
    if (values.has(argument)) throw new LearningFeedbackError('LEARNING_FEEDBACK_UNAVAILABLE', 'Retention flags cannot be repeated.');
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) throw new LearningFeedbackError('LEARNING_FEEDBACK_UNAVAILABLE', 'Retention flag value is missing.');
    values.set(argument, value);
    index += 1;
  }
  const tenantId = values.get('--tenant-id') ?? '';
  if (tenantId.length === 0 || tenantId !== tenantId.trim()) throw new LearningFeedbackError('LEARNING_FEEDBACK_UNAVAILABLE', 'Retention requires an unambiguous tenant.');
  const limitValue = values.get('--limit') ?? '100';
  const cutoffValue = values.get('--cutoff');
  const environmentValue = env.LEARNING_FEEDBACK_RETENTION_ENVIRONMENT;
  if (!['test', 'development', 'production'].includes(environmentValue ?? '')) throw new LearningFeedbackError('LEARNING_FEEDBACK_UNAVAILABLE', 'Retention requires an explicit environment.');
  const batchLimit = Number(limitValue);
  const cutoff = cutoffValue === undefined ? new Date() : new Date(cutoffValue);
  const confirmationTarget = values.get('--confirm-target');
  if (!Number.isInteger(batchLimit) || batchLimit < 1 || batchLimit > 500 || !Number.isFinite(cutoff.getTime())) throw new LearningFeedbackError('LEARNING_FEEDBACK_UNAVAILABLE', 'Retention arguments are invalid.');
  return {
    mode,
    tenantId,
    cutoff,
    batchLimit,
    actorUserId: env.LEARNING_FEEDBACK_RETENTION_ACTOR_ID ?? '',
    environment: environmentValue as RetentionCommand['environment'],
    databaseName: '',
    confirm: switches.has('--confirm'),
    ...(confirmationTarget === undefined ? {} : { confirmationTarget }),
    executeEnabled: env.LEARNING_FEEDBACK_RETENTION_EXECUTE_ENABLED === 'true',
  };
}

export async function runRetentionCli(args: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  let repository: PostgresLearningFeedbackRepository | undefined;
  try {
    const command = parseRetentionArgs(args, env);
    const connectionString = env.LEARNING_FEEDBACK_RETENTION_DATABASE_URL;
    if (!connectionString) throw new LearningFeedbackError('LEARNING_FEEDBACK_UNAVAILABLE', 'Retention requires a configured database.');
    repository = new PostgresLearningFeedbackRepository({ connectionString });
    command.databaseName = await repository.getCurrentDatabaseName();
    const service = new LearningFeedbackRetentionService(repository, env.LEARNING_FEEDBACK_PSEUDONYM_KEY ?? '', env.LEARNING_FEEDBACK_PSEUDONYM_KEY_VERSION ?? 'v1');
    const summary = await service.run(command);
    process.stdout.write(`${JSON.stringify(command.mode === 'DRY_RUN' ? { ...summary, confirmationTarget: buildRetentionConfirmationTarget(command) } : summary)}\n`);
    return summary.status === 'ANOMALY' ? 2 : 0;
  } catch (error) {
    const code = error instanceof LearningFeedbackError ? error.code : 'LEARNING_FEEDBACK_RETENTION_FAILED';
    process.stderr.write(`${JSON.stringify({ error: { code } })}\n`);
    return error instanceof LearningFeedbackError && error.code === 'LEARNING_FEEDBACK_RETENTION_ANOMALY' ? 2 : 1;
  } finally {
    await repository?.close();
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runRetentionCli(process.argv.slice(2));
}
