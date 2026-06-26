'use client';

import { useEffect, useState, type FormEvent } from 'react';

interface EmergencySwitch {
  key: 'force_manual_review' | 'disable_llm' | 'disable_auto_reject';
  enabled: boolean;
  reason?: string;
  updatedBy: string;
  updatedAt: string;
}

interface IncidentEvent {
  id: string;
  tenantId?: string;
  incidentType: string;
  severity: string;
  status: string;
  title: string;
  description: string;
  createdAt: string;
}

interface IncidentDetail {
  incident: IncidentEvent;
  actions: Array<{ id: string; actionType: string; summary: string; createdAt: string }>;
  postmortem?: {
    id: string;
    rootCause: string;
    impact: string;
    correctiveActions: string[];
    preventionActions: string[];
  };
}

const switchCopy: Record<EmergencySwitch['key'], string> = {
  force_manual_review: '一键切换 force_manual_review',
  disable_llm: '一键禁用 LLM',
  disable_auto_reject: '一键禁用自动拦截',
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`请求失败（HTTP ${response.status}）`);
  return (await response.json()) as T;
}

export default function IncidentsPage() {
  const [switches, setSwitches] = useState<EmergencySwitch[]>([]);
  const [incidents, setIncidents] = useState<IncidentEvent[]>([]);
  const [selected, setSelected] = useState<IncidentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [incidentForm, setIncidentForm] = useState({
    incidentType: 'llm_failure',
    severity: 'high',
    title: 'LLM 故障演练',
    description: '模拟 LLM 超时或不可用，验证系统降级为规则引擎审核。',
    tenantId: '',
  });
  const [postmortemForm, setPostmortemForm] = useState({
    rootCause: '演练场景，无真实故障。',
    impact: '无生产影响。',
  });

  const load = async () => {
    const [switchPayload, incidentPayload] = await Promise.all([
      fetchJson<{ items: EmergencySwitch[] }>('/api/emergency/switches'),
      fetchJson<{ items: IncidentEvent[] }>('/api/incidents'),
    ]);
    setSwitches(switchPayload.items);
    setIncidents(incidentPayload.items);
    const firstId = selected?.incident.id ?? incidentPayload.items[0]?.id;
    if (firstId) {
      setSelected(await fetchJson<IncidentDetail>(`/api/incidents/${firstId}`));
    }
  };

  useEffect(() => {
    load().catch((cause) => {
      setError(cause instanceof Error ? cause.message : '事故控制台加载失败。');
    });
  }, []);

  const toggleSwitch = async (item: EmergencySwitch) => {
    setError(null);
    setNotice(null);
    try {
      await fetchJson(`/api/emergency/switches/${item.key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: !item.enabled,
          reason: item.enabled ? '解除应急开关' : `触发 ${item.key}`,
          updatedBy: 'web_incident_commander',
        }),
      });
      setNotice(`${switchCopy[item.key]} 已${item.enabled ? '关闭' : '开启'}。`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '更新应急开关失败。');
    }
  };

  const createIncident = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const incident = await fetchJson<IncidentEvent>('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          incidentType: incidentForm.incidentType,
          severity: incidentForm.severity,
          title: incidentForm.title,
          description: incidentForm.description,
          tenantId: incidentForm.tenantId.trim() || undefined,
          createdBy: 'web_incident_commander',
        }),
      });
      await fetchJson(`/api/incidents/${incident.id}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'notify_owner',
          actorId: 'web_incident_commander',
          summary: '事故已记录，等待负责人处理。',
        }),
      });
      setNotice('事故已记录。');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '记录事故失败。');
    }
  };

  const createPostmortem = async () => {
    if (selected === null) return;
    setError(null);
    setNotice(null);
    try {
      await fetchJson(`/api/incidents/${selected.incident.id}/postmortem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rootCause: postmortemForm.rootCause,
          impact: postmortemForm.impact,
          timeline: ['发现事故', '触发应急开关', '确认降级策略', '生成复盘'],
          correctiveActions: ['补充回归样本', '复核规则版本'],
          preventionActions: ['发布前运行质量门禁', '定期演练 Kill Switch'],
          createdBy: 'web_incident_commander',
        }),
      });
      setNotice('事故复盘已生成。');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '生成事故复盘失败。');
    }
  };

  const runRollbackDrill = async () => {
    setError(null);
    setNotice(null);
    try {
      await fetchJson('/api/incidents/drills/rule-rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actorId: 'web_drill_operator',
          ruleVersion: 'previous-published-version',
        }),
      });
      setNotice('规则回滚演练已完成。');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '规则回滚演练失败。');
    }
  };

  return (
    <main>
      <header className="masthead">
        <div>
          <span className="brand-mark">SOS</span>
          <div>
            <strong>事故演练与应急控制台</strong>
            <span>Incident Response</span>
          </div>
        </div>
        <nav className="top-nav">
          <a className="text-link" href="/monitoring">
            监控灰度
          </a>
          <a className="text-link" href="/beta-launch">
            Beta 交付
          </a>
          <a className="text-link" href="/help-center">
            帮助中心
          </a>
        </nav>
      </header>

      <section className="intro-block intro-block--compact">
        <p className="section-label">Kill switch</p>
        <h1>出问题时，先稳住系统。</h1>
        <p>
          快速切换强制人工复核、禁用 LLM、禁用自动拦截，记录事故和复盘，并定期演练规则回滚。
        </p>
      </section>

      {error ? <div className="error-message">{error}</div> : null}
      {notice ? <div className="success-message">{notice}</div> : null}

      <section className="monitoring-grid">
        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Emergency</p>
            <h2>Kill Switch 控制台</h2>
          </div>
          <div className="ops-list">
            {switches.map((item) => (
              <article key={item.key}>
                <div>
                  <strong>{switchCopy[item.key]}</strong>
                  <span className={`rule-status rule-status--${item.enabled ? 'draft' : 'published'}`}>
                    {item.enabled ? 'ON' : 'OFF'}
                  </span>
                </div>
                <small>{item.reason ?? '未触发'} · {item.updatedAt}</small>
                <button className="ghost-button" type="button" onClick={() => void toggleSwitch(item)}>
                  {item.enabled ? '关闭开关' : '触发开关'}
                </button>
              </article>
            ))}
          </div>
        </article>

        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Drill</p>
            <h2>规则回滚演练</h2>
          </div>
          <p className="empty-state">
            演练会创建一条规则回滚事故、记录回滚动作并生成复盘报告，不改变真实规则版本。
          </p>
          <button className="submit-button submit-button--inline" type="button" onClick={() => void runRollbackDrill()}>
            开始规则回滚演练
          </button>
        </article>
      </section>

      <section className="monitoring-grid monitoring-grid--wide">
        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Incident</p>
            <h2>记录事故</h2>
          </div>
          <form className="rule-form" onSubmit={createIncident}>
            <select
              value={incidentForm.incidentType}
              onChange={(event) =>
                setIncidentForm((current) => ({ ...current, incidentType: event.target.value }))
              }
            >
              <option value="false_positive_spike">误杀升高</option>
              <option value="false_negative">漏判</option>
              <option value="system_error">系统异常</option>
              <option value="llm_failure">LLM 故障</option>
              <option value="rag_bad_citation">RAG 错误引用</option>
              <option value="data_leak">数据泄露</option>
              <option value="rule_regression">规则回归</option>
              <option value="other">其他</option>
            </select>
            <select
              value={incidentForm.severity}
              onChange={(event) =>
                setIncidentForm((current) => ({ ...current, severity: event.target.value }))
              }
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="critical">critical</option>
            </select>
            <input
              value={incidentForm.title}
              onChange={(event) =>
                setIncidentForm((current) => ({ ...current, title: event.target.value }))
              }
            />
            <textarea
              value={incidentForm.description}
              onChange={(event) =>
                setIncidentForm((current) => ({ ...current, description: event.target.value }))
              }
            />
            <button className="submit-button submit-button--inline" type="submit">
              记录事故
            </button>
          </form>
        </article>

        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Events</p>
            <h2>事故记录表</h2>
          </div>
          <div className="ops-list">
            {incidents.map((incident) => (
              <button
                key={incident.id}
                className={`eval-list-item ${selected?.incident.id === incident.id ? 'eval-list-item--active' : ''}`}
                type="button"
                onClick={() => {
                  void fetchJson<IncidentDetail>(`/api/incidents/${incident.id}`).then(setSelected);
                }}
              >
                <span>{incident.status}</span>
                <strong>{incident.title}</strong>
                <small>{incident.incidentType} · {incident.severity} · {incident.createdAt}</small>
              </button>
            ))}
          </div>
        </article>

        <article className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Postmortem</p>
            <h2>事故复盘报告</h2>
          </div>
          {selected ? (
            <>
              <strong>{selected.incident.title}</strong>
              <div className="ops-list">
                {selected.actions.map((action) => (
                  <article key={action.id}>
                    <span>{action.actionType}</span>
                    <small>{action.summary}</small>
                  </article>
                ))}
              </div>
              {selected.postmortem ? (
                <div className="feedback-summary">
                  <strong>Root cause</strong>
                  <p>{selected.postmortem.rootCause}</p>
                  <strong>Impact</strong>
                  <p>{selected.postmortem.impact}</p>
                </div>
              ) : (
                <div className="rule-form">
                  <textarea
                    value={postmortemForm.rootCause}
                    onChange={(event) =>
                      setPostmortemForm((current) => ({ ...current, rootCause: event.target.value }))
                    }
                  />
                  <textarea
                    value={postmortemForm.impact}
                    onChange={(event) =>
                      setPostmortemForm((current) => ({ ...current, impact: event.target.value }))
                    }
                  />
                  <button className="submit-button submit-button--inline" type="button" onClick={() => void createPostmortem()}>
                    生成复盘报告
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="empty-state">请选择事故查看详情。</p>
          )}
        </article>
      </section>
    </main>
  );
}
