'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type {
  ApiErrorResponse,
  AuditDecision,
  AuditResult,
  Evidence,
  Finding,
  RiskCategory,
  Severity,
} from '@job-compliance/shared';
import { useAuth } from './auth/auth-provider';
import { getMatchedTexts, getRiskScore } from './audit-view-model';
import { EmptyState, ErrorState, RiskBadge } from './components/ui';
import { ReportExportActions } from './components/report-export-actions';
import { useLanguage } from './i18n/language-provider';

interface AuditFormState {
  title: string;
  companyName: string;
  description: string;
  salary: string;
  location: string;
  employmentType: string;
}

type FeedbackType =
  | 'FALSE_POSITIVE'
  | 'FALSE_NEGATIVE'
  | 'WRONG_CATEGORY'
  | 'WRONG_SEVERITY'
  | 'WRONG_EVIDENCE'
  | 'BAD_REWRITE'
  | 'RULE_TOO_BROAD'
  | 'RULE_TOO_NARROW'
  | 'NEEDS_NEW_RULE'
  | 'VALID_RESULT';

interface FeedbackState {
  feedbackType: FeedbackType;
  comment: string;
}

interface DemoAuditCase {
  id: string;
  title: string;
  companyName: string;
  description: string;
  location: string;
  salary: string;
  employmentType: string;
  scenario: string;
}

const initialForm: AuditFormState = {
  title: '',
  companyName: '',
  description: '',
  salary: '',
  location: '',
  employmentType: 'full_time',
};

const initialFeedback: FeedbackState = {
  feedbackType: 'VALID_RESULT',
  comment: '',
};

