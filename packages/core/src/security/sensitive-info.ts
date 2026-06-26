import { createHash } from 'node:crypto';
import type { LLMMessage } from '../llm/types.js';
import type { SanitizeAuditLogOptions, SensitiveInfoMatch, SensitiveInfoType } from './types.js';

interface DetectionPattern {
  type: SensitiveInfoType;
  pattern: RegExp;
  redact: (value: string) => string;
  captureGroup?: number;
}

const phonePattern = /(?<!\d)1[3-9]\d{9}(?!\d)/gu;
const idCardPattern = /(?<![0-9Xx])(?:\d{17}[0-9Xx]|\d{15})(?![0-9Xx])/gu;
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu;
const bankCardPattern = /(?<!\d)(?:\d[ -]?){16,19}(?!\d)/gu;
const wechatPattern =
  /(?:微信号?|wechat|weixin|wx)\s*[：:是为]?\s*([a-zA-Z][-_a-zA-Z0-9]{5,19})/giu;
const addressPattern =
  /[\u4e00-\u9fa5]{2,}(?:省|市|区|县|镇|乡|街道|路|街|巷|弄)[\u4e00-\u9fa50-9号栋幢单元室楼-]{4,}/gu;
const verificationCodePattern =
  /(?:验证码|校验码|动态码|短信码|verification code)\s*[：:是为]?\s*([A-Za-z0-9]{4,10})/giu;

function maskMiddle(
  value: string,
  prefixLength: number,
  suffixLength: number,
  minStars = 4,
): string {
  if (value.length <= prefixLength + suffixLength)
    return '*'.repeat(Math.max(minStars, value.length));
  return `${value.slice(0, prefixLength)}${'*'.repeat(
    Math.max(minStars, value.length - prefixLength - suffixLength),
  )}${value.slice(-suffixLength)}`;
}

function redactPhone(value: string): string {
  return maskMiddle(value, 3, 4);
}

function redactIdCard(value: string): string {
  return maskMiddle(value, 6, 4, 8);
}

function redactEmail(value: string): string {
  const [name, domain] = value.split('@');
  if (!name || !domain) return '[REDACTED_EMAIL]';
  return `${name[0] ?? '*'}***@${domain}`;
}

function redactBankCard(value: string): string {
  const digits = value.replace(/\D/gu, '');
  return maskMiddle(digits, 4, 4, 8);
}

function redactWechat(value: string): string {
  return maskMiddle(value, 2, 2);
}

function redactAddress(value: string): string {
  return `${value.slice(0, Math.min(6, value.length))}***`;
}

function redactVerificationCode(value: string): string {
  return '*'.repeat(Math.max(4, value.length));
}

const detectionPatterns: DetectionPattern[] = [
  { type: 'EMAIL', pattern: emailPattern, redact: redactEmail },
  { type: 'ID_CARD', pattern: idCardPattern, redact: redactIdCard },
  { type: 'PHONE', pattern: phonePattern, redact: redactPhone },
  { type: 'BANK_CARD', pattern: bankCardPattern, redact: redactBankCard },
  { type: 'WECHAT_ID', pattern: wechatPattern, redact: redactWechat, captureGroup: 1 },
  { type: 'ADDRESS', pattern: addressPattern, redact: redactAddress },
  {
    type: 'VERIFICATION_CODE',
    pattern: verificationCodePattern,
    redact: redactVerificationCode,
    captureGroup: 1,
  },
];

function overlaps(left: SensitiveInfoMatch, right: SensitiveInfoMatch): boolean {
  return left.start < right.end && right.start < left.end;
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`)
    .join(',')}}`;
}

/** Detects sensitive information spans in free text. */
export function detectSensitiveInfo(text: string): SensitiveInfoMatch[] {
  const matches: SensitiveInfoMatch[] = [];
  for (const definition of detectionPatterns) {
    definition.pattern.lastIndex = 0;
    for (const match of text.matchAll(definition.pattern)) {
      const value =
        definition.captureGroup === undefined ? match[0] : match[definition.captureGroup];
      if (!value) continue;
      const matchIndex = match.index ?? 0;
      const start =
        definition.captureGroup === undefined ? matchIndex : matchIndex + match[0].indexOf(value);
      const candidate: SensitiveInfoMatch = {
        type: definition.type,
        value,
        redacted: definition.redact(value),
        start,
        end: start + value.length,
      };
      if (!matches.some((existing) => overlaps(existing, candidate))) {
        matches.push(candidate);
      }
    }
  }
  return matches.sort((left, right) => left.start - right.start || left.end - right.end);
}

/** Redacts sensitive information while preserving enough shape for review. */
export function redactSensitiveInfo(text: string): string {
  const matches = detectSensitiveInfo(text);
  if (matches.length === 0) return text;
  let cursor = 0;
  let output = '';
  for (const match of matches) {
    output += text.slice(cursor, match.start);
    output += match.redacted;
    cursor = match.end;
  }
  output += text.slice(cursor);
  return output;
}

/** Creates a deterministic SHA-256 hash for sensitive values or structured payloads. */
export function hashSensitiveValue(value: unknown): string {
  return createHash('sha256').update(stableSerialize(value)).digest('hex');
}

function sanitizeValue(value: unknown, options: Required<SanitizeAuditLogOptions>): unknown {
  if (typeof value === 'string') return redactSensitiveInfo(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, options));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => {
        if (key === 'rawText') {
          if (!options.includeRawText) return [key, '[RAW_TEXT_OMITTED]'];
          return [
            key,
            options.allowUnredactedRawText
              ? entryValue
              : typeof entryValue === 'string'
                ? redactSensitiveInfo(entryValue)
                : sanitizeValue(entryValue, options),
          ];
        }
        return [key, sanitizeValue(entryValue, options)];
      }),
    );
  }
  return value;
}

/** Sanitizes audit-log payloads recursively. rawText is omitted unless explicitly enabled. */
export function sanitizeAuditLog<T>(payload: T, options: SanitizeAuditLogOptions = {}): T {
  return sanitizeValue(payload, {
    includeRawText: options.includeRawText ?? false,
    allowUnredactedRawText: options.allowUnredactedRawText ?? false,
  }) as T;
}

/** Redacts LLM messages unless the caller explicitly allows sensitive data. */
export function sanitizeLLMMessages(
  messages: readonly LLMMessage[],
  allowSensitiveData = false,
): LLMMessage[] {
  if (allowSensitiveData) return messages.map((message) => ({ ...message }));
  return messages.map((message) => ({
    ...message,
    content: redactSensitiveInfo(message.content),
  }));
}
