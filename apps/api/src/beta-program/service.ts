import { randomUUID } from 'node:crypto';
import { redactSensitiveText } from '@job-compliance/database';

export const betaProgramModes = ['shadow', 'assist', 'limited_enforce'] as const;
export type BetaProgramMode = (typeof betaProgramModes)[number];
export type BetaProgramStatus = 'draft' | 'active' | 'paused' | 'completed';
export type BetaParticipantRole = 'reviewer' | 'operator' | 'compliance' | 'observer';
export type BetaFeedbackType =
  | 'bug'
  | 'false_positive'
  | 'false_negative'
  | 'bad_evidence'
  | 'bad_rewrite'
  | 'ux_issue'
  | 'process_gap'
  | 'other';
export type BetaFeedbackStatus = 'open' | 'triaged' | 'resolved';
export type GoNoGoStatus = 'pending' | 'pass' | 'fail' | 'waived';

export interface BetaProgram {
  id: string;
  tenantId: string;
  name: string;
  status: BetaProgramStatus;
  mode: BetaProgramMode;
  startDate: string;
  endDate: string;
  scope: string;
  goals: string[];
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface BetaParticipant {
  id: string;
  programId: string;
  tenantId: string;
  userId: string;
  displayName: string;
  role: BetaParticipantRole;
  email?: string;
  active: boolean;
  createdAt: string;
}

export interface BetaFeedback {
  id: string;
  programId: string;
  tenantId: string;
  reporterId: string;
  feedbackType: BetaFeedbackType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: BetaFeedbackStatus;
  title: string;
  description: string;
  relatedAuditRunId?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface BetaDailyReport {
  id: string;
  programId: string;
  tenantId: string;
  reportDate: string;
  activeParticipants: number;
  auditsReviewed: number;
  manualReviewsCompleted: number;
  feedbackOpened: number;
  feedbackResolved: number;
  blockers: string[];
  summary: string;
  nextActions: string[];
  createdBy: string;
  createdAt: string;
}

export interface BetaGoNoGoCheck {
  id: string;
  programId: string;
  tenantId: string;
  checkKey: string;
  title: string;
  required: boolean;
  status: GoNoGoStatus;
  ownerRole: BetaParticipantRole | 'system';
  evidence?: string;
  updatedAt: string;
}

export interface CreateBetaProgramInput {
  tenantId: string;
  name: string;
  mode?: BetaProgramMode;
  startDate: string;
  endDate: string;
  scope?: string;
  goals?: string[];
  ownerId?: string;
}

export interface AddBetaParticipantInput {
  userId: string;
  displayName: string;
  role: BetaParticipantRole;
  email?: string;
}

export interface AddBetaFeedbackInput {
  reporterId: string;
  feedbackType: BetaFeedbackType;
  severity?: BetaFeedback['severity'];
  title: string;
  description: string;
  relatedAuditRunId?: string;
}

export interface CreateBetaDailyReportInput {
  reportDate?: string;
  auditsReviewed?: number;
  manualReviewsCompleted?: number;
  blockers?: string[];
  summary?: string;
  nextActions?: string[];
  createdBy?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function today(): string {
  return nowIso().slice(0, 10);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

const defaultGoNoGoChecks = [
  {
    checkKey: 'core_flow_ready',
    title: '核心审核流程可用',
    ownerRole: 'operator',
  },
  {
    checkKey: 'review_sop_trained',
    title: '审核员已阅读 SOP 和标注指南',
    ownerRole: 'reviewer',
  },
  {
    checkKey: 'privacy_redaction_ready',
    title: '日志和反馈默认脱敏',
    ownerRole: 'compliance',
  },
  {
    checkKey: 'escalation_channel_ready',
    title: '升级处理通道已明确',
    ownerRole: 'compliance',
  },
  {
    checkKey: 'known_limitations_acknowledged',
    title: '已确认已知限制和禁用场景',
    ownerRole: 'operator',
  },
] as const;

export class BetaProgramService {
  private readonly programs = new Map<string, BetaProgram>();
  private readonly participants = new Map<string, BetaParticipant>();
  private readonly feedback = new Map<string, BetaFeedback>();
  private readonly dailyReports = new Map<string, BetaDailyReport>();
  private readonly checks = new Map<string, BetaGoNoGoCheck>();

  createProgram(input: CreateBetaProgramInput): BetaProgram {
    const timestamp = nowIso();
    const program: BetaProgram = {
      id: `beta_program_${randomUUID()}`,
      tenantId: input.tenantId,
      name: redactSensitiveText(input.name),
      status: 'active',
      mode: input.mode ?? 'shadow',
      startDate: input.startDate,
      endDate: input.endDate,
      scope: redactSensitiveText(input.scope ?? '受控岗位审核试运行'),
      goals: (input.goals ?? ['验证审核准确性', '评估人工提效', '收集流程反馈']).map((goal) =>
        redactSensitiveText(goal),
      ),
      ownerId: input.ownerId ?? 'beta_owner',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.programs.set(program.id, clone(program));
    for (const check of defaultGoNoGoChecks) {
      const record: BetaGoNoGoCheck = {
        id: `beta_check_${randomUUID()}`,
        programId: program.id,
        tenantId: program.tenantId,
        checkKey: check.checkKey,
        title: check.title,
        required: true,
        status: 'pending',
        ownerRole: check.ownerRole,
        updatedAt: timestamp,
      };
      this.checks.set(record.id, clone(record));
    }
    return clone(program);
  }

  listPrograms(options: { tenantId?: string } = {}): BetaProgram[] {
    return [...this.programs.values()]
      .filter((program) => options.tenantId === undefined || program.tenantId === options.tenantId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(clone);
  }

  findProgram(id: string): BetaProgram | undefined {
    const program = this.programs.get(id);
    return program === undefined ? undefined : clone(program);
  }

  setMode(programId: string, mode: BetaProgramMode): BetaProgram | undefined {
    const program = this.programs.get(programId);
    if (program === undefined) return undefined;
    const updated: BetaProgram = {
      ...program,
      mode,
      updatedAt: nowIso(),
    };
    this.programs.set(programId, clone(updated));
    return clone(updated);
  }

  addParticipant(programId: string, input: AddBetaParticipantInput): BetaParticipant | undefined {
    const program = this.programs.get(programId);
    if (program === undefined) return undefined;
    const participant: BetaParticipant = {
      id: `beta_participant_${randomUUID()}`,
      programId,
      tenantId: program.tenantId,
      userId: input.userId,
      displayName: redactSensitiveText(input.displayName),
      role: input.role,
      ...(input.email === undefined ? {} : { email: redactSensitiveText(input.email) }),
      active: true,
      createdAt: nowIso(),
    };
    this.participants.set(participant.id, clone(participant));
    return clone(participant);
  }

  listParticipants(programId: string): BetaParticipant[] {
    return [...this.participants.values()]
      .filter((participant) => participant.programId === programId)
      .sort((left, right) => left.displayName.localeCompare(right.displayName))
      .map(clone);
  }

  addFeedback(programId: string, input: AddBetaFeedbackInput): BetaFeedback | undefined {
    const program = this.programs.get(programId);
    if (program === undefined) return undefined;
    const feedback: BetaFeedback = {
      id: `beta_feedback_${randomUUID()}`,
      programId,
      tenantId: program.tenantId,
      reporterId: input.reporterId,
      feedbackType: input.feedbackType,
      severity: input.severity ?? 'medium',
      status: 'open',
      title: redactSensitiveText(input.title),
      description: redactSensitiveText(input.description),
      ...(input.relatedAuditRunId === undefined ? {} : { relatedAuditRunId: input.relatedAuditRunId }),
      createdAt: nowIso(),
    };
    this.feedback.set(feedback.id, clone(feedback));
    return clone(feedback);
  }

  listFeedback(options: { programId?: string; tenantId?: string; status?: BetaFeedbackStatus | 'all' } = {}): BetaFeedback[] {
    const status = options.status ?? 'all';
    return [...this.feedback.values()]
      .filter((item) => options.programId === undefined || item.programId === options.programId)
      .filter((item) => options.tenantId === undefined || item.tenantId === options.tenantId)
      .filter((item) => status === 'all' || item.status === status)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(clone);
  }

  createDailyReport(
    programId: string,
    input: CreateBetaDailyReportInput = {},
  ): BetaDailyReport | undefined {
    const program = this.programs.get(programId);
    if (program === undefined) return undefined;
    const reportDate = input.reportDate ?? today();
    const participants = this.listParticipants(programId).filter((participant) => participant.active);
    const feedback = this.listFeedback({ programId });
    const openedToday = feedback.filter((item) => item.createdAt.slice(0, 10) === reportDate);
    const resolvedToday = openedToday.filter((item) => item.status === 'resolved');
    const report: BetaDailyReport = {
      id: `beta_daily_report_${randomUUID()}`,
      programId,
      tenantId: program.tenantId,
      reportDate,
      activeParticipants: participants.length,
      auditsReviewed: input.auditsReviewed ?? 0,
      manualReviewsCompleted: input.manualReviewsCompleted ?? 0,
      feedbackOpened: openedToday.length,
      feedbackResolved: resolvedToday.length,
      blockers: (input.blockers ?? []).map((blocker) => redactSensitiveText(blocker)),
      summary: redactSensitiveText(
        input.summary ??
          `Beta ${program.name} ${reportDate} 日报：当前模式 ${program.mode}，开放反馈 ${openedToday.length} 条。`,
      ),
      nextActions: (input.nextActions ?? ['继续收集人工反馈并复盘高风险样本']).map((action) =>
        redactSensitiveText(action),
      ),
      createdBy: input.createdBy ?? 'beta_operator',
      createdAt: nowIso(),
    };
    this.dailyReports.set(report.id, clone(report));
    return clone(report);
  }

  listDailyReports(programId: string): BetaDailyReport[] {
    return [...this.dailyReports.values()]
      .filter((report) => report.programId === programId)
      .sort((left, right) => right.reportDate.localeCompare(left.reportDate))
      .map(clone);
  }

  listGoNoGoChecks(programId: string): BetaGoNoGoCheck[] {
    return [...this.checks.values()]
      .filter((check) => check.programId === programId)
      .sort((left, right) => left.checkKey.localeCompare(right.checkKey))
      .map(clone);
  }

  updateGoNoGoCheck(
    programId: string,
    checkId: string,
    input: {
      status: GoNoGoStatus;
      evidence?: string;
    },
  ): BetaGoNoGoCheck | undefined {
    const check = this.checks.get(checkId);
    if (check === undefined || check.programId !== programId) return undefined;
    const updated: BetaGoNoGoCheck = {
      ...check,
      status: input.status,
      ...(input.evidence === undefined ? {} : { evidence: redactSensitiveText(input.evidence) }),
      updatedAt: nowIso(),
    };
    this.checks.set(checkId, clone(updated));
    return clone(updated);
  }

  getOverview(programId: string):
    | {
        program: BetaProgram;
        participants: BetaParticipant[];
        feedback: BetaFeedback[];
        dailyReports: BetaDailyReport[];
        goNoGoChecks: BetaGoNoGoCheck[];
        goNoGoSummary: {
          total: number;
          passed: number;
          failed: number;
          pending: number;
          ready: boolean;
        };
      }
    | undefined {
    const program = this.programs.get(programId);
    if (program === undefined) return undefined;
    const checks = this.listGoNoGoChecks(programId);
    const failed = checks.filter((check) => check.status === 'fail').length;
    const pending = checks.filter((check) => check.required && check.status === 'pending').length;
    const passed = checks.filter((check) => check.status === 'pass' || check.status === 'waived').length;
    return {
      program: clone(program),
      participants: this.listParticipants(programId),
      feedback: this.listFeedback({ programId }),
      dailyReports: this.listDailyReports(programId),
      goNoGoChecks: checks,
      goNoGoSummary: {
        total: checks.length,
        passed,
        failed,
        pending,
        ready: failed === 0 && pending === 0,
      },
    };
  }
}
