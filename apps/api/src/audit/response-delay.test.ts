import { describe, expect, it } from 'vitest';
import { testAuditResponseDelayMs } from './routes.js';

describe('test-only audit response delay', () => {
  it('is disabled unless an explicit bounded test environment value is supplied', () => {
    expect(testAuditResponseDelayMs({ NODE_ENV: 'production', TEST_AUDIT_RESPONSE_DELAY_MS: '50' })).toBe(0);
    expect(testAuditResponseDelayMs({ NODE_ENV: 'development', TEST_AUDIT_RESPONSE_DELAY_MS: '50' })).toBe(0);
    expect(testAuditResponseDelayMs({ NODE_ENV: 'test' })).toBe(0);
    expect(testAuditResponseDelayMs({ NODE_ENV: 'test', TEST_AUDIT_RESPONSE_DELAY_MS: '0' })).toBe(0);
    expect(testAuditResponseDelayMs({ NODE_ENV: 'test', TEST_AUDIT_RESPONSE_DELAY_MS: '-1' })).toBe(0);
    expect(testAuditResponseDelayMs({ NODE_ENV: 'test', TEST_AUDIT_RESPONSE_DELAY_MS: 'not-a-number' })).toBe(0);
  });
  it('accepts only positive integer test delays and caps them', () => {
    expect(testAuditResponseDelayMs({ NODE_ENV: 'test', TEST_AUDIT_RESPONSE_DELAY_MS: '250' })).toBe(250);
    expect(testAuditResponseDelayMs({ NODE_ENV: 'test', TEST_AUDIT_RESPONSE_DELAY_MS: '999999' })).toBe(10_000);
  });
});
