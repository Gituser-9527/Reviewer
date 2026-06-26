import type {
  LLMCompletionOptions,
  LLMCompletionResult,
  LLMMessage,
  LLMProvider,
} from './types.js';
import { resolveCompletionOptions, runWithTimeout } from './safe-completion.js';
import { sanitizeLLMMessages } from '../security/index.js';

/** Function used by MockLLMProvider to produce deterministic test output. */
export type MockLLMHandler = (
  messages: readonly LLMMessage[],
  options: LLMCompletionOptions,
) => string | LLMCompletionResult | Promise<string | LLMCompletionResult>;

/** Mock provider that never calls external services and is safe for default tests. */
export class MockLLMProvider implements LLMProvider {
  readonly name = 'mock';
  readonly model: string;
  private readonly handler: MockLLMHandler;

  constructor(response: string | MockLLMHandler = '{}', model = 'mock-llm') {
    this.model = model;
    this.handler = typeof response === 'function' ? response : () => response;
  }

  /** Returns deterministic, timeout-bound mock output. */
  async complete(
    messages: readonly LLMMessage[],
    options: LLMCompletionOptions = {},
  ): Promise<LLMCompletionResult> {
    const resolved = resolveCompletionOptions(options);
    const safeMessages = sanitizeLLMMessages(messages, resolved.allowSensitiveData);
    return runWithTimeout(
      resolved.timeoutMs ?? 1,
      async () => {
        const result = await this.handler(safeMessages, resolved);
        if (typeof result === 'string') {
          return {
            provider: this.name,
            model: resolved.model ?? this.model,
            content: result,
            fallbackUsed: false,
          };
        }
        return {
          ...result,
          provider: result.provider || this.name,
          model: result.model || resolved.model || this.model,
          fallbackUsed: result.fallbackUsed,
        };
      },
      resolved.signal,
    );
  }
}
