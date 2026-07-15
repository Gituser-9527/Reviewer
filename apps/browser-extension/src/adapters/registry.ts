import type { JobPageAdapter, PageContext } from '@job-compliance/shared';
import { GenericJobPageAdapter } from '../extraction/generic-job-page-adapter.js';

export class AdapterRegistry {
  constructor(private readonly adapters: JobPageAdapter[] = [new GenericJobPageAdapter()]) {}
  register(adapter: JobPageAdapter): void { this.adapters.unshift(adapter); }
  resolve(context: PageContext): JobPageAdapter { return this.adapters.find((adapter) => { const match = adapter.supports(context); return typeof match === 'boolean' ? match : match.supported; }) ?? new GenericJobPageAdapter(); }
}
