'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { ApiErrorResponse } from '@job-compliance/shared';

type ReleaseTarget = 'ruleVersion' | 'lawKbVersion' | 'modelVersion' | 'promptVersion';

interface ReleaseCandidate {
  id: string;
  name: string;
  target: ReleaseTarget;
  targetVersion: string;
  ruleVersion?: string;
  lawKbVersion?: string;
  modelVersion?: string;
  promptVersion?: string;
  status: string;
  createdAt: string;
  qualityMetrics: Record<string, number>;
}

interface GateCheck {
  id: string;
  checkKey: string;
  title: string;
  status: 'pass' | 'fail' | 'skipped';
  required: boolean;
  threshold?: number;
  actual?: number | string | boolean;
  detail: string;
}

interface GateResult {
  id: string;
  status: 'passed' | 'failed';
  checks: GateCheck[];
  createdAt: string;
}

interface ReleaseApproval {
  id: string;
  approvedBy: string;
  createdAt: string;
}

interface GateResultResponse {
  candidate: ReleaseCandidate;
  approvals: ReleaseApproval[];
  items: GateResult[];
}

interface CandidateForm {
  name: string;
  target: ReleaseTarget;
  version: string;
  criticalRecall: string;
  falseNegativeRate: string;
  falsePositiveRate: string;
  evidenceAccuracy: string;
  rewriteSafetyRate: string;
  redTeamRecall: string;
  predictedRejectRateChange: string;
}

type MetricFormKey = Exclude<keyof CandidateForm, 'name' | 'target' | 'version'>;

const metricFields: Array<[MetricFormKey, string]> = [
  ['criticalRecall', 'Critical Recall'],
  ['falseNegativeRate', 'False Negative'],
  ['falsePositiveRate', 'False Positive'],
  ['evidenceAccuracy', 'Evidence Accuracy'],
  ['rewriteSafetyRate', 'Rewrite Safety'],
  ['redTeamRecall', 'Red Team Recall'],
  ['predictedRejectRateChange', 'Reject 变化'],
];

const emptyForm: CandidateForm = {
  name: 'Rule release candidate',
  target: 'ruleVersion',
  version: '2.0.0',
  criticalRecall: '0.96',
  falseNegativeRate: '0.01',
  falsePositiveRate: '0.05',
  evidenceAccuracy: '0.92',
  rewriteSafetyRate: '0.96',
  redTeamRecall: '0.86',
  predictedRejectRateChange: '0.03',
};

async function parseApiError(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as ApiErrorResponse | null;
  return payload?.error.message ?? `请求失败（HTTP ${response.status}）`;
}

