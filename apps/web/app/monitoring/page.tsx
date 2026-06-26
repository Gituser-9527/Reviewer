'use client';

import { useEffect, useState, type FormEvent } from 'react';

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

interface AuthMe {
  permissions: string[];
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
    throw new Error(`请求失败（HTTP ${response.status}）`);
  }
  return (await response.json()) as T;
}

export default function MonitoringPage() {
  const [state, setState] = useState<MonitoringState>(emptyState);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [form, setForm] = useState({
    target: 'ruleVersion',
    stableVersion: '1.0.0',
    candidateVersion: '1.0.1',
    tenantAllowList: '',
    rolloutPercent: '0',
  });

  const loadDashboard = async () => {
    const [me, metrics, configs, rollouts, alerts] = await Promise.all([
      fetchJson<AuthMe>('/api/auth/me'),
      fetchJson<AuditMetricsSnapshot>('/api/metrics/audit'),
      fetchJson<{ items: RuntimeConfigRecord[] }>('/api/runtime-configs'),
      fetchJson<{ items: RolloutPlanRecord[] }>('/api/rollouts'),
      fetchJson<{ items: AlertEventRecord[] }>('/api/alerts'),
    ]);
    setPermissions(me.permissions);
    setState({
      metrics,
      configs: configs.items,
      rollouts: rollouts.items,
      alerts: alerts.items,
    });
  };

  useEffect(() => {
    loadDashboard().catch((cause) => {
      setError(cause instanceof Error ? cause.message : '加载监控数据失败。');
    });
  }, []);

  const createRollout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
      setMessage('灰度计划已创建。');
      await loadDashboard();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建灰度计划失败。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const rollback = async (id: string) => {
    setError(null);
    setMessage(null);
    try {
      await fetchJson(`/api/rollouts/${id}/rollback`, { method: 'POST' });
      setMessage('已回滚到 stableVersion。');
      await loadDashboard();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '回滚失败。');
    }
  };

  const metrics = state.metrics;
  const versionEntries = Object.entries(metrics?.version_distribution ?? {});
  const canManageGlobal = permissions.includes('global:manage');

  return (
    <main>
      <header className="masthead">
        <div>
          <span className="brand-mark">JC</span>
          <div>
            <strong>岗位合规审核台</strong>
            <span>Monitoring & Rollout</span>
          </div>
        </div>
        <nav className="top-nav">
          <a className="text-link" href="/">
            审核台
          </a>
          <a className="text-link" href="/rules">
            规则管理
          </a>
          <a className="text-link" href="/evals">
            评估台
          </a>
          <a className="text-link" href="/releases">
            发布门禁
          </a>
        </nav>
      </header>

      <section className="intro-block intro-block--compact">
        <p className="section-label">Operations</p>
        <h1>监控灰度与快速回滚。</h1>
        <p>查看审核指标、规则版本分布、灰度计划和告警事件，支持运营侧一键回滚。</p>
      </section>

      {error ? <div className="error-message">{error}</div> : null}
      {message ? <div className="success-message">{message}</div> : null}

      <section className="monitoring-grid">
        {canManageGlobal ? (
        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Audit metrics</p>
            <h2>监控总览</h2>
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
            <p className="empty-state">当前角色没有创建灰度计划权限。</p>
          </article>
        )}

        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Versions</p>
            <h2>规则版本分布</h2>
          </div>
          <div className="ops-list">
            {versionEntries.length > 0 ? (
              versionEntries.map(([version, count]) => (
                <article key={version}>
                  <strong>{version}</strong>
                  <span>{count} 次审核</span>
                </article>
              ))
            ) : (
              <p className="empty-state">暂无审核版本分布。</p>
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
            <p className="section-label">New rollout</p>
            <h2>创建灰度计划</h2>
          </div>
          <form className="rule-form" onSubmit={createRollout}>
            <label>
              <span>目标</span>
              <select
                value={form.target}
                onChange={(event) => setForm((current) => ({ ...current, target: event.target.value }))}
              >
                <option value="ruleVersion">规则版本</option>
                <option value="lawKbVersion">知识库版本</option>
                <option value="modelVersion">模型版本</option>
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
              {isSubmitting ? '创建中…' : '创建灰度计划'}
            </button>
          </form>
        </article>

        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Rollouts</p>
            <h2>灰度计划列表</h2>
          </div>
          <div className="ops-list">
            {state.rollouts.length > 0 ? (
              state.rollouts.map((rollout) => (
                <article key={rollout.id}>
                  <div>
                    <strong>{rollout.target}</strong>
                    <span className={`rule-status rule-status--${rollout.status}`}>
                      {rollout.status}
                    </span>
                  </div>
                  <p>
                    {rollout.stableVersion} → {rollout.candidateVersion} ·{' '}
                    {rollout.rolloutPercent}% · allowList {rollout.tenantAllowList.length}
                  </p>
                  {canManageGlobal ? (
                  <button
                    className="ghost-button"
                    disabled={rollout.status === 'rolled_back'}
                    type="button"
                    onClick={() => void rollback(rollout.id)}
                  >
                    回滚到 stableVersion
                  </button>
                  ) : null}
                </article>
              ))
            ) : (
              <p className="empty-state">暂无灰度计划。</p>
            )}
          </div>
        </article>

        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Alerts</p>
            <h2>告警列表</h2>
          </div>
          <div className="ops-list">
            {state.alerts.length > 0 ? (
              state.alerts.map((alert) => (
                <article key={alert.id}>
                  <div>
                    <strong>{alert.message}</strong>
                    <span className={`severity severity--${alert.severity}`}>{alert.severity}</span>
                  </div>
                  <p>
                    {alert.metricKey}: {asPercent(alert.metricValue)} / 阈值{' '}
                    {asPercent(alert.threshold)}
                  </p>
                  <small>{new Date(alert.createdAt).toLocaleString('zh-CN')}</small>
                </article>
              ))
            ) : (
              <p className="empty-state empty-state--pass">暂无告警。</p>
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