function optionalText(value: string): string | undefined {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function formatEvidenceSource(evidence: Evidence): string {
  return evidence.sourceName ?? evidence.sourceId ?? evidence.sourceType;
}

function findEvidenceForFinding(result: AuditResult, finding: Finding): Evidence[] {
  const ids = new Set([
    ...finding.evidenceIds,
    ...(finding.evidenceId === undefined ? [] : [finding.evidenceId]),
    ...finding.evidence.map((item) => item.id),
  ]);
  return [...finding.evidence, ...result.evidence.filter((item) => ids.has(item.id))].filter(
    (item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index,
  );
}

function createAuditReportSummary(result: AuditResult, labels: {
  decision: Record<AuditDecision, string>;
  risk: Record<AuditResult['riskLevel'], string>;
  category: Record<RiskCategory, string>;
  severity: Record<Severity, string>;
  report: {
    auditId: string;
    decision: string;
    risk: string;
    summary: string;
    findings: string;
    noFindings: string;
  };
}): string {
  const findings = result.findings
    .map((finding, index) =>
      `${index + 1}. [${labels.severity[finding.severity]}] ${labels.category[finding.category]} - ${finding.title}\n${finding.message}\n${finding.suggestion ?? ''}`,
    )
    .join('\n\n');
  return [
    `${labels.report.auditId}: ${result.auditId}`,
    `${labels.report.decision}: ${labels.decision[result.decision]}`,
    `${labels.report.risk}: ${labels.risk[result.riskLevel]}`,
    `${labels.report.summary}: ${result.summary}`,
    findings.length > 0 ? `${labels.report.findings}:\n${findings}` : labels.report.noFindings,
  ].join('\n\n');
}

function AuditInputForm({
  form,
  isSubmitting,
  onChange,
  onSubmit,
  onReset,
  demoCases,
  onUseDemoCase,
}: Readonly<{
  form: AuditFormState;
  isSubmitting: boolean;
  onChange: (field: keyof AuditFormState, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onReset: () => void;
  demoCases: DemoAuditCase[];
  onUseDemoCase: (demoCase: DemoAuditCase) => void;
}>) {
  const { messages, formatNumber } = useLanguage();
  const t = messages.auditWorkbench;
  const primaryDemoCase = demoCases[0];

  return (
    <form className="audit-workbench-form" onSubmit={onSubmit}>
      <div className="audit-workbench-card__head">
        <div>
          <p className="section-label">{t.input.eyebrow}</p>
          <h2>{t.input.title}</h2>
        </div>
        <span>{t.input.required}</span>
      </div>

      <div className="audit-workbench-form__grid">
        <label>
          <span>{t.input.jobTitle}</span>
          <input
            required
            maxLength={200}
            placeholder={t.input.jobTitlePlaceholder}
            value={form.title}
            onChange={(event) => onChange('title', event.target.value)}
          />
        </label>
        <label>
          <span>{t.input.companyName}</span>
          <input
            required
            maxLength={200}
            placeholder={t.input.companyNamePlaceholder}
            value={form.companyName}
            onChange={(event) => onChange('companyName', event.target.value)}
          />
        </label>
        <label>
          <span>{t.input.location}</span>
          <input
            maxLength={500}
            placeholder={t.input.locationPlaceholder}
            value={form.location}
            onChange={(event) => onChange('location', event.target.value)}
          />
        </label>
        <label>
          <span>{t.input.salary}</span>
          <input
            maxLength={200}
            placeholder={t.input.salaryPlaceholder}
            value={form.salary}
            onChange={(event) => onChange('salary', event.target.value)}
          />
        </label>
        <label>
          <span>{t.input.employmentType}</span>
          <select
            value={form.employmentType}
            onChange={(event) => onChange('employmentType', event.target.value)}
          >
            <option value="full_time">{t.input.employmentTypes.fullTime}</option>
            <option value="part_time">{t.input.employmentTypes.partTime}</option>
            <option value="internship">{t.input.employmentTypes.internship}</option>
            <option value="contract">{t.input.employmentTypes.contract}</option>
          </select>
        </label>
      </div>

      <label className="audit-workbench-description">
        <span>{t.input.description}</span>
        <textarea
          required
          maxLength={50_000}
          rows={16}
          placeholder={t.input.descriptionPlaceholder}
          value={form.description}
          onChange={(event) => onChange('description', event.target.value)}
        />
        <small>
          {formatNumber(form.description.length)} / {formatNumber(50_000)}
        </small>
      </label>

      <div className="audit-workbench-form__actions">
        <button className="submit-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? t.input.submitting : t.input.submit}
        </button>
        {primaryDemoCase ? (
          <button
            className="ghost-button"
            type="button"
            onClick={() => onUseDemoCase(primaryDemoCase)}
          >
            {t.input.useDemoCase}
          </button>
        ) : null}
        <button className="ghost-button" type="button" onClick={onReset}>
          {t.actions.reset}
        </button>
      </div>
      {demoCases.length > 0 ? (
        <div className="demo-case-strip">
          {demoCases.map((item) => (
            <button key={item.id} type="button" onClick={() => onUseDemoCase(item)}>
              <strong>{item.title}</strong>
              <span>{item.scenario}</span>
            </button>
          ))}
        </div>
      ) : null}
    </form>
  );
}

function HighlightedText({
  text,
  highlights,
  activeText,
}: Readonly<{
  text: string;
  highlights: string[];
  activeText: string | undefined;
}>) {
  const unique = [...new Set(highlights.filter((item) => item.trim().length > 0))].sort(
    (left, right) => right.length - left.length,
  );
  if (text.trim().length === 0) {
    return null;
  }
  if (unique.length === 0) {
    return <p>{text}</p>;
  }

  const pattern = new RegExp(`(${unique.map((item) => item.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('|')})`, 'gu');
  const parts = text.split(pattern);
  return (
    <p>
      {parts.map((part, index) =>
        unique.includes(part) ? (
          <mark
            className={part === activeText ? 'audit-highlight audit-highlight--active' : 'audit-highlight'}
            key={`${part}-${index}`}
            id={part === activeText ? 'active-match' : undefined}
          >
            {part}
          </mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )}
    </p>
  );
}

function RiskScoreCard({ result }: Readonly<{ result: AuditResult }>) {
  const { messages } = useLanguage();
  const score = getRiskScore(result);
  const t = messages.auditWorkbench;

  return (
    <article className={`risk-score-card risk-score-card--${result.riskLevel.toLowerCase()}`}>
      <div>
        <span>{t.result.riskScore}</span>
        <strong>{score.value}</strong>
        <small>/ 100</small>
      </div>
      <p>{score.isEstimated ? t.result.scoreEstimated : t.result.scoreProvided}</p>
    </article>
  );
}

function AuditResultSummary({ result }: Readonly<{ result: AuditResult }>) {
  const { messages, formatDate } = useLanguage();
  const t = messages.auditWorkbench;

  return (
    <section className={`audit-summary audit-summary--${result.decision.toLowerCase()}`}>
      <div>
        <p className="section-label">{t.result.decision}</p>
        <h2>{messages.enums.decision[result.decision]}</h2>
        <p>{result.summary}</p>
      </div>
      <RiskScoreCard result={result} />
      <dl>
        <div>
          <dt>{t.result.riskLevel}</dt>
          <dd>
            <RiskBadge level={result.riskLevel}>{messages.enums.riskLevel[result.riskLevel]}</RiskBadge>
          </dd>
        </div>
        <div>
          <dt>{t.result.findingCount}</dt>
          <dd>{result.findings.length}</dd>
        </div>
        <div>
          <dt>{t.result.auditId}</dt>
          <dd>{result.auditId}</dd>
        </div>
        <div>
          <dt>{t.result.createdAt}</dt>
          <dd>{formatDate(result.createdAt)}</dd>
        </div>
      </dl>
    </section>
  );
}

function FindingCard({
  finding,
  index,
  active,
  evidence,
  onClick,
  onOpenEvidence,
}: Readonly<{
  finding: Finding;
  index: number;
  active: boolean;
  evidence: Evidence[];
  onClick: () => void;
  onOpenEvidence: () => void;
}>) {
  const { messages, formatPercent } = useLanguage();
  const t = messages.auditWorkbench;
  const matchedTexts = getMatchedTexts(finding);

  return (
    <article className={active ? 'audit-finding-card audit-finding-card--active' : 'audit-finding-card'}>
      <button type="button" onClick={onClick}>
        <span>{String(index + 1).padStart(2, '0')}</span>
        <div>
          <strong>{finding.title}</strong>
          <small>{messages.enums.riskCategory[finding.category]}</small>
        </div>
        <RiskBadge level={finding.severity}>{messages.enums.severity[finding.severity]}</RiskBadge>
      </button>
      <dl>
        <div>
          <dt>{t.finding.matchedText}</dt>
          <dd>
            {matchedTexts.length > 0 ? (
              matchedTexts.map((text) => <mark key={text}>{text}</mark>)
            ) : (
              <span className="muted">{t.finding.noMatchedText}</span>
            )}
          </dd>
        </div>
        <div>
          <dt>{t.finding.reason}</dt>
          <dd>{finding.message}</dd>
        </div>
        <div>
          <dt>{t.finding.suggestion}</dt>
          <dd>{finding.suggestion ?? t.finding.defaultSuggestion}</dd>
        </div>
      </dl>
      <footer>
        <span>{t.finding.ruleId}: {finding.ruleId ?? t.common.unlinked}</span>
        <span>{t.finding.decision}: {messages.enums.decision[finding.decision]}</span>
        {finding.confidence === undefined ? null : (
          <span>{t.finding.confidence}: {formatPercent(finding.confidence)}</span>
        )}
        <button className="audit-chip-button" type="button" onClick={onOpenEvidence}>
          {t.finding.evidenceCount}: {evidence.length}
        </button>
      </footer>
    </article>
  );
}

function EvidencePanel({
  evidence,
  selectedFinding,
  onOpenDrawer,
}: Readonly<{
  evidence: Evidence[];
  selectedFinding: Finding | null;
  onOpenDrawer: () => void;
}>) {
  const { messages } = useLanguage();
  const t = messages.auditWorkbench;

  return (
    <section className="audit-detail-card">
      <div className="audit-workbench-card__head">
        <div>
          <p className="section-label">{t.evidence.eyebrow}</p>
          <h2>{t.evidence.title}</h2>
        </div>
        <button className="ghost-button" type="button" disabled={evidence.length === 0} onClick={onOpenDrawer}>
          {t.evidence.openDrawer} · {evidence.length}
        </button>
      </div>
      {selectedFinding ? <p className="audit-context-note">{selectedFinding.title}</p> : null}
      {evidence.length === 0 ? (
        <EmptyState title={t.evidence.emptyTitle} description={t.evidence.emptyDescription} />
      ) : (
        <div className="audit-evidence-list">
          {evidence.map((item) => (
            <details key={item.id} open={evidence.length === 1}>
              <summary>
                <span>{item.sourceType}</span>
                <strong>{formatEvidenceSource(item)}</strong>
              </summary>
              {item.quote ? <blockquote>{item.quote}</blockquote> : <p>{t.evidence.noQuote}</p>}
              <dl>
                <div>
                  <dt>{t.evidence.id}</dt>
                  <dd>{item.id}</dd>
                </div>
                <div>
                  <dt>{t.evidence.version}</dt>
                  <dd>{item.sourceVersion ?? item.version}</dd>
                </div>
                <div>
                  <dt>{t.evidence.url}</dt>
                  <dd>{item.url}</dd>
                </div>
              </dl>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

function RewrittenPostingPanel({ text }: Readonly<{ text: string | null }>) {
  const { messages } = useLanguage();
  const [copied, setCopied] = useState(false);
  const t = messages.auditWorkbench;

  const copyRewrite = async () => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section className="audit-detail-card">
      <div className="audit-workbench-card__head">
        <div>
          <p className="section-label">{t.rewrite.eyebrow}</p>
          <h2>{t.rewrite.title}</h2>
        </div>
        <button className="ghost-button" type="button" disabled={!text} onClick={() => void copyRewrite()}>
          {copied ? t.actions.copied : t.actions.copyRewrite}
        </button>
      </div>
      {text ? <pre className="audit-rewrite-text">{text}</pre> : <EmptyState title={t.rewrite.emptyTitle} description={t.rewrite.emptyDescription} />}
    </section>
  );
}

function AuditActionBar({
  result,
  onCopySummary,
  onOpenFeedback,
  onResubmit,
  onSaveEval,
  onNotice,
}: Readonly<{
  result: AuditResult;
  onCopySummary: () => void;
  onOpenFeedback: () => void;
  onResubmit: () => void;
  onSaveEval: () => void;
  onNotice: (message: string) => void;
}>) {
  const { messages } = useLanguage();
  const t = messages.auditWorkbench;
  const highRisk = result.decision === 'REJECT' || result.decision === 'MANUAL_REVIEW';

  return (
    <section className={highRisk ? 'audit-action-bar audit-action-bar--urgent' : 'audit-action-bar'}>
      <div>
        <strong>{highRisk ? t.actions.highRiskTitle : t.actions.readyTitle}</strong>
        <span>{highRisk ? t.actions.highRiskDescription : t.actions.readyDescription}</span>
      </div>
      <div>
        <button className="ghost-button" type="button" onClick={onCopySummary}>
          {t.actions.copySummary}
        </button>
        <button className="ghost-button" type="button" onClick={onOpenFeedback}>
          {t.actions.feedback}
        </button>
        <button className="ghost-button" type="button" onClick={onSaveEval}>
          {t.actions.saveEval}
        </button>
        <ReportExportActions result={result} onNotice={onNotice} />
        <button className="submit-button submit-button--inline" type="button" onClick={onResubmit}>
          {t.actions.reaudit}
        </button>
      </div>
    </section>
  );
}

function FeedbackDialog({
  open,
  feedback,
  onChange,
  onClose,
  onSubmit,
}: Readonly<{
  open: boolean;
  feedback: FeedbackState;
  onChange: (feedback: FeedbackState) => void;
  onClose: () => void;
  onSubmit: () => void;
}>) {
  const { messages } = useLanguage();
  const t = messages.auditWorkbench;
  if (!open) return null;

  return (
    <div className="feedback-dialog-backdrop" role="presentation">
      <section className="feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
        <div className="audit-workbench-card__head">
          <div>
            <p className="section-label">{t.feedback.eyebrow}</p>
            <h2 id="feedback-title">{t.feedback.title}</h2>
          </div>
          <button className="ghost-button" type="button" onClick={onClose}>
            {t.actions.close}
          </button>
        </div>
        <label>
          <span>{t.feedback.type}</span>
          <select
            value={feedback.feedbackType}
            onChange={(event) =>
              onChange({ ...feedback, feedbackType: event.target.value as FeedbackState['feedbackType'] })
            }
          >
            {Object.keys(messages.enums.feedbackType).map((type) => (
              <option key={type} value={type}>
                {messages.enums.feedbackType[type as keyof typeof messages.enums.feedbackType]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t.feedback.comment}</span>
          <textarea
            rows={6}
            value={feedback.comment}
            placeholder={t.feedback.placeholder}
            onChange={(event) => onChange({ ...feedback, comment: event.target.value })}
          />
        </label>
        <div className="audit-workbench-form__actions">
          <button className="submit-button" type="button" onClick={onSubmit}>
            {t.feedback.submit}
          </button>
          <button className="ghost-button" type="button" onClick={onClose}>
            {t.actions.cancel}
          </button>
        </div>
      </section>
    </div>
  );
}

function ResultSkeleton() {
  const { messages } = useLanguage();
  return (
    <section className="audit-result-skeleton" aria-label={messages.auditWorkbench.result.loadingLabel}>
      <div />
      <div />
      <div />
      <div />
    </section>
  );
}

function EvidenceDrawer({
  evidence,
  open,
  selectedFinding,
  onClose,
}: Readonly<{
  evidence: Evidence[];
  open: boolean;
  selectedFinding: Finding | null;
  onClose: () => void;
}>) {
  const { messages } = useLanguage();
  const t = messages.auditWorkbench;
  if (!open) return null;

  return (
    <div className="evidence-drawer-backdrop" role="presentation">
      <aside className="evidence-drawer" role="dialog" aria-modal="true" aria-labelledby="evidence-drawer-title">
        <div className="audit-workbench-card__head">
          <div>
            <p className="section-label">{t.evidence.eyebrow}</p>
            <h2 id="evidence-drawer-title">{t.evidence.drawerTitle}</h2>
          </div>
          <button className="ghost-button" type="button" onClick={onClose}>
            {t.actions.close}
          </button>
        </div>
        {selectedFinding ? <p className="audit-context-note">{selectedFinding.title}</p> : null}
        {evidence.length === 0 ? (
          <EmptyState title={t.evidence.emptyTitle} description={t.evidence.emptyDescription} />
        ) : (
          <div className="audit-evidence-list">
            {evidence.map((item) => (
              <article className="evidence-drawer-item" key={item.id}>
                <div>
                  <span>{item.sourceType}</span>
                  <strong>{formatEvidenceSource(item)}</strong>
                </div>
                {item.quote ? <blockquote>{item.quote}</blockquote> : <p>{t.evidence.noQuote}</p>}
                <dl>
                  <div>
                    <dt>{t.evidence.id}</dt>
                    <dd>{item.id}</dd>
                  </div>
                  <div>
                    <dt>{t.evidence.version}</dt>
                    <dd>{item.sourceVersion ?? item.version}</dd>
                  </div>
                  <div>
                    <dt>{t.evidence.url}</dt>
                    <dd>{item.url}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}

export default function HomePage() {
  const auth = useAuth();
  const { messages, locale } = useLanguage();
  const [form, setForm] = useState(initialForm);
  const [lastSubmittedForm, setLastSubmittedForm] = useState(initialForm);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [activeMatch, setActiveMatch] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [evidenceDrawerOpen, setEvidenceDrawerOpen] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(initialFeedback);
  const [demoCases, setDemoCases] = useState<DemoAuditCase[]>([]);
  const descriptionRef = useRef<HTMLElement | null>(null);
  const t = messages.auditWorkbench;

  useEffect(() => {
    const loadDemoCases = async () => {
      const response = await fetch('/api/demo');
      if (!response.ok) return;
      const payload = (await response.json()) as { auditCases?: DemoAuditCase[] };
      setDemoCases(payload.auditCases ?? []);
    };
    void loadDemoCases();
  }, []);

  const labels = useMemo(
    () => ({
      decision: messages.enums.decision,
      risk: messages.enums.riskLevel,
      category: messages.enums.riskCategory,
      severity: messages.enums.severity,
      report: messages.auditWorkbench.report,
    }),
    [messages],
  );

  const selectedFinding =
    result?.findings.find((finding) => finding.id === selectedFindingId) ?? result?.findings[0] ?? null;
  const selectedEvidence = result && selectedFinding ? findEvidenceForFinding(result, selectedFinding) : [];
  const allMatchedTexts = result?.findings.flatMap(getMatchedTexts) ?? [];

  const updateField = (field: keyof AuditFormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const useDemoCase = (demoCase: DemoAuditCase) => {
    setForm({
      title: demoCase.title,
      companyName: demoCase.companyName,
      description: demoCase.description,
      salary: demoCase.salary,
      location: demoCase.location,
      employmentType: demoCase.employmentType,
    });
    setError(null);
    setNotice(t.notices.demoCaseLoaded.replace('{title}', demoCase.title));
  };

  const submitAudit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setNotice(null);
    setResult(null);
    setSelectedFindingId(null);
    setActiveMatch(undefined);
    setLastSubmittedForm(form);

    try {
      const response = await auth.fetchWithAuth('/api/audit/job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: auth.tenantId,
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
        throw new Error(payload?.error.message ?? t.errors.auditFailedStatus.replace('{status}', String(response.status)));
      }

      const nextResult = (await response.json()) as AuditResult;
      setResult(nextResult);
      setSelectedFindingId(nextResult.findings[0]?.id ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.errors.auditFailed);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectFinding = (finding: Finding) => {
    const firstMatch = getMatchedTexts(finding)[0];
    setSelectedFindingId(finding.id);
    setActiveMatch(firstMatch);
    descriptionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const openEvidenceForFinding = (finding: Finding) => {
    setSelectedFindingId(finding.id);
    setEvidenceDrawerOpen(true);
  };

  const copySummary = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(createAuditReportSummary(result, labels));
    setNotice(t.notices.summaryCopied);
  };

  const saveEvalCase = async () => {
    if (!result) return;
    setError(null);
    setNotice(null);
    try {
      const datasetId = 'web_saved_audit_samples';
      await fetch('/api/evals/datasets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: datasetId,
          name: t.eval.datasetName,
          version: 'v1',
          description: t.eval.datasetDescription,
        }),
      }).catch(() => undefined);
      const response = await fetch(`/api/evals/datasets/${datasetId}/cases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cases: [
            {
              id: `case_web_${Date.now()}`,
              source: 'web_audit_workbench',
              title: lastSubmittedForm.title,
              description: lastSubmittedForm.description,
              expectedDecision: result.decision,
              expectedCategories: [...new Set(result.findings.map((finding) => finding.category))],
              expectedSeverity: result.riskLevel === 'NONE' ? undefined : result.riskLevel,
              humanReason: result.summary,
              metadata: {
                auditId: result.auditId,
                locale,
              },
            },
          ],
        }),
      });
      if (!response.ok) throw new Error(t.errors.saveEvalFailed);
      setNotice(t.notices.evalSaved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.errors.saveEvalFailed);
    }
  };

  const submitFeedback = () => {
    setFeedbackOpen(false);
    setNotice(t.notices.feedbackSubmitted);
  };

  const resetForm = () => {
    setForm(initialForm);
    setResult(null);
    setError(null);
    setNotice(null);
    setSelectedFindingId(null);
    setActiveMatch(undefined);
    setEvidenceDrawerOpen(false);
  };

  return (
    <main className="audit-workbench-page">
      <section className="intro-block intro-block--compact">
        <p className="section-label">{t.hero.eyebrow}</p>
        <h1>{t.hero.title}</h1>
        <p>{t.hero.description}</p>
      </section>

      {error ? <ErrorState title={t.errors.title} message={error} /> : null}
      {notice ? <div className="success-message">{notice}</div> : null}

      <section className="audit-workbench-layout">
        <aside className="audit-workbench-left">
          <AuditInputForm
            form={form}
            isSubmitting={isSubmitting}
            onChange={updateField}
            demoCases={demoCases}
            onReset={resetForm}
            onSubmit={(event) => void submitAudit(event)}
            onUseDemoCase={useDemoCase}
          />

          <section className="audit-detail-card" ref={descriptionRef}>
            <div className="audit-workbench-card__head">
              <div>
                <p className="section-label">{t.source.eyebrow}</p>
                <h2>{t.source.title}</h2>
              </div>
              <span>{t.source.highlightHint}</span>
            </div>
            <div className="audit-source-preview">
              <HighlightedText
                activeText={activeMatch}
                highlights={allMatchedTexts}
                text={lastSubmittedForm.description || form.description}
              />
            </div>
          </section>
        </aside>

        <section className="audit-workbench-right">
          {isSubmitting ? <ResultSkeleton /> : null}

          {!isSubmitting && result === null ? (
            <EmptyState title={t.empty.title} description={t.empty.description} />
          ) : null}

          {result ? (
            <>
              <AuditResultSummary result={result} />
              <AuditActionBar
                result={result}
                onCopySummary={() => void copySummary()}
                onOpenFeedback={() => setFeedbackOpen(true)}
                onResubmit={() => void submitAudit()}
                onSaveEval={() => void saveEvalCase()}
                onNotice={setNotice}
              />

              {result.findings.length === 0 ? (
                <EmptyState title={t.noRisk.title} description={t.noRisk.description} />
              ) : (
                <section className="audit-detail-card">
                  <div className="audit-workbench-card__head">
                    <div>
                      <p className="section-label">{t.finding.eyebrow}</p>
                      <h2>{t.finding.title}</h2>
                    </div>
                    <span>{result.findings.length}</span>
                  </div>
                  <div className="audit-finding-list">
                    {result.findings.map((finding, index) => (
                      <FindingCard
                        active={selectedFinding?.id === finding.id}
                        evidence={findEvidenceForFinding(result, finding)}
                        finding={finding}
                        index={index}
                        key={finding.id}
                        onClick={() => selectFinding(finding)}
                        onOpenEvidence={() => openEvidenceForFinding(finding)}
                      />
                    ))}
                  </div>
                </section>
              )}

              <EvidencePanel
                evidence={selectedEvidence}
                selectedFinding={selectedFinding}
                onOpenDrawer={() => setEvidenceDrawerOpen(true)}
              />
              <RewrittenPostingPanel text={result.compliantRewrite} />
            </>
          ) : null}
        </section>
      </section>

      <FeedbackDialog
        feedback={feedback}
        onChange={setFeedback}
        onClose={() => setFeedbackOpen(false)}
        onSubmit={submitFeedback}
        open={feedbackOpen}
      />
      <EvidenceDrawer
        evidence={selectedEvidence}
        onClose={() => setEvidenceDrawerOpen(false)}
        open={evidenceDrawerOpen}
        selectedFinding={selectedFinding}
      />
    </main>
  );
}
