import { randomUUID } from 'node:crypto';
import type { EncryptedSecret, SecretEncryptionService } from '@job-compliance/core';
import type { PostgresLLMPersistenceRepository } from '@job-compliance/database';
import { TenantLLMProviderResolver } from './provider-resolver.js';

export type LLMConnectionStatus = 'ACTIVE' | 'DISABLED' | 'INVALID' | 'RATE_LIMITED' | 'DEGRADED' | 'UNAVAILABLE' | 'UNVERIFIED';
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
export interface SettingsServicePort { list(tenantId:string): Promise<PublicConnection[]>; get(id:string,tenantId:string): Promise<LLMConnection|undefined>; create(input: Omit<LLMConnection, 'id'|'encryptedApiKey'|'apiKeyLastFour'|'createdAt'|'updatedAt'|'status'> & {apiKey:string}):Promise<PublicConnection>; update(id:string,tenantId:string,patch:Partial<Pick<LLMConnection,'displayName'|'baseUrl'|'auditModel'|'timeoutMs'|'maxOutputTokens'|'temperature'|'maxRetries'>> & {apiKey?:string}):Promise<PublicConnection|undefined>; delete(id:string,tenantId:string):Promise<boolean>; rotate(id:string,tenantId:string):Promise<PublicConnection|undefined>; setDefault(id:string,tenantId:string):Promise<PublicConnection|undefined>; disable(id:string,tenantId:string):Promise<PublicConnection|undefined>; verify(id:string,tenantId:string):Promise<PublicConnection|undefined>; policy(tenantId:string):Promise<RoutingPolicy>; updatePolicy(tenantId:string,patch:Partial<RoutingPolicy>,updatedBy?:string):Promise<RoutingPolicy>; versions?(tenantId:string):Promise<RoutingPolicy[]>; restore?(tenantId:string,version:string,updatedBy:string):Promise<RoutingPolicy>; }
const defaults = (tenantId: string): RoutingPolicy => ({ tenantId, version: 'routing-v1', enabled: true, skipLLMWhenRuleDecisionIsDeterministic: true, classifierEnabled: true, classifierLowConfidenceThreshold: .35, classifierHighConfidenceThreshold: .85, fastLLMEnabled: true, fastLLMMaxInputChars: 12000, fastLLMTimeoutMs: 8000, deepReviewEnabled: false, timeoutFallback: 'MANUAL_REVIEW', providerErrorFallback: 'MANUAL_REVIEW', invalidOutputFallback: 'RETRY_ONCE', updatedAt: new Date().toISOString() });
const mask = (last?: string) => last ? `sk-****${last}` : undefined;

