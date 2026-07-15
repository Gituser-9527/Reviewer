import type { TextMatchLocation } from '@job-compliance/shared';
export const normalizePageText = (value: string) => value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
/** Exact or normalized-only matching. Ambiguous matches deliberately return no high-confidence location. */
export function locateText(root: ParentNode, text: string): TextMatchLocation[] {
  const target = normalizePageText(text); if (!target) return [];
  const matches: TextMatchLocation[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) { const value = node.textContent ?? ''; const index = normalizePageText(value).indexOf(target); if (index >= 0) matches.push({ textQuote: text, startOffset: index, endOffset: index + target.length, confidence: value.includes(text) ? 1 : .85 }); }
  return matches.length === 1 ? matches : [];
}
