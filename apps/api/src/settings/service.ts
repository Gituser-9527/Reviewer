import { randomUUID } from 'node:crypto';
import type { EncryptedSecret, SecretEncryptionService } from '@job-compliance/core';

export type LLMConnectionStatus = 'ACTIVE' | 'DISABLED' | 'INVALID' | 'RATE_LIMITED' | 'UNVERIFIED';
export interface LLMConnection {
  id: string; tenantId: string; displayName: string; provider: 'OPENAI' | 'OPENAI_COMPATIBLE' | 'LOCAL_OPENAI_COMPATIBLE';
  baseUrl?: string | undefined; encryptedApiKey: EncryptedSecret; apiKeyLastFour?: string | undefined; auditModel: string;
  timeoutMs: number; maxOutputTokens: number; temperature: number; maxRetries: number; status: LLMConnectionStatus;
  isDefault: boolean; lastVerifiedAt?: string | undefined; lastSuccessAt?: string | undefined; lastFailureAt?: string | undefined; lastErrorCode?: string | undefined;
  createdBy: string; createdAt: string; updatedAt: string;
}
export interface RoutingPolicy {
  tenantId: string; version: string; enabled: boolean; skipLLMWhenRuleDecisionIsDeterministic: boolean;
  classifierEnabled: boolean; classifierLowConfidenceThreshold: number; classifierHighConfidenceThreshold: number;
  fastLLMEnabled: boolean; fastLLMMaxInputChars: number; fastLLMTimeoutMs: number; deepReviewEnabled: boolean;
  timeoutFallback: 'RULE_ONLY' | 'MANUAL_REVIEW'; providerErrorFallback: 'RULE_ONLY' | 'MANUAL_REVIEW'; invalidOutputFallback: 'RETRY_ONCE' | 'MANUAL_REVIEW'; updatedAt: string;
}
export type PublicConnection = Omit<LLMConnection, 'encryptedApiKey'> & { apiKeyMasked?: string | undefined };
const defaults = (tenantId: string): RoutingPolicy => ({ tenantId, version: 'routing-v1', enabled: true, skipLLMWhenRuleDecisionIsDeterministic: true, classifierEnabled: true, classifierLowConfidenceThreshold: .35, classifierHighConfidenceThreshold: .85, fastLLMEnabled: true, fastLLMMaxInputChars: 12000, fastLLMTimeoutMs: 8000, deepReviewEnabled: false, timeoutFallback: 'MANUAL_REVIEW', providerErrorFallback: 'MANUAL_REVIEW', invalidOutputFallback: 'RETRY_ONCE', updatedAt: new Date().toISOString() });
const mask = (last?: string) => last ? `sk-****${last}` : undefined;

/** In-memory adapter for local/test mode; the DB table is the production persistence boundary. */
export class LLMSettingsService {
  private readonly connections = new Map<string, LLMConnection>();
  private readonly policies = new Map<string, RoutingPolicy>();
  constructor(private readonly encryption: SecretEncryptionService | undefined = undefined) {}
  private encryptor(): SecretEncryptionService { if (!this.encryption) throw new Error('BYOK encryption is not configured.'); return this.encryption; }
  private public(record: LLMConnection): PublicConnection { const { encryptedApiKey: _secret, ...safe } = record; const masked = mask(record.apiKeyLastFour); return { ...structuredClone(safe), ...(masked === undefined ? {} : { apiKeyMasked: masked }) }; }
  list(tenantId: string): PublicConnection[] { return [...this.connections.values()].filter(x => x.tenantId === tenantId).map(x => this.public(x)); }
  get(id: string, tenantId: string): LLMConnection | undefined { const x = this.connections.get(id); return x?.tenantId === tenantId ? x : undefined; }
  async create(input: Omit<LLMConnection, 'id'|'encryptedApiKey'|'apiKeyLastFour'|'createdAt'|'updatedAt'|'status'> & { apiKey: string }): Promise<PublicConnection> {
    const now = new Date().toISOString(); const encryptedApiKey = await this.encryptor().encrypt(input.apiKey);
    if (input.isDefault) this.clearDefault(input.tenantId);
    const { apiKey, ...connection } = input;
    const record: LLMConnection = { ...connection, id: randomUUID(), encryptedApiKey, apiKeyLastFour: apiKey.slice(-4), status: 'UNVERIFIED', createdAt: now, updatedAt: now };
    this.connections.set(record.id, record); return this.public(record);
  }
  async update(id: string, tenantId: string, patch: Partial<Pick<LLMConnection, 'displayName'|'baseUrl'|'auditModel'|'timeoutMs'|'maxOutputTokens'|'temperature'|'maxRetries'>> & { apiKey?: string }): Promise<PublicConnection | undefined> {
    const current = this.get(id, tenantId); if (!current) return undefined; let encryptedApiKey = current.encryptedApiKey; let apiKeyLastFour = current.apiKeyLastFour;
    if (patch.apiKey?.trim()) { encryptedApiKey = await this.encryptor().encrypt(patch.apiKey); apiKeyLastFour = patch.apiKey.slice(-4); }
    const next = { ...current, ...patch, encryptedApiKey, apiKeyLastFour, updatedAt: new Date().toISOString() }; delete (next as { apiKey?: string }).apiKey; this.connections.set(id, next); return this.public(next);
  }
  delete(id: string, tenantId: string): boolean { const record = this.get(id, tenantId); return record ? this.connections.delete(id) : false; }
  async rotate(id: string, tenantId: string): Promise<PublicConnection | undefined> { const record = this.get(id, tenantId); if (!record) return undefined; const next = { ...record, encryptedApiKey: await this.encryptor().rotate(record.encryptedApiKey), updatedAt: new Date().toISOString() }; this.connections.set(id, next); return this.public(next); }
  setDefault(id: string, tenantId: string): PublicConnection | undefined { const record = this.get(id, tenantId); if (!record || record.status !== 'ACTIVE') return undefined; this.clearDefault(tenantId); const next = { ...record, isDefault: true, updatedAt: new Date().toISOString() }; this.connections.set(id, next); return this.public(next); }
  disable(id: string, tenantId: string): PublicConnection | undefined { const record = this.get(id, tenantId); if (!record) return undefined; const next = { ...record, status: 'DISABLED' as const, isDefault: false, updatedAt: new Date().toISOString() }; this.connections.set(id, next); return this.public(next); }
  verify(id: string, tenantId: string): PublicConnection | undefined { const record = this.get(id, tenantId); if (!record) return undefined; const next = { ...record, status: 'ACTIVE' as const, lastVerifiedAt: new Date().toISOString(), lastSuccessAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; this.connections.set(id, next); return this.public(next); }
  policy(tenantId: string): RoutingPolicy { const p = this.policies.get(tenantId) ?? defaults(tenantId); this.policies.set(tenantId, p); return structuredClone(p); }
  updatePolicy(tenantId: string, patch: Partial<RoutingPolicy>): RoutingPolicy { const current = this.policy(tenantId); const next = { ...current, ...patch, version: `routing-${Date.now()}`, updatedAt: new Date().toISOString() }; if (next.classifierLowConfidenceThreshold >= next.classifierHighConfidenceThreshold) throw new Error('Classifier low threshold must be below high threshold.'); this.policies.set(tenantId, next); return structuredClone(next); }
  private clearDefault(tenantId: string): void { for (const [id, c] of this.connections) if (c.tenantId === tenantId && c.isDefault) this.connections.set(id, { ...c, isDefault: false }); }
}
