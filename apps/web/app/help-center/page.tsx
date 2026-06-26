'use client';

import { useEffect, useState } from 'react';

const tenantId = 'tenant_web';
const reviewerId = 'mock_reviewer_web';

interface HelpCenterPayload {
  documents: Array<{ title: string; path: string; summary: string }>;
  riskLevels: Array<{ level: string; meaning: string; recommendedAction: string }>;
  feedbackTypes: Array<{ type: string; meaning: string }>;
  videoPlaceholders: Array<{ title: string; url: string }>;
  onboardingChecklist: string[];
  commonMisjudgmentCases: string[];
}

interface TrainingStatus {
  reviewerId: string;
  tenantId?: string;
  completed: boolean;
  completion?: {
    completedAt: string;
    documentVersion: string;
  };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`请求失败（HTTP ${response.status}）`);
  return (await response.json()) as T;
}

export default function HelpCenterPage() {
  const [help, setHelp] = useState<HelpCenterPayload | null>(null);
  const [status, setStatus] = useState<TrainingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    const [helpPayload, statusPayload] = await Promise.all([
      fetchJson<HelpCenterPayload>('/api/help-center'),
      fetchJson<TrainingStatus>(
        `/api/training/status?reviewerId=${reviewerId}&tenantId=${tenantId}`,
      ),
    ]);
    setHelp(helpPayload);
    setStatus(statusPayload);
  };

  useEffect(() => {
    load().catch((cause) => {
      setError(cause instanceof Error ? cause.message : '帮助中心加载失败。');
    });
  }, []);

  const completeTraining = async () => {
    setError(null);
    setNotice(null);
    try {
      await fetchJson('/api/training/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewerId,
          tenantId,
          documentVersion: 'training-v1',
        }),
      });
      setNotice('培训确认已记录。');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '培训确认失败。');
    }
  };

  return (
    <main>
      <header className="masthead">
        <div>
          <span className="brand-mark">?</span>
          <div>
            <strong>帮助中心</strong>
            <span>Training & Support</span>
          </div>
        </div>
        <nav className="top-nav">
          <a className="text-link" href="/">
            审核台
          </a>
          <a className="text-link" href="/reviews">
            人工复核
          </a>
          <a className="text-link" href="/beta-launch">
            Beta 交付
          </a>
        </nav>
      </header>

      <section className="intro-block intro-block--compact">
        <p className="section-label">Help center</p>
        <h1>先统一判断口径，再让反馈进入系统。</h1>
        <p>审核员和运营人员可在这里查看培训文档、风险类型、反馈类型、常见误判和新手任务。</p>
      </section>

      {error ? <div className="error-message">{error}</div> : null}
      {notice ? <div className="success-message">{notice}</div> : null}

      {!status?.completed ? (
        <section className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Required</p>
            <h2>首次使用培训确认</h2>
          </div>
          <p className="empty-state">
            你还没有完成培训确认。请阅读培训文档、风险等级和反馈类型定义后，再提交人工反馈或将样本加入评估集。
          </p>
          <button className="submit-button submit-button--inline" type="button" onClick={() => void completeTraining()}>
            我已完成阅读并理解反馈口径
          </button>
        </section>
      ) : (
        <div className="success-message">
          已完成培训确认：{status.completion?.completedAt ?? '已记录'}
        </div>
      )}

      <section className="monitoring-grid">
        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Docs</p>
            <h2>帮助文档</h2>
          </div>
          <div className="ops-list">
            {(help?.documents ?? []).map((document) => (
              <article key={document.path}>
                <strong>{document.title}</strong>
                <span>{document.summary}</span>
                <small>{document.path}</small>
              </article>
            ))}
          </div>
        </article>

        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Checklist</p>
            <h2>新手任务清单</h2>
          </div>
          <div className="ops-list">
            {(help?.onboardingChecklist ?? []).map((item, index) => (
              <article key={item}>
                <strong>{String(index + 1).padStart(2, '0')}</strong>
                <span>{item}</span>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="monitoring-grid monitoring-grid--wide">
        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Risk</p>
            <h2>风险类型说明</h2>
          </div>
          <div className="ops-list">
            {(help?.riskLevels ?? []).map((level) => (
              <article key={level.level}>
                <strong>{level.level}</strong>
                <span>{level.meaning}</span>
                <small>{level.recommendedAction}</small>
              </article>
            ))}
          </div>
        </article>

        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Feedback</p>
            <h2>反馈类型说明</h2>
          </div>
          <div className="ops-list">
            {(help?.feedbackTypes ?? []).map((entry) => (
              <article key={entry.type}>
                <strong>{entry.type}</strong>
                <span>{entry.meaning}</span>
              </article>
            ))}
          </div>
        </article>

        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Cases</p>
            <h2>常见误判案例</h2>
          </div>
          <div className="ops-list">
            {(help?.commonMisjudgmentCases ?? []).map((item) => (
              <article key={item}>
                <span>{item}</span>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="monitoring-panel">
        <div className="section-heading section-heading--stack">
          <p className="section-label">Videos</p>
          <h2>操作视频占位链接</h2>
        </div>
        <div className="ops-list ops-list--compact">
          {(help?.videoPlaceholders ?? []).map((video) => (
            <article key={video.url}>
              <strong>{video.title}</strong>
              <a className="text-link" href={video.url}>
                视频占位链接
              </a>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
