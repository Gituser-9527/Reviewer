export interface LearningRedactionResult {
  value: string;
  redactionCount: number;
  needsPrivacyReview: boolean;
}

const patterns: RegExp[] = [
  /\b(?:\+?86[-\s]?)?1[3-9]\d{9}\b/gu,
  /\b(?:\d{3,4}[-\s]?)?\d{7,8}\b/gu,
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gu,
  /\b\d{17}[\dXx]\b/gu,
  /\b(?:\d[ -]?){13,19}\b/gu,
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/gu,
  /\b(?:Bearer\s+|api[_-]?key\s*[:=]\s*)[^\s]+/giu,
  /(?:微信|wechat|qq)\s*[:：]?\s*[A-Za-z0-9_-]{5,}/giu,
  /https?:\/\/[^\s]+/giu,
  /\b[A-Za-z0-9+/_=-]{32,}\b/gu,
];

/** Browser-safe deterministic pre-redaction. The server repeats this check authoritatively. */
export function redactLearningFeedbackText(input: string): LearningRedactionResult {
  let value = input;
  let redactionCount = 0;
  for (const pattern of patterns) {
    value = value.replace(pattern, () => {
      redactionCount += 1;
      return '[REDACTED]';
    });
  }
  const needsPrivacyReview = /(?:身份证|住址|地址|姓名|公司名称|联系人)/u.test(value);
  return { value, redactionCount, needsPrivacyReview };
}
