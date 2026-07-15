'use client';

import { useState } from 'react';
import type { AuditResult } from '@job-compliance/shared';
import { useAuth } from '../auth/auth-provider';
import { useLanguage } from '../i18n/language-provider';

type ExportFormat = 'pdf' | 'markdown' | 'csv';

function extensionFor(format: ExportFormat): string {
  return format === 'markdown' ? 'md' : format;
}

/** Downloads a sanitized, locale-aware audit report through the authenticated API proxy. */
export function ReportExportActions({ result, onNotice }: Readonly<{ result: AuditResult; onNotice: (message: string) => void }>) {
  const auth = useAuth();
  const { locale, messages } = useLanguage();
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const t = messages.reportExport;

  const download = async (format: ExportFormat) => {
    setBusy(format);
    try {
      const response = await auth.fetchWithAuth(`/api/audit/runs/${result.auditId}/export?tenantId=${auth.tenantId}&format=${format}&locale=${locale}`);
      if (!response.ok) throw new Error(t.failed);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${result.auditId}-${locale}.${extensionFor(format)}`;
      anchor.click();
      URL.revokeObjectURL(url);
      onNotice(t.downloaded.replace('{format}', format.toUpperCase()));
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : t.failed);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="report-export-actions" aria-label={t.label}>
      <span>{t.label}</span>
      {(['pdf', 'markdown', 'csv'] as const).map((format) => (
        <button className="audit-chip-button" disabled={busy !== null} key={format} type="button" onClick={() => void download(format)}>
          {busy === format ? t.exporting : t[format]}
        </button>
      ))}
    </div>
  );
}
