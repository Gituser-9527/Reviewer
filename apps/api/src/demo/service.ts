import type { EvalRunReport } from '@job-compliance/core';
import type {
  AuditResult,
  Evidence,
  Finding,
  HumanReviewTicket,
  JobPostingInput,
} from '@job-compliance/shared';
import type { AuditRunStore } from '../audit/store.js';
import type { EvalStore } from '../evals/store.js';
import type { HumanReviewStore } from '../reviews/store.js';

export const demoTenantId = 'tenant_demo';

export interface DemoUser {
  id: string;
  name: string;
  role: string;
}

export interface DemoAuditCase {
  id: string;
  title: string;
  companyName: string;
  description: string;
  location: string;
  salary: string;
  employmentType: string;
  scenario: string;
}

export interface DemoSnapshot {
  tenant: {
    id: string;
    name: string;
    mode: 'demo';
  };
  users: DemoUser[];
  auditCases: DemoAuditCase[];
  auditRuns: AuditResult[];
  reviewTickets: HumanReviewTicket[];
  rules: Array<{
    id: string;
    category: string;
    severity: string;
    status: string;
    hitCount: number;
    version: string;
  }>;
  evalRuns: EvalRunReport[];
  monitoringMetrics: {
    audit_total: number;
    reject_rate: number;
    manual_review_rate: number;
    critical_finding_rate: number;
    active_alerts: number;
    p95_latency: number;
  };
  appeals: Array<{
    id: string;
    auditRunId: string;
    reasonType: string;
    status: string;
    recommendation: string;
  }>;
  qaIssues: Array<{
    id: string;
    targetType: string;
    severity: string;
    status: string;
    summary: string;
  }>;
  roiReport: {
    id: string;
    totalJobsAudited: number;
    timeSavedHours: number;
    estimatedLaborCostSaved: number;
    manualReviewRate: number;
    limitations: string[];
  };
  seededAt?: string;
}

export interface DemoServiceDependencies {
  auditRunStore: AuditRunStore;
  reviewStore: HumanReviewStore;
  evalStore: EvalStore;
}

const now = () => new Date().toISOString();

const demoEvidence: Evidence = {
  id: 'demo_ev_platform_fee_deposit',
  title: 'Demo 平台招聘规则：不得收取押金或入职费用',
  sourceType: 'PLATFORM_POLICY',
  url: 'internal://demo/platform/job-posting-rules',
  version: 'demo-2026-07',
  quote: '演示规则：岗位发布不得要求求职者缴纳押金、服装费、培训贷或其他入职前费用。',
  sourceName: 'Demo Job Posting Rules',
  sourceVersion: 'demo-2026-07',
};

function finding(input: {
  id: string;
  category: Finding['category'];
  severity: Finding['severity'];
  decision: Finding['decision'];
  title: string;
  message: string;
  suggestion: string;
  ruleId: string;
  matchedText: string;
}): Finding {
  return {
    id: input.id,
    category: input.category,
    severity: input.severity,
    decision: input.decision,
    title: input.title,
    message: input.message,
    suggestion: input.suggestion,
    ruleId: input.ruleId,
    evidence: [demoEvidence],
    evidenceIds: [demoEvidence.id],
    evidenceId: demoEvidence.id,
    confidence: 0.98,
    metadata: {
      matchedText: input.matchedText,
      demo: true,
    },
  };
}

