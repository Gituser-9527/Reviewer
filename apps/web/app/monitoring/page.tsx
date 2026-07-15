'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/auth-provider';
import { DataTable, type DataTableColumn } from '../components/data-table';
import {
  SensitiveActionDialog,
  type SensitiveActionConfig,
} from '../components/sensitive-action-dialog';
import { PageContainer, SkeletonPanel } from '../components/ui';
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
  updatedAt: string;
}

interface RolloutPlanRecord {
  id: string;
  target: string;
  stableVersion: string;
  candidateVersion: string;
  tenantAllowList: string[];
  rolloutPercent: number;
  status: string;
  updatedAt: string;
}

interface AlertEventRecord {
  id: string;
  severity: string;
  status: string;
  metricKey: string;
  metricValue: number;
  threshold: number;
  message: string;
  createdAt: string;
}

interface MonitoringState {
  metrics: AuditMetricsSnapshot | null;
  configs: RuntimeConfigRecord[];
  rollouts: RolloutPlanRecord[];
  alerts: AlertEventRecord[];
}

const emptyState: MonitoringState = {
  metrics: null,
  configs: [],
  rollouts: [],
  alerts: [],
};

function asPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Request failed (HTTP ${response.status})`);
  }
  return (await response.json()) as T;
}

export default function MonitoringPage() {
  const auth = useAuth();
  const { messages, formatDate, formatPercent } = useLanguage();
  const tableCopy = messages.dashboard.tables;
  const routeCopy = messages.routes['/monitoring'];
  const pageCopy = messages.workspacePages.monitoring;
  const [state, setState] = useState<MonitoringState>(emptyState);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingSensitiveAction, setPendingSensitiveAction] = useState<{
    config: SensitiveActionConfig;
    run: () => Promise<void>;
  } | null>(null);
  const [form, setForm] = useState({
    target: 'ruleVersion',
    stableVersion: '1.0.0',
    candidateVersion: '1.0.1',
    tenantAllowList: '',
    rolloutPercent: '0',
  });

  const loadDashboard = async () => {
    setIsLoading(true);
    try {
      const [me, metrics, configs, rollouts, alerts] = await Promise.all([
        fetchJson('/api/auth/me'),
        fetchJson<AuditMetricsSnapshot>('/api/metrics/audit'),
        fetchJson<{ items: RuntimeConfigRecord[] }>('/api/runtime-configs'),
        fetchJson<{ items: RolloutPlanRecord[] }>('/api/rollouts'),
        fetchJson<{ items: AlertEventRecord[] }>('/api/alerts'),
      ]);
      void me;
      setState({
        metrics,
        configs: configs.items,
        rollouts: rollouts.items,
        alerts: alerts.items,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard().catch((cause) => {
      setError(cause instanceof Error ? cause.message : pageCopy.loadFailed);
    });
  }, []);

  const createRollout = async () => {
    setIsSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await fetchJson('/api/rollouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: form.target,
          stableVersion: form.stableVersion.trim(),
          candidateVersion: form.candidateVersion.trim(),
          tenantAllowList: form.tenantAllowList
            .split(',')
            .map((tenant) => tenant.trim())
            .filter(Boolean),
          rolloutPercent: Number(form.rolloutPercent),
          createdBy: 'web_operator',
        }),
      });
      setMessage(pageCopy.createSuccess);
      await loadDashboard();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : pageCopy.createFailed);
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmCreateRollout = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const t = messages.permissions.sensitiveAction;
    setPendingSensitiveAction({
      config: {
        title: t.rolloutCreateTitle,
        description: t.rolloutCreateDescription,
        impact: [
          t.rolloutImpact.replace('{target}', form.target),
          t.versionImpact.replace('{version}', `${form.stableVersion.trim()} -> ${form.candidateVersion.trim()}`),
          t.rolloutPercentImpact.replace('{percent}', form.rolloutPercent),
        ],
        confirmText: 'CREATE ROLLOUT',
        confirmButtonLabel: t.createRollout,
        tone: 'warning',
      },
      run: createRollout,
    });
  };

  const rollback = async (id: string) => {
    setError(null);
    setMessage(null);
    try {
      await fetchJson(`/api/rollouts/${id}/rollback`, { method: 'POST' });
      setMessage(pageCopy.rollbackSuccess);
      await loadDashboard();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : pageCopy.rollbackFailed);
    }
  };

  const confirmRollback = (rollout: RolloutPlanRecord) => {
    const t = messages.permissions.sensitiveAction;
    setPendingSensitiveAction({
      config: {
        title: t.rolloutRollbackTitle,
        description: t.rolloutRollbackDescription,
        impact: [
          t.rolloutImpact.replace('{target}', rollout.target),
          t.versionImpact.replace('{version}', rollout.stableVersion),
          t.auditImpact,
        ],
        confirmText: 'ROLLBACK',
        confirmButtonLabel: t.rollback,
        tone: 'danger',
      },
      run: () => rollback(rollout.id),
    });
  };

  const metrics = state.metrics;
  const versionEntries = Object.entries(metrics?.version_distribution ?? {});
  const canManageGlobal = auth.can('global:manage');
  const rolloutColumns = useMemo<Array<DataTableColumn<RolloutPlanRecord>>>(
    () => [
      {
        key: 'target',
        label: 'Target',
        render: (row) => <strong>{row.target}</strong>,
        searchValue: (row) => `${row.target} ${row.stableVersion} ${row.candidateVersion}`,
      },
      {
        key: 'version',
        label: 'Version',
        render: (row) => `${row.stableVersion} -> ${row.candidateVersion}`,
      },
      {
        key: 'percent',
        label: 'Rollout',
        render: (row) => `${row.rolloutPercent}%`,
      },
      {
        key: 'status',
        label: tableCopy.status,
        render: (row) => <span className={`rule-status rule-status--${row.status}`}>{row.status}</span>,
        filterValue: (row) => row.status,
      },
      {
        key: 'updatedAt',
        label: tableCopy.createdAt,
        render: (row) => formatDate(row.updatedAt),
      },
      {
        key: 'actions',
        label: '',
        render: (row) =>
          canManageGlobal ? (
            <button
              className="ghost-button"
              disabled={row.status === 'rolled_back'}
              type="button"
              onClick={() => confirmRollback(row)}
            >
              {pageCopy.rollbackStable}
            </button>
          ) : null,
      },
    ],
    [canManageGlobal, formatDate, tableCopy.createdAt, tableCopy.status],
  );
  const alertColumns = useMemo<Array<DataTableColumn<AlertEventRecord>>>(
    () => [
      {
        key: 'message',
        label: tableCopy.alert,
        render: (row) => <strong>{row.message}</strong>,
        searchValue: (row) => `${row.message} ${row.metricKey}`,
      },
      {
        key: 'severity',
        label: tableCopy.severity,
        render: (row) => <span className={`severity severity--${row.severity}`}>{row.severity}</span>,
        filterValue: (row) => row.severity,
      },
      {
        key: 'status',
        label: tableCopy.status,
        render: (row) => row.status,
        filterValue: (row) => row.status,
      },
      {
        key: 'metric',
        label: 'Metric',
        render: (row) => `${row.metricKey}: ${formatPercent(row.metricValue)} / ${formatPercent(row.threshold)}`,
      },
      {
        key: 'createdAt',
        label: tableCopy.createdAt,
        render: (row) => formatDate(row.createdAt),
      },
    ],
    [formatDate, formatPercent, tableCopy.alert, tableCopy.createdAt, tableCopy.severity, tableCopy.status],
  );

  if (isLoading) {
    return (
      <PageContainer title={routeCopy.title} description={routeCopy.subtitle}>
        <SkeletonPanel blocks={6} />
      </PageContainer>
    );
  }

  return (
    <main>
      <header className="masthead">
        <div>
          <span className="brand-mark">JC</span>
          <div>
            <strong>{pageCopy.brandTitle}</strong>
            <span>{pageCopy.brandSubtitle}</span>
          </div>
        </div>
        <nav className="top-nav">
          <a className="text-link" href="/">
            {pageCopy.navAudit}
          </a>
          <a className="text-link" href="/rules">
            {pageCopy.navRules}
          </a>
          <a className="text-link" href="/evals">
            {pageCopy.navEvals}
          </a>
          <a className="text-link" href="/releases">
            {pageCopy.navReleases}
          </a>
        </nav>
      </header>

      <section className="intro-block intro-block--compact">
        <p className="section-label">{pageCopy.heroEyebrow}</p>
        <h1>{pageCopy.heroTitle}</h1>
        <p>{pageCopy.heroDescription}</p>
      </section>

      {error ? <div className="error-message">{error}</div> : null}
      {message ? <div className="success-message">{message}</div> : null}

      <section className="monitoring-grid">
        {canManageGlobal ? (
        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Audit metrics</p>
            <h2>{pageCopy.metricsTitle}</h2>
          </div>
          <dl className="ops-metrics">
            <div>
              <dt>audit_total</dt>
              <dd>{metrics?.audit_total ?? 0}</dd>
            </div>
            <div>
              <dt>reject_rate</dt>
              <dd>{asPercent(metrics?.reject_rate ?? 0)}</dd>
            </div>
            <div>
              <dt>manual_review_rate</dt>
              <dd>{asPercent(metrics?.manual_review_rate ?? 0)}</dd>
            </div>
            <div>
              <dt>critical_finding_rate</dt>
              <dd>{asPercent(metrics?.critical_finding_rate ?? 0)}</dd>
            </div>
            <div>
              <dt>rag_no_result_rate</dt>
              <dd>{asPercent(metrics?.rag_no_result_rate ?? 0)}</dd>
            </div>
            <div>
              <dt>p95_latency</dt>
              <dd>{Math.round(metrics?.p95_latency ?? 0)}ms</dd>
            </div>
          </dl>
        </article>
        ) : (
          <article className="monitoring-panel">
            <p className="empty-state">{pageCopy.noManagePermission}</p>
          </article>
        )}

        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Versions</p>
            <h2>{pageCopy.versionsTitle}</h2>
          </div>
          <div className="ops-list">
            {versionEntries.length > 0 ? (
              versionEntries.map(([version, count]) => (
                <article key={version}>
                  <strong>{version}</strong>
                  <span>{pageCopy.auditCount.replace('{count}', String(count))}</span>
                </article>
              ))
            ) : (
              <p className="empty-state">{pageCopy.noVersionDistribution}</p>
            )}
          </div>
          <div className="ops-list ops-list--compact">
            {state.configs.map((config) => (
              <article key={config.key}>
                <strong>{config.key}</strong>
                <span>stable {config.stableVersion}</span>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="monitoring-grid monitoring-grid--wide">
        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">{pageCopy.newRolloutEyebrow}</p>
            <h2>{pageCopy.newRolloutTitle}</h2>
          </div>
          {canManageGlobal ? (
          <form className="rule-form" onSubmit={confirmCreateRollout}>
            <label>
              <span>{pageCopy.target}</span>
              <select
                value={form.target}
                onChange={(event) => setForm((current) => ({ ...current, target: event.target.value }))}
              >
                <option value="ruleVersion">{pageCopy.ruleVersion}</option>
                <option value="lawKbVersion">{pageCopy.lawKbVersion}</option>
                <option value="modelVersion">{pageCopy.modelVersion}</option>
              </select>
            </label>
            <div className="form-grid form-grid--compact">
              <label>
                <span>stableVersion</span>
                <input
                  required
                  value={form.stableVersion}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, stableVersion: event.target.value }))
                  }
                />
              </label>
              <label>
                <span>candidateVersion</span>
                <input
                  required
                  value={form.candidateVersion}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, candidateVersion: event.target.value }))
                  }
                />
              </label>
            </div>
            <label>
              <span>tenantAllowList</span>
              <input
                placeholder="tenant_a, tenant_b"
                value={form.tenantAllowList}
                onChange={(event) =>
                  setForm((current) => ({ ...current, tenantAllowList: event.target.value }))
                }
              />
            </label>
            <label>
              <span>rolloutPercent</span>
              <input
                min="0"
                max="100"
                type="number"
                value={form.rolloutPercent}
                onChange={(event) =>
                  setForm((current) => ({ ...current, rolloutPercent: event.target.value }))
                }
              />
            </label>
            <button className="submit-button submit-button--inline" type="submit" disabled={isSubmitting}>
              {isSubmitting ? pageCopy.creating : pageCopy.createRollout}
            </button>
          </form>
          ) : (
            <p className="empty-state">{pageCopy.noManagePermission}</p>
          )}
        </article>

        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Rollouts</p>
            <h2>{pageCopy.rolloutsTitle}</h2>
          </div>
          <DataTable
            rows={state.rollouts}
            columns={rolloutColumns}
            searchPlaceholder={tableCopy.search}
            filterLabel={tableCopy.filter}
            filters={[
              { label: tableCopy.all, value: 'all' },
              { label: 'active', value: 'active' },
              { label: 'paused', value: 'paused' },
              { label: 'completed', value: 'completed' },
              { label: 'rolled_back', value: 'rolled_back' },
            ]}
            emptyTitle={pageCopy.noRollouts}
          />
        </article>

        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Alerts</p>
            <h2>{pageCopy.alertsTitle}</h2>
          </div>
          <DataTable
            rows={state.alerts}
            columns={alertColumns}
            searchPlaceholder={tableCopy.search}
            filterLabel={tableCopy.filter}
            filters={[
              { label: tableCopy.all, value: 'all' },
              { label: tableCopy.critical, value: 'critical' },
              { label: tableCopy.warning, value: 'warning' },
              { label: tableCopy.open, value: 'open' },
              { label: tableCopy.resolved, value: 'resolved' },
            ]}
            emptyTitle={pageCopy.noAlerts}
          />
        </article>
      </section>
      {pendingSensitiveAction ? (
        <SensitiveActionDialog
          busy={isSubmitting}
          config={pendingSensitiveAction.config}
          onCancel={() => setPendingSensitiveAction(null)}
          onConfirm={() => {
            void pendingSensitiveAction.run().finally(() => setPendingSensitiveAction(null));
          }}
        />
      ) : null}
    </main>
  );
}
