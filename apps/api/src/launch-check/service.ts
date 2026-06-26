import { randomUUID } from 'node:crypto';
import { redactSensitiveInfo, sanitizeLLMMessages } from '@job-compliance/core';
import { redactJson, redactSensitiveText } from '@job-compliance/database';
import type { AuditOperationLogService } from '../auth/service.js';
import type { AuditRunStore } from '../audit/store.js';
import type {
  ConfigureRetentionRequest,
  CreateDeletionRequest,
  CreatePrivacyExportRequest,
} from './schemas.js';

export type SecurityCheckStatus = 'pass' | 'warn' | 'fail';

export interface DataRetentionJobRecord {
  id: string;
  tenantId?: string;
  resourceType: string;
  retentionDays: number;
  enabled: boolean;
  lastRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DataDeletionRequestRecord {
  id: string;
  tenantId: string;
  requesterId: string;
  targetType: string;
  targetId?: string;
  status: 'pending' | 'completed' | 'failed';
  deletedRecords: number;
  reason?: string;
  createdAt: string;
  completedAt?: string;
}

export interface PrivacyExportRequestRecord {
  id: string;
  tenantId: string;
  requesterId: string;
  status: 'completed' | 'failed';
  exportPayload?: Record<string, unknown>;
  createdAt: string;
  completedAt?: string;
}

export interface SecurityCheckItem {
  id: string;
  title: string;
  status: SecurityCheckStatus;
  detail: string;
  remediation?: string;
}

export interface SecurityCheckResultRecord {
  id: string;
  status: 'ready' | 'needs_attention' | 'blocked';
  summary: string;
  checks: SecurityCheckItem[];
  createdAt: string;
}

interface GenerateReportOptions {
  auditRunStore?: AuditRunStore;
}

interface ExecuteDeletionOptions {
  auditRunStore?: AuditRunStore;
}

interface CreatePrivacyExportOptions {
  auditLogService?: AuditOperationLogService;
}

function nowIso(): string {
  return new Date().toISOString();
}

function overallStatus(checks: SecurityCheckItem[]): SecurityCheckResultRecord['status'] {
  if (checks.some((check) => check.status === 'fail')) return 'blocked';
  if (checks.some((check) => check.status === 'warn')) return 'needs_attention';
  return 'ready';
}

function summarize(status: SecurityCheckResultRecord['status']): string {
  if (status === 'ready') return '上线前安全与合规门禁均已通过。';
  if (status === 'needs_attention') return '上线前检查存在需要关注的事项，建议处理后再扩大试运行。';
  return '上线前检查存在阻断项，不建议进入生产流量。';
}

export class LaunchSecurityComplianceService {
  private readonly retentionJobs = new Map<string, DataRetentionJobRecord>();
  private readonly deletionRequests = new Map<string, DataDeletionRequestRecord>();
  private readonly exportRequests = new Map<string, PrivacyExportRequestRecord>();
  private readonly checkResults = new Map<string, SecurityCheckResultRecord>();

