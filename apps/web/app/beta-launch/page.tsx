'use client';

import { useEffect, useState, type FormEvent } from 'react';

type BetaMode = 'shadow' | 'assist' | 'limited_enforce';

interface BetaProgram {
  id: string;
  tenantId: string;
  name: string;
  status: string;
  mode: BetaMode;
  startDate: string;
  endDate: string;
  ownerId: string;
}

interface BetaParticipant {
  id: string;
  displayName: string;
  role: string;
  userId: string;
  active: boolean;
}

interface BetaFeedback {
  id: string;
  reporterId: string;
  feedbackType: string;
  severity: string;
  status: string;
  title: string;
  description: string;
  createdAt: string;
}

interface BetaDailyReport {
  id: string;
  reportDate: string;
  activeParticipants: number;
  auditsReviewed: number;
  manualReviewsCompleted: number;
  feedbackOpened: number;
  feedbackResolved: number;
  blockers: string[];
  summary: string;
  nextActions: string[];
}

interface BetaGoNoGoCheck {
  id: string;
  checkKey: string;
  title: string;
  required: boolean;
  status: string;
  ownerRole: string;
  evidence?: string;
}

interface BetaOverview {
  program: BetaProgram;
  participants: BetaParticipant[];
  feedback: BetaFeedback[];
  dailyReports: BetaDailyReport[];
  goNoGoChecks: BetaGoNoGoCheck[];
  goNoGoSummary: {
    total: number;
    passed: number;
    failed: number;
    pending: number;
    ready: boolean;
  };
}

const modeLabels: Record<BetaMode, string> = {
  shadow: 'Shadow：只观察不影响业务',
  assist: 'Assist：给人工审核员建议',
  limited_enforce: 'Limited enforce：限定租户小范围执行',
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`请求失败（HTTP ${response.status}）`);
  return (await response.json()) as T;
}

