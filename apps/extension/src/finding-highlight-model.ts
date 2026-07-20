import type { AuditResult, FindingHighlight } from './types.js';

export const minimumHighlightEvidenceLength = 2;

export function findingHighlights(result: AuditResult): FindingHighlight[] {
  const seen = new Set<string>();
  return result.findings.flatMap((finding, findingIndex) => {
    const texts = [...(finding.metadata?.matchedText ?? []), ...finding.evidence.flatMap((evidence) => evidence.quote === undefined ? [] : [evidence.quote])];
    return texts.flatMap((text, textIndex) => {
      const normalized = text.trim();
      if (!isUsableEvidence(normalized) || seen.has(normalized)) return [];
      seen.add(normalized);
      return [{ id: `finding-${findingIndex}-${textIndex}`, text: normalized, severity: finding.severity }];
    });
  });
}

export function isUsableEvidence(value: string): boolean {
  return value.length >= minimumHighlightEvidenceLength && /[^\s\p{P}]/u.test(value);
}