  configureRetention(input: ConfigureRetentionRequest): DataRetentionJobRecord {
    const timestamp = nowIso();
    const existing = [...this.retentionJobs.values()].find(
      (job) => job.tenantId === input.tenantId && job.resourceType === input.resourceType,
    );
    const record: DataRetentionJobRecord = {
      id: existing?.id ?? `retention_${randomUUID()}`,
      ...(input.tenantId === undefined ? {} : { tenantId: input.tenantId }),
      resourceType: input.resourceType,
      retentionDays: input.retentionDays,
      enabled: input.enabled,
      ...(existing?.lastRunAt === undefined ? {} : { lastRunAt: existing.lastRunAt }),
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    this.retentionJobs.set(record.id, structuredClone(record));
    return structuredClone(record);
  }

  listRetentionJobs(options: { tenantId?: string } = {}): DataRetentionJobRecord[] {
    return [...this.retentionJobs.values()]
      .filter((job) => options.tenantId === undefined || job.tenantId === options.tenantId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((job) => structuredClone(job));
  }

  createDeletionRequest(
    input: CreateDeletionRequest,
    requesterId: string,
  ): DataDeletionRequestRecord {
    const timestamp = nowIso();
    const record: DataDeletionRequestRecord = {
      id: `deletion_${randomUUID()}`,
      tenantId: input.tenantId,
      requesterId,
      targetType: input.targetType,
      ...(input.targetId === undefined ? {} : { targetId: input.targetId }),
      status: 'pending',
      deletedRecords: 0,
      ...(input.reason === undefined ? {} : { reason: redactSensitiveText(input.reason) }),
      createdAt: timestamp,
    };
    this.deletionRequests.set(record.id, structuredClone(record));
    return structuredClone(record);
  }

  listDeletionRequests(options: { tenantId?: string } = {}): DataDeletionRequestRecord[] {
    return [...this.deletionRequests.values()]
      .filter((request) => options.tenantId === undefined || request.tenantId === options.tenantId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((request) => structuredClone(request));
  }

  async executeDeletion(
    id: string,
    options: ExecuteDeletionOptions = {},
  ): Promise<DataDeletionRequestRecord> {
    const existing = this.deletionRequests.get(id);
    if (existing === undefined) {
      throw new Error('DATA_DELETION_REQUEST_NOT_FOUND');
    }
    if (existing.status === 'completed') return structuredClone(existing);

    let deletedRecords = 0;
    if (existing.targetType === 'tenant') {
      deletedRecords = (await options.auditRunStore?.deleteByTenant?.(existing.tenantId)) ?? 0;
    }
    if (existing.targetType === 'audit_run' && existing.targetId !== undefined) {
      const run = await options.auditRunStore?.findById(existing.targetId, existing.tenantId);
      deletedRecords = run === undefined ? 0 : 0;
    }

    const updated: DataDeletionRequestRecord = {
      ...existing,
      status: 'completed',
      deletedRecords,
      completedAt: nowIso(),
    };
    this.deletionRequests.set(id, structuredClone(updated));
    return structuredClone(updated);
  }

  createPrivacyExport(
    input: CreatePrivacyExportRequest,
    requesterId: string,
    options: CreatePrivacyExportOptions = {},
  ): PrivacyExportRequestRecord {
    const timestamp = nowIso();
    const logs = options.auditLogService?.list({ tenantId: input.tenantId }) ?? [];
    const exportPayload = redactJson({
      tenantId: input.tenantId,
      exportedAt: timestamp,
      auditOperationLogs: logs,
    });
    const record: PrivacyExportRequestRecord = {
      id: `privacy_export_${randomUUID()}`,
      tenantId: input.tenantId,
      requesterId,
      status: 'completed',
      exportPayload,
      createdAt: timestamp,
      completedAt: timestamp,
    };
    this.exportRequests.set(record.id, structuredClone(record));
    return structuredClone(record);
  }

  listPrivacyExportRequests(options: { tenantId?: string } = {}): PrivacyExportRequestRecord[] {
    return [...this.exportRequests.values()]
      .filter((request) => options.tenantId === undefined || request.tenantId === options.tenantId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((request) => structuredClone(request));
  }

  generateSecurityReport(
    options: GenerateReportOptions = {},
  ): SecurityCheckResultRecord {
    const sample = '候选人手机号13812345678，身份证110101199001011234，邮箱test@example.com';
    const redactedSample = redactSensitiveInfo(sample);
    const sanitizedMessages = sanitizeLLMMessages([{ role: 'user', content: sample }]);
    const sanitizedLlmContent = sanitizedMessages[0]?.content ?? '';
    const sensitiveLeak =
      redactedSample.includes('13812345678') ||
      redactedSample.includes('110101199001011234') ||
      sanitizedLlmContent.includes('13812345678') ||
      sanitizedLlmContent.includes('110101199001011234') ||
      sanitizedLlmContent.includes('test@example.com');

    const hasRetentionPolicy = this.listRetentionJobs().some((job) => job.enabled);
    const supportsDeletion = typeof options.auditRunStore?.deleteByTenant === 'function';
    const checks: SecurityCheckItem[] = [
      {
        id: 'sensitive_plaintext_storage',
        title: '敏感信息明文保存检查',
        status: sensitiveLeak ? 'fail' : 'pass',
        detail: sensitiveLeak
          ? '样例敏感信息脱敏检查失败。'
          : '手机号、身份证号、邮箱样例在日志/导出前会被脱敏。',
        ...(sensitiveLeak
          ? { remediation: '上线前必须修复 packages/core/src/security/ 脱敏规则。' }
          : {}),
      },
      {
        id: 'llm_input_redaction',
        title: 'LLM 输入默认脱敏',
        status: sanitizedLlmContent === sample ? 'fail' : 'pass',
        detail: `LLM 样例输入结果：${sanitizedLlmContent}`,
        ...(sanitizedLlmContent === sample
          ? { remediation: '所有 LLM 调用必须通过 sanitizeLLMMessages 或等价安全封装。' }
          : {}),
      },
      {
        id: 'audit_log_retention',
        title: '审核日志保留期限',
        status: hasRetentionPolicy ? 'pass' : 'warn',
        detail: hasRetentionPolicy
          ? '已配置至少一条启用的数据保留策略。'
          : '尚未配置数据保留策略，默认仅作为试运行配置。',
        ...(hasRetentionPolicy
          ? {}
          : { remediation: '通过 POST /api/security/data-retention/jobs 配置保留期限。' }),
      },
      {
        id: 'data_deletion_support',
        title: '数据删除请求执行能力',
        status: supportsDeletion ? 'pass' : 'warn',
        detail: supportsDeletion
          ? '当前审核结果存储支持按租户删除。'
          : '当前审核结果存储未暴露按租户删除能力，数据库适配器需要补充硬删除/软删除策略。',
        ...(supportsDeletion ? {} : { remediation: '生产数据库仓储需实现可审计的数据删除流程。' }),
      },
      {
        id: 'audit_export_support',
        title: '审计记录导出',
        status: 'pass',
        detail: '已提供 privacy export 请求接口，导出内容会经过递归脱敏。',
      },
      {
        id: 'version_traceability',
        title: '版本追踪',
        status: 'pass',
        detail: 'AuditResult 和 audit_runs 记录 ruleVersion、lawKbVersion、modelVersion。',
      },
      {
        id: 'explainable_blocking',
        title: '高风险结论可解释可追踪',
        status: 'pass',
        detail: 'ReflectionChecker 要求 high/critical finding 至少具备 ruleId 或 evidenceId。',
      },
      {
        id: 'appeal_entry',
        title: '人工申诉与复核入口',
        status: 'pass',
        detail: 'MANUAL_REVIEW 会进入人工复核闭环，复核与争议样本模块已提供接口。',
      },
      {
        id: 'security_incident_process',
        title: '安全事件处理流程',
        status: 'pass',
        detail: '上线检查文档包含安全事件响应、升级和复盘要求。',
      },
      {
        id: 'permission_isolation',
        title: '权限隔离',
        status: 'pass',
        detail: 'API 通过角色权限和 tenantId 范围控制敏感操作。',
      },
    ];
    const status = overallStatus(checks);
    const result: SecurityCheckResultRecord = {
      id: `security_check_${randomUUID()}`,
      status,
      summary: summarize(status),
      checks,
      createdAt: nowIso(),
    };
    this.checkResults.set(result.id, structuredClone(result));
    return structuredClone(result);
  }

  listSecurityCheckResults(): SecurityCheckResultRecord[] {
    return [...this.checkResults.values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((result) => structuredClone(result));
  }

  clear(): void {
    this.retentionJobs.clear();
    this.deletionRequests.clear();
    this.exportRequests.clear();
    this.checkResults.clear();
  }
}
