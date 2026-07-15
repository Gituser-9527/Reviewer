import { redactSensitiveInfo, sanitizeAuditLog } from '@job-compliance/core';
import type { AuditResult, Evidence, Finding } from '@job-compliance/shared';

export type ReportLocale = 'zh-CN' | 'en-US';
export type ReportFormat = 'csv' | 'markdown' | 'pdf';

export interface ReportBrand {
  displayName?: string;
  logoUrl?: string;
  primaryColor?: string;
}

export interface ReportOptions {
  locale?: ReportLocale;
  brand?: ReportBrand;
  auditMode?: string;
}

const copy = {
  'zh-CN': {
    title: '招聘岗位合规审核报告',
    batchTitle: '招聘岗位批量合规审核报告',
    decision: '审核结论', riskLevel: '风险等级', riskSummary: '风险摘要', auditTime: '审核时间',
    auditMode: '审核模式', ruleVersion: '规则版本', kbVersion: '知识库版本', modelVersion: '模型版本',
    findings: '风险明细', matchedText: '命中原文', explanation: '风险解释', suggestion: '修改建议',
    evidence: '依据列表', rewrite: '合规改写', operations: '操作记录', disclaimer: '免责声明',
    noFindings: '当前规则集未识别出需展示的风险项。', noRewrite: '当前未生成合规改写文案。',
    standard: '标准审核', source: '来源', version: '版本', status: '状态', category: '风险类别', severity: '严重等级',
    generatedAt: '报告生成时间', auditId: '审核编号', reportFor: '报告对象', batchId: '批量任务编号',
    disclaimerText: '本报告仅用于招聘岗位合规风险辅助审核，不构成法律意见或法律裁判。结论应结合适用地区、岗位实际情况及人工复核流程使用。报告内容已按系统规则进行敏感信息脱敏。',
  },
  'en-US': {
    title: 'Job Posting Compliance Audit Report',
    batchTitle: 'Batch Job Posting Compliance Audit Report',
    decision: 'Decision', riskLevel: 'Risk level', riskSummary: 'Risk summary', auditTime: 'Audit time',
    auditMode: 'Audit mode', ruleVersion: 'Rule version', kbVersion: 'Knowledge base version', modelVersion: 'Model version',
    findings: 'Detailed findings', matchedText: 'Matched source text', explanation: 'Risk explanation', suggestion: 'Suggested revision',
    evidence: 'Evidence references', rewrite: 'Compliant rewrite', operations: 'Operation record', disclaimer: 'Disclaimer',
    noFindings: 'No reportable risk was identified by the current rule set.', noRewrite: 'No compliant rewrite was generated.',
    standard: 'Standard audit', source: 'Source', version: 'Version', status: 'Status', category: 'Risk category', severity: 'Severity',
    generatedAt: 'Report generated at', auditId: 'Audit ID', reportFor: 'Report for', batchId: 'Batch ID',
    disclaimerText: 'This report is an assistive compliance-risk review for job postings. It is not legal advice or a legal determination. Use the result together with applicable jurisdiction, the actual role context, and human-review procedures. Sensitive information is redacted by system policy.',
  },
} as const;

