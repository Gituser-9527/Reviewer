import { MockLLMProvider, type MockLLMHandler } from './mock-provider.js';
import { OpenAICompatibleProvider, type OpenAICompatibleProviderConfig } from './openai-compatible-provider.js';
import type { LLMProvider } from './types.js';

/** Supported provider kinds. */
export type LLMProviderKind = 'mock' | 'openai-compatible';

/** Factory configuration for provider creation. */
export interface LLMProviderFactoryConfig {
  /** Provider kind. Defaults to env LLM_PROVIDER or mock. */
  provider?: LLMProviderKind;
  /** Mock response or handler. */
  mockResponse?: string | MockLLMHandler;
  /** OpenAI-compatible provider configuration override. */
  openAICompatible?: OpenAICompatibleProviderConfig;
  /** Environment object used for tests. */
  env?: NodeJS.ProcessEnv;
}

/** Creates provider instances without binding the domain layer to a concrete SDK. */
export class LLMProviderFactory {
  /** Creates an LLM provider from config or environment. */
  static create(config: LLMProviderFactoryConfig = {}): LLMProvider {
    const env = config.env ?? process.env;
    const provider = config.provider ?? (env.LLM_PROVIDER as LLMProviderKind | undefined) ?? 'mock';

    if (provider === 'openai-compatible') {
      const baseURL =
        config.openAICompatible?.baseURL ?? env.OPENAI_COMPATIBLE_BASE_URL ?? env.OPENAI_BASE_URL;
      const apiKey =
        config.openAICompatible?.apiKey ?? env.OPENAI_COMPATIBLE_API_KEY ?? env.OPENAI_API_KEY;
      const model =
        config.openAICompatible?.model ?? env.OPENAI_COMPATIBLE_MODEL ?? env.OPENAI_MODEL;
      return new OpenAICompatibleProvider({
        ...(baseURL === undefined ? {} : { baseURL }),
        ...(apiKey === undefined ? {} : { apiKey }),
        ...(model === undefined ? {} : { model }),
        ...(config.openAICompatible?.fetch === undefined
          ? {}
          : { fetch: config.openAICompatible.fetch }),
      });
    }

    return new MockLLMProvider(config.mockResponse ?? '{}');
  }
}