function auditResult(input: {
  auditId: string;
  decision: AuditResult['decision'];
  riskLevel: AuditResult['riskLevel'];
  summary: string;
  findings: Finding[];
  compliantRewrite: string | null;
  createdAt: string;
}): AuditResult {
  const result: AuditResult = {
    auditId: input.auditId,
    decision: input.decision,
    riskLevel: input.riskLevel,
    summary: input.summary,
    findings: input.findings,
    evidence: [demoEvidence],
    suggestions: input.findings
      .map((item) => item.suggestion)
      .filter((suggestion): suggestion is string => suggestion !== undefined),
    compliantRewrite: input.compliantRewrite,
    context: {
      auditId: input.auditId,
      tenantId: demoTenantId,
      requestId: `req_${input.auditId}`,
      jurisdiction: 'CN_MAINLAND',
      locale: 'zh-CN',
      platform: 'demo',
      ruleVersion: 'demo-rules-1.0.0',
      lawKbVersion: 'demo-law-kb-2026-07',
      promptVersion: 'demo-prompt-1',
      modelProvider: 'mock',
      modelName: 'mock-llm',
      modelVersion: 'demo-model-1',
      evaluatedAt: input.createdAt,
    },
    checkerResults: [],
    createdAt: input.createdAt,
  };
  if (input.riskLevel !== 'NONE') {
    result.severity = input.riskLevel;
  }
  return result;
}

const demoCases: DemoAuditCase[] = [
  {
    id: 'demo_case_admin_fee',
    title: '行政专员',
    companyName: '示例未来科技有限公司',
    description: '招聘行政专员，负责办公室日常协调。限女性，已婚已育优先，入职需缴纳500元服装费。',
    location: '北京',
    salary: '8k-12k',
    employmentType: 'full_time',
    scenario: '高风险混合样本：性别/婚育限制 + 入职收费',
  },
  {
    id: 'demo_case_sales_review',
    title: '销售顾问',
    companyName: '示例云聘服务有限公司',
    description: '招聘销售顾问，负责客户沟通和方案介绍。要求形象气质佳，能接受灵活出差，薪资面议。',
    location: '上海',
    salary: '10k-18k',
    employmentType: 'full_time',
    scenario: '边界样本：表达模糊，适合人工复核演示',
  },
  {
    id: 'demo_case_engineer_pass',
    title: '前端工程师',
    companyName: '示例开源软件有限公司',
    description: '负责 Web 产品研发，与设计和后端团队协作。要求熟悉 TypeScript、React 和基础工程化实践。',
    location: '深圳',
    salary: '18k-28k',
    employmentType: 'full_time',
    scenario: '低风险正常岗位样本',
  },
];

function createDemoRuns(): AuditResult[] {
  const createdAt = now();
  return [
    auditResult({
      auditId: 'demo_audit_reject_001',
      decision: 'REJECT',
      riskLevel: 'CRITICAL',
      summary: '命中入职收费和限制性招聘条件，建议拦截并要求修改后重新提交。',
      createdAt,
      findings: [
        finding({
          id: 'demo_finding_fee_001',
          category: 'FEE_DEPOSIT',
          severity: 'CRITICAL',
          decision: 'REJECT',
          title: '疑似入职前收费',
          message: '岗位文案包含“缴纳500元服装费”，存在向求职者收取入职费用的风险。',
          suggestion: '删除服装费、押金、培训贷等入职前收费表达。',
          ruleId: 'DEMO_CN_FEE_001',
          matchedText: '入职需缴纳500元服装费',
        }),
        finding({
          id: 'demo_finding_discrimination_001',
          category: 'DISCRIMINATION',
          severity: 'HIGH',
          decision: 'MANUAL_REVIEW',
          title: '疑似性别或婚育限制',
          message: '岗位文案包含“限女性，已婚已育优先”，存在不当限制候选人的风险。',
          suggestion: '改为与岗位职责直接相关的能力要求。',
          ruleId: 'DEMO_CN_DISCRIMINATION_001',
          matchedText: '限女性，已婚已育优先',
        }),
      ],
      compliantRewrite:
        '招聘行政专员，负责办公室日常协调、会议安排、资料整理和跨部门沟通。要求具备良好的沟通能力、责任心和办公软件使用能力。公司不向候选人收取任何入职费用。',
    }),
    auditResult({
      auditId: 'demo_audit_review_001',
      decision: 'MANUAL_REVIEW',
      riskLevel: 'HIGH',
      summary: '岗位包含较模糊的筛选表达，建议人工复核确认是否与岗位职责直接相关。',
      createdAt,
      findings: [
        finding({
          id: 'demo_finding_discrimination_002',
          category: 'DISCRIMINATION',
          severity: 'HIGH',
          decision: 'MANUAL_REVIEW',
          title: '疑似隐含筛选条件',
          message: '“形象气质佳”等表达可能被理解为非岗位必要条件，建议人工确认。',
          suggestion: '替换为可验证、与岗位职责相关的沟通表达能力要求。',
          ruleId: 'DEMO_CN_DISCRIMINATION_002',
          matchedText: '形象气质佳',
        }),
      ],
      compliantRewrite:
        '招聘销售顾问，负责客户沟通、需求理解和方案介绍。要求具备清晰表达能力、客户服务意识和持续学习能力，可接受合理业务出差安排。',
    }),
    auditResult({
      auditId: 'demo_audit_pass_001',
      decision: 'PASS',
      riskLevel: 'NONE',
      summary: '未发现当前演示规则可识别的高风险表达。',
      createdAt,
      findings: [],
      compliantRewrite: null,
    }),
  ];
}

