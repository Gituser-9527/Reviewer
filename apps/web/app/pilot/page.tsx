'use client';

import { useEffect, useState, type FormEvent } from 'react';

type PilotMode = 'shadow_mode' | 'assist_mode' | 'enforce_mode';

interface PilotProject {
  id: string;
  tenantId: string;
  name: string;
  status: string;
  modes: PilotMode[];
  startDate: string;
  endDate: string;
  avgReviewTimeBefore: number;
  avgReviewTimeAfter: number;
  hourlyLaborCost: number;
  createdAt: string;
}

interface PilotDailyMetrics {
  id: string;
  mode: PilotMode | 'all';
  metricDate: string;
  totalJobsAudited: number;
  autoPassRate: number;
  autoRejectRate: number;
  manualReviewRate: number;
  timeSavedHours: number;
  estimatedLaborCostSaved: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  appealRate: number;
  customerSatisfaction: number;
  topRiskCategories: Array<{ category: string; count: number }>;
  topRuleHits: Array<{ ruleId: string; count: number }>;
}

interface RoiReport {
  totalJobsAudited: number;
  timeSavedHours: number;
  estimatedLaborCostSaved: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  appealRate: number;
  customerSatisfaction: number;
  risksAndLimitations: string[];
  markdown: string;
}

interface CustomerFeedback {
  id: string;
  feedbackType: string;
  rating?: number;
  contactName?: string;
  comment: string;
  createdAt: string;
}

interface PilotDashboard {
  project: PilotProject;
  dailyMetrics: PilotDailyMetrics[];
  report: RoiReport;
  feedback: CustomerFeedback[];
}

const modeLabels: Record<PilotMode, string> = {
  shadow_mode: 'Shadow',
  assist_mode: 'Assist',
  enforce_mode: 'Enforce',
};

function asPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`请求失败（HTTP ${response.status}）`);
  return (await response.json()) as T;
}

