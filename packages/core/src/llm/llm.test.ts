import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { LLMProviderFactory } from './factory.js';
import { MockLLMProvider } from './mock-provider.js';
import { OpenAICompatibleProvider } from './openai-compatible-provider.js';
import { llmRewriteSchema } from './output-schemas.js';
import { defaultPromptRegistry, PromptTemplateRegistry } from './prompt-templates.js';
import { completeJsonWithFallback, completeWithFallback } from './safe-completion.js';

const messages = [
  {
    role: 'user' as const,
    content: '请只输出 JSON',
  },
];

describe('MockLLMProvider', () => {
  it('returns deterministic responses without external calls', async () => {
    const provider = new MockLLMProvider('{"ok":true}');

    await expect(provider.complete(messages, { timeoutMs: 100 })).resolves.toMatchObject({
      provider: 'mock',
      model: 'mock-llm',
      content: '{"ok":true}',
      fallbackUsed: false,
    });
  });

  it('falls back when a provider call times out', async () => {
    const provider = new MockLLMProvider(
      () =>
        new Promise<string>((resolve) => {
          setTimeout(() => resolve('too late'), 50);
        }),
    );

    const result = await completeWithFallback(
      provider,
      messages,
      { timeoutMs: 1 },
      '{"fallback":true}',
    );

    expect(result).toMatchObject({
      provider: 'mock',
      content: '{"fallback":true}',
      fallbackUsed: true,
      errorCode: 'LLM_TIMEOUT',
    });
  });

  it('validates JSON output with zod and falls back on schema mismatch', async () => {
    const provider = new MockLLMProvider('{"rewrittenPosting":123}');

    const result = await completeJsonWithFallback(provider, {
      messages,
      schema: llmRewriteSchema,
      fallback: {
        rewrittenPosting: '规则引擎结果保持不变。',
      },
      options: { timeoutMs: 100 },
    });

    expect(result.data).toEqual({
      rewrittenPosting: '规则引擎结果保持不变。',
    });
    expect(result.fallbackUsed).toBe(true);
    expect(result.errorCode).toBe('LLM_OUTPUT_VALIDATION_FAILED');
  });

  it('validates successful JSON output', async () => {
    const provider = new MockLLMProvider('{"value":"ok"}');
    const schema = z.object({ value: z.literal('ok') });

    const result = await completeJsonWithFallback(provider, {
      messages,
      schema,
      fallback: { value: 'ok' as const },
      options: { timeoutMs: 100 },
    });

    expect(result.data).toEqual({ value: 'ok' });
    expect(result.fallbackUsed).toBe(false);
  });
});

describe('OpenAICompatibleProvider', () => {
  it('uses fallback when API key is absent', async () => {
    const provider = new OpenAICompatibleProvider({
      baseURL: 'https://example.test/v1',
      model: 'test-model',
    });

    const result = await completeWithFallback(provider, messages, { timeoutMs: 100 }, '{}');

    expect(result).toMatchObject({
      provider: 'openai-compatible',
      model: 'test-model',
      content: '{}',
      fallbackUsed: true,
      errorCode: 'LLM_CONFIGURATION_MISSING',
    });
  });

  it('parses OpenAI-compatible chat completion responses', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          id: 'request_001',
          model: 'test-model',
          choices: [{ message: { content: '{"ok":true}' } }],
          usage: {
            prompt_tokens: 2,
            completion_tokens: 3,
            total_tokens: 5,
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    const provider = new OpenAICompatibleProvider({
      apiKey: 'test-key',
      baseURL: 'https://example.test/v1',
      model: 'test-model',
      fetch: fetchImpl,
    });

    await expect(provider.complete(messages, { timeoutMs: 100 })).resolves.toMatchObject({
      provider: 'openai-compatible',
      model: 'test-model',
      providerRequestId: 'request_001',
      content: '{"ok":true}',
      usage: {
        promptTokens: 2,
        completionTokens: 3,
        totalTokens: 5,
      },
      fallbackUsed: false,
    });
  });

  it('redacts messages before sending them to OpenAI-compatible providers by default', async () => {
    let requestBody = '';
    const fetchImpl: typeof fetch = async (_input, init) => {
      requestBody = String(init?.body ?? '');
      return new Response(
        JSON.stringify({
          id: 'request_002',
          model: 'test-model',
          choices: [{ message: { content: '{"ok":true}' } }],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    };
    const provider = new OpenAICompatibleProvider({
      apiKey: 'test-key',
      baseURL: 'https://example.test/v1',
      model: 'test-model',
      fetch: fetchImpl,
    });

    await provider.complete(
      [
        {
          role: 'user',
          content: '候选人手机号13812345678，身份证110101199001011234',
        },
      ],
      { timeoutMs: 100 },
    );

    expect(requestBody).toContain('138****5678');
    expect(requestBody).toContain('110101********1234');
    expect(requestBody).not.toContain('13812345678');
    expect(requestBody).not.toContain('110101199001011234');
  });
});

describe('LLMProviderFactory', () => {
  it('defaults to mock provider so tests do not need API keys', () => {
    const provider = LLMProviderFactory.create({ env: {} });

    expect(provider).toBeInstanceOf(MockLLMProvider);
  });

  it('creates OpenAI-compatible providers from explicit config', () => {
    const provider = LLMProviderFactory.create({
      provider: 'openai-compatible',
      openAICompatible: {
        apiKey: 'test-key',
        baseURL: 'https://example.test/v1',
        model: 'test-model',
      },
    });

    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
    expect(provider.model).toBe('test-model');
  });
});

describe('PromptTemplateRegistry', () => {
  it('renders default prompt templates with variables', () => {
    const messages = defaultPromptRegistry.render('risk-explanation', {
      findingsJson: '[{"id":"finding_001"}]',
      evidenceJson: '[{"id":"evidence_001"}]',
    });

    expect(messages).toHaveLength(2);
    expect(messages[0]?.content).toContain('ruleId');
    expect(messages[1]?.content).toContain('finding_001');
  });

  it('throws for missing templates', () => {
    const registry = new PromptTemplateRegistry([]);

    expect(() => registry.get('compliance-rewrite')).toThrow('Prompt template not found');
  });
});
