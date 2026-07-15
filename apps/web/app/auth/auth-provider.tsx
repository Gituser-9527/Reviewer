'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  hasAnyPermission,
  hasPermission,
  normalizeRole,
  permissionsByRole,
  type Permission,
  type Role,
} from './permissions';

const storageKey = 'job-compliance-role';

interface AuthContextValue {
  userId: string;
  tenantId: string;
  role: Role;
  permissions: Permission[];
  setRole: (role: Role) => void;
  can: (permission: Permission) => boolean;
  canAny: (required: readonly Permission[]) => boolean;
  authHeaders: () => HeadersInit;
  fetchWithAuth: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  // Keep the server and first client render identical; restore persisted demo state after hydration.
  const [role, setRoleState] = useState<Role>('SUPER_ADMIN');
  const tenantId = 'tenant_demo';
  const userId = `web_${role.toLowerCase()}`;
  const currentPermissions = permissionsByRole[role];

  useEffect(() => {
    setRoleState(normalizeRole(window.localStorage.getItem(storageKey)));
  }, []);

  const setRole = (nextRole: Role) => {
    setRoleState(nextRole);
    window.localStorage.setItem(storageKey, nextRole);
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      userId,
      tenantId,
      role,
      permissions: currentPermissions,
      setRole,
      can: (permission) => hasPermission(currentPermissions, permission),
      canAny: (required) => hasAnyPermission(currentPermissions, required),
      authHeaders: () => ({
        'x-user-id': userId,
        'x-user-role': role,
        'x-tenant-id': tenantId,
      }),
      fetchWithAuth: (input, init = {}) => {
        const headers = new Headers(init.headers);
        headers.set('x-user-id', userId);
        headers.set('x-user-role', role);
        headers.set('x-tenant-id', tenantId);
        return fetch(input, { ...init, headers });
      },
    }),
    [currentPermissions, role, tenantId, userId],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider.');
  }
  return context;
}
