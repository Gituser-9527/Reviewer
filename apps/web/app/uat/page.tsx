'use client';

import { useEffect, useState } from 'react';

type CheckStatus = 'pass' | 'warn' | 'fail';
type GoNoGoDecision = 'GO' | 'NO_GO';

interface UatCheckItem {
  key: string;
  title: string;
  status: CheckStatus;
  required: boolean;
  detail: string;
  evidence?: string;
}

interface UatAcceptanceReport {
  id: string;
  currentVersion: string;
  generatedAt: string;
  generatedBy: string;
  completedModules: string[];
  incompleteModules: string[];
  knownLimitations: string[];
  checks: UatCheckItem[];
  blockers: UatCheckItem[];
  recommendation: string;
  betaBoundaries: string[];
  goNoGoDecision: GoNoGoDecision;
  approvedBetaProgramId?: string;
  metrics: {
    evalAccuracy?: number;
    decisionAccuracy?: number;
    categoryRecall?: number;
    redTeamRecall?: number;
    p95LatencyMs?: number;
    securityStatus?: string;
    privacyStatus?: string;
    trainingReadinessRate?: number;
  };
}

interface BetaProgram {
  id: string;
  tenantId: string;
  name: string;
  mode: string;
  status: string;
}

const statusLabels: Record<CheckStatus, string> = {
  pass: '通过',
  warn: '关注',
  fail: '阻塞',
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as
      | { error?: { message?: string } }
      | undefined;
    throw new Error(body?.error?.message ?? `请求失败（HTTP ${response.status}）`);
  }
  return (await response.json()) as T;
}

function metricPercent(value: number | undefined): string {
  if (value === undefined) return '未记录';
  return `${Math.round(value * 1000) / 10}%`;
}

