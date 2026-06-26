import { z } from 'zod';
import type {
  LLMCompletionOptions,
  LLMCompletionResult,
  LLMMessage,
  LLMProvider,
} from './types.js';
import { LLMProviderError } from './types.js';
import { resolveCompletionOptions, runWithTimeout } from './safe-completion.js';
import { sanitizeLLMMessages } from '../security/index.js';

const openAICompatibleResponseSchema = z.object({
  id: z.string().optional(),
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullable().optional(),
        }),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
      total_tokens: z.number().optional(),
    })
    .optional(),
});

/** Configuration for OpenAI-compatible chat completion providers. */
export interface OpenAICompatibleProviderConfig {
  /** Base URL ending at the API root, for example https://api.openai.com/v1. */
  baseURL?: string;
  /** API key. The provider refuses real calls when absent. */
  apiKey?: string;
  /** Default model name. */
  model?: string;
  /** Optional fetch implementation for tests. */
  fetch?: typeof fetch;
}

/** OpenAI-compatible provider placeholder for future real model integration. */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly name = 'openai-compatible';
  readonly model: string;
  private readonly baseURL: string;
  private readonly apiKey: string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(config: OpenAICompatibleProviderConfig = {}) {
    this.baseURL = config.baseURL ?? 'https://api.openai.com/v1';
    this.apiKey = config.apiKey;
    this.model = config.model ?? 'gpt-4.1-mini';
    this.fetchImpl = config.fetch ?? fetch;
  }

  /** Builds a provider from environment variables without requiring them at import time. */
  static fromEnv(env: NodeJS.ProcessEnv = process.env): OpenAICompatibleProvider {
    const config: OpenAICompatibleProviderConfig = {};
    const baseURL = env.OPENAI_COMPATIBLE_BASE_URL ?? env.OPENAI_BASE_URL;
    const apiKey = env.OPENAI_COMPATIBLE_API_KEY ?? env.OPENAI_API_KEY;
    const model = env.OPENAI_COMPATIBLE_MODEL ?? env.OPENAI_MODEL;
    if (baseURL !== undefined) config.baseURL = baseURL;
    if (apiKey !== undefined) config.apiKey = apiKey;
    if (model !== undefined) config.model = model;
    return new OpenAICompatibleProvider(config);
  }

  /** Executes an OpenAI-compatible chat completion with timeout and response validation. */
  async complete(
    messages: readonly LLMMessage[],
    options: LLMCompletionOptions = {},
  ): Promise<LLMCompletionResult> {
    if (this.apiKey === undefined || this.apiKey.trim() === '') {
      throw new LLMProviderError(
        'LLM_CONFIGURATION_MISSING',
        'OpenAI-compatible provider requires an API key.',
      );
    }

    const resolved = resolveCompletionOptions(options);
    const model = resolved.model ?? this.model;
    const endpoint = `${this.baseURL.replace(/\/+$/u, '')}/chat/completions`;
    const safeMessages = sanitizeLLMMessages(messages, resolved.allowSensitiveData);

    return runWithTimeout(
      resolved.timeoutMs ?? 1,
      async (signal) => {
        const response = await this.fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: safeMessages,
            ...(resolved.temperature === undefined ? {} : { temperature: resolved.temperature }),
            ...(resolved.maxTokens === undefined ? {} : { max_tokens: resolved.maxTokens }),
            ...(resolved.responseFormat === 'json_object'
              ? { response_format: { type: 'json_object' } }
              : {}),
          }),
          signal,
        });

        if (!response.ok) {
          throw new LLMProviderError(
            'LLM_HTTP_ERROR',
            `OpenAI-compatible provider returned HTTP ${response.status}.`,
            response.status >= 500,
          );
        }

        const payload = openAICompatibleResponseSchema.parse(await response.json());
        const content = payload.choices[0]?.message.content;
        if (!content) {
          throw new LLMProviderError('LLM_EMPTY_RESPONSE', 'Provider returned empty content.');
        }

        return {
          provider: this.name,
          model: payload.model ?? model,
          content,
          ...(payload.id === undefined ? {} : { providerRequestId: payload.id }),
          ...(payload.usage === undefined
            ? {}
            : {
                usage: {
                  ...(payload.usage.prompt_tokens === undefined
                    ? {}
                    : { promptTokens: payload.usage.prompt_tokens }),
                  ...(payload.usage.completion_tokens === undefined
                    ? {}
                    : { completionTokens: payload.usage.completion_tokens }),
                  ...(payload.usage.total_tokens === undefined
                    ? {}
                    : { totalTokens: payload.usage.total_tokens }),
                },
              }),
          fallbackUsed: false,
        };
      },
      resolved.signal,
    );
  }
}
