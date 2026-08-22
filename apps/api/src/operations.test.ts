import { Writable } from 'node:stream';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerOperationalLogging, safeErrorLogDetails } from './operations.js';

describe('safeErrorLogDetails', () => {
  it('keeps only whitelisted PostgreSQL metadata and excludes payload-bearing error fields', () => {
    const marker = 'LEARNING_SECRET_MARKER_173';
    const error = new Error(`query failed params: ${marker}`, {
      cause: {
        code: '23505',
        constraint: 'learning_feedback_idempotency_idx',
        detail: `payload=${marker}`,
        query: `insert ${marker}`,
      },
    });

    const details = safeErrorLogDetails(error);
    expect(details).toEqual({
      errorType: 'DATABASE_ERROR',
      code: '23505',
      constraint: 'learning_feedback_idempotency_idx',
    });
    expect(JSON.stringify(details)).not.toContain(marker);
  });

  it('does not write a payload marker to actual Fastify error logs', async () => {
    const marker = 'LEARNING_SECRET_MARKER_173';
    let logs = '';
    const stream = new Writable({ write(chunk, _encoding, callback) { logs += chunk.toString(); callback(); } });
    const app = Fastify({ logger: { level: 'error', stream } as never, disableRequestLogging: true });
    registerOperationalLogging(app);
    app.get('/controlled-database-error', async () => {
      throw new Error(`payload=${marker}`, { cause: { code: '23505', constraint: 'learning_feedback_idempotency_idx', detail: marker } });
    });
    app.setErrorHandler((_error, _request, reply) => reply.code(500).send({ error: 'safe' }));
    const response = await app.inject({ method: 'GET', url: '/controlled-database-error' });
    await app.close();
    expect(response.statusCode).toBe(500);
    expect(logs).toContain('23505');
    expect(logs).toContain('learning_feedback_idempotency_idx');
    expect(logs).not.toContain(marker);
  });
});
