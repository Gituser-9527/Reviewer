import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalKnowledgeRetriever } from './local-knowledge-retriever.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

async function temporaryKnowledgeDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'job-compliance-knowledge-'));
  temporaryDirectories.push(directory);
  return directory;
}

describe('LocalKnowledgeRetriever', () => {
  it('loads markdown and filters evidence by category', async () => {
    const directory = await temporaryKnowledgeDirectory();
    await writeFile(
      join(directory, 'fee.md'),
      `---
id: LAW_FEE
title: 收费规则摘要
sourceType: LAW
url: https://example.gov.cn/law
version: 2026-01
jurisdiction: CN_MAINLAND
categories: [FEE_DEPOSIT]
keywords: [押金, 服装费]
---
不得向劳动者收取押金。
`,
      'utf8',
    );

    const retriever = new LocalKnowledgeRetriever(directory);
    const feeResults = await retriever.retrieve({
      category: 'FEE_DEPOSIT',
      text: '岗位要求缴纳服装费',
      keywords: ['服装费'],
      jurisdiction: 'CN_MAINLAND',
      platform: 'DEFAULT',
      locale: 'zh-CN',
      asOf: '2026-06-12T00:00:00.000Z',
      topK: 3,
    });
    const privacyResults = await retriever.retrieve({
      category: 'PRIVACY',
      text: '身份证',
      keywords: ['身份证'],
      jurisdiction: 'CN_MAINLAND',
      platform: 'DEFAULT',
      locale: 'zh-CN',
      asOf: '2026-06-12T00:00:00.000Z',
      topK: 3,
    });

    expect(feeResults).toEqual([
      expect.objectContaining({
        id: 'LAW_FEE',
        title: '收费规则摘要',
        sourceType: 'LAW',
        quote: '不得向劳动者收取押金。',
        url: 'https://example.gov.cn/law',
        version: '2026-01',
      }),
    ]);
    expect(privacyResults).toEqual([]);
  });

  it('loads JSON entries and ranks keyword matches before category-only matches', async () => {
    const directory = await temporaryKnowledgeDirectory();
    await writeFile(
      join(directory, 'privacy.json'),
      JSON.stringify([
        {
          id: 'PRIVACY_GENERAL',
          title: '一般隐私规则',
          sourceType: 'LAW',
          url: 'https://example.gov.cn/privacy-general',
          version: '1',
          quote: '个人信息处理应合法正当。',
          categories: ['PRIVACY'],
          keywords: ['个人信息'],
          jurisdiction: 'CN_MAINLAND',
        },
        {
          id: 'PRIVACY_ID_CARD',
          title: '身份证信息规则',
          sourceType: 'LAW',
          url: 'https://example.gov.cn/privacy-id-card',
          version: '1',
          quote: '身份证信息应按最小必要范围处理。',
          categories: ['PRIVACY'],
          keywords: ['身份证', '最小必要'],
          jurisdiction: 'CN_MAINLAND',
        },
      ]),
      'utf8',
    );

    const results = await new LocalKnowledgeRetriever(directory).retrieve({
      category: 'PRIVACY',
      text: '要求上传身份证',
      keywords: ['身份证'],
      jurisdiction: 'CN_MAINLAND',
      platform: 'DEFAULT',
      locale: 'zh-CN',
      asOf: '2026-06-12T00:00:00.000Z',
      topK: 1,
    });

    expect(results.map((result) => result.id)).toEqual(['PRIVACY_ID_CARD']);
  });
});
