import { describe, expect, it } from 'vitest';
import { EnrichmentWorker, MockEnrichmentProvider } from './enrichment-worker.js';

describe('EnrichmentWorker', () => {
  it('completes a mock explanation and records mock usage', async () => {
    const events:string[]=[]; const job={id:'j1',tenantId:'tenant-a',type:'AUDIT_GENERATE_EXPLANATIONS',status:'RUNNING',auditRunId:'audit-a',attemptCount:1,maxAttempts:3,payload:{tenantId:'tenant-a',auditRunId:'audit-a',jobType:'AUDIT_GENERATE_EXPLANATIONS',promptVersion:'v1',idempotencyKey:'audit-a:explanation:v1'}};
    const worker=new EnrichmentWorker({releaseExpiredLocks:async()=>0,claimNext:async()=>job,completeJob:async()=>{events.push('complete');},retryJob:async()=>{events.push('retry');},deadLetter:async()=>{events.push('dead');},createUsage:async input=>{expect(input.isMock).toBe(true);events.push('usage');}},new MockEnrichmentProvider());
    expect(await worker.runOnce()).toBe(true); expect(events).toEqual(['complete','usage']);
  });
});
