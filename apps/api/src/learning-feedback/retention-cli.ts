import { pathToFileURL } from 'node:url';
import { PostgresLearningFeedbackRepository } from '@job-compliance/database';
import { LearningFeedbackError } from './service.js';
import { LearningFeedbackRetentionService, type RetentionCommand } from './retention.js';

export function parseRetentionArgs(args: string[], env: NodeJS.ProcessEnv = process.env): RetentionCommand {
  const mode = args[0] === 'execute' ? 'EXECUTE' : args[0] === 'dry-run' ? 'DRY_RUN' : undefined;
  if (mode === undefined) throw new LearningFeedbackError('LEARNING_FEEDBACK_UNAVAILABLE', 'Retention mode must be dry-run or execute.');
  const value = (flag: string) => { const index = args.indexOf(flag); return index === -1 ? undefined : args[index + 1]; };
  const tenantId = value('--tenant-id') ?? '';
  const limitValue = value('--limit') ?? '100';
  const cutoffValue = value('--cutoff');
  return {
    mode,
    tenantId,
    cutoff: cutoffValue === undefined ? new Date() : new Date(cutoffValue),
    batchLimit: Number(limitValue),
    actorUserId: env.LEARNING_FEEDBACK_RETENTION_ACTOR_ID ?? '',
    confirm: args.includes('--confirm'),
    executeEnabled: env.LEARNING_FEEDBACK_RETENTION_EXECUTE_ENABLED === 'true',
  };
}

export async function runRetentionCli(args: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  let repository: PostgresLearningFeedbackRepository | undefined;
  try {
    const command = parseRetentionArgs(args, env);
    const connectionString = env.TEST_DATABASE_URL ?? env.DATABASE_URL;
    if (!connectionString) throw new LearningFeedbackError('LEARNING_FEEDBACK_UNAVAILABLE', 'Retention requires a configured database.');
    repository = new PostgresLearningFeedbackRepository({ connectionString });
    const service = new LearningFeedbackRetentionService(repository, env.LEARNING_FEEDBACK_PSEUDONYM_KEY ?? '', env.LEARNING_FEEDBACK_PSEUDONYM_KEY_VERSION ?? 'v1');
    const summary = await service.run(command);
    process.stdout.write(`${JSON.stringify(summary)}\n`);
    return summary.anomalyCount > 0 ? 2 : 0;
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
