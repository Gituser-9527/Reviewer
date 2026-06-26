import type { AuditResult, Finding } from '@job-compliance/shared';

function csvEscape(value: unknown): string {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

function findingSummary(finding: Finding): string {
  return `${finding.category}/${finding.severity}/${finding.ruleId ?? 'no-rule'}: ${finding.title}`;
}

export function exportAuditResultCsv(result: AuditResult): string {
  const rows = [
    ['auditId', 'tenantId', 'decision', 'riskLevel', 'summary', 'ruleVersion', 'lawKbVersion'],
    [
      result.auditId,
      result.context.tenantId,
      result.decision,
      result.riskLevel,
      result.summary,
      result.context.ruleVersion,
      result.context.lawKbVersion,
    ],
    [],
    ['findingId', 'category', 'severity', 'decision', 'ruleId', 'evidenceIds', 'message', 'suggestion'],
    ...result.findings.map((finding) => [
      finding.id,
      finding.category,
      finding.severity,
      finding.decision,
      finding.ruleId ?? '',
      finding.evidenceIds.join('|'),
      finding.message,
      finding.suggestion ?? '',
    ]),
  ];
  return `${rows.map((row) => row.map(csvEscape).join(',')).join('\n')}\n`;
}

function pdfEscape(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

export function exportAuditResultPdf(result: AuditResult): Buffer {
  const lines = [
    'Job Compliance Audit Report',
    `Audit ID: ${result.auditId}`,
    `Tenant ID: ${result.context.tenantId}`,
    `Decision: ${result.decision}`,
    `Risk Level: ${result.riskLevel}`,
    `Rule Version: ${result.context.ruleVersion}`,
    `Law KB Version: ${result.context.lawKbVersion}`,
    `Summary: ${result.summary}`,
    'Findings:',
    ...(result.findings.length === 0
      ? ['- No findings']
      : result.findings.slice(0, 20).map((finding) => `- ${findingSummary(finding)}`)),
  ].map((line) => pdfEscape(line.slice(0, 180)));

  const textCommands = lines
    .map((line, index) => `BT /F1 10 Tf 50 ${760 - index * 18} Td (${line}) Tj ET`)
    .join('\n');
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${Buffer.byteLength(textCommands)} >> stream\n${textCommands}\nendstream endobj`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${object}\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}
