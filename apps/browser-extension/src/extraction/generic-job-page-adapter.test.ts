import { describe, expect, it } from 'vitest';
import { GenericJobPageAdapter } from './generic-job-page-adapter.js';

describe('GenericJobPageAdapter', () => {
  it('extracts JSON-LD JobPosting fields from a fixed page snapshot', async () => {
    const capture = await new GenericJobPageAdapter().extract({
      url: 'https://fixture.example/jobs/1', title: '后备标题', mainText: '职位正文', embeddedJsonBlocks: [],
      jsonLdBlocks: [{ '@context': 'https://schema.org', '@type': 'JobPosting', title: '合规专员', description: '负责招聘合规审核', employmentType: 'FULL_TIME', hiringOrganization: { name: '示例公司' } }],
    });
    expect(capture.job.title?.value).toBe('合规专员');
    expect(capture.job.description?.source).toBe('JSON_LD');
    expect(capture.completenessScore).toBeGreaterThan(0);
  });

  it('degrades to title and main text when structured data is unavailable', async () => {
    const capture = await new GenericJobPageAdapter().extract({ url: 'https://fixture.example/jobs/2', title: '审核助理', mainText: '负责页面职位审核。', jsonLdBlocks: [], embeddedJsonBlocks: [] });
    expect(capture.job.title?.value).toBe('审核助理');
    expect(capture.extractionWarnings).toHaveLength(1);
  });
});