function csvEscape(value: unknown): string {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function localized(options: ReportOptions) {
  return copy[options.locale ?? 'zh-CN'];
}

function safeResult(result: AuditResult): AuditResult {
  return sanitizeAuditLog(result, { includeRawText: false });
}

function safeText(value: string | undefined): string {
  return redactSensitiveInfo(value ?? '');
}

function findingMatchedText(finding: Finding): string {
  const metadata = finding.metadata?.matchedText;
  if (typeof metadata === 'string') return safeText(metadata);
  if (Array.isArray(metadata)) return safeText(metadata.filter((item): item is string => typeof item === 'string').join(' | '));
  return safeText(finding.evidence.map((item) => item.quote).filter(Boolean).join(' | '));
}

function evidenceLabel(evidence: Evidence): string {
  return safeText(`${evidence.title} (${evidence.sourceName ?? evidence.sourceType}, ${evidence.sourceVersion ?? evidence.version})`);
}

function decisionTone(value: string): string {
  if (value === 'REJECT') return 'REJECT';
  if (value === 'MANUAL_REVIEW') return 'MANUAL REVIEW';
  return value.replaceAll('_', ' ');
}

/** Produces a shareable Markdown report from a sanitized audit result. */
export function exportAuditResultMarkdown(result: AuditResult, options: ReportOptions = {}): string {
  const audit = safeResult(result);
  const t = localized(options);
  const brand = safeText(options.brand?.displayName) || 'Job Compliance Agent';
  const findings = audit.findings.length === 0
    ? `> ${t.noFindings}`
    : audit.findings.map((finding, index) => [
      `### ${index + 1}. ${safeText(finding.title)}`,
      `- ${t.category}: ${finding.category}`,
      `- ${t.severity}: ${finding.severity}`,
      `- ${t.matchedText}: ${findingMatchedText(finding) || '-'}`,
      `- ${t.explanation}: ${safeText(finding.message)}`,
      `- ${t.suggestion}: ${safeText(finding.suggestion) || '-'}`,
      `- Rule ID: ${finding.ruleId ?? '-'}`,
      `- Evidence ID: ${finding.evidenceIds.join(', ') || '-'}`,
    ].join('\n')).join('\n\n');
  const evidence = audit.evidence.length === 0
    ? '-'
    : audit.evidence.map((item) => `- ${evidenceLabel(item)} | ${t.source}: ${safeText(item.url)}${item.quote ? ` | ${safeText(item.quote)}` : ''}`).join('\n');
  const operations = audit.checkerResults.length === 0
    ? '-'
    : audit.checkerResults.map((item) => `- ${item.checkerId} · ${item.status} · ${item.durationMs}ms`).join('\n');
  return [
    `# ${brand} · ${t.title}`,
    '',
    `> ${t.reportFor}: ${audit.auditId}`,
    '',
    `| ${t.decision} | ${t.riskLevel} |`,
    '| --- | --- |',
    `| **${decisionTone(audit.decision)}** | **${audit.riskLevel}** |`,
    '',
    `## ${t.riskSummary}`,
    safeText(audit.summary),
    '',
    '## Audit metadata',
    `- ${t.auditTime}: ${audit.createdAt}`,
    `- ${t.auditMode}: ${safeText(options.auditMode) || t.standard}`,
    `- ${t.ruleVersion}: ${audit.context.ruleVersion}`,
    `- ${t.kbVersion}: ${audit.context.lawKbVersion}`,
    `- ${t.modelVersion}: ${audit.context.modelVersion ?? '-'}`,
    `- ${t.auditId}: ${audit.auditId}`,
    '',
    `## ${t.findings}`,
    findings,
    '',
    `## ${t.rewrite}`,
    audit.compliantRewrite ? safeText(audit.compliantRewrite) : t.noRewrite,
    '',
    `## ${t.evidence}`,
    evidence,
    '',
    `## ${t.operations}`,
    operations,
    '',
    `## ${t.disclaimer}`,
    t.disclaimerText,
  ].join('\n');
}

/** Exports a flat, sanitized row set suitable for spreadsheet import. */
export function exportAuditResultCsv(result: AuditResult, options: ReportOptions = {}): string {
  const audit = safeResult(result);
  const t = localized(options);
  const rows: unknown[][] = [
    ['auditId', 'tenantId', 'decision', 'riskLevel', 'summary', 'auditTime', 'auditMode', 'ruleVersion', 'lawKbVersion', 'modelVersion', 'locale'],
    [audit.auditId, audit.context.tenantId, audit.decision, audit.riskLevel, safeText(audit.summary), audit.createdAt, options.auditMode ?? t.standard, audit.context.ruleVersion, audit.context.lawKbVersion, audit.context.modelVersion ?? '', options.locale ?? 'zh-CN'],
    [],
    ['findingId', 'category', 'severity', 'decision', 'ruleId', 'evidenceIds', 'matchedText', 'message', 'suggestion'],
    ...audit.findings.map((finding) => [finding.id, finding.category, finding.severity, finding.decision, finding.ruleId ?? '', finding.evidenceIds.join('|'), findingMatchedText(finding), safeText(finding.message), safeText(finding.suggestion)]),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvEscape).join(',')).join('\n')}\n`;
}

/** Exports a summary CSV for one completed batch; failed queue items retain their error detail. */
export function exportBatchAuditResultsCsv(
  batch: { id: string; tenantId: string; status: string; createdAt: string },
  results: AuditResult[],
  failedItems: Array<{ jobPostingId: string; error?: string }>,
  options: ReportOptions = {},
): string {
  const rows: unknown[][] = [
    ['batchId', 'tenantId', 'batchStatus', 'createdAt', 'auditId', 'decision', 'riskLevel', 'summary', 'ruleVersion', 'lawKbVersion', 'modelVersion', 'itemStatus', 'error', 'locale'],
    ...results.map((result) => {
      const audit = safeResult(result);
      return [batch.id, batch.tenantId, batch.status, batch.createdAt, audit.auditId, audit.decision, audit.riskLevel, safeText(audit.summary), audit.context.ruleVersion, audit.context.lawKbVersion, audit.context.modelVersion ?? '', 'completed', '', options.locale ?? 'zh-CN'];
    }),
    ...failedItems.map((item) => [batch.id, batch.tenantId, batch.status, batch.createdAt, item.jobPostingId, '', '', '', '', '', '', 'failed', safeText(item.error), options.locale ?? 'zh-CN']),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvEscape).join(',')).join('\n')}\n`;
}

