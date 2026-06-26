'use client';

import { useEffect, useState } from 'react';
import type {
  ApiErrorResponse,
  Evidence,
  HumanReviewDecision,
  HumanReviewFeedbackType,
  HumanReviewTicket,
  RiskCategory,
  RuleImprovementSuggestion,
} from '@job-compliance/shared';
import {
  decisionLabels,
  getMatchedTexts,
  riskCategoryLabels,
  riskLevelLabels,
  severityLabels,
} from '../audit-view-model';

const tenantId = 'tenant_web';
const reviewerId = 'mock_reviewer_web';

const decisionCopy: Record<HumanReviewDecision, string> = {
  APPROVE: '通过发布',
  REJECT: '拦截岗位',
  REQUEST_REVISION: '要求修改',
};

const feedbackTypeCopy: Record<HumanReviewFeedbackType, string> = {
  FALSE_POSITIVE: '误杀',
  FALSE_NEGATIVE: '漏判',
  WRONG_CATEGORY: '类别错误',
  WRONG_SEVERITY: '等级错误',
  WRONG_EVIDENCE: '依据错误',
  BAD_REWRITE: '改写不安全',
  RULE_TOO_BROAD: '规则过宽',
  RULE_TOO_NARROW: '规则过窄',
  NEEDS_NEW_RULE: '需要新规则',
  VALID_RESULT: '结果有效',
};

const feedbackTypes = Object.keys(feedbackTypeCopy) as HumanReviewFeedbackType[];
const riskCategories = [
  'DISCRIMINATION',
  'FEE_DEPOSIT',
  'PRIVACY',
  'FALSE_OR_MISLEADING',
  'INCOMPLETE_INFORMATION',
  'LABOR_CONTRACT_RISK',
  'PLATFORM_POLICY',
  'OTHER',
] as RiskCategory[];

type LabelSeverity = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

interface LabelingReference {
  riskLevels: Array<{ level: LabelSeverity; meaning: string; recommendedAction: string }>;
  feedbackTypes: Array<{ type: HumanReviewFeedbackType; meaning: string }>;
}

interface ReviewerAgreementStats {
  reviewerId: string;
  totalLabeled: number;
  agreementCount: number;
  disagreementCount: number;
  agreementRate: number;
}

interface DisputedCase {
  id: string;
  reviewTicketId: string;
  status: 'open' | 'resolved';
  reason: string;
  reviewerDecisionIds: string[];
  finalDecision?: HumanReviewDecision;
  finalSeverity?: LabelSeverity;
}

interface AuthMe {
  permissions: string[];
}

interface TrainingStatus {
  completed: boolean;
  completion?: {
    completedAt: string;
    documentVersion: string;
  };
}

async function readError(response: Response, fallback: string): Promise<Error> {
  const payload = (await response.json().catch(() => null)) as ApiErrorResponse | null;
  return new Error(payload?.error.message ?? fallback);
}

function uniqueEvidence(ticket: HumanReviewTicket): Evidence[] {
  const seen = new Set<string>();
  return [
    ...ticket.auditResult.evidence,
    ...ticket.findings.flatMap((finding) => finding.evidence),
  ].filter((evidence) => {
    if (seen.has(evidence.id)) return false;
    seen.add(evidence.id);
    return true;
  });
}

