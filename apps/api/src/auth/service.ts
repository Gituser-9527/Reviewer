import { randomUUID } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { redactJson, redactSensitiveText } from '@job-compliance/database';

export const roles = [
  'SUPER_ADMIN',
  'TENANT_ADMIN',
  'COMPLIANCE_MANAGER',
  'REVIEWER',
  'RULE_OPERATOR',
  'VIEWER',
] as const;

export type Role = (typeof roles)[number];

export const permissions = [
  'audit:read',
  'audit:write',
  'review:read',
  'review:write',
  'rule:read',
  'rule:edit_draft',
  'rule:approve_publish',
  'rule:rollback',
  'runtime:read',
  'runtime:write',
  'eval:read',
  'eval:write',
  'eval:delete',
  'global:manage',
  'audit_log:read',
] as const;

export type Permission = (typeof permissions)[number];

export interface AuthContext {
  userId: string;
  role: Role;
  tenantId?: string;
  permissions: Permission[];
}

export interface AuditOperationLogRecord {
  id: string;
  actorUserId: string;
  actorRole: Role;
  tenantId?: string;
  operation: string;
  resourceType: string;
  resourceId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  requestId?: string;
  createdAt: string;
}

export interface RulePublishApprovalRecord {
  id: string;
  ruleSetId: string;
  ruleVersion?: string;
  action: 'publish' | 'rollback';
  status: 'approved';
  requestedBy: string;
  approvedBy: string;
  comment?: string;
  createdAt: string;
  approvedAt: string;
}

const permissionsByRole: Record<Role, Permission[]> = {
  SUPER_ADMIN: [...permissions],
  TENANT_ADMIN: ['audit:read', 'review:read', 'eval:read'],
  COMPLIANCE_MANAGER: [
    'audit:read',
    'review:read',
    'review:write',
    'rule:read',
    'rule:approve_publish',
    'rule:rollback',
    'runtime:read',
    'eval:read',
    'audit_log:read',
  ],
  REVIEWER: ['audit:read', 'review:read', 'review:write'],
  RULE_OPERATOR: ['rule:read', 'rule:edit_draft', 'review:read', 'eval:read'],
  VIEWER: ['audit:read', 'review:read', 'rule:read', 'runtime:read', 'eval:read'],
};

function headerValue(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeRole(value: string | undefined): Role {
  const normalized = value?.trim().toUpperCase();
  return roles.includes(normalized as Role) ? (normalized as Role) : 'SUPER_ADMIN';
}

export class AuthorizationError extends Error {
  constructor(
    readonly code: 'FORBIDDEN' | 'TENANT_FORBIDDEN',
    message: string,
  ) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class AuthService {
  getContext(request: FastifyRequest): AuthContext {
    const role = normalizeRole(headerValue(request, 'x-user-role'));
    const tenantId = headerValue(request, 'x-tenant-id');
    return {
      userId: headerValue(request, 'x-user-id') ?? 'dev_super_admin',
      role,
      ...(tenantId === undefined ? {} : { tenantId }),
      permissions: permissionsByRole[role],
    };
  }

  hasPermission(context: AuthContext, permission: Permission): boolean {
    return context.permissions.includes(permission);
  }

  requirePermission(request: FastifyRequest, permission: Permission): AuthContext {
    const context = this.getContext(request);
    if (!this.hasPermission(context, permission)) {
      throw new AuthorizationError(
        'FORBIDDEN',
        `Role ${context.role} does not have permission ${permission}.`,
      );
    }
    return context;
  }

  requireTenantAccess(request: FastifyRequest, tenantId: string): AuthContext {
    const context = this.getContext(request);
    if (context.role === 'SUPER_ADMIN') return context;
    if (context.tenantId !== tenantId) {
      throw new AuthorizationError('TENANT_FORBIDDEN', 'Tenant data is outside current scope.');
    }
    return context;
  }

  requireTenantScope(request: FastifyRequest): AuthContext {
    const context = this.getContext(request);
    if (context.role !== 'SUPER_ADMIN' && context.tenantId === undefined) {
      throw new AuthorizationError('TENANT_FORBIDDEN', 'Tenant scope is required for this role.');
    }
    return context;
  }

  currentUserPayload(request: FastifyRequest): AuthContext {
    return this.getContext(request);
  }
}

export class AuditOperationLogService {
  private readonly logs = new Map<string, AuditOperationLogRecord>();

  record(input: {
    actor: AuthContext;
    operation: string;
    resourceType: string;
    resourceId?: string;
    tenantId?: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    requestId?: string;
  }): AuditOperationLogRecord {
    const createdAt = new Date().toISOString();
    const record: AuditOperationLogRecord = {
      id: `audit_op_${randomUUID()}`,
      actorUserId: input.actor.userId,
      actorRole: input.actor.role,
      ...(input.tenantId === undefined ? {} : { tenantId: input.tenantId }),
      operation: input.operation,
      resourceType: input.resourceType,
      ...(input.resourceId === undefined ? {} : { resourceId: input.resourceId }),
      ...(input.before === undefined ? {} : { before: redactJson(input.before) }),
      ...(input.after === undefined ? {} : { after: redactJson(input.after) }),
      ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
      createdAt,
    };
    this.logs.set(record.id, structuredClone(record));
    return structuredClone(record);
  }

  list(options: { tenantId?: string } = {}): AuditOperationLogRecord[] {
    return [...this.logs.values()]
      .filter((log) => options.tenantId === undefined || log.tenantId === options.tenantId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((log) => structuredClone(log));
  }

  clear(): void {
    this.logs.clear();
  }
}

export class RulePublishApprovalService {
  private readonly approvals = new Map<string, RulePublishApprovalRecord>();

  approve(input: {
    ruleSetId: string;
    ruleVersion?: string;
    action: 'publish' | 'rollback';
    requestedBy: string;
    approvedBy: string;
    comment?: string;
  }): RulePublishApprovalRecord {
    const timestamp = new Date().toISOString();
    const record: RulePublishApprovalRecord = {
      id: `rule_approval_${randomUUID()}`,
      ruleSetId: input.ruleSetId,
      ...(input.ruleVersion === undefined ? {} : { ruleVersion: input.ruleVersion }),
      action: input.action,
      status: 'approved',
      requestedBy: input.requestedBy,
      approvedBy: input.approvedBy,
      ...(input.comment === undefined ? {} : { comment: redactSensitiveText(input.comment) }),
      createdAt: timestamp,
      approvedAt: timestamp,
    };
    this.approvals.set(record.id, structuredClone(record));
    return structuredClone(record);
  }

  list(): RulePublishApprovalRecord[] {
    return [...this.approvals.values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((approval) => structuredClone(approval));
  }
}

export interface AuthServices {
  authService: AuthService;
  auditLogService: AuditOperationLogService;
  rulePublishApprovalService: RulePublishApprovalService;
}

export function createAuthServices(): AuthServices {
  return {
    authService: new AuthService(),
    auditLogService: new AuditOperationLogService(),
    rulePublishApprovalService: new RulePublishApprovalService(),
  };
}
