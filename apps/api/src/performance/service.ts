import { randomUUID } from 'node:crypto';
import type { AuditJobRequest } from '../audit/schemas.js';

export type AsyncJobStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type BatchAuditStatus = 'queued' | 'processing' | 'completed' | 'partial_failed' | 'failed';
export type BatchAuditItemStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type CacheNamespace = 'llm' | 'rag' | 'rules';

export interface AsyncAuditJob {
  id: string;
  type: 'audit';
  tenantId: string;
  status: AsyncJobStatus;
  batchId?: string;
  batchItemId?: string;
  auditRunId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface BatchAuditJob {
  id: string;
  tenantId: string;
  status: BatchAuditStatus;
  totalCount: number;
  queuedCount: number;
  processingCount: number;
  completedCount: number;
  failedCount: number;
  resultIds: string[];
  errors: Array<Record<string, unknown>>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface BatchAuditItem {
  id: string;
  batchId: string;
  tenantId: string;
  jobPostingId: string;
  status: BatchAuditItemStatus;
  auditRunId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface CacheStats {
  namespace: CacheNamespace;
  size: number;
  hits: number;
  misses: number;
}

export interface RateLimitConfig {
  tenantDailyAuditLimit: number;
  tenantPerMinuteLimit: number;
  apiKeyPerMinuteLimit: number;
}

export interface RateLimitSnapshot {
  tenantId: string;
  apiKeyId?: string;
  limits: RateLimitConfig;
  tenantDailyUsed: number;
  tenantMinuteUsed: number;
  apiKeyMinuteUsed: number;
  remainingDaily: number;
  remainingTenantMinute: number;
  remainingApiKeyMinute: number;
  period: string;
  generatedAt: string;
}

export interface CostUsageRecord {
  id: string;
  tenantId: string;
  apiKeyId?: string;
  auditId?: string;
  batchId?: string;
  itemId?: string;
  auditCount: number;
  llmTokensIn: number;
  llmTokensOut: number;
  llmCost: number;
  ragCost: number;
  ruleCost: number;
  totalCost: number;
  createdAt: string;
}

export interface CostUsageDaily {
  tenantId: string;
  date: string;
  auditCount: number;
  llmTokensIn: number;
  llmTokensOut: number;
  llmCost: number;
  ragCost: number;
  ruleCost: number;
  totalCost: number;
  updatedAt: string;
}

export interface CostUsageSnapshot {
  tenantId: string;
  date?: string;
  daily: CostUsageDaily[];
  records: CostUsageRecord[];
  generatedAt: string;
}

export interface BatchAuditJobInput {
  jobPostingId: string;
  request: AuditJobRequest;
}

export interface QueueProcessorResult {
  auditRunId: string;
}

export type QueueItemProcessor = (item: BatchAuditJobInput & { itemId: string; batchId: string }) => Promise<QueueProcessorResult>;
export type BatchCompleteHandler = (batch: BatchAuditJob) => Promise<void> | void;

function nowIso(): string {
  return new Date().toISOString();
}

function dayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function minuteAgo(): number {
  return Date.now() - 60_000;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class RateLimitError extends Error {
  constructor(
    readonly code: 'RATE_LIMITED',
    message: string,
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class CacheService {
  private readonly caches = new Map<CacheNamespace, Map<string, CacheEntry<unknown>>>();
  private readonly hits = new Map<CacheNamespace, number>();
  private readonly misses = new Map<CacheNamespace, number>();

  constructor(private readonly defaultTtlMs = 10 * 60_000) {
    for (const namespace of ['llm', 'rag', 'rules'] satisfies CacheNamespace[]) {
      this.caches.set(namespace, new Map());
      this.hits.set(namespace, 0);
      this.misses.set(namespace, 0);
    }
  }

  get<T>(namespace: CacheNamespace, key: string): T | undefined {
    const cache = this.caches.get(namespace) ?? new Map<string, CacheEntry<unknown>>();
    const entry = cache.get(key);
    if (entry === undefined || entry.expiresAt < Date.now()) {
      if (entry !== undefined) cache.delete(key);
      this.misses.set(namespace, (this.misses.get(namespace) ?? 0) + 1);
      return undefined;
    }
    this.hits.set(namespace, (this.hits.get(namespace) ?? 0) + 1);
    return clone(entry.value as T);
  }

  set<T>(namespace: CacheNamespace, key: string, value: T, ttlMs = this.defaultTtlMs): void {
    const cache = this.caches.get(namespace) ?? new Map<string, CacheEntry<unknown>>();
    cache.set(key, { value: clone(value), expiresAt: Date.now() + ttlMs });
    this.caches.set(namespace, cache);
  }

  getOrSet<T>(namespace: CacheNamespace, key: string, factory: () => T, ttlMs = this.defaultTtlMs): T {
    const cached = this.get<T>(namespace, key);
    if (cached !== undefined) return cached;
    const value = factory();
    this.set(namespace, key, value, ttlMs);
    return value;
  }

  stats(): CacheStats[] {
    return [...this.caches.entries()].map(([namespace, cache]) => ({
      namespace,
      size: cache.size,
      hits: this.hits.get(namespace) ?? 0,
      misses: this.misses.get(namespace) ?? 0,
    }));
  }
}

export class RateLimitService {
  private readonly configs = new Map<string, RateLimitConfig>();
  private readonly tenantEvents = new Map<string, number[]>();
  private readonly apiKeyEvents = new Map<string, number[]>();
  private readonly dailyCounts = new Map<string, number>();

  constructor(
    private readonly defaultConfig: RateLimitConfig = {
      tenantDailyAuditLimit: 10_000,
      tenantPerMinuteLimit: 600,
      apiKeyPerMinuteLimit: 300,
    },
  ) {}

  configureTenant(tenantId: string, config: Partial<RateLimitConfig>): RateLimitConfig {
    const updated = { ...this.getConfig(tenantId), ...config };
    this.configs.set(tenantId, updated);
    return clone(updated);
  }

  assertAllowed(input: { tenantId: string; quantity?: number; apiKeyId?: string }): RateLimitSnapshot {
    const quantity = input.quantity ?? 1;
    const config = this.getConfig(input.tenantId);
    const snapshot = this.snapshot(input.tenantId, input.apiKeyId);
    if (snapshot.tenantDailyUsed + quantity > config.tenantDailyAuditLimit) {
      throw new RateLimitError('RATE_LIMITED', 'Tenant daily audit limit has been exceeded.');
    }
    if (snapshot.tenantMinuteUsed + quantity > config.tenantPerMinuteLimit) {
      throw new RateLimitError('RATE_LIMITED', 'Tenant per-minute audit limit has been exceeded.');
    }
    if (
      input.apiKeyId !== undefined &&
      snapshot.apiKeyMinuteUsed + quantity > config.apiKeyPerMinuteLimit
    ) {
      throw new RateLimitError('RATE_LIMITED', 'API key per-minute audit limit has been exceeded.');
    }
    return snapshot;
  }

  record(input: { tenantId: string; quantity?: number; apiKeyId?: string }): RateLimitSnapshot {
    const quantity = input.quantity ?? 1;
    const now = Date.now();
    const tenantEvents = this.trimEvents(this.tenantEvents.get(input.tenantId) ?? []);
    tenantEvents.push(...Array.from({ length: quantity }, () => now));
    this.tenantEvents.set(input.tenantId, tenantEvents);
    if (input.apiKeyId !== undefined) {
      const events = this.trimEvents(this.apiKeyEvents.get(input.apiKeyId) ?? []);
      events.push(...Array.from({ length: quantity }, () => now));
      this.apiKeyEvents.set(input.apiKeyId, events);
    }
    const dailyKey = `${input.tenantId}:${dayKey()}`;
    this.dailyCounts.set(dailyKey, (this.dailyCounts.get(dailyKey) ?? 0) + quantity);
    return this.snapshot(input.tenantId, input.apiKeyId);
  }

  snapshot(tenantId: string, apiKeyId?: string): RateLimitSnapshot {
    const config = this.getConfig(tenantId);
    const tenantMinuteUsed = this.trimEvents(this.tenantEvents.get(tenantId) ?? []).length;
    const apiKeyMinuteUsed =
      apiKeyId === undefined ? 0 : this.trimEvents(this.apiKeyEvents.get(apiKeyId) ?? []).length;
    const tenantDailyUsed = this.dailyCounts.get(`${tenantId}:${dayKey()}`) ?? 0;
    return {
      tenantId,
      ...(apiKeyId === undefined ? {} : { apiKeyId }),
      limits: clone(config),
      tenantDailyUsed,
      tenantMinuteUsed,
      apiKeyMinuteUsed,
      remainingDaily: Math.max(0, config.tenantDailyAuditLimit - tenantDailyUsed),
      remainingTenantMinute: Math.max(0, config.tenantPerMinuteLimit - tenantMinuteUsed),
      remainingApiKeyMinute: Math.max(0, config.apiKeyPerMinuteLimit - apiKeyMinuteUsed),
      period: dayKey(),
      generatedAt: nowIso(),
    };
  }

  private getConfig(tenantId: string): RateLimitConfig {
    return this.configs.get(tenantId) ?? this.defaultConfig;
  }

  private trimEvents(events: number[]): number[] {
    const cutoff = minuteAgo();
    return events.filter((timestamp) => timestamp >= cutoff);
  }
}

export class CostTrackingService {
  private readonly records = new Map<string, CostUsageRecord>();
  private readonly daily = new Map<string, CostUsageDaily>();

  recordAudit(input: {
    tenantId: string;
    apiKeyId?: string;
    auditId?: string;
    batchId?: string;
    itemId?: string;
    llmTokensIn?: number;
    llmTokensOut?: number;
    ragNoResult?: boolean;
  }): CostUsageRecord {
    const llmTokensIn = input.llmTokensIn ?? 0;
    const llmTokensOut = input.llmTokensOut ?? 0;
    const llmCost = (llmTokensIn / 1_000) * 0.002 + (llmTokensOut / 1_000) * 0.006;
    const ragCost = input.ragNoResult === true ? 0 : 0.0002;
    const ruleCost = 0.0001;
    const timestamp = nowIso();
    const record: CostUsageRecord = {
      id: `cost_${randomUUID()}`,
      tenantId: input.tenantId,
      ...(input.apiKeyId === undefined ? {} : { apiKeyId: input.apiKeyId }),
      ...(input.auditId === undefined ? {} : { auditId: input.auditId }),
      ...(input.batchId === undefined ? {} : { batchId: input.batchId }),
      ...(input.itemId === undefined ? {} : { itemId: input.itemId }),
      auditCount: 1,
      llmTokensIn,
      llmTokensOut,
      llmCost,
      ragCost,
      ruleCost,
      totalCost: llmCost + ragCost + ruleCost,
      createdAt: timestamp,
    };
    this.records.set(record.id, clone(record));
    this.addDaily(record);
    return clone(record);
  }

  getUsage(input: { tenantId: string; date?: string }): CostUsageSnapshot {
    const daily = [...this.daily.values()]
      .filter(
        (entry) =>
          entry.tenantId === input.tenantId && (input.date === undefined || entry.date === input.date),
      )
      .sort((left, right) => right.date.localeCompare(left.date))
      .map(clone);
    const records = [...this.records.values()]
      .filter(
        (entry) =>
          entry.tenantId === input.tenantId &&
          (input.date === undefined || entry.createdAt.startsWith(input.date)),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(clone);
    return {
      tenantId: input.tenantId,
      ...(input.date === undefined ? {} : { date: input.date }),
      daily,
      records,
      generatedAt: nowIso(),
    };
  }

  private addDaily(record: CostUsageRecord): void {
    const date = record.createdAt.slice(0, 10);
    const key = `${record.tenantId}:${date}`;
    const existing =
      this.daily.get(key) ??
      ({
        tenantId: record.tenantId,
        date,
        auditCount: 0,
        llmTokensIn: 0,
        llmTokensOut: 0,
        llmCost: 0,
        ragCost: 0,
        ruleCost: 0,
        totalCost: 0,
        updatedAt: record.createdAt,
      } satisfies CostUsageDaily);
    const updated: CostUsageDaily = {
      ...existing,
      auditCount: existing.auditCount + record.auditCount,
      llmTokensIn: existing.llmTokensIn + record.llmTokensIn,
      llmTokensOut: existing.llmTokensOut + record.llmTokensOut,
      llmCost: existing.llmCost + record.llmCost,
      ragCost: existing.ragCost + record.ragCost,
      ruleCost: existing.ruleCost + record.ruleCost,
      totalCost: existing.totalCost + record.totalCost,
      updatedAt: record.createdAt,
    };
    this.daily.set(key, clone(updated));
  }
}

export class FallbackPolicyService {
  constructor(
    readonly options: {
      auditTimeoutMs: number;
      llmTimeoutMs: number;
      ragNoResultFallbackDecision: 'continue' | 'manual_review';
    } = {
      auditTimeoutMs: 8_000,
      llmTimeoutMs: 3_000,
      ragNoResultFallbackDecision: 'continue',
    },
  ) {}

  runAuditWithFallback<T>(
    primary: () => Promise<T>,
    fallback: () => Promise<T>,
    timeoutMs = this.options.auditTimeoutMs,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        void fallback().then(resolve, reject);
      }, timeoutMs);
      void primary().then(
        (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve(value);
        },
        (error: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          reject(error);
        },
      );
    });
  }
}

export class JobQueueService {
  private readonly asyncJobs = new Map<string, AsyncAuditJob>();
  private readonly batches = new Map<string, BatchAuditJob>();
  private readonly batchItems = new Map<string, BatchAuditItem>();
  private readonly pending: Array<{
    batchId: string;
    itemId: string;
    input: BatchAuditJobInput;
    processor: QueueItemProcessor;
    onBatchComplete?: BatchCompleteHandler;
  }> = [];
  private activeCount = 0;

  constructor(private readonly concurrency = 2) {}

  enqueueBatch(input: {
    tenantId: string;
    jobs: BatchAuditJobInput[];
    processor: QueueItemProcessor;
    onBatchComplete?: BatchCompleteHandler;
  }): BatchAuditJob {
    const timestamp = nowIso();
    const batch: BatchAuditJob = {
      id: `batch_${randomUUID()}`,
      tenantId: input.tenantId,
      status: 'queued',
      totalCount: input.jobs.length,
      queuedCount: input.jobs.length,
      processingCount: 0,
      completedCount: 0,
      failedCount: 0,
      resultIds: [],
      errors: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.batches.set(batch.id, clone(batch));

    for (const job of input.jobs) {
      const item: BatchAuditItem = {
        id: `batch_item_${randomUUID()}`,
        batchId: batch.id,
        tenantId: input.tenantId,
        jobPostingId: job.jobPostingId,
        status: 'queued',
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      this.batchItems.set(item.id, clone(item));
      this.asyncJobs.set(`async_${item.id}`, {
        id: `async_${item.id}`,
        type: 'audit',
        tenantId: input.tenantId,
        status: 'queued',
        batchId: batch.id,
        batchItemId: item.id,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      this.pending.push({
        batchId: batch.id,
        itemId: item.id,
        input: job,
        processor: input.processor,
        ...(input.onBatchComplete === undefined ? {} : { onBatchComplete: input.onBatchComplete }),
      });
    }
    this.schedule();
    return clone(batch);
  }

  getBatch(id: string): BatchAuditJob | undefined {
    const batch = this.batches.get(id);
    return batch === undefined ? undefined : clone(batch);
  }

  listBatchItems(batchId: string): BatchAuditItem[] {
    return [...this.batchItems.values()]
      .filter((item) => item.batchId === batchId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(clone);
  }

  listAsyncJobs(): AsyncAuditJob[] {
    return [...this.asyncJobs.values()].map(clone);
  }

  private schedule(): void {
    setTimeout(() => this.drain(), 0);
  }

  private drain(): void {
    while (this.activeCount < this.concurrency && this.pending.length > 0) {
      const entry = this.pending.shift();
      if (entry === undefined) return;
      this.activeCount += 1;
      void this.process(entry).finally(() => {
        this.activeCount -= 1;
        this.schedule();
      });
    }
  }

  private async process(entry: {
    batchId: string;
    itemId: string;
    input: BatchAuditJobInput;
    processor: QueueItemProcessor;
    onBatchComplete?: BatchCompleteHandler;
  }): Promise<void> {
    this.markItemProcessing(entry.batchId, entry.itemId);
    try {
      const result = await entry.processor({
        ...entry.input,
        itemId: entry.itemId,
        batchId: entry.batchId,
      });
      this.markItemCompleted(entry.batchId, entry.itemId, result.auditRunId);
    } catch (error) {
      this.markItemFailed(
        entry.batchId,
        entry.itemId,
        error instanceof Error ? error.message : 'Batch audit item failed.',
      );
    }
    const batch = this.refreshBatch(entry.batchId);
    if (batch.status === 'completed' || batch.status === 'partial_failed' || batch.status === 'failed') {
      await entry.onBatchComplete?.(batch);
    }
  }

  private markItemProcessing(batchId: string, itemId: string): void {
    const timestamp = nowIso();
    const item = this.batchItems.get(itemId);
    if (item !== undefined) {
      this.batchItems.set(itemId, {
        ...item,
        status: 'processing',
        startedAt: timestamp,
        updatedAt: timestamp,
      });
    }
    this.patchAsyncJob(itemId, { status: 'processing', startedAt: timestamp });
    const batch = this.batches.get(batchId);
    if (batch !== undefined) {
      this.batches.set(batchId, { ...batch, status: 'processing', updatedAt: timestamp });
    }
  }

  private markItemCompleted(batchId: string, itemId: string, auditRunId: string): void {
    const timestamp = nowIso();
    const item = this.batchItems.get(itemId);
    if (item !== undefined) {
      this.batchItems.set(itemId, {
        ...item,
        status: 'completed',
        auditRunId,
        completedAt: timestamp,
        updatedAt: timestamp,
      });
    }
    this.patchAsyncJob(itemId, { status: 'completed', auditRunId, completedAt: timestamp });
    this.refreshBatch(batchId);
  }

  private markItemFailed(batchId: string, itemId: string, error: string): void {
    const timestamp = nowIso();
    const item = this.batchItems.get(itemId);
    if (item !== undefined) {
      this.batchItems.set(itemId, {
        ...item,
        status: 'failed',
        error,
        completedAt: timestamp,
        updatedAt: timestamp,
      });
    }
    this.patchAsyncJob(itemId, { status: 'failed', error, completedAt: timestamp });
    this.refreshBatch(batchId);
  }

  private refreshBatch(batchId: string): BatchAuditJob {
    const batch = this.batches.get(batchId);
    if (batch === undefined) throw new Error(`Batch ${batchId} not found.`);
    const items = this.listBatchItems(batchId);
    const completed = items.filter((item) => item.status === 'completed');
    const failed = items.filter((item) => item.status === 'failed');
    const processing = items.filter((item) => item.status === 'processing');
    const queued = items.filter((item) => item.status === 'queued');
    const isDone = completed.length + failed.length === batch.totalCount;
    const updated: BatchAuditJob = {
      ...batch,
      status: isDone
        ? failed.length === 0
          ? 'completed'
          : completed.length === 0
            ? 'failed'
            : 'partial_failed'
        : processing.length > 0
          ? 'processing'
          : 'queued',
      queuedCount: queued.length,
      processingCount: processing.length,
      completedCount: completed.length,
      failedCount: failed.length,
      resultIds: completed.flatMap((item) => (item.auditRunId === undefined ? [] : [item.auditRunId])),
      errors: failed.map((item) => ({
        itemId: item.id,
        jobPostingId: item.jobPostingId,
        error: item.error ?? 'Batch audit item failed.',
      })),
      updatedAt: nowIso(),
      ...(isDone ? { completedAt: nowIso() } : {}),
    };
    this.batches.set(batchId, clone(updated));
    return clone(updated);
  }

  private patchAsyncJob(itemId: string, patch: Partial<AsyncAuditJob>): void {
    const id = `async_${itemId}`;
    const job = this.asyncJobs.get(id);
    if (job === undefined) return;
    this.asyncJobs.set(id, {
      ...job,
      ...patch,
      updatedAt: nowIso(),
    });
  }
}

export interface PerformanceServices {
  queueService: JobQueueService;
  cacheService: CacheService;
  rateLimitService: RateLimitService;
  costTrackingService: CostTrackingService;
  fallbackPolicyService: FallbackPolicyService;
}

export function createPerformanceServices(): PerformanceServices {
  return {
    queueService: new JobQueueService(),
    cacheService: new CacheService(),
    rateLimitService: new RateLimitService(),
    costTrackingService: new CostTrackingService(),
    fallbackPolicyService: new FallbackPolicyService(),
  };
}