function pdfHex(value: string): string {
  const utf16 = Buffer.from(`\uFEFF${value}`, 'utf16le');
  for (let index = 0; index < utf16.length; index += 2) {
    const current = utf16[index] ?? 0;
    utf16[index] = utf16[index + 1] ?? 0;
    utf16[index + 1] = current;
  }
  return `<${utf16.toString('hex').toUpperCase()}>`;
}

function wrapPdfLines(text: string, width = 42): string[] {
  const output: string[] = [];
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line.length === 0) { output.push(''); continue; }
    for (let offset = 0; offset < line.length; offset += width) output.push(line.slice(offset, offset + width));
  }
  return output;
}

/** Renders a paginated CJK PDF with a restrained professional report layout. */
export function exportAuditResultPdf(result: AuditResult, options: ReportOptions = {}): Buffer {
  const audit = safeResult(result);
  const t = localized(options);
  const brand = safeText(options.brand?.displayName) || 'Job Compliance Agent';
  const lines = [
    `${brand} · ${t.title}`,
    `${t.decision}: ${decisionTone(audit.decision)}   |   ${t.riskLevel}: ${audit.riskLevel}`,
    `${t.auditTime}: ${audit.createdAt}`,
    `${t.auditMode}: ${safeText(options.auditMode) || t.standard}`,
    `${t.ruleVersion}: ${audit.context.ruleVersion}   |   ${t.kbVersion}: ${audit.context.lawKbVersion}`,
    `${t.modelVersion}: ${audit.context.modelVersion ?? '-'}`,
    '', `${t.riskSummary}`, safeText(audit.summary), '', `${t.findings}`,
    ...(audit.findings.length === 0 ? [t.noFindings] : audit.findings.flatMap((finding, index) => [
      `${index + 1}. ${safeText(finding.title)} [${finding.category}/${finding.severity}]`,
      `${t.matchedText}: ${findingMatchedText(finding) || '-'}`,
      `${t.explanation}: ${safeText(finding.message)}`,
      `${t.suggestion}: ${safeText(finding.suggestion) || '-'}`,
      `Rule ID: ${finding.ruleId ?? '-'} | Evidence: ${finding.evidenceIds.join(', ') || '-'}`,
      '',
    ])),
    `${t.rewrite}`, audit.compliantRewrite ? safeText(audit.compliantRewrite) : t.noRewrite, '',
    `${t.evidence}`,
    ...(audit.evidence.length === 0 ? ['-'] : audit.evidence.flatMap((item) => [evidenceLabel(item), `${t.source}: ${safeText(item.url)}`, item.quote ? safeText(item.quote) : ''])),
    '', `${t.operations}`,
    ...(audit.checkerResults.length === 0 ? ['-'] : audit.checkerResults.map((item) => `${item.checkerId} · ${item.status} · ${item.durationMs}ms`)),
    '', `${t.disclaimer}`, t.disclaimerText,
  ].flatMap((line) => wrapPdfLines(line));
  const pageSize = 42;
  const pages = Array.from({ length: Math.max(1, Math.ceil(lines.length / pageSize)) }, (_, index) => lines.slice(index * pageSize, (index + 1) * pageSize));
  const objects: string[] = [];
  const add = (value: string) => { objects.push(value); return objects.length; };
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add(`<< /Type /Pages /Kids [${pages.map((_, index) => `${5 + index * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  add('<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [4 0 R] >>');
  add('<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 5 >> /DW 1000 >>');
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const page = pages[pageIndex] ?? [];
    const contentId = 6 + pageIndex * 2;
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`);
    const commands = [
      '0.035 0.20 0.18 rg 0 752 612 40 re f',
      '0.92 0.97 0.95 rg 36 715 540 1 re f',
      `BT /F1 10 Tf 1 1 1 rg 38 768 Td ${pdfHex(`${brand} · ${t.title}`)} Tj ET`,
       ...page.map((line, index) => {
        const emphasized = line === t.riskSummary || line === t.findings || line === t.rewrite || line === t.evidence || line === t.operations || line === t.disclaimer;
        return `BT /F1 ${emphasized ? 12 : 9} Tf ${emphasized ? '0.035 0.20 0.18' : '0.12 0.16 0.15'} rg 38 ${728 - index * 16} Td ${pdfHex(line)} Tj ET`;
      }),
      `BT /F1 8 Tf 0.35 0.40 0.38 rg 38 26 Td ${pdfHex(`${t.generatedAt}: ${new Date().toISOString()}  ·  ${pageIndex + 1}/${pages.length}`)} Tj ET`,
    ].join('\n');
    add(`<< /Length ${Buffer.byteLength(commands)} >>\nstream\n${commands}\nendstream`);
  }
  let pdf = '%PDF-1.4\n%\u00E2\u00E3\u00CF\u00D3\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'binary');
}
