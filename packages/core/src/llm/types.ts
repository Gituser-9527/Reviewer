import type { z } from 'zod';

/** Chat message role supported by OpenAI-compatible providers. */
export type LLMMessageRole = 'system' | 'user' | 'assistant';

/** Provider-agnostic chat message. */
export interface LLMMessage {
  /** Message role. */
  role: LLMMessageRole;
  /** Plain text message content. */
  content: string;
}

/** Runtime options applied to one LLM completion call. */
export interface LLMCompletionOptions {
  /** Model override. Defaults to provider configuration. */
  model?: string;
  /** Sampling temperature. Use low values for compliance helper tasks. */
  temperature?: number;
  /** Maximum generated tokens. */
  maxTokens?: number;
  /** Required timeout in milliseconds. Providers apply a safe default when omitted. */
  timeoutMs?: number;
  /** Desired response format. JSON output must still be schema-validated by the caller. */
  responseFormat?: 'text' | 'json_object';
  /** Optional upstream abort signal. */
  signal?: AbortSignal;
  /** Explicitly allow sensitive data in provider messages. Defaults to false. */
  allowSensitiveData?: boolean;
}

/** Token usage returned by providers when available. */
export interface LLMTokenUsage {
  /** Prompt/input tokens. */
  promptTokens?: number;
  /** Completion/output tokens. */
  completionTokens?: number;
  /** Total tokens. */
  totalTokens?: number;
}

/** Raw completion result before task-level schema parsing. */
export interface LLMCompletionResult {
  /** Provider identifier. */
  provider: string;
  /** Model used by the provider. */
  model: string;
  /** Generated content. */
  content: string;
  /** Provider request identifier, when returned. */
  providerRequestId?: string;
  /** Token usage, when returned. */
  usage?: LLMTokenUsage;
  /** Whether the result came from a fallback path. */
  fallbackUsed: boolean;
  /** Stable error code when fallback was used. */
  errorCode?: string;
}

/** Schema-validated JSON completion result. */
export interface LLMValidatedCompletion<T> extends Omit<LLMCompletionResult, 'content'> {
  /** Parsed and schema-validated JSON data. */
  data: T;
  /** Original model content, retained for debugging only after caller-side redaction. */
  content: string;
}

/** Provider-independent LLM interface. */
export interface LLMProvider {
  /** Stable provider name. */
  readonly name: string;
  /** Configured default model. */
  readonly model: string;
  /** Executes one raw chat completion. */
  complete(
    messages: readonly LLMMessage[],
    options?: LLMCompletionOptions,
  ): Promise<LLMCompletionResult>;
}

/** Input for schema-validated JSON completion with deterministic fallback. */
export interface LLMJsonCompletionInput<T> {
  /** Chat messages to send. */
  messages: readonly LLMMessage[];
  /** Zod schema that validates the parsed JSON output. */
  schema: z.ZodType<T>;
  /** Fallback returned on timeout, provider failure, invalid JSON, or schema mismatch. */
  fallback: T;
  /** Completion options. */
  options?: LLMCompletionOptions;
}

/** Error type used by provider implementations. */
export class LLMProviderError extends Error {
  /** Stable machine-readable error code. */
  readonly code: string;
  /** Whether retrying the same request may succeed. */
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.name = 'LLMProviderError';
    this.code = code;
    this.retryable = retryable;
  }
}
