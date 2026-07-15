import { describe, expect, it } from 'vitest';
import type { JobPageAdapter, PageContext, WebJobCapture } from '@job-compliance/shared';
import { AdapterRegistry } from './registry.js';

const context: PageContext = { url: 'https://fixture.example/job', title: '职位', mainText: '正文', jsonLdBlocks: [], embeddedJsonBlocks: [] };
const fixtureAdapter: JobPageAdapter = { id: 'fixture', version: '1', supportedDomains: ['fixture.example'], supports: () => true, extract: async (): Promise<WebJobCapture> => { throw new Error('not needed'); } };
describe('AdapterRegistry', () => { it('prefers a registered supported adapter', () => { const registry = new AdapterRegistry(); registry.register(fixtureAdapter); expect(registry.resolve(context).id).toBe('fixture'); }); });
