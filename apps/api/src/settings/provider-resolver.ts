import { OpenAICompatibleProvider, type LLMProvider } from '@job-compliance/core';
import type { PostgresLLMPersistenceRepository } from '@job-compliance/database';
import type { SecretEncryptionService } from '@job-compliance/core';

export type LLMTaskType = 'FAST_AUDIT'|'DEEP_REVIEW'|'EXPLANATION'|'REWRITE'|'CONNECTION_VERIFY'|'SMOKE_TEST';
export interface ResolvedLLMProvider { provider:LLMProvider; connectionId:string; providerName:string; model:string; }
/** Resolves only an enabled tenant default; production has no implicit Mock fallback. */
export class TenantLLMProviderResolver {
  constructor(private readonly repository:PostgresLLMPersistenceRepository,private readonly encryption:SecretEncryptionService){}
  async resolveDefault(tenantId:string,_taskType:LLMTaskType):Promise<ResolvedLLMProvider>{const c=await this.repository.findDefault(tenantId);if(!c)throw new Error('LLM_CONNECTION_UNAVAILABLE');const apiKey=await this.encryption.decrypt(c.encryptedApiKey);return {connectionId:c.id,providerName:c.provider,model:c.auditModel,provider:new OpenAICompatibleProvider({...(c.baseUrl===undefined?{}:{baseURL:c.baseUrl}),apiKey,model:c.auditModel,maxRetries:c.maxRetries})};}
  async resolveConnection(tenantId:string,connectionId:string):Promise<ResolvedLLMProvider>{const c=await this.repository.findById(tenantId,connectionId);if(!c || c.status==='DISABLED')throw new Error('LLM_CONNECTION_UNAVAILABLE');const apiKey=await this.encryption.decrypt(c.encryptedApiKey);return {connectionId:c.id,providerName:c.provider,model:c.auditModel,provider:new OpenAICompatibleProvider({...(c.baseUrl===undefined?{}:{baseURL:c.baseUrl}),apiKey,model:c.auditModel,maxRetries:c.maxRetries})};}
}
