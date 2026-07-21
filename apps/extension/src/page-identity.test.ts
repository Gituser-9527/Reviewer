import { describe, expect, it } from 'vitest';
import { captureFingerprint, identityForCapture, normalizePageUrl, samePageIdentity } from './page-identity.js';
import type { WebJobCapture } from './types.js';

const capture = (overrides: Partial<WebJobCapture['job']> = {}): WebJobCapture => ({ schemaVersion:1,captureId:'capture',capturedAt:'now',sourceUrl:'https://jobs.example.test:443/view?b=2&a=1#job-1',sourcePlatform:'jobs.example.test',pageTitle:'岗位',extractionMethod:'dom',extractionWarnings:[],userCorrected:false,job:{title:'工程师',companyName:'示例公司',location:'北京',salary:'10k',employmentType:'FULL_TIME',description:'负责 平台\n开发',requirements:['TypeScript'],...overrides} });

describe('page identity', () => {
  it('normalizes URLs without discarding job-bearing query or hash values', () => {
    expect(normalizePageUrl('https://jobs.example.test:443/view?b=2&a=1#job-1')).toBe('https://jobs.example.test/view?a=1&b=2#job-1');
    expect(normalizePageUrl('https://jobs.example.test/view?a=1&b=2#job-2')).not.toBe(normalizePageUrl('https://jobs.example.test/view?a=1&b=2#job-1'));
    expect(normalizePageUrl('not a URL')).toMatch(/^invalid:/u);
  });
  it('uses normalized core capture fields for a stable fingerprint', () => {
    expect(captureFingerprint(capture())).toBe(captureFingerprint(capture({ description:'负责 平台 开发' })));
    expect(captureFingerprint(capture())).not.toBe(captureFingerprint(capture({ title:'产品经理' })));
    expect(captureFingerprint(capture())).not.toBe(captureFingerprint(capture({ companyName:'另一公司' })));
  });
  it('compares URL and core content together', () => {
    const first = identityForCapture(capture());
    expect(samePageIdentity(first, identityForCapture(capture()))).toBe(true);
    expect(samePageIdentity(first, identityForCapture(capture({ description:'不同岗位内容' })))).toBe(false);
  });
});
