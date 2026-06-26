import { randomUUID } from 'node:crypto';
import { hashSensitiveValue } from '@job-compliance/core';
import { redactSensitiveText } from '@job-compliance/database';
import type {
  ApproveSuggestionInput,
  CreateTrustedSourceInput,
  ImportLawKbDocumentInput,
} from './schemas.js';

export interface TrustedKnowledgeSourceRecord {
  id: string;
  name: string;
  sourceType: string;
  baseUrl: string;
  jurisdiction: string;
  scope: string;
  status: 'active' | 'disabled';
  createdAt: string;
  updatedAt: string;
}

export interface LawKbDocumentRecord {
  id: string;
  sourceId: string;
  title: string;
  sourceUrl: string;
  sourceType: string;
  jurisdiction: string;
  scope: string;
  publishedAt: string;
  effectiveFrom: string;
  effectiveTo?: string;
  categories: string[];
  keywords: string[];
  createdAt: string;
  updatedAt: string;
}

export interface LawKbDocumentVersionRecord {
  id: string;
  documentId: string;
  version: string;
  content: string;
  contentHash: string;
  importedBy: string;
  createdAt: string;
}

export interface ClauseChange {
  index: number;
  text: string;
}

export interface ModifiedClauseChange {
  before: string;
  after: string;
}

export interface LawKbDiffReport {
  fromVersion?: string;
  toVersion: string;
  addedClauses: ClauseChange[];
  modifiedClauses: ModifiedClauseChange[];
  deprecatedClauses: ClauseChange[];
  unchangedCount: number;
}

export interface LawKbImpactReportRecord {
  id: string;
  suggestionId: string;
  affectedCategories: string[];
  affectedRules: string[];
  affectedEvidenceIds: string[];
  summary: string;
  createdAt: string;
}

export interface LawKbUpdateSuggestionRecord {
  id: string;
  documentId: string;
  documentVersionId: string;
  fromVersion?: string;
  toVersion: string;
  status: 'pending' | 'approved' | 'rejected';
  diff: LawKbDiffReport;
  impactSummary: string;
  sourceUrl: string;
  publishedAt: string;
  effectiveFrom: string;
  effectiveTo?: string;
  jurisdiction: string;
  scope: string;
  createdAt: string;
  approvedAt?: string;
}

export interface LawKbVersionRecord {
  id: string;
  lawKbVersion: string;
  suggestionId: string;
  approvedBy: string;
  evalRunId?: string;
  createdAt: string;
}

