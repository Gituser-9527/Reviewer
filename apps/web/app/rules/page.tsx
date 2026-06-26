'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { ApiErrorResponse, RuleImprovementSuggestion } from '@job-compliance/shared';

type RuleStatus = 'draft' | 'published' | 'all';

interface ManagedRule {
  id: string;
  status: 'draft' | 'published';
  jurisdiction: string;
  ruleVersion: string;
  fileName: string;
  category: string;
  severity: string;
  action: string;
  explanation: string;
  suggestion?: string;
  enabled: boolean;
  hitCount: number;
  containsAny?: {
    fields?: string[];
    values?: string[];
  };
  regex?: {
    fields?: string[];
    patterns?: string[];
  };
  patterns?: string[];
}

interface RuleSet {
  id: string;
  name: string;
  jurisdiction: string;
  status: string;
  currentVersion?: string;
  draftVersion: string;
  ruleCount: number;
  updatedAt: string;
}

interface RulePublishRecord {
  id: string;
  ruleSetId: string;
  ruleVersion: string;
  jurisdiction: string;
  publishedAt: string;
  actorId: string;
  ruleCount: number;
  evalPassed: boolean;
  action: 'publish' | 'rollback';
  forcePublished: boolean;
  previousVersion?: string;
}

interface RuleTestResult {
  finalDecision: string;
  hits: Array<{
    ruleId: string;
    matchedText: string[];
    category: string;
    severity: string;
    action: string;
  }>;
}

interface AuthMe {
  permissions: string[];
}

interface RuleForm {
  id: string;
  category: string;
  severity: string;
  action: string;
  fileName: string;
  patterns: string;
  explanation: string;
  suggestion: string;
  enabled: boolean;
}

const emptyForm: RuleForm = {
  id: '',
  category: 'PRIVACY',
  severity: 'medium',
  action: 'manual_review',
  fileName: 'privacy.yml',
  patterns: '',
  explanation: '',
  suggestion: '',
  enabled: true,
};