export default function PilotPage() {
  const [projects, setProjects] = useState<PilotProject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<PilotDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({
    tenantId: 'tenant_web',
    name: '客户招聘合规试点',
    startDate: '2026-06-26',
    endDate: '2026-07-26',
    modes: 'shadow_mode,assist_mode,enforce_mode',
    avgReviewTimeBefore: '8',
    avgReviewTimeAfter: '2',
    hourlyLaborCost: '120',
  });
  const [feedbackForm, setFeedbackForm] = useState({
    feedbackType: 'satisfaction',
    rating: '4',
    contactName: '',
    comment: '',
  });

  const loadProjects = async () => {
    const payload = await fetchJson<{ items: PilotProject[] }>('/api/pilots/projects');
    setProjects(payload.items);
    const firstId = selectedId ?? payload.items[0]?.id ?? null;
    setSelectedId(firstId);
    if (firstId !== null) {
      const detail = await fetchJson<PilotDashboard>(`/api/pilots/projects/${firstId}/dashboard`);
      setDashboard(detail);
    }
  };

  useEffect(() => {
    loadProjects().catch((cause) => {
      setError(cause instanceof Error ? cause.message : '加载试点数据失败。');
    });
  }, []);

  const selectProject = async (id: string) => {
    setSelectedId(id);
    setError(null);
    const detail = await fetchJson<PilotDashboard>(`/api/pilots/projects/${id}/dashboard`);
    setDashboard(detail);
  };

  const createProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const project = await fetchJson<PilotProject>('/api/pilots/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: form.tenantId.trim(),
          name: form.name.trim(),
          startDate: form.startDate,
          endDate: form.endDate,
          modes: form.modes
            .split(',')
            .map((mode) => mode.trim())
            .filter(Boolean),
          avgReviewTimeBefore: Number(form.avgReviewTimeBefore),
          avgReviewTimeAfter: Number(form.avgReviewTimeAfter),
          hourlyLaborCost: Number(form.hourlyLaborCost),
          createdBy: 'web_operator',
        }),
      });
      setNotice('试点项目已创建。');
      setSelectedId(project.id);
      await loadProjects();
      await selectProject(project.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建试点项目失败。');
    }
  };

  const addFeedback = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedId === null) return;
    setError(null);
    setNotice(null);
    try {
      await fetchJson(`/api/pilots/projects/${selectedId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedbackType: feedbackForm.feedbackType,
          rating: feedbackForm.rating.trim().length === 0 ? undefined : Number(feedbackForm.rating),
          contactName: feedbackForm.contactName.trim() || undefined,
          comment: feedbackForm.comment.trim(),
        }),
      });
      setFeedbackForm((current) => ({ ...current, comment: '' }));
      setNotice('客户反馈已记录。');
      await selectProject(selectedId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '记录客户反馈失败。');
    }
  };

  const report = dashboard?.report;
  const aggregate = dashboard?.dailyMetrics.find((metric) => metric.mode === 'all');
  const modeMetrics = dashboard?.dailyMetrics.filter((metric) => metric.mode !== 'all') ?? [];

  return (
    <main>
      <header className="masthead">
        <div>
          <span className="brand-mark">ROI</span>
          <div>
            <strong>客户试点与 ROI</strong>
            <span>Pilot dashboard</span>
          </div>
        </div>
        <nav className="top-nav">
          <a className="text-link" href="/">
            审核台
          </a>
          <a className="text-link" href="/beta-trial">
            Beta Trial
          </a>
          <a className="text-link" href="/monitoring">
            监控灰度
          </a>
        </nav>
      </header>

      <section className="intro-block intro-block--compact">
        <p className="section-label">Pilot ROI</p>
        <h1>把“合规更稳”翻译成业务价值。</h1>
        <p>
          创建客户试点项目，按 tenant 和试点周期聚合审核量、自动处置率、人工节省时间、误杀漏判和客户反馈。
        </p>
      </section>

      {error ? <div className="error-message">{error}</div> : null}
      {notice ? <div className="success-message">{notice}</div> : null}

      <section className="monitoring-grid">
        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">New pilot</p>
            <h2>创建试点项目</h2>
          </div>
          <form className="rule-form" onSubmit={createProject}>
            <label>
              <span>tenantId</span>
              <input
                required
                value={form.tenantId}
                onChange={(event) => setForm((current) => ({ ...current, tenantId: event.target.value }))}
              />
            </label>
            <label>
              <span>项目名称</span>
              <input
                required
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <div className="form-grid form-grid--compact">
              <label>
                <span>开始日期</span>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))}
                />
              </label>
              <label>
                <span>结束日期</span>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))}
                />
              </label>
            </div>
            <label>
              <span>模式对比</span>
              <input
                value={form.modes}
                onChange={(event) => setForm((current) => ({ ...current, modes: event.target.value }))}
              />
            </label>
            <div className="form-grid form-grid--compact">
              <label>
                <span>审核前分钟/条</span>
                <input
                  type="number"
                  value={form.avgReviewTimeBefore}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, avgReviewTimeBefore: event.target.value }))
                  }
                />
              </label>
              <label>
                <span>审核后分钟/条</span>
                <input
                  type="number"
                  value={form.avgReviewTimeAfter}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, avgReviewTimeAfter: event.target.value }))
                  }
                />
              </label>
            </div>
            <label>
              <span>人工小时成本</span>
              <input
                type="number"
                value={form.hourlyLaborCost}
                onChange={(event) =>
                  setForm((current) => ({ ...current, hourlyLaborCost: event.target.value }))
                }
              />
            </label>
            <button className="submit-button submit-button--inline" type="submit">
              创建试点
            </button>
          </form>
        </article>

        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Projects</p>
            <h2>试点项目列表</h2>
          </div>
          <div className="ops-list">
            {projects.map((project) => (
              <button
                key={project.id}
                className={`eval-list-item ${selectedId === project.id ? 'eval-list-item--active' : ''}`}
                type="button"
                onClick={() => void selectProject(project.id)}
              >
                <span>{project.status}</span>
                <strong>{project.name}</strong>
                <small>
                  {project.tenantId} · {project.startDate} 至 {project.endDate}
                </small>
              </button>
            ))}
            {projects.length === 0 ? <p className="empty-state">暂无试点项目。</p> : null}
          </div>
        </article>
      </section>

      <section className="monitoring-grid">
        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Metrics</p>
            <h2>试点期间指标</h2>
          </div>
          <dl className="ops-metrics">
            <div>
              <dt>totalJobsAudited</dt>
              <dd>{report?.totalJobsAudited ?? 0}</dd>
            </div>
            <div>
              <dt>timeSavedHours</dt>
              <dd>{report?.timeSavedHours.toFixed(1) ?? '0.0'}</dd>
            </div>
            <div>
              <dt>costSaved</dt>
              <dd>{report?.estimatedLaborCostSaved.toFixed(0) ?? '0'}</dd>
            </div>
            <div>
              <dt>autoPassRate</dt>
              <dd>{asPercent(aggregate?.autoPassRate ?? 0)}</dd>
            </div>
            <div>
              <dt>manualReviewRate</dt>
              <dd>{asPercent(aggregate?.manualReviewRate ?? 0)}</dd>
            </div>
            <div>
              <dt>customerSatisfaction</dt>
              <dd>{report?.customerSatisfaction.toFixed(1) ?? '0.0'}</dd>
            </div>
          </dl>
        </article>

        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">ROI report</p>
            <h2>ROI 报告</h2>
          </div>
          <p className="empty-state">
            误杀率 {asPercent(report?.falsePositiveRate ?? 0)} · 漏判率{' '}
            {asPercent(report?.falseNegativeRate ?? 0)} · 申诉率{' '}
            {asPercent(report?.appealRate ?? 0)}
          </p>
          {selectedId ? (
            <div className="rule-actions">
              <a className="ghost-button" href={`/api/pilots/projects/${selectedId}/roi-report/export?format=markdown`}>
                导出 Markdown
              </a>
              <a className="ghost-button" href={`/api/pilots/projects/${selectedId}/roi-report/export?format=pdf`}>
                导出 PDF
              </a>
            </div>
          ) : null}
          <div className="ops-list">
            {(report?.risksAndLimitations ?? []).map((item) => (
              <article key={item}>
                <strong>风险和限制</strong>
                <span>{item}</span>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="monitoring-grid monitoring-grid--wide">
        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Modes</p>
            <h2>模式对比</h2>
          </div>
          <div className="ops-list">
            {modeMetrics.map((metric) => (
              <article key={metric.id}>
                <strong>{modeLabels[metric.mode as PilotMode]}</strong>
                <span>
                  审核 {metric.totalJobsAudited} · 自动通过 {asPercent(metric.autoPassRate)} · 自动拦截{' '}
                  {asPercent(metric.autoRejectRate)}
                </span>
                <small>
                  节省 {metric.timeSavedHours.toFixed(2)} 小时 / {metric.estimatedLaborCostSaved.toFixed(2)}
                </small>
              </article>
            ))}
          </div>
        </article>

        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Feedback</p>
            <h2>客户反馈列表</h2>
          </div>
          <form className="rule-form" onSubmit={addFeedback}>
            <div className="form-grid form-grid--compact">
              <label>
                <span>类型</span>
                <select
                  value={feedbackForm.feedbackType}
                  onChange={(event) =>
                    setFeedbackForm((current) => ({ ...current, feedbackType: event.target.value }))
                  }
                >
                  <option value="satisfaction">满意度</option>
                  <option value="risk">风险/申诉</option>
                  <option value="feature_request">功能建议</option>
                  <option value="bug">问题反馈</option>
                  <option value="other">其他</option>
                </select>
              </label>
              <label>
                <span>评分</span>
                <input
                  min="1"
                  max="5"
                  type="number"
                  value={feedbackForm.rating}
                  onChange={(event) =>
                    setFeedbackForm((current) => ({ ...current, rating: event.target.value }))
                  }
                />
              </label>
            </div>
            <label>
              <span>联系人</span>
              <input
                value={feedbackForm.contactName}
                onChange={(event) =>
                  setFeedbackForm((current) => ({ ...current, contactName: event.target.value }))
                }
              />
            </label>
            <label>
              <span>反馈内容</span>
              <textarea
                required
                value={feedbackForm.comment}
                onChange={(event) =>
                  setFeedbackForm((current) => ({ ...current, comment: event.target.value }))
                }
              />
            </label>
            <button className="submit-button submit-button--inline" type="submit" disabled={selectedId === null}>
              记录反馈
            </button>
          </form>
          <div className="ops-list">
            {(dashboard?.feedback ?? []).map((item) => (
              <article key={item.id}>
                <strong>{item.feedbackType}</strong>
                <span>
                  {item.rating ? `${item.rating}/5 · ` : ''}
                  {item.comment}
                </span>
                <small>{new Date(item.createdAt).toLocaleString('zh-CN')}</small>
              </article>
            ))}
          </div>
        </article>

        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Top risks</p>
            <h2>风险与规则命中</h2>
          </div>
          <div className="ops-list">
            {(aggregate?.topRiskCategories ?? []).map((entry) => (
              <article key={entry.category}>
                <strong>{entry.category}</strong>
                <span>{entry.count} 次</span>
              </article>
            ))}
            {(aggregate?.topRuleHits ?? []).map((entry) => (
              <article key={entry.ruleId}>
                <strong>{entry.ruleId}</strong>
                <span>{entry.count} 次</span>
              </article>
            ))}
            {(aggregate?.topRiskCategories ?? []).length === 0 &&
            (aggregate?.topRuleHits ?? []).length === 0 ? (
              <p className="empty-state">暂无风险类别或规则命中。</p>
            ) : null}
          </div>
        </article>
      </section>
    </main>
  );
}
