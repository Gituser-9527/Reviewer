import { hashSensitiveValue, redactSensitiveInfo } from '@job-compliance/core';

/** Redacts sensitive identifiers before any audit payload is persisted. */
export function redactSensitiveText(text: string): string {
  return redactSensitiveInfo(text);
}

/** Creates a deterministic SHA-256 hash for deduplication and trace correlation. */
export function createInputHash(value: unknown): string {
  return hashSensitiveValue(value);
}

/** Recursively redacts string values in a JSON-compatible object. */
export function redactJson<T>(value: T): T {
  if (typeof value === 'string') return redactSensitiveText(value) as T;
  if (Array.isArray(value)) return value.map((item) => redactJson(item)) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
        key,
        redactJson(entryValue),
      ]),
    ) as T;
  }
  return value;
}
