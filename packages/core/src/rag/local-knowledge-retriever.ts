import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { riskCategories, type Evidence, type RiskCategory } from '@job-compliance/shared';
import { parse as parseYaml } from 'yaml';
import type { EvidenceRetrievalQuery, EvidenceRetriever } from './types.js';

interface KnowledgeDocument {
  id: string;
  title: string;
  sourceType: string;
  url: string;
  version: string;
  quote: string;
  categories: RiskCategory[];
  keywords: string[];
  jurisdiction?: string;
  platform?: string;
  metadata?: Record<string, unknown>;
}

interface RankedDocument {
  document: KnowledgeDocument;
  score: number;
}

const supportedExtensions = new Set(['.md', '.json']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function requireText(value: unknown, field: string, source: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${source}: ${field} must be a non-empty string`);
  }
  return value.trim();
}

function requireTextArray(value: unknown, field: string, source: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new TypeError(`${source}: ${field} must be an array of non-empty strings`);
  }
  return value.map((item) => item.trim());
}

function toDocument(value: unknown, source: string, fallbackQuote?: string): KnowledgeDocument {
  if (!isRecord(value)) throw new TypeError(`${source}: knowledge entry must be an object`);
  const categories = requireTextArray(value.categories, 'categories', source) as RiskCategory[];
  const unsupportedCategory = categories.find((category) => !riskCategories.includes(category));
  if (unsupportedCategory) {
    throw new TypeError(`${source}: unsupported risk category ${unsupportedCategory}`);
  }
  const quote = fallbackQuote?.trim() || requireText(value.quote, 'quote', source);
  return {
    id: requireText(value.id, 'id', source),
    title: requireText(value.title, 'title', source),
    sourceType: requireText(value.sourceType, 'sourceType', source),
    url: requireText(value.url, 'url', source),
    version: requireText(value.version, 'version', source),
    quote,
    categories,
    keywords: requireTextArray(value.keywords, 'keywords', source),
    ...(value.jurisdiction === undefined
      ? {}
      : { jurisdiction: requireText(value.jurisdiction, 'jurisdiction', source) }),
    ...(value.platform === undefined
      ? {}
      : { platform: requireText(value.platform, 'platform', source) }),
    ...(isRecord(value.metadata) ? { metadata: value.metadata } : {}),
  };
}

function parseMarkdown(content: string, source: string): KnowledgeDocument[] {
  const match = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n([\s\S]*)$/u.exec(content);
  if (!match) throw new TypeError(`${source}: markdown knowledge must include YAML front matter`);
  return [toDocument(parseYaml(match[1] ?? ''), source, match[2])];
}

function parseJson(content: string, source: string): KnowledgeDocument[] {
  const parsed: unknown = JSON.parse(content);
  return (Array.isArray(parsed) ? parsed : [parsed]).map((entry, index) =>
    toDocument(entry, `${source}[${index}]`),
  );
}

async function listKnowledgeFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return listKnowledgeFiles(path);
      if (entry.name.toLowerCase() === 'readme.md') return [];
      return entry.isFile() && supportedExtensions.has(extname(entry.name).toLowerCase())
        ? [path]
        : [];
    }),
  );
  return nested.flat().sort();
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().trim();
}

function matchesScope(document: KnowledgeDocument, query: EvidenceRetrievalQuery): boolean {
  const jurisdictionMatches =
    document.jurisdiction === undefined ||
    normalize(document.jurisdiction) === normalize(query.jurisdiction);
  const platformMatches =
    document.platform === undefined ||
    normalize(document.platform) === normalize(query.platform) ||
    normalize(document.platform) === 'default';
  return jurisdictionMatches && platformMatches;
}

function scoreDocument(document: KnowledgeDocument, query: EvidenceRetrievalQuery): number {
  if (!document.categories.includes(query.category) || !matchesScope(document, query)) return 0;
  const haystack = normalize(`${document.title} ${document.quote} ${document.keywords.join(' ')}`);
  const queryTerms = [...new Set([...query.keywords, query.text])]
    .map(normalize)
    .filter((term) => term.length > 0);
  const keywordMatches = queryTerms.filter((term) => haystack.includes(term)).length;
  const sourceWeight = document.sourceType === 'LAW' ? 2 : 1;
  return 10 + keywordMatches * 2 + sourceWeight;
}

function toEvidence(ranked: RankedDocument, sourcePath: string): Evidence {
  const { document, score } = ranked;
  return {
    id: document.id,
    title: document.title,
    sourceType: document.sourceType,
    quote: document.quote,
    url: document.url,
    version: document.version,
    sourceId: document.id,
    sourceName: document.title,
    sourceVersion: document.version,
    metadata: {
      ...document.metadata,
      knowledgePath: sourcePath,
      retrievalScore: score,
      maintainedSummary: true,
    },
  };
}

/** File-backed retriever for approved markdown and JSON knowledge assets. */
export class LocalKnowledgeRetriever implements EvidenceRetriever {
  private documentsPromise: Promise<Array<{ document: KnowledgeDocument; path: string }>> | null =
    null;

  /** Creates a retriever rooted at the knowledge directory. */
  constructor(private readonly knowledgeDirectory: string) {}

  private loadDocuments(): Promise<Array<{ document: KnowledgeDocument; path: string }>> {
    this.documentsPromise ??= (async () => {
      const files = await listKnowledgeFiles(this.knowledgeDirectory);
      const loaded = await Promise.all(
        files.map(async (path) => {
          const content = await readFile(path, 'utf8');
          const entries =
            extname(path).toLowerCase() === '.json'
              ? parseJson(content, path)
              : parseMarkdown(content, path);
          return entries.map((document) => ({
            document,
            path: relative(this.knowledgeDirectory, path).replaceAll('\\', '/'),
          }));
        }),
      );
      const documents = loaded.flat();
      const duplicateIds = documents
        .map(({ document }) => document.id)
        .filter((id, index, all) => all.indexOf(id) !== index);
      if (duplicateIds.length > 0) {
        throw new TypeError(
          `Duplicate knowledge evidence ids: ${[...new Set(duplicateIds)].join(', ')}`,
        );
      }
      return documents;
    })();
    return this.documentsPromise;
  }

  /** Retrieves category-compatible evidence and ranks exact keyword matches first. */
  async retrieve(query: EvidenceRetrievalQuery): Promise<Evidence[]> {
    if (!Number.isInteger(query.topK) || query.topK < 1) {
      throw new RangeError('Evidence retrieval topK must be a positive integer');
    }
    const documents = await this.loadDocuments();
    return documents
      .map(({ document, path }) => ({ document, path, score: scoreDocument(document, query) }))
      .filter((entry) => entry.score > 0)
      .sort(
        (left, right) =>
          right.score - left.score || left.document.id.localeCompare(right.document.id),
      )
      .slice(0, query.topK)
      .map(({ document, path, score }) => toEvidence({ document, score }, path));
  }
}
