import { describe, expect, it } from 'vitest';
import { calculateRewriteFindingCoverage } from './rewrite-finding-coverage.js';

const originalJob = { title: '招聘专员', description: '仅限男性\n联系 HR', companyName: 'Acme' };
const finding = (id: string, matchedText = '仅限男性') => ({
  id,
  category: 'DISCRIMINATION',
  severity: 'HIGH',
  title: id,
  matchedText,
  evidenceIds: [],
});
const rewrite = (
  changes: Array<{
    findingId: string;
    originalText: string;
    rewrittenText: string;
    reason: string;
  }>,
  description = '欢迎符合岗位要求的候选人 联系 HR',
) => ({ description, changes, preservedFacts: [], warnings: [] });
const change = (findingId: string) => ({
  findingId,
  originalText: '仅限男性',
  rewrittenText: '欢迎符合岗位要求的候选人',
  reason: '移除限制',
});

describe('rewrite finding coverage', () => {
  it('addresses only explicitly referenced matched text removed from the rewrite', () =>
    expect(
      calculateRewriteFindingCoverage({
        findings: [finding('f1')],
        originalJob,
        rewrite: rewrite([change('f1')]),
      }),
    ).toEqual({ addressedFindingIds: ['f1'], unaddressedFindingIds: [], unknownFindingIds: [] }));
  it('partitions multiple findings and does not infer unreferenced removal', () =>
    expect(
      calculateRewriteFindingCoverage({
        findings: [finding('f2', '联系 HR'), finding('f1')],
        originalJob,
        rewrite: rewrite([change('f1')]),
      }),
    ).toEqual({
      addressedFindingIds: ['f1'],
      unaddressedFindingIds: ['f2'],
      unknownFindingIds: [],
    }));
  it('rejects retained text, empty or unverifiable matched text as unaddressed', () =>
    expect(
      calculateRewriteFindingCoverage({
        findings: [finding('retained'), finding('empty', ''), finding('absent', '不存在')],
        originalJob,
        rewrite: rewrite([change('retained'), change('empty'), change('absent')], '仅限男性'),
      }),
    ).toMatchObject({
      addressedFindingIds: [],
      unaddressedFindingIds: ['absent', 'empty', 'retained'],
    }));
  it('reports known and unknown change references separately with stable deduplication', () =>
    expect(
      calculateRewriteFindingCoverage({
        findings: [finding('f1')],
        originalJob,
        rewrite: rewrite([
          change('unknown-z'),
          change('f1'),
          change('unknown-a'),
          change('unknown-z'),
        ]),
      }),
    ).toEqual({
      addressedFindingIds: ['f1'],
      unaddressedFindingIds: [],
      unknownFindingIds: ['unknown-a', 'unknown-z'],
    }));
  it('handles empty findings without inventing addressed ids', () =>
    expect(
      calculateRewriteFindingCoverage({
        findings: [],
        originalJob,
        rewrite: rewrite([change('missing')]),
      }),
    ).toEqual({
      addressedFindingIds: [],
      unaddressedFindingIds: [],
      unknownFindingIds: ['missing'],
    }));
  it('normalizes whitespace, full-width spaces, newlines and English case without fuzzy matching', () => {
    const coverage = calculateRewriteFindingCoverage({
      findings: [finding('case', 'MEN ONLY'), finding('near', 'male')],
      originalJob: { description: 'MEN　ONLY\nrole' },
      rewrite: rewrite([change('case'), change('near')], 'welcome role'),
    });
    expect(coverage).toEqual({
      addressedFindingIds: ['case'],
      unaddressedFindingIds: ['near'],
      unknownFindingIds: [],
    });
  });
});
