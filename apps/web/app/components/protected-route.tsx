'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useAuth } from '../auth/auth-provider';
import type { Permission } from '../auth/permissions';
import { useLanguage } from '../i18n/language-provider';
import { EmptyState, RiskBadge } from './ui';

export function ProtectedRoute({
  permissions,
  children,
}: Readonly<{
  permissions: Permission[];
  children: ReactNode;
}>) {
  const auth = useAuth();
  const { messages } = useLanguage();
  const t = messages.permissions;

  if (auth.canAny(permissions)) {
    return <>{children}</>;
  }

  return (
    <main className="no-permission-page">
      <EmptyState
        title={t.noAccessTitle}
        description={t.noAccessDescription}
        action={
          <div className="no-permission-actions">
            <RiskBadge level="medium">{auth.role}</RiskBadge>
            {permissions.length > 0 ? (
              <div className="permission-explainer">
                <span>{t.requiredPermissions}</span>
                <code>{permissions.join(', ')}</code>
                <span>{t.currentPermissions}</span>
                <code>{auth.permissions.join(', ') || '-'}</code>
              </div>
            ) : null}
            <Link className="ghost-button" href="/overview">
              {t.backToDashboard}
            </Link>
          </div>
        }
      />
    </main>
  );
}
