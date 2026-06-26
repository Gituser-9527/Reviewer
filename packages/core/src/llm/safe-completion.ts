import type {
  LLMCompletionOptions,
  LLMCompletionResult,
  LLMJsonCompletionInput,
  LLMMessage,
  LLMProvider,
  LLMValidatedCompletion,
} from './types.js';
import { LLMProviderError } from './types.js';

/** Default timeout applied to every LLM call unless the caller supplies a stricter value. */
export const defaultLLMTimeoutMs = 10_000;

/** Resolves completion options with a non-zero timeout. */
export function resolveCompletionOptions(options: LLMCompletionOptions = {}): LLMCompletionOptions {
  return {
    ...options,
    timeoutMs: Math.max(1, options.timeoutMs ?? defaultLLMTimeoutMs),
  };
}

/** Runs a promise-returning operation with AbortController-based timeout semantics. */
export async function runWithTimeout<T>(
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
  upstreamSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const abortFromUpstream = (): void => controller.abort();
  upstreamSignal?.addEventListener('abort', abortFromUpstream, { once: true });

  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new LLMProviderError('LLM_TIMEOUT', 'LLM call timed out.', true));
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new LLMProviderError('LLM_TIMEOUT', 'LLM call timed out.', true);
    }
    throw error;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    upstreamSignal?.removeEventListener('abort', abortFromUpstream);
  }
}

function fallbackResult(
  provider: LLMProvider,
  fallbackContent: string,
  error: unknown,
): LLMCompletionResult {
  return {
    provider: provider.name,
    model: provider.model,
    content: fallbackContent,
    fallbackUsed: true,
    errorCode: error instanceof LLMProviderError ? error.code : 'LLM_CALL_FAILED',
  };
}

/** Calls a provider and converts all failures into an explicit fallback result. */
export async function completeWithFallback(
  provider: LLMProvider,
  messages: readonly LLMMessage[],
  options: LLMCompletionOptions,
  fallbackContent: string,
): Promise<LLMCompletionResult> {
  try {
    return await provider.complete(messages, resolveCompletionOptions(options));
  } catch (error) {
    return fallbackResult(provider, fallbackContent, error);
  }
}

/** Calls a provider, parses JSON, validates it with zod, and falls back on any failure. */
export async function completeJsonWithFallback<T>(
  provider: LLMProvider,
  input: LLMJsonCompletionInput<T>,
): Promise<LLMValidatedCompletion<T>> {
  const completion = await completeWithFallback(
    provider,
    input.messages,
    {
      ...input.options,
      responseFormat: 'json_object',
    },
    JSON.stringify(input.fallback),
  );

  try {
    const parsed: unknown = JSON.parse(completion.content);
    const data = input.schema.parse(parsed);
    return {
      ...completion,
      data,
    };
  } catch {
    return {
      provider: completion.provider,
      model: completion.model,
      content: JSON.stringify(input.fallback),
      data: input.fallback,
      fallbackUsed: true,
      errorCode: 'LLM_OUTPUT_VALIDATION_FAILED',
    };
  }
}