export default function HumanReviewsPage() {
  const [tickets, setTickets] = useState<HumanReviewTicket[]>([]);
  const [suggestions, setSuggestions] = useState<RuleImprovementSuggestion[]>([]);
  const [selected, setSelected] = useState<HumanReviewTicket | null>(null);
  const [comment, setComment] = useState('请企业按 Agent 建议修改岗位文案后重新提交。');
  const [feedbackType, setFeedbackType] = useState<HumanReviewFeedbackType>('VALID_RESULT');
  const [labelReviewerId, setLabelReviewerId] = useState('reviewer_a');
  const [labelFinalDecision, setLabelFinalDecision] =
    useState<HumanReviewDecision>('REQUEST_REVISION');
  const [labelSeverity, setLabelSeverity] = useState<LabelSeverity>('HIGH');
  const [labelCategories, setLabelCategories] = useState('DISCRIMINATION');
  const [labelingReference, setLabelingReference] = useState<LabelingReference | null>(null);
  const [agreementStats, setAgreementStats] = useState<ReviewerAgreementStats[]>([]);
  const [disputedCases, setDisputedCases] = useState<DisputedCase[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [trainingStatus, setTrainingStatus] = useState<TrainingStatus | null>(null);
  const [addToEval, setAddToEval] = useState(true);
  const [createSuggestion, setCreateSuggestion] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadSuggestions = async () => {
    const response = await fetch(`/api/rule-suggestions?status=open&tenantId=${tenantId}`);
    if (!response.ok) throw await readError(response, '规则建议加载失败。');
    const payload = (await response.json()) as { items: RuleImprovementSuggestion[] };
    setSuggestions(payload.items);
  };

  const loadLabelingData = async () => {
    const [
      meResponse,
      referenceResponse,
      statsResponse,
      disputesResponse,
      trainingResponse,
    ] = await Promise.all([
      fetch('/api/auth/me'),
      fetch('/api/labeling/reference'),
      fetch('/api/reviewer-agreement-stats'),
      fetch(`/api/disputed-cases?status=all&tenantId=${tenantId}`),
      fetch(`/api/training/status?reviewerId=${reviewerId}&tenantId=${tenantId}`),
    ]);
    if (!meResponse.ok) throw await readError(meResponse, '权限信息加载失败。');
    if (!referenceResponse.ok) throw await readError(referenceResponse, '标注说明加载失败。');
    if (!statsResponse.ok) throw await readError(statsResponse, '一致率统计加载失败。');
    if (!disputesResponse.ok) throw await readError(disputesResponse, '争议样本加载失败。');
    if (!trainingResponse.ok) throw await readError(trainingResponse, '培训状态加载失败。');
    setPermissions(((await meResponse.json()) as AuthMe).permissions);
    setLabelingReference((await referenceResponse.json()) as LabelingReference);
    setAgreementStats(
      ((await statsResponse.json()) as { items: ReviewerAgreementStats[] }).items,
    );
    setDisputedCases(((await disputesResponse.json()) as { items: DisputedCase[] }).items);
    setTrainingStatus((await trainingResponse.json()) as TrainingStatus);
  };

  const canWriteReview = permissions.includes('review:write');

  const loadTickets = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/reviews?status=pending&tenantId=${tenantId}`);
      if (!response.ok) throw await readError(response, '复核单加载失败。');
      const payload = (await response.json()) as { items: HumanReviewTicket[] };
      setTickets(payload.items);
      setSelected((current) => {
        if (current && payload.items.some((ticket) => ticket.id === current.id)) return current;
        return payload.items[0] ?? null;
      });
      await loadSuggestions();
      await loadLabelingData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '复核单加载失败。');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadTickets();
  }, []);

  const addSelectedToEval = async (ticket: HumanReviewTicket) => {
    const response = await fetch(`/api/reviews/${ticket.id}/add-to-eval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        datasetId: 'human_review_feedback',
        humanReason: comment,
      }),
    });
    if (!response.ok) throw await readError(response, '加入评估集失败。');
  };

  const createSelectedRuleSuggestion = async (ticket: HumanReviewTicket) => {
    const response = await fetch(`/api/reviews/${ticket.id}/create-rule-suggestion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createdBy: reviewerId,
        feedbackType,
        title: `${feedbackTypeCopy[feedbackType]}：${ticket.findings[0]?.title ?? ticket.id}`,
        description: comment || ticket.summary,
      }),
    });
    if (!response.ok) throw await readError(response, '规则建议创建失败。');
  };

  const submitDecision = async (finalDecision: HumanReviewDecision) => {
    if (!selected) return;
    setIsSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/reviews/${selected.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewerId,
          finalDecision,
          feedbackType,
          comment,
          falsePositive: feedbackType === 'FALSE_POSITIVE',
          falseNegative: feedbackType === 'FALSE_NEGATIVE',
        }),
      });
      if (!response.ok) throw await readError(response, '人工结论提交失败。');
      const updated = (await response.json()) as HumanReviewTicket;
      if (addToEval) await addSelectedToEval(updated);
      if (createSuggestion) await createSelectedRuleSuggestion(updated);
      setSelected(updated);
      setNotice(`已提交人工结论：${decisionCopy[finalDecision]}`);
      await loadTickets();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '人工结论提交失败。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitReviewerLabel = async () => {
    if (!selected) return;
    setIsSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const categories = labelCategories
        .split(',')
        .map((category) => category.trim())
        .filter(Boolean);
      const response = await fetch(`/api/reviews/${selected.id}/reviewer-decisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewerId: labelReviewerId,
          finalDecision: labelFinalDecision,
          categories,
          severity: labelSeverity,
          feedbackType,
          comment,
          confidence: 0.9,
        }),
      });
      if (!response.ok) throw await readError(response, '多人标注提交失败。');
      setNotice(`已提交 ${labelReviewerId} 的标注。`);
      await loadLabelingData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '多人标注提交失败。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resolveDispute = async (dispute: DisputedCase) => {
    setError(null);
    try {
      const categories = labelCategories
        .split(',')
        .map((category) => category.trim())
        .filter(Boolean);
      const response = await fetch(`/api/disputed-cases/${dispute.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resolvedBy: 'senior_reviewer_web',
          finalDecision: labelFinalDecision,
          finalCategories: categories,
          finalSeverity: labelSeverity,
          resolutionComment: comment || '高级审核员已裁决。',
        }),
      });
      if (!response.ok) throw await readError(response, '争议裁决失败。');
      setNotice('争议样本已裁决。');
      await loadLabelingData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '争议裁决失败。');
    }
  };

  const resolveSuggestion = async (suggestion: RuleImprovementSuggestion) => {
    setError(null);
    try {
      const response = await fetch(`/api/rule-suggestions/${suggestion.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resolvedBy: 'mock_rule_admin',
          resolutionComment: '已记录，待规则发布流程统一处理。',
        }),
      });
      if (!response.ok) throw await readError(response, '规则建议处理失败。');
      await loadSuggestions();
      setNotice('规则建议已标记为已处理。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '规则建议处理失败。');
    }
  };

  const completeTraining = async () => {
    setError(null);
    try {
      const response = await fetch('/api/training/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewerId,
          tenantId,
          documentVersion: 'training-v1',
        }),
      });
      if (!response.ok) throw await readError(response, '培训确认失败。');
      setNotice('培训确认已记录。');
      await loadLabelingData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '培训确认失败。');
    }
  };

  return (
    <main>
      <header className="masthead">
        <div>
          <span className="brand-mark">HR</span>
          <div>
            <strong>人工复核台</strong>
            <span>Human Review Queue</span>
          </div>
        </div>
        <nav className="top-nav">
          <a className="text-link" href="/">
            返回审核台
          </a>
          <a className="text-link" href="/evals">
            评估台
          </a>
          <a className="text-link" href="/beta-trial">
            封闭试运行
          </a>
        </nav>
      </header>

      <section className="intro-block intro-block--compact">
        <p className="section-label">Manual review</p>
        <h1>把人的判断，变成下一轮改进的燃料。</h1>
        <p>复核结论可同步进入评估集，也可以沉淀为规则改进建议。MVP 使用固定 reviewerId。</p>
      </section>

      {error ? <div className="error-message">{error}</div> : null}
      {notice ? <div className="success-message">{notice}</div> : null}
      {trainingStatus?.completed !== true ? (
        <section className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Training required</p>
            <h2>首次使用前请完成培训确认</h2>
          </div>
          <p className="empty-state">
            为避免错误反馈污染评估集，请先阅读帮助中心里的反馈类型定义、常见误判案例和申诉处理指南。
          </p>
          <div className="rule-actions">
            <a className="ghost-button" href="/help-center">
              打开帮助中心
            </a>
            <button className="ghost-button" type="button" onClick={() => void completeTraining()}>
              我已完成阅读
            </button>
          </div>
        </section>
      ) : null}

      <section className="review-workspace review-workspace--wide">
        <aside className="review-queue">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Pending</p>
            <h2>待复核列表</h2>
          </div>
          {isLoading ? <p className="empty-state">正在加载复核单…</p> : null}
          {!isLoading && tickets.length === 0 ? (
            <p className="empty-state empty-state--pass">当前没有待复核单。</p>
          ) : null}
          <div className="review-ticket-list">
            {tickets.map((ticket) => (
              <button
                className={`review-ticket ${selected?.id === ticket.id ? 'review-ticket--active' : ''}`}
                key={ticket.id}
                type="button"
                onClick={() => setSelected(ticket)}
              >
                <span>{riskLevelLabels[ticket.riskLevel]}</span>
                <strong>{ticket.auditResult.auditId}</strong>
                <small>{ticket.summary}</small>
              </button>
            ))}
          </div>
        </aside>

        <section className="review-detail">
          {selected ? (
            <>
              <div className="result-banner result-banner--manual_review">
                <div>
                  <p className="section-label">Agent conclusion</p>
                  <h2>{decisionLabels[selected.suggestedAction]}</h2>
                  <p>{selected.summary}</p>
                </div>
              </div>

              <div className="result-facts">
                <div>
                  <span>Agent 结论</span>
                  <strong>{decisionLabels[selected.agentDecision]}</strong>
                </div>
                <div>
                  <span>风险等级</span>
                  <strong>{riskLevelLabels[selected.riskLevel]}</strong>
                </div>
                <div>
                  <span>状态</span>
                  <strong>{selected.status === 'pending' ? '待复核' : '已完成'}</strong>
                </div>
              </div>

              <section className="result-section">
                <div className="section-heading">
                  <p className="section-label">Findings</p>
                  <h2>风险详情与命中片段</h2>
                </div>
                <div className="finding-list">
                  {selected.findings.map((finding) => {
                    const matchedTexts = getMatchedTexts(finding);
                    return (
                      <article className="finding-card" key={finding.id}>
                        <div className="finding-card__head">
                          <span className="finding-number">!</span>
                          <div>
                            <p className="finding-category">
                              {riskCategoryLabels[finding.category]}
                            </p>
                            <h3>{finding.title}</h3>
                          </div>
                          <span className={`severity severity--${finding.severity.toLowerCase()}`}>
                            {severityLabels[finding.severity]}
                          </span>
                        </div>
                        <dl className="finding-details">
                          <div>
                            <dt>原文命中片段</dt>
                            <dd>
                              {matchedTexts.length > 0 ? (
                                <div className="quote-list">
                                  {matchedTexts.map((text) => (
                                    <mark key={text}>“{text}”</mark>
                                  ))}
                                </div>
                              ) : (
                                <span className="muted">无可展示片段</span>
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt>风险解释</dt>
                            <dd>{finding.message}</dd>
                          </div>
                          <div>
                            <dt>Agent 建议</dt>
                            <dd>{finding.suggestion ?? '建议人工确认后处理。'}</dd>
                          </div>
                        </dl>
                      </article>
                    );
                  })}
                </div>
              </section>

              <section className="result-section">
                <div className="section-heading">
                  <p className="section-label">Evidence</p>
                  <h2>依据展示</h2>
                </div>
                <div className="evidence-list">
                  {uniqueEvidence(selected).map((evidence) => (
                    <article className="evidence-item" key={evidence.id}>
                      <div>
                        <span className="evidence-type">{evidence.sourceType}</span>
                        <strong>{evidence.title}</strong>
                      </div>
                      <blockquote>{evidence.quote ?? '未提供摘录'}</blockquote>
                      <p>{evidence.version}</p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="result-section">
                <div className="section-heading">
                  <p className="section-label">Feedback</p>
                  <h2>人工最终结论</h2>
                </div>
                <div className="form-grid">
                  <label>
                    <span>审核员 ID</span>
                    <input
                      value={labelReviewerId}
                      onChange={(event) => setLabelReviewerId(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>标注结论</span>
                    <select
                      value={labelFinalDecision}
                      onChange={(event) =>
                        setLabelFinalDecision(event.target.value as HumanReviewDecision)
                      }
                    >
                      {(Object.keys(decisionCopy) as HumanReviewDecision[]).map((decision) => (
                        <option key={decision} value={decision}>
                          {decisionCopy[decision]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span title="请选择最能解释人工结论与 Agent 输出差异的类型，避免把主观偏好写入评估集。">
                      反馈类型 ⓘ
                    </span>
                    <select
                      value={feedbackType}
                      onChange={(event) =>
                        setFeedbackType(event.target.value as HumanReviewFeedbackType)
                      }
                    >
                      {feedbackTypes.map((type) => (
                        <option key={type} value={type}>
                          {feedbackTypeCopy[type]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>风险等级</span>
                    <select
                      value={labelSeverity}
                      onChange={(event) => setLabelSeverity(event.target.value as LabelSeverity)}
                    >
                      {(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as LabelSeverity[]).map(
                        (severity) => (
                          <option key={severity} value={severity}>
                            {severity}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label>
                    <span>风险类别，逗号分隔</span>
                    <input
                      list="risk-category-list"
                      value={labelCategories}
                      onChange={(event) => setLabelCategories(event.target.value)}
                    />
                    <datalist id="risk-category-list">
                      {riskCategories.map((category) => (
                        <option key={category} value={category} />
                      ))}
                    </datalist>
                  </label>
                  <label className="checkbox-row">
                    <input
                      checked={addToEval}
                      type="checkbox"
                      onChange={(event) => setAddToEval(event.target.checked)}
                    />
                    <span>加入评估集</span>
                  </label>
                  <label className="checkbox-row">
                    <input
                      checked={createSuggestion}
                      type="checkbox"
                      onChange={(event) => setCreateSuggestion(event.target.checked)}
                    />
                    <span>生成规则改进建议</span>
                  </label>
                </div>
                <label className="description-field review-comment">
                  <span>复核意见</span>
                  <textarea
                    rows={5}
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                  />
                </label>
                <p className="empty-state">
                  当前反馈类型：{feedbackTypeCopy[feedbackType]}。
                  {labelingReference?.feedbackTypes.find((entry) => entry.type === feedbackType)?.meaning ??
                    '请选择清晰的反馈类型。'}{' '}
                  <a className="text-link" href="/help-center">
                    查看完整定义
                  </a>
                </p>
                <div className="decision-buttons">
                  <button
                    className="decision-button decision-button--request_revision"
                    disabled={isSubmitting || !canWriteReview}
                    type="button"
                    onClick={() => void submitReviewerLabel()}
                  >
                    提交多人标注
                  </button>
                  {(Object.keys(decisionCopy) as HumanReviewDecision[]).map((decision) => (
                    <button
                      className={`decision-button decision-button--${decision.toLowerCase()}`}
                      disabled={isSubmitting || selected.status === 'completed' || !canWriteReview}
                      key={decision}
                      type="button"
                      onClick={() => void submitDecision(decision)}
                    >
                      {decisionCopy[decision]}
                    </button>
                  ))}
                </div>
                {!canWriteReview ? (
                  <p className="empty-state">当前角色没有提交人工复核或标注的权限。</p>
                ) : null}
                {selected.feedback ? (
                  <div className="feedback-summary">
                    <strong>已提交：{decisionCopy[selected.feedback.finalDecision]}</strong>
                    <p>{selected.feedback.comment || '无补充意见'}</p>
                    <small>
                      {feedbackTypeCopy[selected.feedback.feedbackType]} ·{' '}
                      {selected.feedback.reviewerId} · {selected.feedback.createdAt}
                    </small>
                  </div>
                ) : null}
              </section>
            </>
          ) : (
            <p className="empty-state">请选择一个复核单查看详情。</p>
          )}
        </section>

        <aside className="review-queue">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Labeling guide</p>
            <h2>风险等级解释</h2>
          </div>
          <div className="review-ticket-list">
            {labelingReference?.riskLevels.map((level) => (
              <article className="review-ticket" key={level.level}>
                <span>{level.level}</span>
                <strong>{level.recommendedAction}</strong>
                <small>{level.meaning}</small>
              </article>
            ))}
          </div>

          <div className="section-heading section-heading--stack">
            <p className="section-label">Feedback</p>
            <h2>反馈类型说明</h2>
          </div>
          <div className="review-ticket-list">
            {labelingReference?.feedbackTypes.slice(0, 5).map((entry) => (
              <article className="review-ticket" key={entry.type}>
                <span>{feedbackTypeCopy[entry.type]}</span>
                <small>{entry.meaning}</small>
              </article>
            ))}
          </div>

          <div className="section-heading section-heading--stack">
            <p className="section-label">Agreement</p>
            <h2>审核员一致率</h2>
          </div>
          <div className="review-ticket-list">
            {agreementStats.map((stat) => (
              <article className="review-ticket" key={stat.reviewerId}>
                <span>{Math.round(stat.agreementRate * 100)}%</span>
                <strong>{stat.reviewerId}</strong>
                <small>
                  一致 {stat.agreementCount} / 不一致 {stat.disagreementCount}
                </small>
              </article>
            ))}
            {agreementStats.length === 0 ? (
              <p className="empty-state">暂无多人标注统计。</p>
            ) : null}
          </div>

          <div className="section-heading section-heading--stack">
            <p className="section-label">Disputes</p>
            <h2>争议样本池</h2>
          </div>
          <div className="review-ticket-list">
            {disputedCases.map((dispute) => (
              <article className="review-ticket" key={dispute.id}>
                <span>{dispute.status}</span>
                <strong>{dispute.reviewTicketId}</strong>
                <small>
                  {dispute.reason} · 标注数 {dispute.reviewerDecisionIds.length}
                </small>
                {dispute.status === 'open' && canWriteReview ? (
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => void resolveDispute(dispute)}
                  >
                    按当前标签裁决
                  </button>
                ) : null}
              </article>
            ))}
            {disputedCases.length === 0 ? (
              <p className="empty-state empty-state--pass">暂无争议样本。</p>
            ) : null}
          </div>

          <div className="section-heading section-heading--stack">
            <p className="section-label">Rule suggestions</p>
            <h2>规则改进建议</h2>
          </div>
          <div className="review-ticket-list">
            {suggestions.map((suggestion) => (
              <article className="review-ticket" key={suggestion.id}>
                <span>{feedbackTypeCopy[suggestion.feedbackType]}</span>
                <strong>{suggestion.title}</strong>
                <small>{suggestion.description}</small>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => void resolveSuggestion(suggestion)}
                >
                  标记已处理
                </button>
              </article>
            ))}
            {suggestions.length === 0 ? (
              <p className="empty-state">暂无开放的规则改进建议。</p>
            ) : null}
          </div>
        </aside>
      </section>
    </main>
  );
}
