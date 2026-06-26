import Fastify, { type FastifyInstance } from 'fastify';
import { PostgresAuditRunRepository, PostgresEvalRepository } from '@job-compliance/database';
import type { HealthResponse } from '@job-compliance/shared';
import { ZodError } from 'zod';
import { DatabaseAuditRunStore } from './audit/database-store.js';
import { registerAuditRoutes, type AuditJobHandler } from './audit/routes.js';
import { InMemoryAuditRunStore, type AuditRunStore } from './audit/store.js';
import { registerAppealRoutes } from './appeals/routes.js';
import { InMemoryAppealStore } from './appeals/store.js';
import { registerAuthRoutes } from './auth/routes.js';
import { AuthorizationError, createAuthServices, type AuthServices } from './auth/service.js';
import { registerBetaProgramRoutes } from './beta-program/routes.js';
import { BetaProgramService } from './beta-program/service.js';
import { registerBetaTrialRoutes } from './beta-trial/routes.js';
import { BetaTrialService } from './beta-trial/service.js';
import { registerEvalRoutes } from './evals/routes.js';
import { InMemoryEvalStore, RepositoryEvalStore, type EvalStore } from './evals/store.js';
import { registerIncidentRoutes } from './incidents/routes.js';
import { IncidentResponseService } from './incidents/service.js';
import { registerIntegrationRoutes } from './integrations/routes.js';
import { IntegrationApiError, IntegrationService } from './integrations/service.js';
import { registerLabelingRoutes } from './labeling/routes.js';
import { LabelingService } from './labeling/service.js';
import { registerLaunchSecurityRoutes } from './launch-check/routes.js';
import { LaunchSecurityComplianceService } from './launch-check/service.js';
import { registerKnowledgeUpdateRoutes } from './knowledge-update/routes.js';
import { LawKbUpdateService } from './knowledge-update/service.js';
import { registerOperationalLogging, type ReadinessCheck, sendMetrics } from './operations.js';
import { registerPerformanceRoutes } from './performance/routes.js';
import { createPerformanceServices, RateLimitError, type PerformanceServices } from './performance/service.js';
import { registerPilotRoutes } from './pilot/routes.js';
import { PilotRoiService } from './pilot/service.js';
import { registerProductRoutes } from './product/routes.js';
import { ProductApiError, ProductService } from './product/service.js';
import { registerQaRoutes } from './qa/routes.js';
import { QaInspectionService } from './qa/service.js';
import { registerReleaseRoutes } from './releases/routes.js';
import { ReleaseQualityGateService } from './releases/service.js';
import { DatabaseHumanReviewStore } from './reviews/database-store.js';
import { registerReviewRoutes } from './reviews/routes.js';
import { InMemoryHumanReviewStore, type HumanReviewStore } from './reviews/store.js';
import { registerRuleRoutes } from './rules/routes.js';
import { RuleManagementError, type FileRuleManagementStore } from './rules/store.js';
import { registerRuntimeRoutes } from './runtime/routes.js';
import { createRuntimeServices, type RuntimeServices } from './runtime/services.js';
import { registerTrainingRoutes } from './training/routes.js';
import { TrainingService } from './training/service.js';
import { registerUatRoutes } from './uat/routes.js';
import { UatAcceptanceService } from './uat/service.js';

const serviceName = 'job-compliance-api';

function healthPayload(checks?: HealthResponse['checks']): HealthResponse {
  const degraded = checks !== undefined && Object.values(checks).some((status) => status !== 'ok');
  return {
    service: serviceName,
    status: degraded ? 'degraded' : 'ok',
    timestamp: new Date().toISOString(),
    ...(checks === undefined ? {} : { checks }),
  };
}

/** Optional dependencies used to isolate API tests and future persistence adapters. */
export interface BuildAppOptions {
  /** Process-local or persistent audit run store. */
  auditRunStore?: AuditRunStore;
  /** Optional core audit handler override. */
  auditJob?: AuditJobHandler;
  /** Process-local or persistent human review store. */
  reviewStore?: HumanReviewStore;
  /** Process-local or persistent evaluation store. */
  evalStore?: EvalStore;
  /** Optional readiness checks used by tests or future infrastructure adapters. */
  readinessChecks?: ReadinessCheck[];
  /** Optional rule management store used by tests or future persistence adapters. */
  ruleStore?: FileRuleManagementStore;
  /** Optional runtime services used by tests or future persistence adapters. */
  runtimeServices?: RuntimeServices;
  /** Optional beta trial service used by tests or future persistence adapters. */
  betaTrialService?: BetaTrialService;
  /** Optional labeling service used by tests or future persistence adapters. */
  labelingService?: LabelingService;
  /** Optional auth, RBAC and audit logging services. */
  authServices?: AuthServices;
  /** Optional launch security compliance service used by tests or future persistence adapters. */
  launchSecurityService?: LaunchSecurityComplianceService;
  /** Optional appeal store used by tests or future persistence adapters. */
  appealStore?: InMemoryAppealStore;
  /** Optional productization service used by tests or future persistence adapters. */
  productService?: ProductService;
  /** Optional law KB update service used by tests or future persistence adapters. */
  lawKbUpdateService?: LawKbUpdateService;
  /** Optional release quality gate service used by tests or future persistence adapters. */
  releaseGateService?: ReleaseQualityGateService;
  /** Optional performance, queue, cache, rate-limit and cost services. */
  performanceServices?: PerformanceServices;
  /** Optional stable external integration layer service. */
  integrationService?: IntegrationService;
  /** Optional QA inspection service used by tests or future persistence adapters. */
  qaInspectionService?: QaInspectionService;
  /** Optional customer pilot and ROI service used by tests or future persistence adapters. */
  pilotRoiService?: PilotRoiService;
  /** Optional Beta launch delivery service used by tests or future persistence adapters. */
  betaProgramService?: BetaProgramService;
  /** Optional reviewer training service used by tests or future persistence adapters. */
  trainingService?: TrainingService;
  /** Optional incident response and emergency switch service. */
  incidentResponseService?: IncidentResponseService;
  /** Optional UAT acceptance service used by tests or future persistence adapters. */
  uatAcceptanceService?: UatAcceptanceService;
}

