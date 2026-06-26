import type { FastifyInstance } from 'fastify';
import type { LabelingService } from '../labeling/service.js';
import { completeTrainingBodySchema, trainingStatusQuerySchema } from './schemas.js';
import type { TrainingService } from './service.js';

export interface TrainingRoutesDependencies {
  trainingService: TrainingService;
  labelingService: LabelingService;
}

const helpDocuments = [
  {
    title: '审核员培训手册',
    path: '/docs/REVIEWER_TRAINING_MANUAL.md',
    summary: '人工复核流程、反馈口径和禁止事项。',
  },
  {
    title: '运营 FAQ',
    path: '/docs/OPERATOR_FAQ.md',
    summary: 'Beta 运营、评估集和 limited enforce 常见问题。',
  },
  {
    title: '常见误判案例',
    path: '/docs/COMMON_MISJUDGMENT_CASES.md',
    summary: '岗位必要条件、收费、隐私和虚假高薪等边界样本。',
  },
  {
    title: '申诉处理指南',
    path: '/docs/HOW_TO_HANDLE_APPEALS.md',
    summary: '申诉复审流程和审慎表达要求。',
  },
  {
    title: 'Bug 反馈指南',
    path: '/docs/HOW_TO_REPORT_BUGS.md',
    summary: '反馈字段、严重度口径和隐私要求。',
  },
];

const videoPlaceholders = [
  {
    title: '5 分钟完成首次复核',
    url: 'https://example.invalid/training/reviewer-first-review',
  },
  {
    title: '如何选择反馈类型',
    url: 'https://example.invalid/training/feedback-types',
  },
  {
    title: '如何处理企业申诉',
    url: 'https://example.invalid/training/appeals',
  },
];

const onboardingChecklist = [
  '阅读审核员培训手册',
  '确认风险等级口径',
  '确认反馈类型定义',
  '完成 3 条练习样本复核',
  '确认不要提交未脱敏敏感信息',
  '点击“我已完成培训”',
];

export function registerTrainingRoutes(
  app: FastifyInstance,
  dependencies: TrainingRoutesDependencies,
): void {
  app.get('/api/help-center', async (_request, reply) => {
    const reference = dependencies.labelingService.getReference();
    return reply.send({
      documents: helpDocuments,
      riskLevels: reference.riskLevels,
      feedbackTypes: reference.feedbackTypes,
      videoPlaceholders,
      onboardingChecklist,
      commonMisjudgmentCases: [
        '岗位必要条件不等于歧视，需检查是否与履职无关。',
        '提供工服不等于收取服装费，需检查是否由劳动者承担费用。',
        '简历投递邮箱通常不是隐私过度收集。',
        '高薪范围不必然虚假，需结合夸大承诺话术。',
        '改写后仍有高风险词，应标记 BAD_REWRITE。',
      ],
    });
  });

  app.get('/api/training/status', async (request, reply) => {
    const query = trainingStatusQuerySchema.parse(request.query);
    const completion = dependencies.trainingService.getCompletion({
      reviewerId: query.reviewerId,
      ...(query.tenantId === undefined ? {} : { tenantId: query.tenantId }),
    });
    return reply.send({
      reviewerId: query.reviewerId,
      ...(query.tenantId === undefined ? {} : { tenantId: query.tenantId }),
      completed: completion?.completed ?? false,
      completion,
    });
  });

  app.post('/api/training/complete', async (request, reply) => {
    const body = completeTrainingBodySchema.parse(request.body);
    const completion = dependencies.trainingService.markCompleted({
      reviewerId: body.reviewerId,
      ...(body.tenantId === undefined ? {} : { tenantId: body.tenantId }),
      documentVersion: body.documentVersion,
    });
    return reply.code(201).send(completion);
  });
}
