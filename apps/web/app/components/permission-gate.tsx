'use client';

import type { ReactNode } from 'react';
import { useAuth } from '../auth/auth-provider';
import type { Permission } from '../auth/permissions';

export function PermissionGate({
  permissions,
  children,
  fallback = null,
}: Readonly<{
  permissions: Permission[];
  children: ReactNode;
  fallback?: ReactNode;
}>) {
  const auth = useAuth();
  return auth.canAny(permissions) ? <>{children}</> : <>{fallback}</>;
}