function splitPatterns(value: string): string[] {
  return value
    .split(/\r?\n|,/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function patternsOf(rule: ManagedRule): string {
  return [
    ...(rule.containsAny?.values ?? []),
    ...(rule.regex?.patterns ?? []),
    ...(rule.patterns ?? []),
  ].join('\n');
}

function toForm(rule: ManagedRule): RuleForm {
  return {
    id: rule.id,
    category: rule.category,
    severity: rule.severity,
    action: rule.action,
    fileName: rule.fileName,
    patterns: patternsOf(rule),
    explanation: rule.explanation,
    suggestion: rule.suggestion ?? '',
    enabled: rule.enabled,
  };
}

async function parseApiError(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as ApiErrorResponse | null;
  return payload?.error.message ?? `请求失败（HTTP ${response.status}）`;
}

export default function RulesPage() {
  const [status, setStatus] = useState<RuleStatus>('draft');
  const [ruleSets, setRuleSets] = useState<RuleSet[]>([]);
  const [selectedRuleSetId, setSelectedRuleSetId] = useState('CN_MAINLAND');
  const [rules, setRules] = useState<ManagedRule[]>([]);
  const [publishRecords, setPublishRecords] = useState<RulePublishRecord[]>([]);
  const [suggestions, setSuggestions] = useState<RuleImprovementSuggestion[]>([]);
  const [form, setForm] = useState<RuleForm>(emptyForm);
  const [testText, setTestText] = useState('招聘文员，入职需缴纳保证金500元。');
  const [testResult, setTestResult] = useState<RuleTestResult | null>(null);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [publishVersion, setPublishVersion] = useState('');
  const [forcePublish, setForcePublish] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);

  const canEditDraft = permissions.includes('rule:edit_draft');
  const canPublish = permissions.includes('rule:approve_publish');

  const selectedRule = useMemo(
    () => rules.find((rule) => rule.id === selectedRuleId && rule.status === 'draft') ?? null,
    [rules, selectedRuleId],
  );

  const loadRules = async (nextStatus = status) => {
    setIsLoading(true);
    setError(null);
    try {
      const rulesResponse = await fetch(
        `/api/rules?jurisdiction=${selectedRuleSetId}&status=${nextStatus}`,
      );
      const [meResponse, ruleSetsResponse, recordsResponse, suggestionsResponse] = await Promise.all([
        fetch('/api/auth/me'),
        fetch('/api/rulesets'),
        fetch('/api/rule-publish-records'),
        fetch('/api/rule-suggestions?status=open'),
      ]);
      if (!meResponse.ok) throw new Error(await parseApiError(meResponse));
      if (!rulesResponse.ok) throw new Error(await parseApiError(rulesResponse));
      if (!ruleSetsResponse.ok) throw new Error(await parseApiError(ruleSetsResponse));
      if (!recordsResponse.ok) throw new Error(await parseApiError(recordsResponse));
      if (!suggestionsResponse.ok) throw new Error(await parseApiError(suggestionsResponse));
      setPermissions(((await meResponse.json()) as AuthMe).permissions);
      setRules(((await rulesResponse.json()) as { items: ManagedRule[] }).items);
      const nextRuleSets = ((await ruleSetsResponse.json()) as { items: RuleSet[] }).items;
      setRuleSets(nextRuleSets);
      setPublishRecords(((await recordsResponse.json()) as { items: RulePublishRecord[] }).items);
      setSuggestions(
        ((await suggestionsResponse.json()) as { items: RuleImprovementSuggestion[] }).items,
      );
      setSelectedRuleSetId((current) => current || nextRuleSets[0]?.id || 'CN_MAINLAND');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '规则列表加载失败。');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadRules(status);
  }, [status, selectedRuleSetId]);

  const editRule = (rule: ManagedRule) => {
    setSelectedRuleId(rule.id);
    setForm(toForm(rule));
    setMessage(null);
    setError(null);
  };

  const resetForm = () => {
    setSelectedRuleId(null);
    setForm(emptyForm);
  };

  const submitRule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const patterns = splitPatterns(form.patterns);
    if (patterns.length === 0) {
      setError('至少需要填写一个匹配词。');
      return;
    }

    const payload = {
      jurisdiction: selectedRuleSetId,
      ...(selectedRule === null ? { fileName: form.fileName } : {}),
      rule: {
        ...(form.id.trim().length === 0 ? {} : { id: form.id.trim() }),
        category: form.category,
        severity: form.severity,
        action: form.action,
        containsAny: {
          fields: ['rawText', 'normalizedText'],
          values: patterns,
        },
        explanation: form.explanation.trim(),
        ...(form.suggestion.trim().length === 0 ? {} : { suggestion: form.suggestion.trim() }),
        enabled: form.enabled,
      },
    };

    try {
      const response = await fetch(
        selectedRule === null
          ? `/api/rulesets/${selectedRuleSetId}/rules`
          : `/api/rules/${selectedRule.id}`,
        {
          method: selectedRule === null ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) throw new Error(await parseApiError(response));
      setMessage(selectedRule === null ? '已创建 draft 规则。' : '已更新 draft 规则。');
      resetForm();
      await loadRules('draft');
      setStatus('draft');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '规则保存失败。');
    }
  };

  const toggleRule = async (rule: ManagedRule) => {
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/rules/${rule.id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jurisdiction: selectedRuleSetId,
          enabled: !rule.enabled,
        }),
      });
      if (!response.ok) throw new Error(await parseApiError(response));
      setMessage(`已${rule.enabled ? '禁用' : '启用'} draft 规则。`);
      await loadRules('draft');
      setStatus('draft');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '启停规则失败。');
    }
  };

  const publishRules = async () => {
    setIsPublishing(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/rulesets/${selectedRuleSetId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(publishVersion.trim().length === 0 ? {} : { ruleVersion: publishVersion.trim() }),
          actorId: 'mock-rule-admin',
          forcePublish,
        }),
      });
      if (!response.ok) throw new Error(await parseApiError(response));
      const result = (await response.json()) as { ruleVersion: string; ruleCount: number };
      setPublishVersion('');
      setMessage(`发布成功：${result.ruleVersion}，规则数 ${result.ruleCount}。`);
      await loadRules(status);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '发布失败，draft 未影响线上规则。');
    } finally {
      setIsPublishing(false);
    }
  };

  const runRuleTest = async () => {
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/rulesets/${selectedRuleSetId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: testText }),
      });
      if (!response.ok) throw new Error(await parseApiError(response));
      setTestResult((await response.json()) as RuleTestResult);
      setMessage('规则测试完成。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '规则测试失败。');
    }
  };

  const rollbackRules = async () => {
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/rulesets/${selectedRuleSetId}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorId: 'mock-rule-admin' }),
      });
      if (!response.ok) throw new Error(await parseApiError(response));
      const result = (await response.json()) as { ruleVersion: string };
      setMessage(`已回滚到版本：${result.ruleVersion}`);
      await loadRules(status);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '回滚失败。');
    }
  };

  const resolveSuggestion = async (suggestion: RuleImprovementSuggestion) => {
    try {
      const response = await fetch(`/api/rule-suggestions/${suggestion.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resolvedBy: 'mock-rule-admin',
          resolutionComment: '已在规则运营后台处理。',
        }),
      });
      if (!response.ok) throw new Error(await parseApiError(response));
      setMessage('规则改进建议已处理。');
      await loadRules(status);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '规则建议处理失败。');
    }
  };

  return (
    <main>
      <header className="masthead">
        <div>
          <span className="brand-mark">JC</span>
          <div>
            <strong>规则管理后台</strong>
            <span>Rule Management MVP</span>
          </div>
        </div>
        <nav className="top-nav">
          <a className="text-link" href="/">
            岗位审核台
          </a>
          <a className="text-link" href="/reviews">
            人工复核台
          </a>
          <a className="text-link" href="/releases">
            发布门禁
          </a>
        </nav>
      </header>

      <section className="intro-block intro-block--compact">
        <p className="section-label">Rules</p>
        <h1>规则先进入 draft，通过评测后再发布。</h1>
        <p>当前后台用于 MVP 规则维护：查看、新增、编辑、启停、发布和版本记录。</p>
      </section>

      {error ? <div className="error-message">{error}</div> : null}
      {message ? <div className="success-message">{message}</div> : null}

      <section className="rule-admin">
        <aside className="rule-panel">
          <div className="section-heading section-heading--stack">
            <p className="section-label">Rule sets</p>
            <h2>规则集</h2>
          </div>
          <div className="eval-list">
            {ruleSets.map((ruleSet) => (
              <button
                className={`eval-list-item ${
                  ruleSet.id === selectedRuleSetId ? 'eval-list-item--active' : ''
                }`}
                key={ruleSet.id}
                type="button"
                onClick={() => setSelectedRuleSetId(ruleSet.id)}
              >
                <strong>{ruleSet.name}</strong>
                <span>{ruleSet.status}</span>
                <small>
                  当前版本 {ruleSet.currentVersion ?? '未发布'} · draft {ruleSet.draftVersion}
                </small>
              </button>
            ))}
          </div>

          <div className="section-heading section-heading--stack">
            <p className="section-label">Editor</p>
            <h2>{selectedRule === null ? '新增 draft 规则' : '编辑 draft 规则'}</h2>
          </div>

          {canEditDraft ? (
          <form className="rule-form" onSubmit={submitRule}>
            <label>
              <span>规则 ID</span>
              <input
                placeholder="留空则自动生成"
                value={form.id}
                disabled={selectedRule !== null}
                onChange={(event) => setForm((current) => ({ ...current, id: event.target.value }))}
              />
            </label>
            <label>
              <span>文件名</span>
              <input
                value={form.fileName}
                disabled={selectedRule !== null}
                onChange={(event) =>
                  setForm((current) => ({ ...current, fileName: event.target.value }))
                }
              />
            </label>
            <div className="form-grid form-grid--compact">
              <label>
                <span>风险类别</span>
                <select
                  value={form.category}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, category: event.target.value }))
                  }
                >
                  <option value="DISCRIMINATION">DISCRIMINATION</option>
                  <option value="FEE_DEPOSIT">FEE_DEPOSIT</option>
                  <option value="PRIVACY">PRIVACY</option>
                  <option value="FALSE_OR_MISLEADING">FALSE_OR_MISLEADING</option>
                  <option value="INCOMPLETE_INFORMATION">INCOMPLETE_INFORMATION</option>
                  <option value="LABOR_CONTRACT_RISK">LABOR_CONTRACT_RISK</option>
                  <option value="PLATFORM_POLICY">PLATFORM_POLICY</option>
                  <option value="OTHER">OTHER</option>
                </select>
              </label>
              <label>
                <span>严重级别</span>
                <select
                  value={form.severity}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, severity: event.target.value }))
                  }
                >
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                  <option value="critical">critical</option>
                </select>
              </label>
            </div>
            <label>
              <span>Action</span>
              <select
                value={form.action}
                onChange={(event) =>
                  setForm((current) => ({ ...current, action: event.target.value }))
                }
              >
                <option value="pass">pass</option>
                <option value="reject">reject</option>
                <option value="manual_review">manual_review</option>
                <option value="allow_with_warning">allow_with_warning</option>
                <option value="need_more_info">need_more_info</option>
              </select>
            </label>
            <label>
              <span>匹配词，一行一个</span>
              <textarea
                rows={6}
                value={form.patterns}
                onChange={(event) =>
                  setForm((current) => ({ ...current, patterns: event.target.value }))
                }
              />
            </label>
            <label>
              <span>风险解释</span>
              <textarea
                required
                rows={4}
                value={form.explanation}
                onChange={(event) =>
                  setForm((current) => ({ ...current, explanation: event.target.value }))
                }
              />
            </label>
            <label>
              <span>修改建议</span>
              <textarea
                rows={4}
                value={form.suggestion}
                onChange={(event) =>
                  setForm((current) => ({ ...current, suggestion: event.target.value }))
                }
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) =>
                  setForm((current) => ({ ...current, enabled: event.target.checked }))
                }
              />
              <span>启用 draft 规则</span>
            </label>
            <button className="submit-button" type="submit">
              <span>{selectedRule === null ? '新增规则' : '保存编辑'}</span>
              <span aria-hidden="true">→</span>
            </button>
            {selectedRule !== null ? (
              <button className="ghost-button" type="button" onClick={resetForm}>
                取消编辑
              </button>
            ) : null}
          </form>
          ) : (
            <p className="empty-state">当前角色没有 draft 规则编辑权限。</p>
          )}
        </aside>

        <section className="rule-list-panel">
          <div className="rule-toolbar">
            <div>
              <p className="section-label">Rule list</p>
              <h2>规则列表</h2>
            </div>
            <div className="segmented">
              {(['draft', 'published', 'all'] as const).map((item) => (
                <button
                  className={
                    status === item ? 'segmented__item segmented__item--active' : 'segmented__item'
                  }
                  key={item}
                  type="button"
                  onClick={() => setStatus(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          {canPublish ? (
          <div className="rule-publish-box">
            <label>
              <span>发布版本号</span>
              <input
                placeholder="留空自动 patch +1"
                value={publishVersion}
                onChange={(event) => setPublishVersion(event.target.value)}
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={forcePublish}
                onChange={(event) => setForcePublish(event.target.checked)}
              />
              <span>强制发布</span>
            </label>
            <button type="button" disabled={isPublishing} onClick={publishRules}>
              {isPublishing ? '正在运行 eval…' : '发布 draft'}
            </button>
            <button type="button" disabled={isPublishing} onClick={rollbackRules}>
              回滚上一版本
            </button>
          </div>
          ) : (
            <p className="empty-state">当前角色不能发布或回滚规则，需要合规经理审批。</p>
          )}

          <section className="result-section">
            <div className="section-heading">
              <p className="section-label">Test</p>
              <h2>规则测试</h2>
            </div>
            <label className="description-field review-comment">
              <span>岗位文本</span>
              <textarea
                rows={5}
                value={testText}
                onChange={(event) => setTestText(event.target.value)}
              />
            </label>
            <button className="ghost-button" type="button" onClick={runRuleTest}>
              测试 draft 规则
            </button>
            {testResult ? (
              <div className="feedback-summary">
                <strong>最终结论：{testResult.finalDecision}</strong>
                <div className="eval-failure-list">
                  {testResult.hits.map((hit) => (
                    <article className="review-ticket" key={hit.ruleId}>
                      <span>{hit.category}</span>
                      <strong>{hit.ruleId}</strong>
                      <small>
                        {hit.severity} · {hit.action} · 命中：{hit.matchedText.join('、')}
                      </small>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          {isLoading ? <p className="empty-state">规则加载中…</p> : null}
          <div className="rule-card-list">
            {rules.map((rule) => (
              <article className="rule-card" key={`${rule.status}-${rule.id}`}>
                <div className="rule-card__head">
                  <div>
                    <span className={`rule-status rule-status--${rule.status}`}>{rule.status}</span>
                    <h3>{rule.id}</h3>
                  </div>
                  <span className={rule.enabled ? 'pill pill--enabled' : 'pill'}>
                    {rule.enabled ? 'enabled' : 'disabled'}
                  </span>
                </div>
                <p>{rule.explanation}</p>
                <dl className="rule-meta">
                  <div>
                    <dt>category</dt>
                    <dd>{rule.category}</dd>
                  </div>
                  <div>
                    <dt>severity</dt>
                    <dd>{rule.severity}</dd>
                  </div>
                  <div>
                    <dt>version</dt>
                    <dd>{rule.ruleVersion}</dd>
                  </div>
                  <div>
                    <dt>hit count</dt>
                    <dd>{rule.hitCount}</dd>
                  </div>
                </dl>
                <div className="quote-list">
                  {splitPatterns(patternsOf(rule))
                    .slice(0, 6)
                    .map((pattern) => (
                      <mark key={pattern}>{pattern}</mark>
                    ))}
                </div>
                {rule.status === 'draft' && canEditDraft ? (
                  <div className="rule-actions">
                    <button type="button" onClick={() => editRule(rule)}>
                      编辑
                    </button>
                    <button type="button" onClick={() => toggleRule(rule)}>
                      {rule.enabled ? '禁用' : '启用'}
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>

          <section className="result-section">
            <div className="section-heading">
              <p className="section-label">Versions</p>
              <h2>发布记录</h2>
            </div>
            {publishRecords.length === 0 ? (
              <p className="empty-state">暂无发布记录。</p>
            ) : (
              <div className="version-list">
                {publishRecords.map((version) => (
                  <article key={version.id}>
                    <strong>{version.ruleVersion}</strong>
                    <span>{version.action}</span>
                    <span>{version.ruleCount} rules</span>
                    <time>{new Date(version.publishedAt).toLocaleString('zh-CN')}</time>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="result-section">
            <div className="section-heading">
              <p className="section-label">Suggestions</p>
              <h2>规则改进建议</h2>
            </div>
            <div className="review-ticket-list">
              {suggestions.map((suggestion) => (
                <article className="review-ticket" key={suggestion.id}>
                  <span>{suggestion.feedbackType}</span>
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
              {suggestions.length === 0 ? <p className="empty-state">暂无规则改进建议。</p> : null}
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}
