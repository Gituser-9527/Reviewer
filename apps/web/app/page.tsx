'use client';

import { useState, type FormEvent } from 'react';
import type { ApiErrorResponse, AuditResult, Evidence, Finding } from '@job-compliance/shared';
import {
  decisionLabels,
  getMatchedTexts,
  getRiskScore,
  riskCategoryLabels,
  riskLevelLabels,
  severityLabels,
} from './audit-view-model';

interface AuditFormState {
  title: string;
  companyName: string;
  description: string;
  salary: string;
  location: string;
  employmentType: string;
}

const initialForm: AuditFormState = {
  title: '',
  companyName: '',
  description: '',
  salary: '',
  location: '',
  employmentType: 'full_time',
};

function optionalText(value: string): string | undefined {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function formatEvidenceSource(evidence: Evidence): string {
  return evidence.sourceName ?? evidence.sourceId ?? evidence.sourceType;
}

function FindingCard({ finding, index }: Readonly<{ finding: Finding; index: number }>) {
  const matchedTexts = getMatchedTexts(finding);

  return (
    <article className="finding-card">
      <div className="finding-card__head">
        <span className="finding-number">{String(index + 1).padStart(2, '0')}</span>
        <div>
          <p className="finding-category">{riskCategoryLabels[finding.category]}</p>
          <h3>{finding.title}</h3>
        </div>
        <span className={`severity severity--${finding.severity.toLowerCase()}`}>
          {severityLabels[finding.severity]}
        </span>
      </div>

      <dl className="finding-details">
        <div>
          <dt>命中的原文片段</dt>
          <dd>
            {matchedTexts.length > 0 ? (
              <div className="quote-list">
                {matchedTexts.map((text) => (
                  <mark key={text}>“{text}”</mark>
                ))}
              </div>
            ) : (
              <span className="muted">无可展示的原文片段</span>
            )}
          </dd>
        </div>
        <div>
          <dt>风险解释</dt>
          <dd>{finding.message}</dd>
        </div>
        <div>
          <dt>修改建议</dt>
          <dd>{finding.suggestion ?? '请结合规则依据进行人工复核和修改。'}</dd>
        </div>
      </dl>

      <div className="finding-meta">
        <span>规则 {finding.ruleId ?? '未关联'}</span>
        <span>结论 {decisionLabels[finding.decision]}</span>
      </div>
    </article>
  );
}

function EvidenceList({ evidence }: Readonly<{ evidence: Evidence[] }>) {
  if (evidence.length === 0) {
    return <p className="empty-state">当前审核未返回法规或规则依据。</p>;
  }

  return (
    <div className="evidence-list">
      {evidence.map((item) => (
        <article className="evidence-item" key={item.id}>
          <div>
            <span className="evidence-type">{item.sourceType}</span>
            <strong>{formatEvidenceSource(item)}</strong>
          </div>
          {item.quote ? <blockquote>{item.quote}</blockquote> : null}
          <p>
            {item.sourceVersion ? `版本 ${item.sourceVersion}` : '未标注版本'}
            {item.fieldPath ? ` · 来源字段 ${item.fieldPath}` : ''}
          </p>
        </article>
      ))}
    </div>
  );
}

function AuditResultPanel({ result }: Readonly<{ result: AuditResult }>) {
  const score = getRiskScore(result);

  return (
    <section className="result-panel" aria-live="polite">
      <div className={`result-banner result-banner--${result.decision.toLowerCase()}`}>
        <div>
          <p className="section-label">审核结论</p>
          <h2>{decisionLabels[result.decision]}</h2>
          <p>{result.summary}</p>
        </div>
        <div className="score-block" aria-label={`风险分数 ${score.value} 分`}>
          <span>{score.value}</span>
          <small>/ 100</small>
          <em>{score.isEstimated ? '按等级换算' : '系统评分'}</em>
        </div>
      </div>

      <div className="result-facts">
        <div>
          <span>风险等级</span>
          <strong>{riskLevelLabels[result.riskLevel]}</strong>
        </div>
        <div>
          <span>风险项</span>
          <strong>{result.findings.length}</strong>
        </div>
        <div>
          <span>审核编号</span>
          <code>{result.auditId}</code>
        </div>
      </div>

      <section className="result-section">
        <div className="section-heading">
          <p className="section-label">Findings</p>
          <h2>风险明细</h2>
        </div>
        {result.findings.length > 0 ? (
          <div className="finding-list">
            {result.findings.map((finding, index) => (
              <FindingCard finding={finding} index={index} key={finding.id} />
            ))}
          </div>
        ) : (
          <p className="empty-state empty-state--pass">未发现当前规则集可识别的岗位风险。</p>
        )}
      </section>

      {result.suggestions.length > 0 ? (
        <section className="result-section">
          <div className="section-heading">
            <p className="section-label">Remediation</p>
            <h2>修改建议汇总</h2>
          </div>
          <ol className="suggestion-list">
            {result.suggestions.map((suggestion) => (
              <li key={suggestion}>{suggestion}</li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="result-section">
        <div className="section-heading">
          <p className="section-label">Evidence</p>
          <h2>规则与依据</h2>
        </div>
        <EvidenceList evidence={result.evidence} />
      </section>

      {result.compliantRewrite ? (
        <section className="result-section rewrite-section">
          <div className="section-heading">
            <p className="section-label">Rewritten posting</p>
            <h2>合规改写</h2>
          </div>
          <pre>{result.compliantRewrite}</pre>
        </section>
      ) : null}
    </section>
  );
}

export default function HomePage() {
  const [form, setForm] = useState(initialForm);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = (field: keyof AuditFormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submitAudit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/audit/job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: 'tenant_web',
          jobPostingId: `job_${Date.now()}`,
          company: { name: form.companyName.trim() },
          job: {
            title: form.title.trim(),
            description: form.description.trim(),
            location: optionalText(form.location),
            salary: optionalText(form.salary),
            employmentType: form.employmentType,
          },
          options: {
            jurisdiction: 'CN_MAINLAND',
            enableRewrite: true,
            enableRag: true,
          },
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as ApiErrorResponse | null;
        throw new Error(payload?.error.message ?? `审核请求失败（HTTP ${response.status}）`);
      }

      setResult((await response.json()) as AuditResult);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '审核请求失败，请稍后重试。');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main>
      <header className="masthead">
        <div>
          <span className="brand-mark">JC</span>
          <div>
            <strong>岗位合规审核台</strong>
            <span>Job Compliance Review</span>
          </div>
        </div>
        <span className="system-status">规则引擎 · CN MAINLAND · V1.0.0</span>
      </header>

      <section className="intro-block">
        <p className="section-label">New audit</p>
        <h1>发布之前，先把风险说清楚。</h1>
        <p>输入岗位原文，系统将基于当前规则集检查歧视、收费、隐私、误导与信息完整性风险。</p>
      </section>

      <section className="workspace">
        <form className="audit-form" onSubmit={submitAudit}>
          <div className="form-heading">
            <div>
              <span>01</span>
              <h2>岗位信息</h2>
            </div>
            <p>带 * 的字段为必填项</p>
          </div>

          <div className="form-grid">
            <label>
              <span>岗位标题 *</span>
              <input
                required
                maxLength={200}
                placeholder="例如：行政专员"
                value={form.title}
                onChange={(event) => updateField('title', event.target.value)}
              />
            </label>
            <label>
              <span>公司名称 *</span>
              <input
                required
                maxLength={200}
                placeholder="例如：某某科技有限公司"
                value={form.companyName}
                onChange={(event) => updateField('companyName', event.target.value)}
              />
            </label>
            <label>
              <span>工作地点</span>
              <input
                maxLength={500}
                placeholder="例如：北京"
                value={form.location}
                onChange={(event) => updateField('location', event.target.value)}
              />
            </label>
            <label>
              <span>薪资</span>
              <input
                maxLength={200}
                placeholder="例如：8k-15k"
                value={form.salary}
                onChange={(event) => updateField('salary', event.target.value)}
              />
            </label>
            <label>
              <span>用工类型</span>
              <select
                value={form.employmentType}
                onChange={(event) => updateField('employmentType', event.target.value)}
              >
                <option value="full_time">全职</option>
                <option value="part_time">兼职</option>
                <option value="internship">实习</option>
                <option value="contract">劳务 / 合同制</option>
              </select>
            </label>
          </div>

          <label className="description-field">
            <span>岗位描述 *</span>
            <textarea
              required
              maxLength={50_000}
              rows={10}
              placeholder="粘贴完整岗位描述，包括岗位职责、任职要求、福利待遇及其他说明……"
              value={form.description}
              onChange={(event) => updateField('description', event.target.value)}
            />
            <small>{form.description.length.toLocaleString()} / 50,000</small>
          </label>

          {error ? <div className="error-message">{error}</div> : null}

          <button className="submit-button" type="submit" disabled={isSubmitting}>
            <span>{isSubmitting ? '正在审核…' : '开始审核'}</span>
            <span aria-hidden="true">→</span>
          </button>
        </form>

        <aside className="review-note">
          <span>审核说明</span>
          <p>
            当前版本使用确定性 YAML 规则和本地人工维护知识库，不调用真实 LLM
            或外部向量服务。审核结果用于辅助发布决策，不替代法律意见。
          </p>
          <dl>
            <div>
              <dt>输入</dt>
              <dd>岗位文本与结构化字段</dd>
            </div>
            <div>
              <dt>输出</dt>
              <dd>结论、风险、依据与建议</dd>
            </div>
          </dl>
        </aside>
      </section>

      {result ? <AuditResultPanel result={result} /> : null}
    </main>
  );
}
