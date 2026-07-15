'use client';

import { EmptyState, PageContainer, StatCard } from '../components/ui';
import { useLanguage } from '../i18n/language-provider';

export default function SettingsPage() {
  const { messages } = useLanguage();
  const t = messages.workspacePages.settings;

  return (
    <PageContainer
      eyebrow={t.eyebrow}
      title={t.title}
      description={t.description}
    >
      <section className="dashboard-grid">
        <StatCard label="Tenant" value="Scoped" helper={t.tenantHelper} tone="success" />
        <StatCard label="RBAC" value="Enabled" helper={t.rbacHelper} tone="info" />
        <StatCard label="Privacy" value="Redacted" helper={t.privacyHelper} tone="warning" />
      </section>
      <EmptyState
        title={t.emptyTitle}
        description={t.emptyDescription}
      />
    </PageContainer>
  );
}
