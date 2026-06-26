'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';

interface EvalDatasetRecord {
  id: string;
  name: string;
  version: string;
  description?: string;
  createdAt: string;
}

interface EvalFailureRecord {
  id: string;
  evalRunId: string;
  caseId: string;
  expected: Record<string, unknown>;
  actual: Record<string, unknown>;
  failureType: string;
  reason?: string;
  createdAt: string;
}

interface EvalRunReport {
  id: string;
  datasetId: string;
  ruleVersion: string;
  lawKbVersion?: string;
  modelVersion?: string;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  decisionAccuracy: number;
  categoryPrecision: number;
  categoryRecall: number;
  criticalRecall: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  manualReviewRate: number;
  evidenceAccuracy: number;
  rewriteSafetyRate: number;
  failures: EvalFailureRecord[];
  createdAt: string;
}

function percent(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(payload?.error?.message ?? `请求失败（HTTP ${response.status}）`);
  }
  return (await response.json()) as T;
}

export default function EvalsPage() {
  const [datasets, setDatasets] = useState<EvalDatasetRecord[]>([]);
  const [runs, setRuns] = useState<EvalRunReport[]>([]);
  const [failures, setFailures] = useState<EvalFailureRecord[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [selectedRun, setSelectedRun] = useState<EvalRunReport | null>(null);
  const [selectedFailure, setSelectedFailure] = useState<EvalFailureRecord | null>(null);
  const [datasetName, setDatasetName] = useState('真实岗位脱敏评估集');
  const [datasetVersion, setDatasetVersion] = useState('v1');
  const [jsonl, setJsonl] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === selectedDatasetId),
    [datasets, selectedDatasetId],
  );

  const loadOverview = async () => {
    const [datasetPayload, runPayload] = await Promise.all([
      requestJson<{ items: EvalDatasetRecord[] }>('/api/evals/datasets'),
      requestJson<{ items: EvalRunReport[] }>('/api/evals/runs'),
    ]);
    setDatasets(datasetPayload.items);
    setRuns(runPayload.items);
    setSelectedDatasetId((current) => current || datasetPayload.items[0]?.id || '');
  };

  useEffect(() => {
    void loadOverview().catch((cause) => {
      setError(cause instanceof Error ? cause.message : '加载评估数据失败。');
    });
  }, []);

  const createDataset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsBusy(true);
    setError(null);
    setMessage(null);
    try {
      const dataset = await requestJson<EvalDatasetRecord>('/api/evals/datasets', {
        method: 'POST',
        body: JSON.stringify({
          id: `dataset_${Date.now()}`,
          name: datasetName,
          version: datasetVersion,
        }),
      });
      await loadOverview();
      setSelectedDatasetId(dataset.id);
      setMessage('评估数据集已创建。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建数据集失败。');
    } finally {
      setIsBusy(false);
    }
  };

  const importCases = async () => {
    if (!selectedDatasetId || !jsonl.trim()) return;
    setIsBusy(true);
    setError(null);
    setMessage(null);
    try {
      const payload = await requestJson<{ imported: number }>(
        `/api/evals/datasets/${selectedDatasetId}/cases`,
        {
          method: 'POST',
          body: JSON.stringify({ jsonl }),
        },
      );
      setMessage(`已导入 ${payload.imported} 条脱敏样本。`);
      setJsonl('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '导入样本失败。');
    } finally {
      setIsBusy(false);
    }
  };

  const runEval = async () => {
    if (!selectedDatasetId) return;
    setIsBusy(true);
    setError(null);
    setMessage(null);
    try {
      const report = await requestJson<EvalRunReport>('/api/evals/run', {
        method: 'POST',
        body: JSON.stringify({
          datasetId: selectedDatasetId,
          modelVersion: 'mock',
          enableRealLlm: false,
        }),
      });
      setSelectedRun(report);
      setFailures(report.failures);
      setSelectedFailure(report.failures[0] ?? null);
      await loadOverview();
      setMessage('评估运行完成。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '评估运行失败。');
    } finally {
      setIsBusy(false);
    }
  };

  const openRun = async (run: EvalRunReport) => {
    setSelectedRun(run);
    const payload = await requestJson<{ items: EvalFailureRecord[] }>(
      `/api/evals/runs/${run.id}/failures`,
    );
    setFailures(payload.items);
    setSelectedFailure(payload.items[0] ?? null);
  };

  return (
    <main>
      <header className="masthead">
        <div>
          <span className="brand-mark">JC</span>
          <div>
            <strong>真实数据评估台</strong>
            <span>Evaluation Console</span>
          </div>
        </div>
        <nav className="top-nav">
          <a className="text-link" href="/">
            岗位审核
          </a>
          <a className="text-link" href="/rules">
            规则管理
          </a>
        </nav>
      </header>

      <section className="intro-block intro-block--compact">
        <p className="section-label">Real-world evaluation</p>
        <h1>用脱敏真实样本，检查规则稳定性。</h1>
        <p>导入 JSONL 评估样本，运行当前规则与本地依据检索，查看指标和失败样本。</p>
      </section>

      {error ? <div className="error-message">{error}</div> : null}
      {message ? <div className="success-message">{message}</div> : null}

      <section className="eval-workspace">
        <aside className="eval-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Datasets</p>
            <h2>评估数据集</h2>
          </div>

          <form className="rule-form" onSubmit={createDataset}>
            <label>
              <span>名称</span>
              <input value={datasetName} onChange={(event) => setDatasetName(event.target.value)} />
            </label>
            <label>
              <span>版本</span>
              <input
                value={datasetVersion}
                onChange={(event) => setDatasetVersion(event.target.value)}
              />
            </label>
            <button className="submit-button" disabled={isBusy} type="submit">
              <span>新建数据集</span>
              <span aria-hidden="true">＋</span>
            </button>
          </form>

          <div className="eval-list">
            {datasets.map((dataset) => (
              <button
                className={`eval-list-item ${
                  dataset.id === selectedDatasetId ? 'eval-list-item--active' : ''
                }`}
                key={dataset.id}
                onClick={() => setSelectedDatasetId(dataset.id)}
                type="button"
              >
                <strong>{dataset.name}</strong>
                <span>{dataset.version}</span>
                <small>{dataset.id}</small>
              </button>
            ))}
          </div>
        </aside>

        <section className="eval-detail">
          <div className="eval-toolbar">
            <div>
              <p className="section-label">Selected dataset</p>
              <h2>{selectedDataset?.name ?? '尚未选择数据集'}</h2>
            </div>
            <button
              className="submit-button submit-button--inline"
              disabled={isBusy || !selectedDatasetId}
              onClick={runEval}
              type="button"
            >
              <span>运行评估</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>

          <label className="description-field eval-import">
            <span>JSONL 样本导入</span>
            <textarea
              placeholder='{"id":"case_001","input":{"title":"行政专员","description":"限女性..."},"expected":{"decision":"REJECT","categories":["DISCRIMINATION"],"minRiskLevel":"critical"}}'
              rows={7}
              value={jsonl}
              onChange={(event) => setJsonl(event.target.value)}
            />
          </label>
          <button
            className="ghost-button"
            disabled={isBusy || !selectedDatasetId || !jsonl.trim()}
            onClick={importCases}
            type="button"
          >
            导入脱敏样本
          </button>

          <section className="result-section">
            <div className="section-heading">
              <p className="section-label">Runs</p>
              <h2>评估运行记录</h2>
            </div>
            <div className="eval-run-list">
              {runs.map((run) => (
                <button
                  className={`eval-run-card ${run.id === selectedRun?.id ? 'eval-run-card--active' : ''}`}
                  key={run.id}
                  onClick={() => void openRun(run)}
                  type="button"
                >
                  <strong>{run.id}</strong>
                  <span>{run.datasetId}</span>
                  <small>
                    {run.passedCases}/{run.totalCases} 通过 · 决策准确率{' '}
                    {percent(run.decisionAccuracy)}
                  </small>
                </button>
              ))}
            </div>
          </section>

          {selectedRun ? (
            <section className="result-section">
              <div className="section-heading">
                <p className="section-label">Metrics</p>
                <h2>评估指标</h2>
              </div>
              <dl className="eval-metrics">
                <div>
                  <dt>Decision Accuracy</dt>
                  <dd>{percent(selectedRun.decisionAccuracy)}</dd>
                </div>
                <div>
                  <dt>Category Precision</dt>
                  <dd>{percent(selectedRun.categoryPrecision)}</dd>
                </div>
                <div>
                  <dt>Category Recall</dt>
                  <dd>{percent(selectedRun.categoryRecall)}</dd>
                </div>
                <div>
                  <dt>Critical Recall</dt>
                  <dd>{percent(selectedRun.criticalRecall)}</dd>
                </div>
                <div>
                  <dt>False Positive Rate</dt>
                  <dd>{percent(selectedRun.falsePositiveRate)}</dd>
                </div>
                <div>
                  <dt>False Negative Rate</dt>
                  <dd>{percent(selectedRun.falseNegativeRate)}</dd>
                </div>
                <div>
                  <dt>Manual Review Rate</dt>
                  <dd>{percent(selectedRun.manualReviewRate)}</dd>
                </div>
                <div>
                  <dt>Evidence Accuracy</dt>
                  <dd>{percent(selectedRun.evidenceAccuracy)}</dd>
                </div>
                <div>
                  <dt>Rewrite Safety Rate</dt>
                  <dd>{percent(selectedRun.rewriteSafetyRate)}</dd>
                </div>
              </dl>
            </section>
          ) : null}

          {selectedRun ? (
            <section className="result-section">
              <div className="section-heading">
                <p className="section-label">Failures</p>
                <h2>失败样本</h2>
              </div>
              <div className="eval-failure-layout">
                <div className="eval-failure-list">
                  {failures.length === 0 ? (
                    <p className="empty-state empty-state--pass">当前运行没有失败样本。</p>
                  ) : (
                    failures.map((failure) => (
                      <button
                        className={`eval-list-item ${
                          failure.id === selectedFailure?.id ? 'eval-list-item--active' : ''
                        }`}
                        key={failure.id}
                        onClick={() => setSelectedFailure(failure)}
                        type="button"
                      >
                        <strong>{failure.caseId}</strong>
                        <span>{failure.failureType}</span>
                        <small>{failure.reason ?? '未记录失败原因'}</small>
                      </button>
                    ))
                  )}
                </div>
                {selectedFailure ? (
                  <article className="eval-failure-detail">
                    <h3>{selectedFailure.caseId}</h3>
                    <p>{selectedFailure.reason ?? '未记录失败原因'}</p>
                    <h4>Expected</h4>
                    <pre>{JSON.stringify(selectedFailure.expected, null, 2)}</pre>
                    <h4>Actual</h4>
                    <pre>{JSON.stringify(selectedFailure.actual, null, 2)}</pre>
                  </article>
                ) : null}
              </div>
            </section>
          ) : null}
        </section>
      </section>
    </main>
  );
}
