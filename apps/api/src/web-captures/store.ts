import { randomUUID } from 'node:crypto';
import { hashSensitiveValue, redactSensitiveInfo, sanitizeAuditLog } from '@job-compliance/core';
import type { WebJobCapture } from '@job-compliance/shared';
export type WebCaptureStatus = 'CAPTURED' | 'CONFIRMED' | 'AUDITING' | 'AUDITED' | 'FAILED' | 'DELETED';
export interface WebCaptureRecord extends WebJobCapture { tenantId: string; userId: string; status: WebCaptureStatus; pageUrlHash: string; rawContentExpiresAt?: string; retentionExpiresAt: string; auditRunId?: string; }
export interface RetentionPolicy { rawContentRetentionDays: 0 | 1 | 7 | 30; extractedFieldsRetentionDays: number; storeRawContent: boolean; storePageUrlQuery: boolean; allowUserCorrectionHistory: boolean; }
export const defaultRetentionPolicy: RetentionPolicy = { rawContentRetentionDays: 7, extractedFieldsRetentionDays: 180, storeRawContent: true, storePageUrlQuery: false, allowUserCorrectionHistory: true };
const cleanUrl = (value: string, keepQuery: boolean) => { const url = new URL(value); url.hash = ''; if (!keepQuery) url.search = ''; return url.toString(); };
export class InMemoryWebCaptureStore {
  private readonly records = new Map<string, WebCaptureRecord>();
  create(input: WebJobCapture, context: { tenantId: string; userId: string }): WebCaptureRecord {
    const pageUrl = cleanUrl(input.pageUrl, false); const now = Date.now(); const rawExpires = now + defaultRetentionPolicy.rawContentRetentionDays * 86_400_000;
    const record: WebCaptureRecord = { ...sanitizeAuditLog(input, { includeRawText: true }), captureId: `capture_${randomUUID()}`, tenantId: context.tenantId, userId: context.userId, pageUrl, pageUrlHash: hashSensitiveValue(pageUrl), pageTitle: redactSensitiveInfo(input.pageTitle), rawContent: { ...input.rawContent, mainText: defaultRetentionPolicy.storeRawContent ? redactSensitiveInfo(input.rawContent.mainText) : '' }, status: 'CAPTURED', rawContentExpiresAt: new Date(rawExpires).toISOString(), retentionExpiresAt: new Date(now + defaultRetentionPolicy.extractedFieldsRetentionDays * 86_400_000).toISOString() };
    this.records.set(record.captureId, structuredClone(record)); return structuredClone(record);
  }
  get(id: string, tenantId: string): WebCaptureRecord | undefined { const value = this.records.get(id); return value?.tenantId === tenantId ? structuredClone(value) : undefined; }
  markAudited(id: string, tenantId: string, auditRunId: string): void { const value = this.records.get(id); if (value?.tenantId === tenantId) { value.status = 'AUDITED'; value.auditRunId = auditRunId; } }
  cleanup(tenantId?: string, dryRun = false): number { const now = Date.now(); let count = 0; for (const item of this.records.values()) { if (tenantId && item.tenantId !== tenantId) continue; if (item.rawContentExpiresAt && Date.parse(item.rawContentExpiresAt) <= now) { count++; if (!dryRun) { item.rawContent = { mainText: '' }; delete item.rawContentExpiresAt; } } } return count; }
}
