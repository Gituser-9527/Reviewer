'use client';

import { useEffect, useState } from 'react';
import type {
  ApiErrorResponse,
  Evidence,
  HumanReviewDecision,
  HumanReviewFeedbackType,
  HumanReviewTicket,
  RiskCategory,
  Severity,
  RuleImprovementSuggestion,
} from '@job-compliance/shared';
import { useAuth } from '../auth/auth-provider';
import { getMatchedTexts } from '../audit-view-model';
import {
  SensitiveActionDialog,
  type SensitiveActionConfig,
} from '../components/sensitive-action-dialog';
import { useLanguage } from '../i18n/language-provider';

const reviewerId = 'mock_reviewer_web';

const reviewDecisions: HumanReviewDecision[] = ['APPROVE', 'REJECT', 'REQUEST_REVISION'];
const feedbackTypes: HumanReviewFeedbackType[] = [
  'FALSE_POSITIVE',
  'FALSE_NEGATIVE',
  'WRONG_CATEGORY',
  'WRONG_SEVERITY',
  'WRONG_EVIDENCE',
  'BAD_REWRITE',
  'RULE_TOO_BROAD',
  'RULE_TOO_NARROW',
  'NEEDS_NEW_RULE',
  'VALID_RESULT',
];
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
  const auth = useAuth();
  const tenantId = auth.tenantId;
  const { formatPercent, messages } = useLanguage();
  const t = messages.workspacePages.reviewQueue;
  const enums = messages.enums;
  const [tickets, setTickets] = useState<HumanReviewTicket[]>([]);
  const [suggestions, setSuggestions] = useState<RuleImprovementSuggestion[]>([]);
  const [selected, setSelected] = useState<HumanReviewTicket | null>(null);
  const [comment, setComment] = useState('');
  const [feedbackType, setFeedbackType] = useState<HumanReviewFeedbackType>('VALID_RESULT');
  const [labelReviewerId, setLabelReviewerId] = useState('reviewer_a');
  const [labelFinalDecision, setLabelFinalDecision] =
    useState<HumanReviewDecision>('REQUEST_REVISION');
  const [labelSeverity, setLabelSeverity] = useState<LabelSeverity>('HIGH');
  const [labelCategories, setLabelCategories] = useState('DISCRIMINATION');
  const [labelingReference, setLabelingReference] = useState<LabelingReference | null>(null);
  const [agreementStats, setAgreementStats] = useState<ReviewerAgreementStats[]>([]);
  const [disputedCases, setDisputedCases] = useState<DisputedCase[]>([]);
  const [trainingStatus, setTrainingStatus] = useState<TrainingStatus | null>(null);
  const [addToEval, setAddToEval] = useState(true);
  const [createSuggestion, setCreateSuggestion] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingSensitiveAction, setPendingSensitiveAction] = useState<{
    config: SensitiveActionConfig;
    run: () => Promise<void>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadSuggestions = async () => {
    const response = await fetch(`/api/rule-suggestions?status=open&tenantId=${tenantId}`);
    if (!response.ok) throw await readError(response, t.errors.ruleSuggestionsLoadFailed);
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
    if (!meResponse.ok) throw await readError(meResponse, t.errors.permissionLoadFailed);
    if (!referenceResponse.ok) throw await readError(referenceResponse, t.errors.referenceLoadFailed);
    if (!statsResponse.ok) throw await readError(statsResponse, t.errors.statsLoadFailed);
    if (!disputesResponse.ok) throw await readError(disputesResponse, t.errors.disputesLoadFailed);
    if (!trainingResponse.ok) throw await readError(trainingResponse, t.errors.trainingLoadFailed);
    await meResponse.json();
    setLabelingReference((await referenceResponse.json()) as LabelingReference);
    setAgreementStats(
      ((await statsResponse.json()) as { items: ReviewerAgreementStats[] }).items,
    );
    setDisputedCases(((await disputesResponse.json()) as { items: DisputedCase[] }).items);
    setTrainingStatus((await trainingResponse.json()) as TrainingStatus);
  };

  const canWriteReview = auth.can('review:write');

  const loadTickets = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/reviews?status=pending&tenantId=${tenantId}`);
      if (!response.ok) throw await readError(response, t.errors.ticketsLoadFailed);
      const payload = (await response.json()) as { items: HumanReviewTicket[] };
      setTickets(payload.items);
      setSelected((current) => {
        if (current && payload.items.some((ticket) => ticket.id === current.id)) return current;
        return payload.items[0] ?? null;
      });
      await loadSuggestions();
      await loadLabelingData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.errors.ticketsLoadFailed);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadTickets();
  }, [tenantId]);

  const addSelectedToEval = async (ticket: HumanReviewTicket) => {
    const response = await fetch(`/api/reviews/${ticket.id}/add-to-eval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        datasetId: 'human_review_feedback',
        humanReason: comment || t.defaultComment,
      }),
    });
    if (!response.ok) throw await readError(response, t.errors.addToEvalFailed);
  };

  const createSelectedRuleSuggestion = async (ticket: HumanReviewTicket) => {
    const response = await fetch(`/api/reviews/${ticket.id}/create-rule-suggestion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createdBy: reviewerId,
        feedbackType,
        title: `${enums.feedbackType[feedbackType]}: ${ticket.findings[0]?.title ?? ticket.id}`,
        description: comment || ticket.summary,
      }),
    });
    if (!response.ok) throw await readError(response, t.errors.createSuggestionFailed);
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
      if (!response.ok) throw await readError(response, t.errors.decisionSubmitFailed);
      const updated = (await response.json()) as HumanReviewTicket;
      if (addToEval) await addSelectedToEval(updated);
      if (createSuggestion) await createSelectedRuleSuggestion(updated);
      setSelected(updated);
      setNotice(t.notices.decisionSubmitted.replace('{decision}', enums.reviewDecision[finalDecision]));
      await loadTickets();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.errors.decisionSubmitFailed);
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmSubmitDecision = (finalDecision: HumanReviewDecision) => {
    if (!selected) return;
    const sensitiveCopy = messages.permissions.sensitiveAction;
    setPendingSensitiveAction({
      config: {
        title: sensitiveCopy.humanDecisionTitle,
        description: sensitiveCopy.humanDecisionDescription,
        impact: [
          sensitiveCopy.reviewTicketImpact.replace('{id}', selected.id),
          sensitiveCopy.humanDecisionImpact.replace('{decision}', enums.reviewDecision[finalDecision]),
        ],
        confirmText: 'SUBMIT DECISION',
        confirmButtonLabel: sensitiveCopy.submitDecision,
        tone: finalDecision === 'REJECT' ? 'danger' : 'warning',
      },
      run: () => submitDecision(finalDecision),
    });
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
      if (!response.ok) throw await readError(response, t.errors.multiLabelSubmitFailed);
      setNotice(t.notices.labelSubmitted.replace('{reviewerId}', labelReviewerId));
      await loadLabelingData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.errors.multiLabelSubmitFailed);
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
          resolutionComment: comment || t.defaultDisputeResolution,
        }),
      });
      if (!response.ok) throw await readError(response, t.errors.disputeResolveFailed);
      setNotice(t.notices.disputeResolved);
      await loadLabelingData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.errors.disputeResolveFailed);
    }
  };

  const confirmResolveDispute = (dispute: DisputedCase) => {
    const sensitiveCopy = messages.permissions.sensitiveAction;
    setPendingSensitiveAction({
      config: {
        title: sensitiveCopy.humanDecisionTitle,
        description: sensitiveCopy.humanDecisionDescription,
        impact: [
          sensitiveCopy.reviewTicketImpact.replace('{id}', dispute.reviewTicketId),
          sensitiveCopy.humanDecisionImpact.replace('{decision}', enums.reviewDecision[labelFinalDecision]),
        ],
        confirmText: 'SUBMIT DECISION',
        confirmButtonLabel: sensitiveCopy.submitDecision,
        tone: labelFinalDecision === 'REJECT' ? 'danger' : 'warning',
      },
      run: () => resolveDispute(dispute),
    });
  };

  const resolveSuggestion = async (suggestion: RuleImprovementSuggestion) => {
    setError(null);
    try {
      const response = await fetch(`/api/rule-suggestions/${suggestion.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resolvedBy: 'mock_rule_admin',
          resolutionComment: t.defaultRuleResolution,
        }),
      });
      if (!response.ok) throw await readError(response, t.errors.suggestionResolveFailed);
      await loadSuggestions();
      setNotice(t.notices.suggestionResolved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.errors.suggestionResolveFailed);
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
      if (!response.ok) throw await readError(response, t.errors.trainingCompleteFailed);
      setNotice(t.notices.trainingCompleted);
      await loadLabelingData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.errors.trainingCompleteFailed);
    }
  };

  const riskLevelLabel = (level: LabelSeverity) =>
    level === 'NONE' ? enums.riskLevel.NONE : enums.riskLevel[level];
  const severityLabel = (severity: Severity) => enums.severity[severity];

  return (
    <main>
      <header className="masthead">
        <div>
          <span className="brand-mark">HR</span>
          <div>
            <strong>{t.brandTitle}</strong>
            <span>{t.brandSubtitle}</span>
          </div>
        </div>
        <nav className="top-nav">
          <a className="text-link" href="/">
            {t.nav.audit}
          </a>
          <a className="text-link" href="/evals">
            {t.nav.evals}
          </a>
          <a className="text-link" href="/beta-trial">
            {t.nav.betaTrial}
          </a>
        </nav>
      </header>

      <section className="intro-block intro-block--compact">
        <p className="section-label">{t.eyebrow}</p>
        <h1>{t.title}</h1>
        <p>{t.description}</p>
      </section>

      {error ? <div className="error-message">{error}</div> : null}
      {notice ? <div className="success-message">{notice}</div> : null}
      {trainingStatus?.completed !== true ? (
        <section className="monitoring-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">{t.training.eyebrow}</p>
            <h2>{t.training.title}</h2>
          </div>
          <p className="empty-state">{t.training.description}</p>
          <div className="rule-actions">
            <a className="ghost-button" href="/help-center">
              {t.training.openHelp}
            </a>
            <button className="ghost-button" type="button" onClick={() => void completeTraining()}>
              {t.training.confirm}
            </button>
          </div>
        </section>
      ) : null}

      <section className="review-workspace review-workspace--wide">
        <aside className="review-queue">
          <div className="section-heading section-heading--stack">
            <p className="section-label">{t.pending.eyebrow}</p>
            <h2>{t.pending.title}</h2>
          </div>
          {isLoading ? <p className="empty-state">{t.pending.loading}</p> : null}
          {!isLoading && tickets.length === 0 ? (
            <p className="empty-state empty-state--pass">{t.pending.empty}</p>
          ) : null}
          <div className="review-ticket-list">
            {tickets.map((ticket) => (
              <button
                className={`review-ticket ${selected?.id === ticket.id ? 'review-ticket--active' : ''}`}
                key={ticket.id}
                type="button"
                onClick={() => setSelected(ticket)}
              >
                <span>{riskLevelLabel(ticket.riskLevel)}</span>
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
                  <p className="section-label">{t.agentConclusion.eyebrow}</p>
                  <h2>{enums.decision[selected.suggestedAction]}</h2>
                  <p>{selected.summary}</p>
                </div>
              </div>

              <div className="result-facts">
                <div>
                  <span>{t.facts.agentDecision}</span>
                  <strong>{enums.decision[selected.agentDecision]}</strong>
                </div>
                <div>
                  <span>{t.facts.riskLevel}</span>
                  <strong>{riskLevelLabel(selected.riskLevel)}</strong>
                </div>
                <div>
                  <span>{t.facts.status}</span>
                  <strong>{selected.status === 'pending' ? t.status.pending : t.status.completed}</strong>
                </div>
              </div>

              <section className="result-section">
                <div className="section-heading">
                  <p className="section-label">{t.findings.eyebrow}</p>
                  <h2>{t.findings.title}</h2>
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
                              {enums.riskCategory[finding.category]}
                            </p>
                            <h3>{finding.title}</h3>
                          </div>
                          <span className={`severity severity--${finding.severity.toLowerCase()}`}>
                            {severityLabel(finding.severity)}
                          </span>
                        </div>
                        <dl className="finding-details">
                          <div>
                            <dt>{t.findings.matchedText}</dt>
                            <dd>
                              {matchedTexts.length > 0 ? (
                                <div className="quote-list">
                                  {matchedTexts.map((text) => (
                                    <mark key={text}>“{text}”</mark>
                                  ))}
                                </div>
                              ) : (
                                <span className="muted">{t.findings.noMatchedText}</span>
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt>{t.findings.explanation}</dt>
                            <dd>{finding.message}</dd>
                          </div>
                          <div>
                            <dt>{t.findings.suggestion}</dt>
                            <dd>{finding.suggestion ?? t.findings.defaultSuggestion}</dd>
                          </div>
                        </dl>
                      </article>
                    );
                  })}
                </div>
              </section>

              <section className="result-section">
                <div className="section-heading">
                  <p className="section-label">{t.evidence.eyebrow}</p>
                  <h2>{t.evidence.title}</h2>
                </div>
                <div className="evidence-list">
                  {uniqueEvidence(selected).map((evidence) => (
                    <article className="evidence-item" key={evidence.id}>
                      <div>
                        <span className="evidence-type">{evidence.sourceType}</span>
                        <strong>{evidence.title}</strong>
                      </div>
                      <blockquote>{evidence.quote ?? t.evidence.noQuote}</blockquote>
                      <p>{evidence.version}</p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="result-section">
                <div className="section-heading">
                  <p className="section-label">{t.feedback.eyebrow}</p>
                  <h2>{t.feedback.title}</h2>
                </div>
                <div className="form-grid">
                  <label>
                    <span>{t.feedback.reviewerId}</span>
                    <input
                      value={labelReviewerId}
                      onChange={(event) => setLabelReviewerId(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>{t.feedback.finalDecision}</span>
                    <select
                      value={labelFinalDecision}
                      onChange={(event) =>
                        setLabelFinalDecision(event.target.value as HumanReviewDecision)
                      }
                    >
                      {reviewDecisions.map((decision) => (
                        <option key={decision} value={decision}>
                          {enums.reviewDecision[decision]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span title={t.feedback.feedbackTypeTooltip}>
                      {t.feedback.feedbackType}
                    </span>
                    <select
                      value={feedbackType}
                      onChange={(event) =>
                        setFeedbackType(event.target.value as HumanReviewFeedbackType)
                      }
                    >
                      {feedbackTypes.map((type) => (
                        <option key={type} value={type}>
                          {enums.feedbackType[type]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>{t.feedback.riskLevel}</span>
                    <select
                      value={labelSeverity}
                      onChange={(event) => setLabelSeverity(event.target.value as LabelSeverity)}
                    >
                      {(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as LabelSeverity[]).map(
                        (severity) => (
                          <option key={severity} value={severity}>
                            {riskLevelLabel(severity)}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label>
                    <span>{t.feedback.categories}</span>
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
                    <span>{t.feedback.addToEval}</span>
                  </label>
                  <label className="checkbox-row">
                    <input
                      checked={createSuggestion}
                      type="checkbox"
                      onChange={(event) => setCreateSuggestion(event.target.checked)}
                    />
                    <span>{t.feedback.createSuggestion}</span>
                  </label>
                </div>
                <label className="description-field review-comment">
                  <span>{t.feedback.comment}</span>
                  <textarea
                    rows={5}
                    value={comment}
                    placeholder={t.defaultComment}
                    onChange={(event) => setComment(event.target.value)}
                  />
                </label>
                <p className="empty-state">
                  {t.feedback.currentType.replace('{type}', enums.feedbackType[feedbackType])}
                  {labelingReference?.feedbackTypes.find((entry) => entry.type === feedbackType)?.meaning ??
                    t.feedback.defaultTypeMeaning}{' '}
                  <a className="text-link" href="/help-center">
                    {t.feedback.viewDefinitions}
                  </a>
                </p>
                {canWriteReview ? (
                  <div className="decision-buttons">
                    <button
                      className="decision-button decision-button--request_revision"
                      disabled={isSubmitting}
                      type="button"
                      onClick={() => void submitReviewerLabel()}
                    >
                      {t.feedback.submitMultiLabel}
                    </button>
                    {reviewDecisions.map((decision) => (
                      <button
                        className={`decision-button decision-button--${decision.toLowerCase()}`}
                        disabled={isSubmitting || selected.status === 'completed'}
                        key={decision}
                        type="button"
                        onClick={() => confirmSubmitDecision(decision)}
                      >
                        {enums.reviewDecision[decision]}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="empty-state">{t.feedback.noPermission}</p>
                )}
                {selected.feedback ? (
                  <div className="feedback-summary">
                    <strong>
                      {t.feedback.submitted.replace(
                        '{decision}',
                        enums.reviewDecision[selected.feedback.finalDecision],
                      )}
                    </strong>
                    <p>{selected.feedback.comment || t.feedback.noComment}</p>
                    <small>
                      {enums.feedbackType[selected.feedback.feedbackType]} ·{' '}
                      {selected.feedback.reviewerId} · {selected.feedback.createdAt}
                    </small>
                  </div>
                ) : null}
              </section>
            </>
          ) : (
            <p className="empty-state">{t.noSelected}</p>
          )}
        </section>

        <aside className="review-queue">
          <div className="section-heading section-heading--stack">
            <p className="section-label">{t.guide.eyebrow}</p>
            <h2>{t.guide.riskTitle}</h2>
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
            <p className="section-label">{t.guide.feedbackEyebrow}</p>
            <h2>{t.guide.feedbackTitle}</h2>
          </div>
          <div className="review-ticket-list">
            {labelingReference?.feedbackTypes.slice(0, 5).map((entry) => (
              <article className="review-ticket" key={entry.type}>
                <span>{enums.feedbackType[entry.type]}</span>
                <small>{entry.meaning}</small>
              </article>
            ))}
          </div>

          <div className="section-heading section-heading--stack">
            <p className="section-label">{t.guide.agreementEyebrow}</p>
            <h2>{t.guide.agreementTitle}</h2>
          </div>
          <div className="review-ticket-list">
            {agreementStats.map((stat) => (
              <article className="review-ticket" key={stat.reviewerId}>
                <span>{formatPercent(stat.agreementRate)}</span>
                <strong>{stat.reviewerId}</strong>
                <small>
                  {t.guide.agreementSummary
                    .replace('{agree}', String(stat.agreementCount))
                    .replace('{disagree}', String(stat.disagreementCount))}
                </small>
              </article>
            ))}
            {agreementStats.length === 0 ? (
              <p className="empty-state">{t.guide.noAgreementStats}</p>
            ) : null}
          </div>

          <div className="section-heading section-heading--stack">
            <p className="section-label">{t.disputes.eyebrow}</p>
            <h2>{t.disputes.title}</h2>
          </div>
          <div className="review-ticket-list">
            {disputedCases.map((dispute) => (
              <article className="review-ticket" key={dispute.id}>
                <span>{dispute.status}</span>
                <strong>{dispute.reviewTicketId}</strong>
                <small>
                  {dispute.reason} ·{' '}
                  {t.disputes.labelCount.replace(
                    '{count}',
                    String(dispute.reviewerDecisionIds.length),
                  )}
                </small>
                {dispute.status === 'open' && canWriteReview ? (
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => confirmResolveDispute(dispute)}
                  >
                    {t.disputes.resolveWithCurrentLabel}
                  </button>
                ) : null}
              </article>
            ))}
            {disputedCases.length === 0 ? (
              <p className="empty-state empty-state--pass">{t.disputes.empty}</p>
            ) : null}
          </div>

          <div className="section-heading section-heading--stack">
            <p className="section-label">{t.suggestions.eyebrow}</p>
            <h2>{t.suggestions.title}</h2>
          </div>
          <div className="review-ticket-list">
            {suggestions.map((suggestion) => (
              <article className="review-ticket" key={suggestion.id}>
                <span>{enums.feedbackType[suggestion.feedbackType]}</span>
                <strong>{suggestion.title}</strong>
                <small>{suggestion.description}</small>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => void resolveSuggestion(suggestion)}
                >
                  {t.suggestions.resolve}
                </button>
              </article>
            ))}
            {suggestions.length === 0 ? (
              <p className="empty-state">{t.suggestions.empty}</p>
            ) : null}
          </div>
        </aside>
      </section>
      {pendingSensitiveAction ? (
        <SensitiveActionDialog
          busy={isSubmitting}
          config={pendingSensitiveAction.config}
          onCancel={() => setPendingSensitiveAction(null)}
          onConfirm={() => {
            void pendingSensitiveAction.run().finally(() => setPendingSensitiveAction(null));
          }}
        />
      ) : null}
    </main>
  );
}
