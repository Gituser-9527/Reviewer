'use client';

import { EmptyState, PageContainer, StatCard } from '../components/ui';
import { useLanguage } from '../i18n/language-provider';

export default function AppealsPage() {
  const { messages } = useLanguage();
  const t = messages.workspacePages.appeals;

  return (
    <PageContainer
      eyebrow={t.eyebrow}
      title={t.title}
      description={t.description}
    >
      <section className="dashboard-grid">
        <StatCard label="Agent Role" value="Assist" helper={t.agentRoleHelper} tone="info" />
        <StatCard label="Final" value="Human" helper={t.finalHelper} tone="success" />
        <StatCard label="Feedback" value="Eval" helper={t.feedbackHelper} tone="warning" />
      </section>
      <EmptyState
        title={t.emptyTitle}
        description={t.emptyDescription}
      />
    </PageContainer>
  );
}