export default function BetaLaunchPage() {
  const [programs, setPrograms] = useState<BetaProgram[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [overview, setOverview] = useState<BetaOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [programForm, setProgramForm] = useState({
    tenantId: 'tenant_beta',
    name: '招聘合规审核 Agent Beta',
    mode: 'shadow' as BetaMode,
    startDate: '2026-06-26',
    endDate: '2026-07-10',
    scope: '内部审核员、运营人员、合规人员受控试用',
  });
  const [participantForm, setParticipantForm] = useState({
    userId: 'reviewer_001',
    displayName: '审核员 A',
    role: 'reviewer',
    email: '',
  });
  const [feedbackForm, setFeedbackForm] = useState({
    reporterId: 'reviewer_001',
    feedbackType: 'ux_issue',
    severity: 'medium',
    title: '',
    description: '',
  });
  const [reportForm, setReportForm] = useState({
    auditsReviewed: '0',
    manualReviewsCompleted: '0',
    summary: '',
  });

  const loadPrograms = async (preferredId?: string) => {
    const payload = await fetchJson<{ items: BetaProgram[] }>('/api/beta-programs');
    setPrograms(payload.items);
    const nextId = preferredId ?? selectedId ?? payload.items[0]?.id ?? null;
    setSelectedId(nextId);
    if (nextId !== null) {
      const detail = await fetchJson<BetaOverview>(`/api/beta-programs/${nextId}`);
      setOverview(detail);
    } else {
      setOverview(null);
    }
  };

  useEffect(() => {
    loadPrograms().catch((cause) => {
      setError(cause instanceof Error ? cause.message : '加载 Beta 项目失败。');
    });
  }, []);

  const selectProgram = async (id: string) => {
    setSelectedId(id);
    setOverview(await fetchJson<BetaOverview>(`/api/beta-programs/${id}`));
  };

  const createProgram = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const program = await fetchJson<BetaProgram>('/api/beta-programs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(programForm),
      });
      setNotice('Beta 试运行项目已创建。');
      await loadPrograms(program.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建 Beta 项目失败。');
    }
  };

  const updateMode = async (mode: BetaMode) => {
    if (selectedId === null) return;
    await fetchJson(`/api/beta-programs/${selectedId}/mode`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    setNotice('测试模式已更新。');
    await selectProgram(selectedId);
  };

  const addParticipant = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedId === null) return;
    await fetchJson(`/api/beta-programs/${selectedId}/participants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...participantForm,
        email: participantForm.email.trim() || undefined,
      }),
    });
    setNotice('使用人员已添加。');
    await selectProgram(selectedId);
  };

  const addFeedback = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedId === null) return;
    await fetchJson(`/api/beta-programs/${selectedId}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(feedbackForm),
    });
    setFeedbackForm((current) => ({ ...current, title: '', description: '' }));
    setNotice('问题反馈已提交。');
    await selectProgram(selectedId);
  };

  const createDailyReport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedId === null) return;
    await fetchJson(`/api/beta-programs/${selectedId}/daily-reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auditsReviewed: Number(reportForm.auditsReviewed),
        manualReviewsCompleted: Number(reportForm.manualReviewsCompleted),
        summary: reportForm.summary.trim() || undefined,
        createdBy: 'web_operator',
      }),
    });
    setNotice('每日 Beta 报告已生成。');
    await selectProgram(selectedId);
  };

  const updateCheck = async (check: BetaGoNoGoCheck, status: string) => {
    if (selectedId === null) return;
    await fetchJson(`/api/beta-programs/${selectedId}/go-no-go/${check.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status,
        evidence: `${check.title}：${status}`,
      }),
    });
    await selectProgram(selectedId);
  };

  return (
    <main>
      <header className="masthead">
        <div>
          <span className="brand-mark">β</span>
          <div>
            <strong>Beta 试运行交付包</strong>
            <span>Controlled launch</span>
          </div>
        </div>
        <nav className="top-nav">
          <a className="text-link" href="/">
            审核台
          </a>
          <a className="text-link" href="/beta-trial">
            Beta Trial
          </a>
          <a className="text-link" href="/pilot">
            ROI 看板
          </a>
        </nav>
      </header>

      <section className="intro-block intro-block--compact">
        <p className="section-label">Beta launch</p>
        <h1>把试运行变成可执行的交付动作。</h1>
        <p>
          面向审核员、运营和合规团队，管理参与人员、测试模式、每日报告、问题反馈和 Go/No-Go 检查。
        </p>
      </section>

      {error ? <div className="error-message">{error}</div> : null}
      {notice ? <div className="success-message">{notice}</div> : null}

      <section className="monitoring-grid">
        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Create</p>
            <h2>创建 Beta 项目</h2>
          </div>
          <form className="rule-form" onSubmit={createProgram}>
            <label>
              <span>tenantId</span>
              <input
                value={programForm.tenantId}
                onChange={(event) =>
                  setProgramForm((current) => ({ ...current, tenantId: event.target.value }))
                }
              />
            </label>
            <label>
              <span>项目名称</span>
              <input
                value={programForm.name}
                onChange={(event) =>
                  setProgramForm((current) => ({ ...current, name: event.target.value }))
                }
              />
            </label>
            <label>
              <span>模式</span>
              <select
                value={programForm.mode}
                onChange={(event) =>
                  setProgramForm((current) => ({
                    ...current,
                    mode: event.target.value as BetaMode,
                  }))
                }
              >
                {(Object.keys(modeLabels) as BetaMode[]).map((mode) => (
                  <option key={mode} value={mode}>
                    {modeLabels[mode]}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid form-grid--compact">
              <label>
                <span>开始</span>
                <input
                  type="date"
                  value={programForm.startDate}
                  onChange={(event) =>
                    setProgramForm((current) => ({ ...current, startDate: event.target.value }))
                  }
                />
              </label>
              <label>
                <span>结束</span>
                <input
                  type="date"
                  value={programForm.endDate}
                  onChange={(event) =>
                    setProgramForm((current) => ({ ...current, endDate: event.target.value }))
                  }
                />
              </label>
            </div>
            <label>
              <span>范围</span>
              <textarea
                value={programForm.scope}
                onChange={(event) =>
                  setProgramForm((current) => ({ ...current, scope: event.target.value }))
                }
              />
            </label>
            <button className="submit-button submit-button--inline" type="submit">
              创建 Beta 项目
            </button>
          </form>
        </article>

        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Overview</p>
            <h2>Beta 试运行总览</h2>
          </div>
          <div className="ops-list">
            {programs.map((program) => (
              <button
                key={program.id}
                className={`eval-list-item ${selectedId === program.id ? 'eval-list-item--active' : ''}`}
                type="button"
                onClick={() => void selectProgram(program.id)}
              >
                <span>{program.status}</span>
                <strong>{program.name}</strong>
                <small>
                  {program.tenantId} · {modeLabels[program.mode]} · {program.startDate} 至{' '}
                  {program.endDate}
                </small>
              </button>
            ))}
            {programs.length === 0 ? <p className="empty-state">暂无 Beta 项目。</p> : null}
          </div>
          <dl className="ops-metrics">
            <div>
              <dt>participants</dt>
              <dd>{overview?.participants.length ?? 0}</dd>
            </div>
            <div>
              <dt>feedback</dt>
              <dd>{overview?.feedback.length ?? 0}</dd>
            </div>
            <div>
              <dt>go/no-go</dt>
              <dd>{overview?.goNoGoSummary.ready ? 'Go' : 'No'}</dd>
            </div>
          </dl>
        </article>
      </section>

      <section className="monitoring-grid monitoring-grid--wide">
        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Mode</p>
            <h2>使用模式配置</h2>
          </div>
          <div className="ops-list">
            {(Object.keys(modeLabels) as BetaMode[]).map((mode) => (
              <article key={mode}>
                <strong>{modeLabels[mode]}</strong>
                <button className="ghost-button" type="button" onClick={() => void updateMode(mode)}>
                  切换到此模式
                </button>
              </article>
            ))}
          </div>

          <div className="section-heading section-heading--stack">
            <p className="section-label">Participants</p>
            <h2>使用人员名单</h2>
          </div>
          <form className="rule-form" onSubmit={addParticipant}>
            <input
              value={participantForm.userId}
              onChange={(event) =>
                setParticipantForm((current) => ({ ...current, userId: event.target.value }))
              }
            />
            <input
              value={participantForm.displayName}
              onChange={(event) =>
                setParticipantForm((current) => ({ ...current, displayName: event.target.value }))
              }
            />
            <select
              value={participantForm.role}
              onChange={(event) =>
                setParticipantForm((current) => ({ ...current, role: event.target.value }))
              }
            >
              <option value="reviewer">审核员</option>
              <option value="operator">运营</option>
              <option value="compliance">合规</option>
              <option value="observer">观察者</option>
            </select>
            <button className="submit-button submit-button--inline" type="submit">
              添加人员
            </button>
          </form>
          <div className="ops-list">
            {(overview?.participants ?? []).map((participant) => (
              <article key={participant.id}>
                <strong>{participant.displayName}</strong>
                <span>{participant.role} · {participant.userId}</span>
              </article>
            ))}
          </div>
        </article>

        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Daily</p>
            <h2>每日测试报告</h2>
          </div>
          <form className="rule-form" onSubmit={createDailyReport}>
            <div className="form-grid form-grid--compact">
              <input
                type="number"
                value={reportForm.auditsReviewed}
                onChange={(event) =>
                  setReportForm((current) => ({ ...current, auditsReviewed: event.target.value }))
                }
              />
              <input
                type="number"
                value={reportForm.manualReviewsCompleted}
                onChange={(event) =>
                  setReportForm((current) => ({
                    ...current,
                    manualReviewsCompleted: event.target.value,
                  }))
                }
              />
            </div>
            <textarea
              placeholder="今日摘要"
              value={reportForm.summary}
              onChange={(event) =>
                setReportForm((current) => ({ ...current, summary: event.target.value }))
              }
            />
            <button className="submit-button submit-button--inline" type="submit">
              生成日报
            </button>
          </form>
          <div className="ops-list">
            {(overview?.dailyReports ?? []).map((report) => (
              <article key={report.id}>
                <strong>{report.reportDate}</strong>
                <span>
                  审核 {report.auditsReviewed} · 人工复核 {report.manualReviewsCompleted} · 反馈{' '}
                  {report.feedbackOpened}
                </span>
                <small>{report.summary}</small>
              </article>
            ))}
          </div>
        </article>

        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Go / No-Go</p>
            <h2>检查表</h2>
          </div>
          <p className="empty-state">
            已通过 {overview?.goNoGoSummary.passed ?? 0} / {overview?.goNoGoSummary.total ?? 0}，
            待确认 {overview?.goNoGoSummary.pending ?? 0}，失败{' '}
            {overview?.goNoGoSummary.failed ?? 0}
          </p>
          <div className="ops-list">
            {(overview?.goNoGoChecks ?? []).map((check) => (
              <article key={check.id}>
                <strong>{check.title}</strong>
                <span>{check.status} · owner {check.ownerRole}</span>
                <div className="rule-actions">
                  <button className="ghost-button" type="button" onClick={() => void updateCheck(check, 'pass')}>
                    Pass
                  </button>
                  <button className="ghost-button" type="button" onClick={() => void updateCheck(check, 'fail')}>
                    Fail
                  </button>
                  <button className="ghost-button" type="button" onClick={() => void updateCheck(check, 'waived')}>
                    Waive
                  </button>
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="monitoring-grid">
        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Feedback</p>
            <h2>问题反馈列表</h2>
          </div>
          <form className="rule-form" onSubmit={addFeedback}>
            <input
              placeholder="标题"
              value={feedbackForm.title}
              onChange={(event) =>
                setFeedbackForm((current) => ({ ...current, title: event.target.value }))
              }
            />
            <div className="form-grid form-grid--compact">
              <select
                value={feedbackForm.feedbackType}
                onChange={(event) =>
                  setFeedbackForm((current) => ({ ...current, feedbackType: event.target.value }))
                }
              >
                <option value="bug">Bug</option>
                <option value="false_positive">误杀</option>
                <option value="false_negative">漏判</option>
                <option value="bad_evidence">依据问题</option>
                <option value="bad_rewrite">改写问题</option>
                <option value="ux_issue">体验问题</option>
                <option value="process_gap">流程缺口</option>
                <option value="other">其他</option>
              </select>
              <select
                value={feedbackForm.severity}
                onChange={(event) =>
                  setFeedbackForm((current) => ({ ...current, severity: event.target.value }))
                }
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="critical">critical</option>
              </select>
            </div>
            <textarea
              placeholder="反馈描述"
              value={feedbackForm.description}
              onChange={(event) =>
                setFeedbackForm((current) => ({ ...current, description: event.target.value }))
              }
            />
            <button className="submit-button submit-button--inline" type="submit">
              提交反馈
            </button>
          </form>
        </article>

        <article className="monitoring-panel">
          <div className="ops-list">
            {(overview?.feedback ?? []).map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <span className={`severity severity--${item.severity}`}>{item.severity}</span>
                </div>
                <span>{item.feedbackType} · {item.status}</span>
                <small>{item.description}</small>
              </article>
            ))}
            {(overview?.feedback ?? []).length === 0 ? (
              <p className="empty-state">暂无反馈。</p>
            ) : null}
          </div>
        </article>
      </section>
    </main>
  );
}
