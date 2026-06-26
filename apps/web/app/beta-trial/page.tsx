'use client';

import { useEffect, useState, type FormEvent } from 'react';

type BetaTrialMode = 'shadow_mode' | 'assist_mode' | 'enforce_mode';

interface TenantLevelModeRecord {
  tenantId: string;
  mode: BetaTrialMode;
  enabled: boolean;
  updatedAt: string;
}

interface BetaTrialRunRecord {
  id: string;
  tenantId: string;
  auditRunId: string;
  mode: BetaTrialMode;
  agentDecision: string;
  agentRiskLevel: string;
  humanDecision?: string;
  comparisonResult: string;
  falsePositive: boolean;
  falseNegative: boolean;
  businessImpactApplied: boolean;
  agentRuleIds: string[];
  agentEvidenceIds: string[];
  agentSummary: string;
  createdAt: string;
}

interface BetaTrialReport {
  total: number;
  compared: number;
  pending: number;
  agentHumanAgreementRate: number;
  severeRiskRecall: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  estimatedManualReviewMinutesSaved: number;
  topFalsePositiveRules: Array<{ ruleId: string; count: number }>;
  topFalseNegativeRules: Array<{ ruleId: string; count: number }>;
  topEvidenceErrors: Array<{ evidenceId: string; count: number }>;
  mismatchSamples: BetaTrialRunRecord[];
  generatedAt: string;
}

const modeCopy: Record<BetaTrialMode, string> = {
  shadow_mode: 'Shadow：只记录差异',
  assist_mode: 'Assist：辅助人工',
  enforce_mode: 'Enforce：可自动处置',
};

function asPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`请求失败（HTTP ${response.status}）`);
  return (await response.json()) as T;
}

