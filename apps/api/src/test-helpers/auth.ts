import type { Role } from '../auth/service.js';

export const testTenantId = 'tenant_001';

function identity(role: Role, tenantId = testTenantId): Record<string, string> {
  return { 'x-user-id': `test_${role.toLowerCase()}`, 'x-user-role': role, 'x-tenant-id': tenantId };
}

export function auditOperatorIdentity(tenantId = testTenantId): Record<string, string> {
  return identity('AUDIT_OPERATOR', tenantId);
}

export function auditReaderIdentity(tenantId = testTenantId): Record<string, string> {
  return identity('VIEWER', tenantId);
}

export function auditWriterIdentity(tenantId = testTenantId): Record<string, string> {
  return identity('AUDIT_OPERATOR', tenantId);
}

export function reviewerIdentity(tenantId = testTenantId): Record<string, string> {
  return identity('REVIEWER', tenantId);
}

export function ruleOperatorIdentity(tenantId = testTenantId): Record<string, string> {
  return identity('RULE_OPERATOR', tenantId);
}

export function complianceManagerIdentity(tenantId = testTenantId): Record<string, string> {
  return identity('COMPLIANCE_MANAGER', tenantId);
}

export function superAdminIdentity(): Record<string, string> {
  return identity('SUPER_ADMIN');
}
