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

export const permissionsByRole: Record<Role, Permission[]> = {
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

export type RouteKey =
  | '/'
  | '/overview'
  | '/reviews'
  | '/rules'
  | '/evals'
  | '/monitoring'
  | '/settings'
  | '/red-team'
  | '/releases'
  | '/appeals'
  | '/qa'
  | '/uat'
  | '/incidents'
  | '/beta-launch'
  | '/beta-trial'
  | '/pilot'
  | '/help-center'
  | '/api-docs'
  | '/landing';

export const routePermissions: Record<RouteKey, Permission[]> = {
  '/': ['audit:read'],
  '/overview': ['audit:read'],
  '/reviews': ['review:read'],
  '/rules': ['rule:read'],
  '/evals': ['eval:read'],
  '/monitoring': ['runtime:read'],
  '/settings': ['global:manage'],
  '/red-team': ['eval:read'],
  '/releases': ['rule:approve_publish'],
  '/appeals': ['review:read'],
  '/qa': ['review:read'],
  '/uat': ['audit_log:read'],
  '/incidents': ['global:manage'],
  '/beta-launch': ['global:manage'],
  '/beta-trial': ['audit:read'],
  '/pilot': ['audit:read'],
  '/help-center': [],
  '/api-docs': [],
  '/landing': [],
};

export function hasPermission(userPermissions: readonly Permission[], permission: Permission): boolean {
  return userPermissions.includes(permission);
}

export function hasAnyPermission(
  userPermissions: readonly Permission[],
  required: readonly Permission[],
): boolean {
  return required.length === 0 || required.some((permission) => hasPermission(userPermissions, permission));
}

export function normalizeRole(value: string | null | undefined): Role {
  return roles.includes(value as Role) ? (value as Role) : 'SUPER_ADMIN';
}
