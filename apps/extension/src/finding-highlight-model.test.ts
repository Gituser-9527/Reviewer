import { describe, expect, it } from 'vitest';
import { findingHighlights, isUsableEvidence, minimumHighlightEvidenceLength, stableFindingId } from './finding-highlight-model.js';
import { findEvidenceOffsets, normalizeEvidence } from './finding-highlighter.js';

describe('finding highlight evidence model', () => {
  it('uses matched source text before evidence quotes and excludes short or punctuation-only values', () => {
    const highlights = findingHighlights({ auditId:'audit', decision:'MANUAL_REVIEW', riskLevel:'HIGH', summary:'risk', createdAt:'now', findings:[{ category:'DISCRIMINATION', severity:'HIGH', message:'explanation only', metadata:{matchedText:['限女性','限女性']}, evidence:[{title:'source',quote:'服装费'},{title:'source',quote:'。'}] }] });
    expect(highlights).toEqual([{id:stableFindingId('DISCRIMINATION','HIGH','explanation only','限女性'),text:'限女性',severity:'HIGH'},{id:stableFindingId('DISCRIMINATION','HIGH','explanation only','服装费'),text:'服装费',severity:'HIGH'}]);
    expect(isUsableEvidence(' ')).toBe(false); expect(isUsableEvidence('。')).toBe(false); expect(isUsableEvidence('费')).toBe(false); expect(minimumHighlightEvidenceLength).toBe(2);
  });
  it('matches Chinese evidence across inline text boundaries and normalizes whitespace deterministically', () => {
    expect(normalizeEvidence('  限\n女性  ')).toBe('限 女性');
    expect(findEvidenceOffsets('岗位要求：限女性。', '限女性')).toEqual([{start:5,end:8}]);
    expect(findEvidenceOffsets('职位：FEMALE ONLY', 'female only')).toEqual([{start:3,end:14}]);
  });
  it('returns all repeated exact matches and never locates an absent or underspecified phrase', () => {
    expect(findEvidenceOffsets('服装费，后续仍收服装费', '服装费')).toEqual([{start:0,end:3},{start:8,end:11}]);
    expect(findEvidenceOffsets('岗位正常', '不存在')).toEqual([]);
    expect(findEvidenceOffsets('岗位正常', '费')).toEqual([]);
  });
  it('uses stable content-derived provenance IDs and preserves equal evidence from distinct findings', () => {
    const result = { auditId:'audit', decision:'MANUAL_REVIEW' as const, riskLevel:'HIGH', summary:'risk', createdAt:'now', findings:[
      { category:'DISCRIMINATION', severity:'HIGH' as const, message:'first finding', evidence:[{title:'source',quote:'限女性'}] },
      { category:'PLATFORM_POLICY', severity:'MEDIUM' as const, message:'second finding', evidence:[{title:'source',quote:'限女性'}] },
    ] };
    const first = findingHighlights(result);
    expect(findingHighlights({ ...result, findings:[...result.findings].reverse() })).toEqual([...first].reverse());
    expect(first.map((highlight) => highlight.id)).toEqual([
      stableFindingId('DISCRIMINATION','HIGH','first finding','限女性'),
      stableFindingId('PLATFORM_POLICY','MEDIUM','second finding','限女性'),
    ]);
  });
});