interface DefaultStores {
  auditRunStore: AuditRunStore;
  reviewStore: HumanReviewStore;
  evalStore: EvalStore;
  readinessChecks: ReadinessCheck[];
}

function createDefaultStores(): DefaultStores {
  if (process.env.DATABASE_URL === undefined || process.env.DATABASE_URL.trim() === '') {
    return {
      auditRunStore: new InMemoryAuditRunStore(),
      reviewStore: new InMemoryHumanReviewStore(),
      evalStore: new InMemoryEvalStore(),
      readinessChecks: [
        {
          name: 'storage',
          check: async () => true,
        },
      ],
    };
  }
  const repository = new PostgresAuditRunRepository({ connectionString: process.env.DATABASE_URL });
  const evalRepository = new PostgresEvalRepository({ connectionString: process.env.DATABASE_URL });
  return {
    auditRunStore: new DatabaseAuditRunStore(repository),
    reviewStore: new DatabaseHumanReviewStore(repository),
    evalStore: new RepositoryEvalStore(evalRepository),
    readinessChecks: [
      {
        name: 'postgres',
        check: async () => (await repository.healthCheck()).status === 'up',
      },
    ],
  };
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: process.env.NODE_ENV === 'test' ? false : { level: process.env.LOG_LEVEL ?? 'info' },
    disableRequestLogging: true,
  });
  let auditRunStore: AuditRunStore;
  let reviewStore: HumanReviewStore;
  let evalStore: EvalStore;
  let readinessChecks: ReadinessCheck[];
  if (
    options.auditRunStore !== undefined &&
    options.reviewStore !== undefined &&
    options.evalStore !== undefined
  ) {
    auditRunStore = options.auditRunStore;
    reviewStore = options.reviewStore;
    evalStore = options.evalStore;
    readinessChecks = options.readinessChecks ?? [];
  } else {
    const defaultStores = createDefaultStores();
    auditRunStore = options.auditRunStore ?? defaultStores.auditRunStore;
    reviewStore = options.reviewStore ?? defaultStores.reviewStore;
    evalStore = options.evalStore ?? defaultStores.evalStore;
    readinessChecks = options.readinessChecks ?? defaultStores.readinessChecks;
  }

  const runtimeServices = options.runtimeServices ?? createRuntimeServices();
  const betaTrialService = options.betaTrialService ?? new BetaTrialService();
  const betaProgramService = options.betaProgramService ?? new BetaProgramService();
  const trainingService = options.trainingService ?? new TrainingService();
  const incidentResponseService =
    options.incidentResponseService ?? new IncidentResponseService();
  const uatAcceptanceService =
    options.uatAcceptanceService ?? new UatAcceptanceService(betaProgramService);
  const labelingService = options.labelingService ?? new LabelingService();
  const authServices = options.authServices ?? createAuthServices();
  const launchSecurityService =
    options.launchSecurityService ?? new LaunchSecurityComplianceService();
  const appealStore = options.appealStore ?? new InMemoryAppealStore();
  const productService = options.productService ?? new ProductService();
  const lawKbUpdateService = options.lawKbUpdateService ?? new LawKbUpdateService();
  const performanceServices = options.performanceServices ?? createPerformanceServices();
  const integrationService = options.integrationService ?? new IntegrationService(productService);
  const qaInspectionService =
    options.qaInspectionService ??
    new QaInspectionService({
      auditRunStore,
      reviewStore,
      evalStore,
      appealStore,
    });
  const pilotRoiService =
    options.pilotRoiService ??
    new PilotRoiService({
      auditRunStore,
      betaTrialService,
    });
  const releaseGateService =
    options.releaseGateService ??
    new ReleaseQualityGateService({
      evalStore,
      runtimeServices,
    });

  registerOperationalLogging(app);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        requestId: request.id,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed.',
          retryable: false,
          details: error.issues.map((issue) => ({
            field: issue.path.join('.'),
            reason: issue.message,
          })),
        },
      });
    }

    if (error instanceof RuleManagementError) {
      const statusCode =
        error.code === 'RULE_NOT_FOUND' ? 404 : error.code === 'EVAL_FAILED' ? 422 : 400;
      return reply.code(statusCode).send({
        requestId: request.id,
        error: {
          code: error.code,
          message: error.message,
          retryable: error.code === 'EVAL_FAILED',
        },
      });
    }

    if (error instanceof AuthorizationError) {
      return reply.code(403).send({
        requestId: request.id,
        error: {
          code: error.code,
          message: error.message,
          retryable: false,
        },
      });
    }

    if (error instanceof ProductApiError) {
      return reply.code(error.statusCode).send({
        requestId: request.id,
        error: {
          code: error.code,
          message: error.message,
          retryable: error.code === 'QUOTA_EXCEEDED',
        },
      });
    }

    if (error instanceof IntegrationApiError) {
      return reply.code(error.statusCode).send({
        requestId: request.id,
        error: {
          code: error.code,
          message: error.message,
          retryable: false,
        },
      });
    }

    if (error instanceof RateLimitError) {
      return reply.code(429).send({
        requestId: request.id,
        error: {
          code: error.code,
          message: error.message,
          retryable: true,
        },
      });
    }

    request.log.error({ err: error }, 'Unhandled request error');
    return reply.code(500).send({
      requestId: request.id,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'The audit request could not be completed.',
        retryable: false,
      },
    });
  });

  app.get('/health', async () => healthPayload());
  app.get('/health/live', async () => healthPayload());
  app.get('/health/ready', async (_request, reply) => {
    const entries = await Promise.all(
      readinessChecks.map(async (dependency) => {
        const ok = await dependency.check().catch(() => false);
        return [dependency.name, ok ? 'ok' : 'degraded'] as const;
      }),
    );
    const checks = Object.fromEntries(entries);
    const payload = healthPayload(checks);
    return reply.code(payload.status === 'ok' ? 200 : 503).send(payload);
  });
  app.get('/metrics', async (_request, reply) => sendMetrics(reply));

  registerAuthRoutes(app, authServices);

  registerAuditRoutes(app, {
    store: auditRunStore,
    reviewStore,
    runtimeServices,
    betaTrialService,
    authServices,
    productService,
    performanceServices,
    incidentResponseService,
    ...(options.auditJob === undefined ? {} : { auditJob: options.auditJob }),
  });

  registerReviewRoutes(app, {
    auditRunStore,
    reviewStore,
    evalStore,
    betaTrialService,
    labelingService,
    authServices,
  });

  registerRuleRoutes(app, {
    ...(options.ruleStore === undefined ? {} : { store: options.ruleStore }),
    authServices,
  });

  registerRuntimeRoutes(app, runtimeServices, authServices);

  registerIncidentRoutes(app, {
    service: incidentResponseService,
    authServices,
  });

  registerBetaTrialRoutes(app, { betaTrialService });

  registerBetaProgramRoutes(app, {
    service: betaProgramService,
    authServices,
  });

  registerTrainingRoutes(app, {
    trainingService,
    labelingService,
  });

  registerLabelingRoutes(app, {
    reviewStore,
    labelingService,
  });

  registerEvalRoutes(app, {
    evalStore,
    reviewStore,
    authServices,
  });

  registerAppealRoutes(app, {
    auditRunStore,
    evalStore,
    appealStore,
    authServices,
  });

  registerProductRoutes(app, {
    productService,
    auditRunStore,
    reviewStore,
    runtimeServices,
    betaTrialService,
    authServices,
    ...(options.auditJob === undefined ? {} : { auditJob: options.auditJob }),
  });

  registerPerformanceRoutes(app, {
    services: performanceServices,
    auditRunStore,
    reviewStore,
    runtimeServices,
    betaTrialService,
    authServices,
    productService,
    ...(options.auditJob === undefined ? {} : { auditJob: options.auditJob }),
  });

  registerIntegrationRoutes(app, {
    integrationService,
    productService,
    performanceServices,
    auditRunStore,
    reviewStore,
    runtimeServices,
    betaTrialService,
    ...(options.auditJob === undefined ? {} : { auditJob: options.auditJob }),
  });

  registerKnowledgeUpdateRoutes(app, {
    service: lawKbUpdateService,
    evalStore,
    runtimeServices,
    authServices,
  });

  registerLaunchSecurityRoutes(app, {
    service: launchSecurityService,
    auditRunStore,
    authServices,
  });

  registerReleaseRoutes(app, {
    service: releaseGateService,
    authServices,
  });

  registerQaRoutes(app, {
    service: qaInspectionService,
    authServices,
  });

  registerPilotRoutes(app, {
    service: pilotRoiService,
    authServices,
  });

  registerUatRoutes(app, {
    service: uatAcceptanceService,
    authServices,
  });

  app.addHook('onClose', async () => {
    await auditRunStore.close?.();
    await reviewStore.close?.();
    await evalStore.close?.();
  });

  return app;
}