export default function BetaTrialPage() {
  const [modes, setModes] = useState<TenantLevelModeRecord[]>([]);
  const [runs, setRuns] = useState<BetaTrialRunRecord[]>([]);
  const [report, setReport] = useState<BetaTrialReport | null>(null);
  const [tenantId, setTenantId] = useState('tenant_web');
  const [mode, setMode] = useState<BetaTrialMode>('shadow_mode');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    const [modePayload, runPayload, reportPayload] = await Promise.all([
      fetchJson<{ items: TenantLevelModeRecord[] }>('/api/beta-trial/tenant-modes'),
      fetchJson<{ items: BetaTrialRunRecord[] }>('/api/beta-trial/runs?mismatchOnly=true'),
      fetchJson<BetaTrialReport>('/api/beta-trial/reports/daily'),
    ]);
    setModes(modePayload.items);
    setRuns(runPayload.items);
    setReport(reportPayload);
  };

  useEffect(() => {
    load().catch((cause) => {
      setError(cause instanceof Error ? cause.message : '加载 Beta Trial 数据失败。');
    });
  }, []);

  const submitMode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    try {
      await fetchJson(`/api/beta-trial/tenant-modes/${tenantId.trim()}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          enabled: true,
          updatedBy: 'web_operator',
        }),
      });
      setNotice('租户试运行模式已更新。');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '更新租户模式失败。');
    }
  };

  return (
    <main>
      <header className="masthead">
        <div>
          <span className="brand-mark">BT</span>
          <div>
            <strong>封闭试运行</strong>
            <span>Beta Trial</span>
          </div>
        </div>
        <nav className="top-nav">
          <a className="text-link" href="/">
            审核台
          </a>
          <a className="text-link" href="/reviews">
            人工复核
          </a>
          <a className="text-link" href="/monitoring">
            监控灰度
          </a>
        </nav>
      </header>

      <section className="intro-block intro-block--compact">
        <p className="section-label">Beta trial</p>
        <h1>真实数据里先影子跑一圈。</h1>
        <p>
          支持 shadow、assist、enforce 三种模式，用人工结果对照 Agent 输出，观察误杀、漏判和依据质量。
        </p>
      </section>

      {error ? <div className="error-message">{error}</div> : null}
      {notice ? <div className="success-message">{notice}</div> : null}

      <section className="monitoring-grid">
        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Tenant mode</p>
            <h2>租户模式配置</h2>
          </div>
          <form className="rule-form" onSubmit={submitMode}>
            <label>
              <span>tenantId</span>
              <input
                required
                value={tenantId}
                onChange={(event) => setTenantId(event.target.value)}
              />
            </label>
            <label>
              <span>运行模式</span>
              <select value={mode} onChange={(event) => setMode(event.target.value as BetaTrialMode)}>
                {(Object.keys(modeCopy) as BetaTrialMode[]).map((entry) => (
                  <option key={entry} value={entry}>
                    {modeCopy[entry]}
                  </option>
                ))}
              </select>
            </label>
            <button className="submit-button submit-button--inline" type="submit">
              保存模式
            </button>
          </form>
          <div className="ops-list">
            {modes.map((item) => (
              <article key={item.tenantId}>
                <strong>{item.tenantId}</strong>
                <span>{modeCopy[item.mode]}</span>
                <small>{item.enabled ? 'enabled' : 'disabled'} · {item.updatedAt}</small>
              </article>
            ))}
            {modes.length === 0 ? <p className="empty-state">暂无显式租户模式。</p> : null}
          </div>
        </article>

        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Daily report</p>
            <h2>每日试运行报告</h2>
          </div>
          <dl className="ops-metrics">
            <div>
              <dt>total</dt>
              <dd>{report?.total ?? 0}</dd>
            </div>
            <div>
              <dt>compared</dt>
              <dd>{report?.compared ?? 0}</dd>
            </div>
            <div>
              <dt>一致率</dt>
              <dd>{asPercent(report?.agentHumanAgreementRate ?? 0)}</dd>
            </div>
            <div>
              <dt>严重风险召回</dt>
              <dd>{asPercent(report?.severeRiskRecall ?? 0)}</dd>
            </div>
            <div>
              <dt>误杀率</dt>
              <dd>{asPercent(report?.falsePositiveRate ?? 0)}</dd>
            </div>
            <div>
              <dt>漏判率</dt>
              <dd>{asPercent(report?.falseNegativeRate ?? 0)}</dd>
            </div>
          </dl>
          <p className="empty-state">
            预计节省人工复核时间：{report?.estimatedManualReviewMinutesSaved ?? 0} 分钟
          </p>
        </article>
      </section>

      <section className="monitoring-grid monitoring-grid--wide">
        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">False positives</p>
            <h2>Top 规则误杀</h2>
          </div>
          <div className="ops-list">
            {(report?.topFalsePositiveRules ?? []).map((entry) => (
              <article key={entry.ruleId}>
                <strong>{entry.ruleId}</strong>
                <span>{entry.count} 次</span>
              </article>
            ))}
            {(report?.topFalsePositiveRules ?? []).length === 0 ? (
              <p className="empty-state empty-state--pass">暂无误杀规则。</p>
            ) : null}
          </div>
        </article>

        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Mismatches</p>
            <h2>Agent 与人工不一致样本</h2>
          </div>
          <div className="ops-list">
            {runs.map((run) => (
              <article key={run.id}>
                <div>
                  <strong>{run.auditRunId}</strong>
                  <span className="rule-status rule-status--draft">{run.mode}</span>
                </div>
                <p>
                  Agent {run.agentDecision} / 人工 {run.humanDecision ?? '待补充'} ·{' '}
                  {run.falsePositive ? '误杀' : run.falseNegative ? '漏判' : run.comparisonResult}
                </p>
                <small>{run.agentSummary}</small>
              </article>
            ))}
            {runs.length === 0 ? (
              <p className="empty-state empty-state--pass">暂无不一致样本。</p>
            ) : null}
          </div>
        </article>

        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Evidence</p>
            <h2>Top evidence 引用错误</h2>
          </div>
          <div className="ops-list">
            {(report?.topEvidenceErrors ?? []).map((entry) => (
              <article key={entry.evidenceId}>
                <strong>{entry.evidenceId}</strong>
                <span>{entry.count} 次</span>
              </article>
            ))}
            {(report?.topEvidenceErrors ?? []).length === 0 ? (
              <p className="empty-state empty-state--pass">暂无依据错误。</p>
            ) : null}
          </div>
        </article>
      </section>
    </main>
  );
}
