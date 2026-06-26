/** Sensitive information categories recognized by the security module. */
export type SensitiveInfoType =
  | 'PHONE'
  | 'ID_CARD'
  | 'EMAIL'
  | 'BANK_CARD'
  | 'WECHAT_ID'
  | 'ADDRESS'
  | 'VERIFICATION_CODE';

/** One detected sensitive text span. */
export interface SensitiveInfoMatch {
  /** Sensitive information category. */
  type: SensitiveInfoType;
  /** Original matched value. */
  value: string;
  /** Redacted value that can be safely logged. */
  redacted: string;
  /** Inclusive start offset in the input text. */
  start: number;
  /** Exclusive end offset in the input text. */
  end: number;
}

/** Options for audit-log sanitization. */
export interface SanitizeAuditLogOptions {
  /** Whether rawText fields may be retained. Defaults to false. */
  includeRawText?: boolean;
  /** Whether retained rawText may remain unredacted. Defaults to false. */
  allowUnredactedRawText?: boolean;
}