function toMetric(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default function ReleasesPage() {
  const [candidates, setCandidates] = useState<ReleaseCandidate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [gateResults, setGateResults] = useState<GateResult[]>([]);
  const [approvals, setApprovals] = useState<ReleaseApproval[]>([]);
  const [form, setForm] = useState<CandidateForm>(emptyForm);
  const [forcePublish, setForcePublish] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const selectedCandidate = candidates.find((candidate) => candidate.id === selectedId) ?? null;
  const latestGate = gateResults[0] ?? null;

  const loadCandidates = async () => {
    const response = await fetch('/api/releases/candidates');
    if (!response.ok) throw new Error(await parseApiError(response));
    const payload = (await response.json()) as { items: ReleaseCandidate[] };
    setCandidates(payload.items);
    setSelectedId((current) => current ?? payload.items[0]?.id ?? null);
  };

  const loadGateResults = async (candidateId: string) => {
    const response = await fetch(`/api/releases/candidates/${candidateId}/gate-results`);
    if (!response.ok) throw new Error(await parseApiError(response));
    const payload = (await response.json()) as GateResultResponse;
    setGateResults(payload.items);
    setApprovals(payload.approvals);
  };

  useEffect(() => {
    void loadCandidates().catch((cause) =>
      setError(cause instanceof Error ? cause.message : '发布候选加载失败。'),
    );
  }, []);

  useEffect(() => {
    if (selectedId === null) return;
    void loadGateResults(selectedId).catch((cause) =>
      setError(cause instanceof Error ? cause.message : '门禁结果加载失败。'),
    );
  }, [selectedId]);

  const createCandidate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/releases/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          target: form.target,
          [form.target]: form.version,
          createdBy: 'release_operator',
          qualityMetrics: {
            criticalRecall: toMetric(form.criticalRecall),
            falseNegativeRate: toMetric(form.falseNegativeRate),
            falsePositiveRate: toMetric(form.falsePositiveRate),
            evidenceAccuracy: toMetric(form.evidenceAccuracy),
            rewriteSafetyRate: toMetric(form.rewriteSafetyRate),
            redTeamRecall: toMetric(form.redTeamRecall),
            predictedRejectRateChange: toMetric(form.predictedRejectRateChange),
          },
        }),
      });
      if (!response.ok) throw new Error(await parseApiError(response));
      const candidate = (await response.json()) as ReleaseCandidate;
      setMessage('发布候选已创建。');
      await loadCandidates();
      setSelectedId(candidate.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '发布候选创建失败。');
    } finally {
      setIsBusy(false);
    }
  };

  const runGates = async () => {
    if (selectedId === null) return;
    setIsBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/releases/candidates/${selectedId}/run-gates`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error(await parseApiError(response));
      const result = (await response.json()) as GateResult;
      setMessage(result.status === 'passed' ? '质量门禁已通过。' : '质量门禁未通过。');
      await loadCandidates();
      await loadGateResults(selectedId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '运行质量门禁失败。');
    } finally {
      setIsBusy(false);
    }
  };

  const approve = async () => {
    if (selectedId === null) return;
    setIsBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/releases/candidates/${selectedId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approvedBy: 'mock-compliance-manager',
          comment: '人工确认该发布候选可进入质量门禁。',
        }),
      });
      if (!response.ok) throw new Error(await parseApiError(response));
      setMessage('已完成人工审批。');
      await loadCandidates();
      await loadGateResults(selectedId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '审批失败。');
    } finally {
      setIsBusy(false);
    }
  };

  const publish = async () => {
    if (selectedId === null) return;
    setIsBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/releases/candidates/${selectedId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forcePublish }),
      });
      if (!response.ok) throw new Error(await parseApiError(response));
      const result = (await response.json()) as { rolloutPlanIds: string[] };
      setMessage(`已发布并创建灰度计划 ${result.rolloutPlanIds.join(', ') || '无'}。`);
      await loadCandidates();
      await loadGateResults(selectedId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '发布失败。');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <main>
      <header className="masthead">
        <div>
          <span className="brand-mark">JC</span>
          <div>
            <strong>发布质量门禁</strong>
            <span>Release Quality Gate</span>
          </div>
        </div>
        <nav className="top-nav">
          <a className="text-link" href="/rules">
            规则后台
          </a>
          <a className="text-link" href="/monitoring">
            监控灰度
          </a>
        </nav>
      </header>

      <section className="intro-block intro-block--compact">
        <p className="section-label">Release</p>
        <h1>发布前必须跑自动质量门禁。</h1>
        <p>适用于规则版本、知识库版本、模型配置和 Prompt 模板。门禁失败默认禁止发布。</p>
      </section>

      {error ? <div className="error-message">{error}</div> : null}
      {message ? <div className="success-message">{message}</div> : null}

      <section className="release-workspace">
        <aside className="rule-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Create</p>
            <h2>发布候选</h2>
          </div>
          <form className="rule-form" onSubmit={createCandidate}>
            <label>
              <span>名称</span>
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <label>
              <span>发布对象</span>
              <select
                value={form.target}
                onChange={(event) =>
                  setForm((current) => ({ ...current, target: event.target.value as ReleaseTarget }))
                }
              >
                <option value="ruleVersion">ruleVersion</option>
                <option value="lawKbVersion">lawKbVersion</option>
                <option value="modelVersion">modelVersion</option>
                <option value="promptVersion">promptVersion</option>
              </select>
            </label>
            <label>
              <span>目标版本</span>
              <input
                value={form.version}
                onChange={(event) =>
                  setForm((current) => ({ ...current, version: event.target.value }))
                }
              />
            </label>
            <div className="form-grid form-grid--compact">
              {metricFields.map(([key, label]) => (
                <label key={key}>
                  <span>{label}</span>
                  <input
                    value={form[key]}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, [key]: event.target.value }))
                    }
                  />
                </label>
              ))}
            </div>
            <button className="submit-button" disabled={isBusy} type="submit">
              创建候选
            </button>
          </form>
        </aside>

        <section className="rule-list-panel">
          <div className="section-heading">
            <p className="section-label">Candidates</p>
            <h2>候选列表</h2>
          </div>
          <div className="eval-list">
            {candidates.map((candidate) => (
              <button
                className={`eval-list-item ${
                  candidate.id === selectedId ? 'eval-list-item--active' : ''
                }`}
                key={candidate.id}
                type="button"
                onClick={() => setSelectedId(candidate.id)}
              >
                <strong>{candidate.name}</strong>
                <span>{candidate.status}</span>
                <small>
                  {candidate.target}: {candidate.targetVersion}
                </small>
              </button>
            ))}
            {candidates.length === 0 ? <p className="empty-state">暂无发布候选。</p> : null}
          </div>

          {selectedCandidate ? (
            <section className="result-section">
              <div className="section-heading">
                <p className="section-label">Gate</p>
                <h2>{selectedCandidate.name}</h2>
              </div>
              <div className="rule-publish-box">
                <button type="button" disabled={isBusy} onClick={approve}>
                  人工审批
                </button>
                <button type="button" disabled={isBusy} onClick={runGates}>
                  运行质量门禁
                </button>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={forcePublish}
                    onChange={(event) => setForcePublish(event.target.checked)}
                  />
                  <span>强制发布</span>
                </label>
                <button type="button" disabled={isBusy} onClick={publish}>
                  发布 / 进入灰度
                </button>
              </div>

              <div className="eval-metrics">
                <article>
                  <span>审批记录</span>
                  <strong>{approvals.length}</strong>
                </article>
                <article>
                  <span>最新门禁</span>
                  <strong>{latestGate?.status ?? '未运行'}</strong>
                </article>
                <article>
                  <span>状态</span>
                  <strong>{selectedCandidate.status}</strong>
                </article>
              </div>

              {latestGate ? (
                <div className="review-ticket-list">
                  {latestGate.checks.map((check) => (
                    <article className="review-ticket" key={check.id}>
                      <span>{check.status}</span>
                      <strong>{check.title}</strong>
                      <small>
                        {check.checkKey}
                        {check.threshold === undefined ? '' : ` · threshold=${check.threshold}`}
                        {check.actual === undefined ? '' : ` · actual=${String(check.actual)}`}
                      </small>
                      <p>{check.detail}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="empty-state">尚未运行门禁。</p>
              )}
            </section>
          ) : null}
        </section>
      </section>
    </main>
  );
}
