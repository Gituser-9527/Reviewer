/** A value extracted from a job page together with its provenance. */
export interface ExtractedField<T> {
  value: T;
  confidence: number;
  source: 'JSON_LD' | 'EMBEDDED_JSON' | 'SITE_ADAPTER' | 'GENERIC_DOM' | 'USER_CORRECTION' | 'LLM';
  locator?: { selector?: string; textQuote?: string };
}

/** Source-preserving representation of a job page captured with user intent. */
export interface WebJobCapture {
  captureId: string;
  sourceType: 'BROWSER_EXTENSION' | 'PUBLIC_URL';
  pageUrl: string;
  pageTitle: string;
  capturedAt: string;
  adapter: { id: string; version: string; confidence: number };
  job: {
    title?: ExtractedField<string>;
    companyName?: ExtractedField<string>;
    location?: ExtractedField<string>;
    salary?: ExtractedField<string>;
    employmentType?: ExtractedField<string>;
    description?: ExtractedField<string>;
    responsibilities?: ExtractedField<string[]>;
    requirements?: ExtractedField<string[]>;
    benefits?: ExtractedField<string[]>;
  };
  rawContent: { mainText: string; structuredData?: unknown };
  completenessScore: number;
  extractionWarnings: string[];
}

export interface DomLocator {
  selector?: string;
  textQuote?: string;
  elementIndex?: number;
  startOffset?: number;
  endOffset?: number;
  pageFingerprint?: string;
}

export type JobPageType = 'JOB_DETAIL' | 'JOB_EDIT' | 'REVIEW_QUEUE' | 'JOB_LIST' | 'UNKNOWN';
export interface AdapterMatchResult { supported: boolean; confidence: number; pageType: JobPageType; reason?: string; }
export type WebJobFieldName = keyof WebJobCapture['job'];
export interface TextMatchLocation extends DomLocator { confidence: number; }

export interface PageContext {
  url: string;
  title: string;
  mainText: string;
  jsonLdBlocks: unknown[];
  embeddedJsonBlocks: unknown[];
}

export interface NextActionDescriptor {
  label: string;
  locator: DomLocator;
}

/** Boundary for a site-specific extraction adapter. It must never perform page actions. */
export interface JobPageAdapter {
  id: string;
  version: string;
  supportedDomains: string[];
  supports(context: PageContext): boolean | AdapterMatchResult;
  extract(context: PageContext): Promise<WebJobCapture>;
  locateField?(field: keyof WebJobCapture['job'], context: PageContext): DomLocator | null;
  detectNextAction?(context: PageContext): NextActionDescriptor | null;
  locateMatchedText?(matchedText: string, context: PageContext): TextMatchLocation[];
  getPageFingerprint?(context: PageContext): string;
}
