'use client';

import { EmptyState, PageContainer, StatCard } from '../components/ui';
import { useLanguage } from '../i18n/language-provider';

export default function QaPage() {
  const { messages } = useLanguage();
  const t = messages.workspacePages.qa;

  return (
    <PageContainer
      eyebrow={t.eyebrow}
      title={t.title}
      description={t.description}
    >
      <section className="dashboard-grid">
        <StatCard label="Sampling" value="Random" helper={t.samplingHelper} tone="info" />
        <StatCard label="Issues" value="Closed-loop" helper={t.issuesHelper} tone="success" />
        <StatCard label="Regression" value="Eval" helper={t.regressionHelper} tone="warning" />
      </section>
      <EmptyState
        title={t.emptyTitle}
        description={t.emptyDescription}
      />
    </PageContainer>
  );
}
