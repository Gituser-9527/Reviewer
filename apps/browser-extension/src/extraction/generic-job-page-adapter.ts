import type { JobPageAdapter, PageContext, WebJobCapture } from '@job-compliance/shared';

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const jobPosting = (blocks: unknown[]): Record<string, unknown> | undefined =>
  blocks.find((block): block is Record<string, unknown> => {
    if (typeof block !== 'object' || block === null || Array.isArray(block)) return false;
    const type = (block as Record<string, unknown>)['@type'];
    return type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'));
  });

const score = (capture: WebJobCapture): number => {
  const fields = Object.values(capture.job).filter((value) => value !== undefined).length;
  return Math.round((fields / 9) * 100) / 100;
};

/** Conservative fallback for publicly rendered job pages; it does not execute site code. */
export class GenericJobPageAdapter implements JobPageAdapter {
  readonly id = 'generic-job-page';
  readonly version = '1.0.0';
  readonly supportedDomains = ['*'];

  supports(_context: PageContext): boolean { return true; }

  async extract(context: PageContext): Promise<WebJobCapture> {
    const structured = jobPosting(context.jsonLdBlocks);
    const field = (value: unknown, source: 'JSON_LD' | 'GENERIC_DOM', selector?: string) => {
      const text = readString(value);
      return text === undefined ? undefined : { value: text, confidence: source === 'JSON_LD' ? 0.92 : 0.45, source, ...(selector === undefined ? {} : { locator: { selector, textQuote: text } }) };
    };
    const title = field(structured?.title ?? context.title, structured === undefined ? 'GENERIC_DOM' : 'JSON_LD', 'h1');
    const description = field(structured?.description ?? context.mainText, structured === undefined ? 'GENERIC_DOM' : 'JSON_LD', 'main');
    const job = {
      ...(title === undefined ? {} : { title }),
      ...(field(structured?.hiringOrganization && typeof structured.hiringOrganization === 'object' && structured.hiringOrganization !== null ? (structured.hiringOrganization as Record<string, unknown>).name : undefined, 'JSON_LD') === undefined ? {} : { companyName: field(structured?.hiringOrganization && typeof structured.hiringOrganization === 'object' && structured.hiringOrganization !== null ? (structured.hiringOrganization as Record<string, unknown>).name : undefined, 'JSON_LD')! }),
      ...(field(structured?.jobLocation && typeof structured.jobLocation === 'object' && structured.jobLocation !== null ? JSON.stringify(structured.jobLocation) : undefined, 'JSON_LD') === undefined ? {} : { location: field(structured?.jobLocation && typeof structured.jobLocation === 'object' && structured.jobLocation !== null ? JSON.stringify(structured.jobLocation) : undefined, 'JSON_LD')! }),
      ...(field(structured?.employmentType, 'JSON_LD') === undefined ? {} : { employmentType: field(structured?.employmentType, 'JSON_LD')! }),
      ...(field(structured?.baseSalary, 'JSON_LD') === undefined ? {} : { salary: field(structured?.baseSalary, 'JSON_LD')! }),
      ...(description === undefined ? {} : { description }),
    };
    const capture: WebJobCapture = {
      captureId: crypto.randomUUID(), sourceType: 'BROWSER_EXTENSION', pageUrl: context.url, pageTitle: context.title,
      capturedAt: new Date().toISOString(), adapter: { id: this.id, version: this.version, confidence: structured === undefined ? 0.45 : 0.92 },
      job,
      rawContent: { mainText: context.mainText, ...(context.jsonLdBlocks.length === 0 ? {} : { structuredData: context.jsonLdBlocks }) }, completenessScore: 0, extractionWarnings: structured === undefined ? ['未找到 JSON-LD JobPosting，已使用通用正文提取。'] : [],
    };
    capture.completenessScore = score(capture);
    return capture;
  }
}