export default function UatPage() {
  const [reports, setReports] = useState<UatAcceptanceReport[]>([]);
  const [selected, setSelected] = useState<UatAcceptanceReport | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadReports = async (preferredId?: string) => {
    const payload = await fetchJson<{ items: UatAcceptanceReport[] }>('/api/uat/reports');
    setReports(payload.items);
    const next = payload.items.find((report) => report.id === preferredId) ?? payload.items[0] ?? null;
    setSelected(next);
  };

  useEffect(() => {
    loadReports().catch((cause) => {
      setError(cause instanceof Error ? cause.message : '加载 UAT 报告失败。');
    });
  }, []);

  const generateReport = async () => {
    setError(null);
    setNotice(null);
    try {
      const report = await fetchJson<UatAcceptanceReport>('/api/uat/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generatedBy: 'web_uat_operator' }),
      });
      setNotice('UAT 验收报告已生成。');
      await loadReports(report.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '生成 UAT 报告失败。');
    }
  };

  const generateBlockingReport = async () => {
    setError(null);
    setNotice(null);
    try {
      const report = await fetchJson<UatAcceptanceReport>('/api/uat/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generatedBy: 'web_uat_operator',
          checks: [
            {
              key: 'security',
              status: 'fail',
              detail: '演示阻塞项：安全检查未通过。',
              evidence: '用于验证 No-Go 行为。',
            },
          ],
        }),
      });
      setNotice('已生成带阻塞项的 UAT 报告。');
      await loadReports(report.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '生成阻塞报告失败。');
    }
  };

  const approveBeta = async () => {
    if (selected === null) return;
    setError(null);
    setNotice(null);
    try {
      const result = await fetchJson<{ betaProgram: BetaProgram }>(
        `/api/uat/reports/${selected.id}/approve-beta`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantId: 'tenant_beta',
            name: `UAT 通过 Beta - ${selected.currentVersion}`,
            mode: 'shadow',
            startDate: '2026-06-26',
            endDate: '2026-07-10',
            ownerId: 'web_uat_approver',
          }),
        },
      );
      setNotice(`已开启 Beta Program：${result.betaProgram.id}`);
      await loadReports(selected.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '批准进入 Beta 失败。');
    }
  };

  return (
    <main>
      <header className="masthead">
        <div>
          <span className="brand-mark">U</span>
          <div>
            <strong>UAT 验收总览</strong>
            <span>Acceptance gate</span>
          </div>
        </div>
        <nav className="top-nav">
          <a className="text-link" href="/">
            审核台
          </a>
          <a className="text-link" href="/beta-launch">
            Beta
          </a>
          <a className="text-link" href="/incidents">
            应急
          </a>
        </nav>
      </header>

      <section className="intro-block intro-block--compact">
        <p className="section-label">UAT acceptance</p>
        <h1>进入真实使用前的最后一道门。</h1>
        <p>
          汇总核心模块、测试覆盖、Eval、Red Team、安全隐私、回滚演练和培训准备情况；
          只在无阻塞项时允许开启 Beta Program。
        </p>
      </section>

      {notice ? <div className="success-message">{notice}</div> : null}
      {error ? <div className="error-message">{error}</div> : null}

      <section className="monitoring-grid">
        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Reports</p>
            <h2>UAT 报告</h2>
          </div>
          <div className="rule-actions">
            <button className="submit-button submit-button--inline" type="button" onClick={() => void generateReport()}>
              生成 UAT 报告
            </button>
            <button className="ghost-button" type="button" onClick={() => void generateBlockingReport()}>
              生成阻塞样例
            </button>
          </div>
          <div className="ops-list">
            {reports.map((report) => (
              <button
                key={report.id}
                className={`eval-list-item ${selected?.id === report.id ? 'eval-list-item--active' : ''}`}
                type="button"
                onClick={() => setSelected(report)}
              >
                <span>{report.goNoGoDecision}</span>
                <strong>{report.currentVersion}</strong>
                <small>
                  {report.generatedAt} · blockers {report.blockers.length}
                </small>
              </button>
            ))}
            {reports.length === 0 ? <p className="empty-state">暂无 UAT 报告。</p> : null}
          </div>
        </article>

        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Decision</p>
            <h2>Go / No-Go 决策</h2>
          </div>
          <dl className="ops-metrics">
            <div>
              <dt>decision</dt>
              <dd>{selected?.goNoGoDecision ?? '-'}</dd>
            </div>
            <div>
              <dt>blockers</dt>
              <dd>{selected?.blockers.length ?? 0}</dd>
            </div>
            <div>
              <dt>version</dt>
              <dd>{selected?.currentVersion ?? '-'}</dd>
            </div>
          </dl>
          <p className="empty-state">{selected?.recommendation ?? '请先生成 UAT 报告。'}</p>
          <button
            className="submit-button submit-button--inline"
            type="button"
            disabled={selected === null || selected.blockers.length > 0}
            onClick={() => void approveBeta()}
          >
            批准进入 Beta
          </button>
          {selected?.approvedBetaProgramId ? (
            <p className="success-message">已开启：{selected.approvedBetaProgramId}</p>
          ) : null}
        </article>
      </section>

      <section className="monitoring-grid monitoring-grid--wide">
        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Checks</p>
            <h2>各检查项状态</h2>
          </div>
          <div className="ops-list">
            {(selected?.checks ?? []).map((check) => (
              <article key={check.key}>
                <div>
                  <strong>{check.title}</strong>
                  <span className={`severity severity--${check.status === 'fail' ? 'critical' : check.status === 'warn' ? 'medium' : 'low'}`}>
                    {statusLabels[check.status]}
                  </span>
                </div>
                <span>{check.required ? 'required' : 'optional'} · {check.key}</span>
                <small>{check.detail}</small>
                {check.evidence ? <small>证据：{check.evidence}</small> : null}
              </article>
            ))}
          </div>
        </article>

        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Blockers</p>
            <h2>阻塞项列表</h2>
          </div>
          <div className="ops-list">
            {(selected?.blockers ?? []).map((blocker) => (
              <article key={blocker.key}>
                <strong>{blocker.title}</strong>
                <span>{blocker.key}</span>
                <small>{blocker.detail}</small>
              </article>
            ))}
            {(selected?.blockers.length ?? 0) === 0 ? (
              <p className="empty-state">当前无阻塞项，可以进入受控 Beta。</p>
            ) : null}
          </div>
        </article>

        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Metrics</p>
            <h2>关键指标</h2>
          </div>
          <dl className="ops-metrics">
            <div>
              <dt>eval</dt>
              <dd>{metricPercent(selected?.metrics.evalAccuracy)}</dd>
            </div>
            <div>
              <dt>decision</dt>
              <dd>{metricPercent(selected?.metrics.decisionAccuracy)}</dd>
            </div>
            <div>
              <dt>category</dt>
              <dd>{metricPercent(selected?.metrics.categoryRecall)}</dd>
            </div>
            <div>
              <dt>red team</dt>
              <dd>{metricPercent(selected?.metrics.redTeamRecall)}</dd>
            </div>
          </dl>
          <div className="ops-list">
            {(selected?.betaBoundaries ?? []).map((boundary) => (
              <article key={boundary}>
                <span>{boundary}</span>
              </article>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