function createEvalRun(): EvalRunReport {
  return {
    id: 'demo_eval_run_001',
    datasetId: 'demo_dataset_job_postings',
    ruleVersion: 'demo-rules-1.0.0',
    lawKbVersion: 'demo-law-kb-2026-07',
    modelVersion: 'mock-demo',
    totalCases: 12,
    passedCases: 11,
    failedCases: 1,
    decisionAccuracy: 0.917,
    categoryRecall: 0.938,
    categoryPrecision: 0.9,
    criticalRecall: 1,
    falsePositiveRate: 0.04,
    falseNegativeRate: 0,
    manualReviewRate: 0.25,
    evidenceAccuracy: 0.92,
    rewriteSafetyRate: 0.96,
    failures: [
      {
        id: 'demo_eval_failure_001',
        evalRunId: 'demo_eval_run_001',
        caseId: 'demo_case_borderline_001',
        expected: { decision: 'MANUAL_REVIEW', categories: ['DISCRIMINATION'] },
        actual: { decision: 'PASS', categories: [] },
        failureType: 'FALSE_NEGATIVE',
        reason: '隐晦表达未被规则覆盖，建议补充红队样本。',
        createdAt: now(),
      },
    ],
    createdAt: now(),
  };
}

export class DemoService {
  private seededAt: string | undefined;

  constructor(private readonly dependencies: DemoServiceDependencies) {}

  async reset(): Promise<DemoSnapshot> {
    await this.dependencies.auditRunStore.deleteByTenant?.(demoTenantId);
    await this.dependencies.reviewStore.deleteByTenant?.(demoTenantId);
    await this.dependencies.evalStore.deleteDemoData?.();
    this.seededAt = undefined;
    return this.snapshot();
  }

  async seed(): Promise<DemoSnapshot> {
    await this.dependencies.auditRunStore.deleteByTenant?.(demoTenantId);
    await this.dependencies.reviewStore.deleteByTenant?.(demoTenantId);
    await this.dependencies.evalStore.deleteDemoData?.();
    const runs = createDemoRuns();
    const postings = this.demoPostings();
    const defaultPosting = postings.demo_audit_pass_001;
    if (!defaultPosting) {
      throw new Error('Demo posting demo_audit_pass_001 is missing.');
    }
    for (const run of runs) {
      const jobPosting = postings[run.auditId] ?? defaultPosting;
      await this.dependencies.auditRunStore.save(run, {
        tenantId: demoTenantId,
        jobPosting,
      });
      await this.dependencies.reviewStore.createFromAuditResult(run, jobPosting);
    }
    await this.dependencies.evalStore.createDataset({
      id: 'demo_dataset_job_postings',
      name: 'Demo 脱敏岗位评估集',
      version: 'demo-v1',
      description: '用于销售演示和内部培训的安全样本，不包含真实个人信息。',
    });
    await this.dependencies.evalStore.saveRun(createEvalRun());
    this.seededAt = now();
    return this.snapshot();
  }

