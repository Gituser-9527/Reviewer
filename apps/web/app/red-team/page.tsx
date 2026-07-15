'use client';

import { EmptyState, PageContainer, StatCard } from '../components/ui';
import { useLanguage } from '../i18n/language-provider';

export default function RedTeamPage() {
  const { messages } = useLanguage();
  const t = messages.workspacePages.redTeam;

  return (
    <PageContainer
      eyebrow={t.eyebrow}
      title={t.title}
      description={t.description}
    >
      <section className="dashboard-grid">
        <StatCard label="Dataset" value="200+" helper={t.datasetHelper} tone="info" />
        <StatCard label="Script" value="eval:redteam" helper={t.scriptHelper} tone="success" />
        <StatCard label="Target" value="Recall" helper={t.targetHelper} tone="warning" />
      </section>
      <EmptyState
        title={t.emptyTitle}
        description={t.emptyDescription}
      />
    </PageContainer>
  );
}
