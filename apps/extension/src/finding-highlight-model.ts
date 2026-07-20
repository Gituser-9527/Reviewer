import type { AuditResult, FindingHighlight } from './types.js';

export const minimumHighlightEvidenceLength = 2;

export function findingHighlights(result: AuditResult): FindingHighlight[] {
  return result.findings.flatMap((finding) => {
    const seenFindingEvidence = new Set<string>();
    const texts = [...(finding.metadata?.matchedText ?? []), ...finding.evidence.flatMap((evidence) => evidence.quote === undefined ? [] : [evidence.quote])];
    return texts.flatMap((text) => {
      const normalized = text.trim();
      if (!isUsableEvidence(normalized) || seenFindingEvidence.has(normalized)) return [];
      seenFindingEvidence.add(normalized);
      return [{ id: stableFindingId(finding.category, finding.severity, finding.message, normalized), text: normalized, severity: finding.severity }];
    });
  });
}

export function stableFindingId(category: string, severity: string, message: string, evidence: string): string {
  const value = `${category}\u001f${severity}\u001f${message}\u001f${evidence}`;
  let first = 0x811c9dc5;
  let second = 0x01000193;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `finding-${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}`;
}

export function isUsableEvidence(value: string): boolean {
  return value.length >= minimumHighlightEvidenceLength && /[^\s\p{P}]/u.test(value);
}