  async snapshot(): Promise<DemoSnapshot> {
    const runs = await this.dependencies.auditRunStore.listByTenant(demoTenantId);
    const tickets = await this.dependencies.reviewStore.list({
      tenantId: demoTenantId,
      status: 'all',
    });
    const evalRuns = (await this.dependencies.evalStore.listRuns()).filter((run) =>
      run.id.startsWith('demo_'),
    );
    return {
      tenant: {
        id: demoTenantId,
        name: 'Demo Tenant - Safe Sample Workspace',
        mode: 'demo',
      },
      users: [
        { id: 'demo_super_admin', name: 'Demo Super Admin', role: 'SUPER_ADMIN' },
        { id: 'demo_compliance_manager', name: 'Demo Compliance Manager', role: 'COMPLIANCE_MANAGER' },
        { id: 'demo_reviewer', name: 'Demo Reviewer', role: 'REVIEWER' },
        { id: 'demo_rule_operator', name: 'Demo Rule Operator', role: 'RULE_OPERATOR' },
      ],
      auditCases: demoCases,
      auditRuns: runs,
      reviewTickets: tickets,
      rules: [
        {
          id: 'DEMO_CN_FEE_001',
          category: 'FEE_DEPOSIT',
          severity: 'CRITICAL',
          status: 'published',
          hitCount: 8,
          version: 'demo-rules-1.0.0',
        },
        {
          id: 'DEMO_CN_DISCRIMINATION_001',
          category: 'DISCRIMINATION',
          severity: 'HIGH',
          status: 'published',
          hitCount: 6,
          version: 'demo-rules-1.0.0',
        },
      ],
      evalRuns,
      monitoringMetrics: {
        audit_total: Math.max(runs.length, 24),
        reject_rate: 0.29,
        manual_review_rate: 0.25,
        critical_finding_rate: 0.18,
        active_alerts: 1,
        p95_latency: 420,
      },
      appeals: [
        {
          id: 'demo_appeal_001',
          auditRunId: 'demo_audit_reject_001',
          reasonType: '已修改文案',
          status: 'pending_human_review',
          recommendation: '建议复审员对修改后文案重新运行审核，不自动推翻原结论。',
        },
      ],
      qaIssues: [
        {
          id: 'demo_qa_issue_001',
          targetType: 'audit_run',
          severity: 'medium',
          status: 'open',
          summary: '一个隐晦表达样本未命中规则，建议加入红队集。',
        },
      ],
      roiReport: {
        id: 'demo_roi_001',
        totalJobsAudited: 120,
        timeSavedHours: 18.5,
        estimatedLaborCostSaved: 3700,
        manualReviewRate: 0.25,
        limitations: [
          '演示指标为模拟数据，不代表真实生产表现。',
          '演示样本不包含真实个人信息或真实企业数据。',
        ],
      },
      ...(this.seededAt === undefined ? {} : { seededAt: this.seededAt }),
    };
  }

  private demoPostings(): Record<string, JobPostingInput> {
    const [rejectCase, reviewCase, passCase] = demoCases;
    if (rejectCase === undefined || reviewCase === undefined || passCase === undefined) {
      throw new Error('Demo cases are not configured.');
    }
    return {
      demo_audit_reject_001: {
        externalId: 'demo_job_admin_fee',
        title: rejectCase.title,
        description: rejectCase.description,
        companyName: rejectCase.companyName,
        location: rejectCase.location,
        employmentType: 'FULL_TIME',
        salary: { text: rejectCase.salary },
      },
      demo_audit_review_001: {
        externalId: 'demo_job_sales_review',
        title: reviewCase.title,
        description: reviewCase.description,
        companyName: reviewCase.companyName,
        location: reviewCase.location,
        employmentType: 'FULL_TIME',
        salary: { text: reviewCase.salary },
      },
      demo_audit_pass_001: {
        externalId: 'demo_job_engineer_pass',
        title: passCase.title,
        description: passCase.description,
        companyName: passCase.companyName,
        location: passCase.location,
        employmentType: 'FULL_TIME',
        salary: { text: passCase.salary },
      },
    };
  }
}
