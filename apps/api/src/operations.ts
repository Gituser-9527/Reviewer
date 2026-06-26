import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/** Operational dependency checked by the readiness endpoint. */
export interface ReadinessCheck {
  /** Stable dependency name exposed in readiness output. */
  name: string;
  /** Returns true when the dependency can serve production traffic. */
  check: () => Promise<boolean>;
}

interface MetricsState {
  requestsTotal: number;
  responsesTotal: number;
  errorsTotal: number;
  startedAt: number;
}

const requestStarts = new WeakMap<FastifyRequest, bigint>();

/** In-process metrics used until a dedicated telemetry backend is introduced. */
export const metricsState: MetricsState = {
  requestsTotal: 0,
  responsesTotal: 0,
  errorsTotal: 0,
  startedAt: Date.now(),
};

/** Registers sanitized request and error logging hooks. */
export function registerOperationalLogging(app: FastifyInstance): void {
  app.addHook('onRequest', async (request) => {
    metricsState.requestsTotal += 1;
    requestStarts.set(request, process.hrtime.bigint());
    request.log.info(
      {
        requestId: request.id,
        method: request.method,
        url: request.url,
      },
      'request received',
    );
  });

  app.addHook('onResponse', async (request, reply) => {
    metricsState.responsesTotal += 1;
    const durationMs = elapsedMs(request);
    request.log.info(
      {
        requestId: request.id,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        durationMs,
      },
      'request completed',
    );
  });

  app.addHook('onError', async (request, reply, error) => {
    metricsState.errorsTotal += 1;
    request.log.error(
      {
        requestId: request.id,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        err: error,
      },
      'request failed',
    );
  });
}

/** Renders a Prometheus-compatible metrics placeholder. */
export function renderMetrics(): string {
  const uptimeSeconds = Math.floor((Date.now() - metricsState.startedAt) / 1000);
  return [
    '# HELP job_compliance_api_requests_total Total API requests received.',
    '# TYPE job_compliance_api_requests_total counter',
    `job_compliance_api_requests_total ${metricsState.requestsTotal}`,
    '# HELP job_compliance_api_responses_total Total API responses sent.',
    '# TYPE job_compliance_api_responses_total counter',
    `job_compliance_api_responses_total ${metricsState.responsesTotal}`,
    '# HELP job_compliance_api_errors_total Total API request errors.',
    '# TYPE job_compliance_api_errors_total counter',
    `job_compliance_api_errors_total ${metricsState.errorsTotal}`,
    '# HELP job_compliance_api_uptime_seconds API process uptime in seconds.',
    '# TYPE job_compliance_api_uptime_seconds gauge',
    `job_compliance_api_uptime_seconds ${uptimeSeconds}`,
    '',
  ].join('\n');
}

/** Sends the metrics payload with an explicit text content type. */
export function sendMetrics(reply: FastifyReply): FastifyReply {
  return reply.type('text/plain; version=0.0.4; charset=utf-8').send(renderMetrics());
}

function elapsedMs(request: FastifyRequest): number {
  const startedAt = requestStarts.get(request);
  if (startedAt === undefined) return 0;
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
}