/** In-memory adapter for local/test mode; the DB table is the production persistence boundary. */
export class LLMSettingsService implements SettingsServicePort {
  private readonly connections = new Map<string, LLMConnection>();
  private readonly policies = new Map<string, RoutingPolicy>();
  constructor(private readonly encryption: SecretEncryptionService | undefined = undefined) {}
  private encryptor(): SecretEncryptionService { if (!this.encryption) throw new Error('BYOK encryption is not configured.'); return this.encryption; }
  private public(record: LLMConnection): PublicConnection { const { encryptedApiKey: _secret, ...safe } = record; const masked = mask(record.apiKeyLastFour); return { ...structuredClone(safe), ...(masked === undefined ? {} : { apiKeyMasked: masked }) }; }
  async list(tenantId: string): Promise<PublicConnection[]> { return [...this.connections.values()].filter(x => x.tenantId === tenantId).map(x => this.public(x)); }
  async get(id: string, tenantId: string): Promise<LLMConnection | undefined> { const x = this.connections.get(id); return x?.tenantId === tenantId ? x : undefined; }
  async create(input: Omit<LLMConnection, 'id'|'encryptedApiKey'|'apiKeyLastFour'|'createdAt'|'updatedAt'|'status'> & { apiKey: string }): Promise<PublicConnection> {
    const now = new Date().toISOString(); const encryptedApiKey = await this.encryptor().encrypt(input.apiKey);
    if (input.isDefault) this.clearDefault(input.tenantId);
    const { apiKey, ...connection } = input;
    const record: LLMConnection = { ...connection, id: randomUUID(), encryptedApiKey, apiKeyLastFour: apiKey.slice(-4), status: 'UNVERIFIED', createdAt: now, updatedAt: now };
    this.connections.set(record.id, record); return this.public(record);
  }
  async update(id: string, tenantId: string, patch: Partial<Pick<LLMConnection, 'displayName'|'baseUrl'|'auditModel'|'timeoutMs'|'maxOutputTokens'|'temperature'|'maxRetries'>> & { apiKey?: string }): Promise<PublicConnection | undefined> {
    const current = await this.get(id, tenantId); if (!current) return undefined; let encryptedApiKey = current.encryptedApiKey; let apiKeyLastFour = current.apiKeyLastFour;
    if (patch.apiKey?.trim()) { encryptedApiKey = await this.encryptor().encrypt(patch.apiKey); apiKeyLastFour = patch.apiKey.slice(-4); }
    const next = { ...current, ...patch, encryptedApiKey, apiKeyLastFour, updatedAt: new Date().toISOString() }; delete (next as { apiKey?: string }).apiKey; this.connections.set(id, next); return this.public(next);
  }
  async delete(id: string, tenantId: string): Promise<boolean> { const record = await this.get(id, tenantId); return record ? this.connections.delete(id) : false; }
  async rotate(id: string, tenantId: string): Promise<PublicConnection | undefined> { const record = await this.get(id, tenantId); if (!record) return undefined; const next = { ...record, encryptedApiKey: await this.encryptor().rotate(record.encryptedApiKey), updatedAt: new Date().toISOString() }; this.connections.set(id, next); return this.public(next); }
  async setDefault(id: string, tenantId: string): Promise<PublicConnection | undefined> { const record = await this.get(id, tenantId); if (!record || record.status !== 'ACTIVE') return undefined; this.clearDefault(tenantId); const next = { ...record, isDefault: true, updatedAt: new Date().toISOString() }; this.connections.set(id, next); return this.public(next); }
  async disable(id: string, tenantId: string): Promise<PublicConnection | undefined> { const record = await this.get(id, tenantId); if (!record) return undefined; const next = { ...record, status: 'DISABLED' as const, isDefault: false, updatedAt: new Date().toISOString() }; this.connections.set(id, next); return this.public(next); }
  async verify(id: string, tenantId: string): Promise<PublicConnection | undefined> { const record = await this.get(id, tenantId); if (!record) return undefined; const next = { ...record, status: 'ACTIVE' as const, lastVerifiedAt: new Date().toISOString(), lastSuccessAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; this.connections.set(id, next); return this.public(next); }
  async policy(tenantId: string): Promise<RoutingPolicy> { const p = this.policies.get(tenantId) ?? defaults(tenantId); this.policies.set(tenantId, p); return structuredClone(p); }
  async updatePolicy(tenantId: string, patch: Partial<RoutingPolicy>): Promise<RoutingPolicy> { const current = await this.policy(tenantId); const next = { ...current, ...patch, version: `routing-${Date.now()}`, updatedAt: new Date().toISOString() }; if (next.classifierLowConfidenceThreshold >= next.classifierHighConfidenceThreshold) throw new Error('Classifier low threshold must be below high threshold.'); this.policies.set(tenantId, next); return structuredClone(next); }
  private clearDefault(tenantId: string): void { for (const [id, c] of this.connections) if (c.tenantId === tenantId && c.isDefault) this.connections.set(id, { ...c, isDefault: false }); }
}

/** Production settings adapter. The encrypted secret never crosses this service boundary. */
export class PostgresLLMSettingsService implements SettingsServicePort {
  constructor(private readonly repository: PostgresLLMPersistenceRepository, private readonly encryption: SecretEncryptionService) {}
  private public(c: LLMConnection): PublicConnection { const { encryptedApiKey: _secret, ...safe } = c; return { ...safe, ...(c.apiKeyLastFour ? { apiKeyMasked: mask(c.apiKeyLastFour) } : {}) }; }
  async list(tenantId:string):Promise<PublicConnection[]>{ return (await this.repository.listByTenant(tenantId)).map(c=>this.public(c as LLMConnection)); }
  async get(id:string,tenantId:string):Promise<LLMConnection|undefined>{ return (await this.repository.findById(tenantId,id) as LLMConnection|null) ?? undefined; }
  async create(input: Parameters<SettingsServicePort['create']>[0]):Promise<PublicConnection>{ const {apiKey,...value}=input; const encryptedApiKey=await this.encryption.encrypt(apiKey); return this.public(await this.repository.createConnection({...value,...(value.baseUrl === undefined ? {} : {baseUrl:value.baseUrl}),encryptedApiKey,apiKeyLastFour:apiKey.slice(-4),status:'UNVERIFIED'} as never) as unknown as LLMConnection); }
  async update(id:string,tenantId:string,patch:Parameters<SettingsServicePort['update']>[2]):Promise<PublicConnection|undefined>{ const {apiKey,...plain}=patch; if(apiKey?.trim() && !(await this.repository.updateSecret(tenantId,id,await this.encryption.encrypt(apiKey),apiKey.slice(-4))))return undefined; const changed=Object.keys(plain).length ? await this.repository.updateConnection(tenantId,id,plain as never) : await this.repository.findById(tenantId,id); return changed?this.public(changed as unknown as LLMConnection):undefined; }
  async delete(id:string,tenantId:string):Promise<boolean>{return this.repository.deleteConnection(tenantId,id);}
  async rotate(id:string,tenantId:string):Promise<PublicConnection|undefined>{const c=await this.get(id,tenantId);if(!c)return undefined;await this.repository.updateSecret(tenantId,id,await this.encryption.rotate(c.encryptedApiKey),c.apiKeyLastFour);return (await this.list(tenantId)).find(x=>x.id===id);}
  async setDefault(id:string,tenantId:string):Promise<PublicConnection|undefined>{const x=await this.repository.setDefault(tenantId,id);return x?this.public(x as LLMConnection):undefined;}
  async disable(id:string,tenantId:string):Promise<PublicConnection|undefined>{const x=await this.repository.setStatus(tenantId,id,'DISABLED');return x?this.public(x as LLMConnection):undefined;}
  async verify(id:string,tenantId:string):Promise<PublicConnection|undefined>{const connection=await this.get(id,tenantId);if(!connection)return undefined;const started=Date.now();try{const resolved=await new TenantLLMProviderResolver(this.repository,this.encryption).resolveConnection(tenantId,id);const response=await resolved.provider.complete([{role:'user',content:'Return only JSON: {"ok":true}.'}],{maxTokens:8,timeoutMs:connection.timeoutMs,responseFormat:'json_object'});const payload=JSON.parse(response.content) as {ok?:boolean};if(payload.ok!==true)throw new Error('INVALID_RESPONSE');await this.repository.createUsage({tenantId,connectionId:id,provider:resolved.providerName,model:resolved.model,taskType:'CONNECTION_VERIFY',promptVersion:'verify-v1',...(response.usage?.promptTokens===undefined?{}:{inputTokens:response.usage.promptTokens}),...(response.usage?.completionTokens===undefined?{}:{outputTokens:response.usage.completionTokens}),durationMs:Date.now()-started,success:true,isMock:false});const x=await this.repository.recordVerification(tenantId,id,{status:'ACTIVE',success:true});return x?this.public(x as LLMConnection):undefined;}catch(error){const message=error instanceof Error?error.message:'';const code=message.includes('AUTH')?'AUTH_FAILED':message.includes('RATE')?'RATE_LIMITED':message.includes('TIMEOUT')?'TIMEOUT':'PROVIDER_UNAVAILABLE';const status=code==='AUTH_FAILED'?'INVALID':code==='RATE_LIMITED'?'RATE_LIMITED':'UNAVAILABLE';await this.repository.createUsage({tenantId,connectionId:id,provider:connection.provider,model:connection.auditModel,taskType:'CONNECTION_VERIFY',promptVersion:'verify-v1',durationMs:Date.now()-started,success:false,errorCode:code,isMock:false});const x=await this.repository.recordVerification(tenantId,id,{status,success:false,errorCode:code});return x?this.public(x as LLMConnection):undefined;}}
  async policy(tenantId:string):Promise<RoutingPolicy>{return await this.repository.getCurrentPolicy(tenantId) as unknown as RoutingPolicy;}
  async updatePolicy(tenantId:string,patch:Partial<RoutingPolicy>,updatedBy='system'):Promise<RoutingPolicy>{return await this.repository.updatePolicy(tenantId,patch,updatedBy) as unknown as RoutingPolicy;}
  async versions(tenantId:string):Promise<RoutingPolicy[]>{return await this.repository.listPolicyVersions(tenantId) as unknown as RoutingPolicy[];}
  async restore(tenantId:string,version:string,updatedBy:string):Promise<RoutingPolicy>{return await this.repository.restorePolicy(tenantId,version,updatedBy) as unknown as RoutingPolicy;}
}