export interface ImportedLawKbDocumentResult {
  document: LawKbDocumentRecord;
  version: LawKbDocumentVersionRecord;
  diff: LawKbDiffReport;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeClause(text: string): string {
  return text.normalize('NFKC').replace(/\s+/gu, '').toLocaleLowerCase();
}

function splitClauses(content: string): string[] {
  return content
    .split(/\r?\n+/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function fingerprintPrefix(text: string): string {
  return normalizeClause(text).slice(0, 16);
}

function createDiff(
  previous: LawKbDocumentVersionRecord | undefined,
  current: LawKbDocumentVersionRecord,
): LawKbDiffReport {
  const oldClauses = previous === undefined ? [] : splitClauses(previous.content);
  const newClauses = splitClauses(current.content);
  const oldSet = new Set(oldClauses.map(normalizeClause));
  const newSet = new Set(newClauses.map(normalizeClause));
  const addedClauses = newClauses
    .map((text, index) => ({ index, text }))
    .filter((clause) => !oldSet.has(normalizeClause(clause.text)));
  const deprecatedClauses = oldClauses
    .map((text, index) => ({ index, text }))
    .filter((clause) => !newSet.has(normalizeClause(clause.text)));
  const modifiedClauses: ModifiedClauseChange[] = [];
  for (const added of addedClauses) {
    const match = deprecatedClauses.find(
      (deprecated) => fingerprintPrefix(deprecated.text) === fingerprintPrefix(added.text),
    );
    if (match !== undefined) {
      modifiedClauses.push({ before: match.text, after: added.text });
    }
  }
  return {
    ...(previous === undefined ? {} : { fromVersion: previous.version }),
    toVersion: current.version,
    addedClauses,
    modifiedClauses,
    deprecatedClauses,
    unchangedCount: newClauses.filter((clause) => oldSet.has(normalizeClause(clause))).length,
  };
}

function summarizeImpact(document: LawKbDocumentRecord, diff: LawKbDiffReport): string {
  return [
    `适用地区：${document.jurisdiction}`,
    `适用范围：${document.scope}`,
    `影响类别：${document.categories.join(', ')}`,
    `新增 ${diff.addedClauses.length} 条，修改 ${diff.modifiedClauses.length} 条，废止 ${diff.deprecatedClauses.length} 条。`,
  ].join('；');
}

export class LawKbUpdateService {
  private readonly sources = new Map<string, TrustedKnowledgeSourceRecord>();
  private readonly documents = new Map<string, LawKbDocumentRecord>();
  private readonly versions = new Map<string, LawKbDocumentVersionRecord>();
  private readonly suggestions = new Map<string, LawKbUpdateSuggestionRecord>();
  private readonly versionRecords = new Map<string, LawKbVersionRecord>();
  private readonly impactReports = new Map<string, LawKbImpactReportRecord>();

  createTrustedSource(input: CreateTrustedSourceInput): TrustedKnowledgeSourceRecord {
    const timestamp = nowIso();
    const record: TrustedKnowledgeSourceRecord = {
      id: `source_${randomUUID()}`,
      name: redactSensitiveText(input.name),
      sourceType: input.sourceType,
      baseUrl: input.baseUrl,
      jurisdiction: input.jurisdiction,
      scope: input.scope,
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.sources.set(record.id, structuredClone(record));
    return structuredClone(record);
  }

  listTrustedSources(): TrustedKnowledgeSourceRecord[] {
    return [...this.sources.values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((source) => structuredClone(source));
  }

  checkTrustedSource(id: string): Record<string, unknown> | undefined {
    const source = this.sources.get(id);
    if (source === undefined) return undefined;
    return {
      source: structuredClone(source),
      status: 'manual_import_required',
      message: 'MVP 不自动抓取外部法规站点；请通过文档导入接口提交新版本。',
      checkedAt: nowIso(),
    };
  }

  importDocument(input: ImportLawKbDocumentInput): ImportedLawKbDocumentResult {
    const source = this.sources.get(input.sourceId);
    if (source === undefined || source.status !== 'active') {
      throw new Error('TRUSTED_SOURCE_NOT_FOUND');
    }
    const timestamp = nowIso();
    const existingDocument = [...this.documents.values()].find(
      (document) =>
        document.id === input.documentId ||
        (document.sourceUrl === input.sourceUrl && document.title === input.title),
    );
    const document: LawKbDocumentRecord = {
      id: existingDocument?.id ?? input.documentId ?? `law_doc_${randomUUID()}`,
      sourceId: input.sourceId,
      title: redactSensitiveText(input.title),
      sourceUrl: input.sourceUrl,
      sourceType: input.sourceType,
      jurisdiction: input.jurisdiction,
      scope: input.scope,
      publishedAt: input.publishedAt,
      effectiveFrom: input.effectiveFrom,
      ...(input.effectiveTo === undefined ? {} : { effectiveTo: input.effectiveTo }),
      categories: input.categories,
      keywords: input.keywords,
      createdAt: existingDocument?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    const version: LawKbDocumentVersionRecord = {
      id: `law_doc_version_${randomUUID()}`,
      documentId: document.id,
      version: input.version,
      content: redactSensitiveText(input.content),
      contentHash: hashSensitiveValue(input.content),
      importedBy: input.importedBy,
      createdAt: timestamp,
    };
    const previous = this.latestVersion(document.id);
    this.documents.set(document.id, structuredClone(document));
    this.versions.set(version.id, structuredClone(version));
    return {
      document: structuredClone(document),
      version: structuredClone(version),
      diff: createDiff(previous, version),
    };
  }

  listDocuments(): LawKbDocumentRecord[] {
    return [...this.documents.values()]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((document) => structuredClone(document));
  }

  getDiff(documentId: string, version?: string): LawKbDiffReport | undefined {
    const target =
      version === undefined
        ? this.latestVersion(documentId)
        : [...this.versions.values()].find(
            (entry) => entry.documentId === documentId && entry.version === version,
          );
    if (target === undefined) return undefined;
    const previous = this.previousVersion(target);
    return createDiff(previous, target);
  }

  createSuggestion(documentVersionId: string): LawKbUpdateSuggestionRecord | undefined {
    const version = this.versions.get(documentVersionId);
    if (version === undefined) return undefined;
    const document = this.documents.get(version.documentId);
    if (document === undefined) return undefined;
    const diff = createDiff(this.previousVersion(version), version);
    const timestamp = nowIso();
    const suggestion: LawKbUpdateSuggestionRecord = {
      id: `law_kb_suggestion_${randomUUID()}`,
      documentId: document.id,
      documentVersionId,
      ...(diff.fromVersion === undefined ? {} : { fromVersion: diff.fromVersion }),
      toVersion: version.version,
      status: 'pending',
      diff,
      impactSummary: summarizeImpact(document, diff),
      sourceUrl: document.sourceUrl,
      publishedAt: document.publishedAt,
      effectiveFrom: document.effectiveFrom,
      ...(document.effectiveTo === undefined ? {} : { effectiveTo: document.effectiveTo }),
      jurisdiction: document.jurisdiction,
      scope: document.scope,
      createdAt: timestamp,
    };
    this.suggestions.set(suggestion.id, structuredClone(suggestion));
    const impact = this.createImpactReport(suggestion, document);
    this.impactReports.set(impact.id, structuredClone(impact));
    return structuredClone(suggestion);
  }

  listSuggestions(status: LawKbUpdateSuggestionRecord['status'] | 'all' = 'pending'): LawKbUpdateSuggestionRecord[] {
    return [...this.suggestions.values()]
      .filter((suggestion) => status === 'all' || suggestion.status === status)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((suggestion) => structuredClone(suggestion));
  }

  findSuggestion(id: string): LawKbUpdateSuggestionRecord | undefined {
    const suggestion = this.suggestions.get(id);
    return suggestion === undefined ? undefined : structuredClone(suggestion);
  }

  approveSuggestion(
    id: string,
    input: ApproveSuggestionInput,
    evalRunId?: string,
  ): LawKbVersionRecord | undefined {
    const suggestion = this.suggestions.get(id);
    if (suggestion === undefined) return undefined;
    const timestamp = nowIso();
    const lawKbVersion =
      input.lawKbVersion ?? `lawkb-${timestamp.slice(0, 10)}-${suggestion.toVersion}`;
    const updatedSuggestion: LawKbUpdateSuggestionRecord = {
      ...suggestion,
      status: 'approved',
      approvedAt: timestamp,
    };
    this.suggestions.set(id, structuredClone(updatedSuggestion));
    const record: LawKbVersionRecord = {
      id: `law_kb_version_${randomUUID()}`,
      lawKbVersion,
      suggestionId: id,
      approvedBy: input.approvedBy,
      ...(evalRunId === undefined ? {} : { evalRunId }),
      createdAt: timestamp,
    };
    this.versionRecords.set(record.id, structuredClone(record));
    return structuredClone(record);
  }

  listVersions(): LawKbVersionRecord[] {
    return [...this.versionRecords.values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((record) => structuredClone(record));
  }

  findImpactReportBySuggestion(suggestionId: string): LawKbImpactReportRecord | undefined {
    const report = [...this.impactReports.values()].find(
      (entry) => entry.suggestionId === suggestionId,
    );
    return report === undefined ? undefined : structuredClone(report);
  }

  private latestVersion(documentId: string): LawKbDocumentVersionRecord | undefined {
    return [...this.versions.values()]
      .filter((version) => version.documentId === documentId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  }

  private previousVersion(
    target: LawKbDocumentVersionRecord,
  ): LawKbDocumentVersionRecord | undefined {
    return [...this.versions.values()]
      .filter((version) => version.documentId === target.documentId && version.id !== target.id)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  }

  private createImpactReport(
    suggestion: LawKbUpdateSuggestionRecord,
    document: LawKbDocumentRecord,
  ): LawKbImpactReportRecord {
    const affectedEvidenceIds = [`${document.sourceType}:${document.id}`];
    return {
      id: `law_kb_impact_${randomUUID()}`,
      suggestionId: suggestion.id,
      affectedCategories: document.categories,
      affectedRules: document.keywords
        .filter((keyword) => keyword.toUpperCase().startsWith('CN_'))
        .slice(0, 20),
      affectedEvidenceIds,
      summary: `${suggestion.impactSummary}；建议在发布前运行冻结评估集并灰度 lawKbVersion。`,
      createdAt: nowIso(),
    };
  }
}
