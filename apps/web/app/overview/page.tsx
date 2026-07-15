'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { AuditResult, HumanReviewFeedbackType, HumanReviewTicket, RiskCategory } from '@job-compliance/shared';
import { useAuth } from '../auth/auth-provider';
import { routePermissions, type RouteKey } from '../auth/permissions';
import { DataTable, type DataTableColumn } from '../components/data-table';
import { Card, EmptyState, ErrorState, MetadataList, MetricCard, PageContainer, RiskBadge, SkeletonPanel } from '../components/ui';
import { useLanguage } from '../i18n/language-provider';

interface AuditMetricsSnapshot {
  audit_total: number;
  reject_rate: number;
  manual_review_rate: number;
  critical_finding_rate: number;
  rule_hit_by_rule_id: Record<string, number>;
  llm_error_rate: number;
  rag_no_result_rate: number;
  api_error_rate: number;
  p95_latency: number;
  version_distribution: Record<string, number>;
  generatedAt: string;
}

interface RuntimeConfigRecord {
  key: string;
  stableVersion: string;
  candidateVersion?: string;
}

interface AlertEventRecord {
  id: string;
  severity: string;
  status: string;
  metricKey: string;
  message: string;
  createdAt: string;
}

interface CostUsageRecord {
  tenantId: string;
  date: string;
  llmCost: number;
  totalCost: number;
}

interface CostUsageSnapshot {
  tenantId: string;
  daily: CostUsageRecord[];
}

interface DashboardState {
  metrics: AuditMetricsSnapshot | null;
  configs: RuntimeConfigRecord[];
  alerts: AlertEventRecord[];
  auditRuns: AuditResult[];
  reviewTickets: HumanReviewTicket[];
  costs: CostUsageRecord[];
}

interface ChartDatum {
  label: string;
  value: number;
  tone?: 'success' | 'warning' | 'danger' | 'info' | 'default';
}

const emptyDashboardState: DashboardState = {
  metrics: null,
  configs: [],
  alerts: [],
  auditRuns: [],
  reviewTickets: [],
  costs: [],
};

async function fetchOptional<T>(url: string): Promise<T | null> {
  const response = await fetch(url);
  if (!response.ok) return null;
  return (await response.json()) as T;
}

function sameDay(left: Date, right: Date): boolean {
  return left.toDateString() === right.toDateString();
}

function ratio(count: number, total: number): number {
  return total === 0 ? 0 : count / total;
}

function lastSevenDays(): Date[] {
  const today = new Date();
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    return date;
  });
}

function configVersion(configs: RuntimeConfigRecord[], key: string): string {
  return configs.find((config) => config.key === key)?.stableVersion ?? '-';
}

function healthRiskLevel(value: number, mediumThreshold: number, highThreshold: number): 'low' | 'medium' | 'high' {
  if (value >= highThreshold) return 'high';
  if (value >= mediumThreshold) return 'medium';
  return 'low';
}

