import { pathToFileURL } from 'node:url';
import { PostgresLearningFeedbackRepository } from '@job-compliance/database';
import { LearningFeedbackError } from './service.js';
import { LearningFeedbackRetentionService, type RetentionCommand } from './retention.js';

export function parseRetentionArgs(args: string[], env: NodeJS.ProcessEnv = process.env): RetentionCommand {
  if (args[0] === 'execute') throw new LearningFeedbackError('LEARNING_FEEDBACK_RETENTION_EXECUTE_UNAVAILABLE', 'Destructive Retention execute is intentionally unavailable.');
  const mode = args[0] === 'dry-run' ? 'DRY_RUN' : undefined;
  if (mode === undefined) throw new LearningFeedbackError('LEARNING_FEEDBACK_UNAVAILABLE', 'Retention mode must be dry-run.');
  const values = new Map<string, string>();
  const valueFlags = new Set(['--tenant-id', '--limit', '--cutoff']);
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index]!;
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
  if (cutoffValue === undefined) throw new LearningFeedbackError('LEARNING_FEEDBACK_UNAVAILABLE', 'Retention requires an explicit cutoff.');
  const batchLimit = Number(limitValue);
  const cutoff = new Date(cutoffValue);
  if (!Number.isInteger(batchLimit) || batchLimit < 1 || batchLimit > 500 || !Number.isFinite(cutoff.getTime())) throw new LearningFeedbackError('LEARNING_FEEDBACK_UNAVAILABLE', 'Retention arguments are invalid.');
  return {
    mode,
    tenantId,
    cutoff,
    batchLimit,
    actorUserId: env.LEARNING_FEEDBACK_RETENTION_ACTOR_ID ?? '',
  };
}

export async function runRetentionCli(args: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  let repository: PostgresLearningFeedbackRepository | undefined;
  try {
    const command = parseRetentionArgs(args, env);
    const connectionString = env.LEARNING_FEEDBACK_RETENTION_DATABASE_URL;
    if (!connectionString) throw new LearningFeedbackError('LEARNING_FEEDBACK_UNAVAILABLE', 'Retention requires a configured database.');
    repository = new PostgresLearningFeedbackRepository({ connectionString });
    const service = new LearningFeedbackRetentionService(repository, env.LEARNING_FEEDBACK_PSEUDONYM_KEY ?? '', env.LEARNING_FEEDBACK_PSEUDONYM_KEY_VERSION ?? 'v1');
    const summary = await service.run(command);
    process.stdout.write(`${JSON.stringify(summary)}\n`);
    return 0;
  } catch (error) {
    const code = error instanceof LearningFeedbackError ? error.code : 'LEARNING_FEEDBACK_RETENTION_FAILED';
    process.stderr.write(`${JSON.stringify({ error: { code } })}\n`);
    return 1;
  } finally {
    await repository?.close();
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runRetentionCli(process.argv.slice(2));
}