function BarChart({ data, emptyTitle }: Readonly<{ data: ChartDatum[]; emptyTitle: string }>) {
  const max = Math.max(...data.map((item) => item.value), 0);
  if (max <= 0) return <EmptyState title={emptyTitle} />;

  return (
    <div className="chart-bars">
      {data.map((item) => (
        <div className={`chart-bar chart-bar--${item.tone ?? 'default'}`} key={item.label}>
          <span>{item.label}</span>
          <div>
            <i style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }} />
          </div>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

function DistributionChart({ data, emptyTitle }: Readonly<{ data: ChartDatum[]; emptyTitle: string }>) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) return <EmptyState title={emptyTitle} />;

  return (
    <div className="distribution-chart">
      {data.map((item) => (
        <article className={`distribution-item distribution-item--${item.tone ?? 'default'}`} key={item.label}>
          <div>
            <span style={{ width: `${(item.value / total) * 100}%` }} />
          </div>
          <strong>{item.label}</strong>
          <em>{item.value}</em>
        </article>
      ))}
    </div>
  );
}

export default function OverviewPage() {
  const auth = useAuth();
  const { locale, messages, formatDate, formatNumber, formatPercent } = useLanguage();
  const t = messages.dashboard;
  const [state, setState] = useState<DashboardState>(emptyDashboardState);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [metrics, configs, alerts, auditRuns, reviews, costs] = await Promise.all([
          fetchOptional<AuditMetricsSnapshot>('/api/metrics/audit'),
          fetchOptional<{ items: RuntimeConfigRecord[] }>('/api/runtime-configs'),
          fetchOptional<{ items: AlertEventRecord[] }>('/api/alerts'),
          fetchOptional<{ items: AuditResult[] }>(`/api/audit/runs?tenantId=${auth.tenantId}`),
          fetchOptional<{ items: HumanReviewTicket[] }>(`/api/reviews?status=all&tenantId=${auth.tenantId}`),
          fetchOptional<CostUsageSnapshot>(`/api/usage/costs?tenantId=${auth.tenantId}`),
        ]);
        setState({
          metrics,
          configs: configs?.items ?? [],
          alerts: alerts?.items ?? [],
          auditRuns: auditRuns?.items ?? [],
          reviewTickets: reviews?.items ?? [],
          costs: costs?.daily ?? [],
        });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : t.errors.loadFailed);
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, [auth.tenantId, t.errors.loadFailed]);

  const today = new Date();
  const todaysRuns = state.auditRuns.filter((run) => sameDay(new Date(run.createdAt), today));
  const todaysTotal = todaysRuns.length;
  const autoPassRate = ratio(todaysRuns.filter((run) => run.decision === 'PASS').length, todaysTotal);
  const autoRejectRate = ratio(todaysRuns.filter((run) => run.decision === 'REJECT').length, todaysTotal);
  const manualReviewRate =
    todaysTotal > 0
      ? ratio(todaysRuns.filter((run) => run.decision === 'MANUAL_REVIEW').length, todaysTotal)
      : state.metrics?.manual_review_rate ?? 0;
  const criticalCount = todaysRuns.reduce(
    (count, run) => count + run.findings.filter((finding) => finding.severity === 'CRITICAL').length,
    0,
  );
  const activeAlerts = state.alerts.filter((alert) => alert.status !== 'resolved').length;
  const todayCost = state.costs
    .filter((record) => sameDay(new Date(record.date), today))
    .reduce((sum, record) => sum + record.llmCost, 0);

  const trend = lastSevenDays().map((date) => ({
    label: new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric' }).format(date),
    value: state.auditRuns.filter((run) => sameDay(new Date(run.createdAt), date)).length,
    tone: 'info' as const,
  }));

  const riskDistribution = useMemo(() => {
    const counts = new Map<RiskCategory, number>();
    for (const run of state.auditRuns) {
      for (const finding of run.findings) {
        counts.set(finding.category, (counts.get(finding.category) ?? 0) + 1);
      }
    }
    return [...counts.entries()].map(([category, value]) => ({
      label: messages.enums.riskCategory[category],
      value,
      tone: 'warning' as const,
    }));
  }, [messages.enums.riskCategory, state.auditRuns]);

  const decisionDistribution = useMemo(() => {
    const decisions = ['PASS', 'REJECT', 'MANUAL_REVIEW', 'ALLOW_WITH_WARNING', 'NEED_MORE_INFO'] as const;
    return decisions.map((decision) => ({
      label: messages.enums.decision[decision],
      value: state.auditRuns.filter((run) => run.decision === decision).length,
      tone:
        decision === 'PASS'
          ? ('success' as const)
          : decision === 'REJECT'
            ? ('danger' as const)
            : ('warning' as const),
    }));
  }, [messages.enums.decision, state.auditRuns]);

  const topRules = Object.entries(state.metrics?.rule_hit_by_rule_id ?? {})
    .sort(([, left], [, right]) => right - left)
    .slice(0, 10)
    .map(([ruleId, count]) => ({ ruleId, count, status: count > 0 ? 'active' : 'idle' }));

  const feedbackDistribution = useMemo(() => {
    const counts = new Map<HumanReviewFeedbackType, number>();
    for (const ticket of state.reviewTickets) {
      const type = ticket.feedback?.feedbackType;
      if (type !== undefined) counts.set(type, (counts.get(type) ?? 0) + 1);
    }
    return [...counts.entries()].map(([type, value]) => ({
      label: messages.enums.feedbackType[type],
      value,
      tone: type === 'VALID_RESULT' ? ('success' as const) : ('warning' as const),
    }));
  }, [messages.enums.feedbackType, state.reviewTickets]);

  const alertTrend = lastSevenDays().map((date) => ({
    label: new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric' }).format(date),
    value: state.alerts.filter((alert) => sameDay(new Date(alert.createdAt), date)).length,
    tone: 'danger' as const,
  }));

  const alertColumns = useMemo<Array<DataTableColumn<AlertEventRecord>>>(
    () => [
      {
        key: 'message',
        label: t.tables.alert,
        render: (row) => <strong>{row.message}</strong>,
        searchValue: (row) => `${row.message} ${row.metricKey}`,
      },
      {
        key: 'severity',
        label: t.tables.severity,
        render: (row) => <RiskBadge level={row.severity}>{row.severity}</RiskBadge>,
        filterValue: (row) => row.severity,
      },
      {
        key: 'status',
        label: t.tables.status,
        render: (row) => row.status,
        filterValue: (row) => row.status,
      },
      {
        key: 'createdAt',
        label: t.tables.createdAt,
        render: (row) => formatDate(row.createdAt),
      },
    ],
    [formatDate, t.tables.alert, t.tables.createdAt, t.tables.severity, t.tables.status],
  );

  if (isLoading) {
    return (
      <PageContainer eyebrow={t.hero.eyebrow} title={t.hero.title} description={t.hero.description}>
        <SkeletonPanel blocks={8} />
      </PageContainer>
    );
  }

  return (
    <PageContainer eyebrow={t.hero.eyebrow} title={t.hero.title} description={t.hero.description}>
      {error ? <ErrorState title={t.errors.title} message={error} /> : null}

      <section className="dashboard-grid">
        <MetricCard label={t.metrics.todayAudits} value={formatNumber(todaysTotal)} helper={t.metrics.fromAuditRuns} tone="info" />
        <MetricCard label={t.metrics.autoPassRate} value={formatPercent(autoPassRate)} tone="success" />
        <MetricCard label={t.metrics.autoRejectRate} value={formatPercent(autoRejectRate)} tone="danger" />
        <MetricCard label={t.metrics.manualReviewRate} value={formatPercent(manualReviewRate)} tone="warning" />
        <MetricCard label={t.metrics.criticalRiskCount} value={formatNumber(criticalCount)} tone="danger" />
        <MetricCard label={t.metrics.activeAlerts} value={formatNumber(activeAlerts)} tone={activeAlerts > 0 ? 'danger' : 'success'} />
        <MetricCard
          label={t.metrics.todayLlmCost}
          value={formatNumber(todayCost, { currency: 'USD', style: 'currency' })}
          helper={t.metrics.costHelper}
          tone="info"
        />
      </section>

      <Card title={t.runtime.title} description={t.runtime.description}>
        <MetadataList
          items={[
            { label: t.runtime.ruleVersion, value: configVersion(state.configs, 'ruleVersion') },
            { label: t.runtime.lawKbVersion, value: configVersion(state.configs, 'lawKbVersion') },
            { label: t.runtime.modelVersion, value: configVersion(state.configs, 'modelVersion') },
            { label: t.metrics.generatedAt, value: state.metrics?.generatedAt === undefined ? '-' : formatDate(state.metrics.generatedAt) },
          ]}
        />
      </Card>

      <section className="workspace-hub">
        {[
          { href: '/', title: t.workspaces.audit, description: t.workspaces.auditDescription },
          { href: '/reviews', title: t.workspaces.review, description: t.workspaces.reviewDescription },
          { href: '/rules', title: t.workspaces.rules, description: t.workspaces.rulesDescription },
          { href: '/evals', title: t.workspaces.evaluation, description: t.workspaces.evaluationDescription },
          { href: '/appeals', title: t.workspaces.appeals, description: t.workspaces.appealsDescription },
          { href: '/qa', title: t.workspaces.qa, description: t.workspaces.qaDescription },
          { href: '/monitoring', title: t.workspaces.monitoring, description: t.workspaces.monitoringDescription },
          { href: '/settings', title: t.workspaces.settings, description: t.workspaces.settingsDescription },
        ]
          .filter((workspace) => auth.canAny(routePermissions[workspace.href as RouteKey] ?? []))
          .map((workspace) => (
            <Link className="workspace-card" href={workspace.href} key={workspace.href}>
              <strong>{workspace.title}</strong>
              <span>{workspace.description}</span>
            </Link>
          ))}
      </section>

      <section className="dashboard-charts">
        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">{t.chartEyebrows.trend}</p>
            <h2>{t.charts.auditTrend}</h2>
          </div>
          <BarChart data={trend} emptyTitle={t.empty.noTrend} />
        </article>

        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">{t.chartEyebrows.risk}</p>
            <h2>{t.charts.riskDistribution}</h2>
          </div>
          <DistributionChart data={riskDistribution} emptyTitle={t.empty.noRisk} />
        </article>

        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">{t.chartEyebrows.decision}</p>
            <h2>{t.charts.decisionDistribution}</h2>
          </div>
          <DistributionChart data={decisionDistribution} emptyTitle={t.empty.noDecision} />
        </article>

        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">{t.chartEyebrows.feedback}</p>
            <h2>{t.charts.feedbackDistribution}</h2>
          </div>
          <DistributionChart data={feedbackDistribution} emptyTitle={t.empty.noFeedback} />
        </article>

        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">{t.chartEyebrows.alerts}</p>
            <h2>{t.charts.alertTrend}</h2>
          </div>
          <BarChart data={alertTrend} emptyTitle={t.empty.noAlertTrend} />
        </article>
      </section>

      <section className="monitoring-grid">
        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">{t.chartEyebrows.rules}</p>
            <h2>{t.charts.topRules}</h2>
          </div>
          <DataTable
            rows={topRules}
            columns={[
              {
                key: 'ruleId',
                label: t.tables.ruleId,
                render: (row) => <code>{row.ruleId}</code>,
                searchValue: (row) => row.ruleId,
              },
              {
                key: 'count',
                label: t.tables.hitCount,
                render: (row) => formatNumber(row.count),
              },
              {
                key: 'status',
                label: t.tables.status,
                render: (row) => <RiskBadge level={row.status === 'active' ? 'low' : 'none'}>{row.status}</RiskBadge>,
                filterValue: (row) => row.status,
              },
            ]}
            searchPlaceholder={t.tables.search}
            filterLabel={t.tables.filter}
            filters={[
              { label: t.tables.all, value: 'all' },
              { label: t.tables.active, value: 'active' },
              { label: t.tables.idle, value: 'idle' },
            ]}
            emptyTitle={t.empty.noRules}
          />
        </article>

        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">{t.chartEyebrows.alerts}</p>
            <h2>{t.charts.alerts}</h2>
          </div>
          <DataTable
            rows={state.alerts}
            columns={alertColumns}
            searchPlaceholder={t.tables.search}
            filterLabel={t.tables.filter}
            filters={[
              { label: t.tables.all, value: 'all' },
              { label: t.tables.critical, value: 'critical' },
              { label: t.tables.warning, value: 'warning' },
              { label: t.tables.open, value: 'open' },
              { label: t.tables.resolved, value: 'resolved' },
            ]}
            emptyTitle={t.empty.noAlerts}
            emptyDescription={t.empty.noAlertsDescription}
          />
        </article>
      </section>

      <section className="dashboard-health-strip">
        <RiskBadge level={healthRiskLevel(state.metrics?.api_error_rate ?? 0, 0.02, 0.05)}>
          api_error_rate {formatPercent(state.metrics?.api_error_rate ?? 0)}
        </RiskBadge>
        <RiskBadge level={healthRiskLevel(state.metrics?.rag_no_result_rate ?? 0, 0.1, 0.2)}>
          rag_no_result_rate {formatPercent(state.metrics?.rag_no_result_rate ?? 0)}
        </RiskBadge>
        <RiskBadge level={healthRiskLevel(state.metrics?.llm_error_rate ?? 0, 0.02, 0.05)}>
          llm_error_rate {formatPercent(state.metrics?.llm_error_rate ?? 0)}
        </RiskBadge>
        <span>{t.metrics.generatedAt}: {state.metrics?.generatedAt === undefined ? '-' : formatDate(state.metrics.generatedAt)}</span>
      </section>
    </PageContainer>
  );
}
