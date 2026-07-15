/* global console, process */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const zhPath = join(root, 'apps/web/messages/zh-CN.json');
const enPath = join(root, 'apps/web/messages/en-US.json');
const appDir = join(root, 'apps/web/app');
const strictProductFiles = new Set([
  'apps\\web\\app\\page.tsx',
  'apps\\web\\app\\overview\\page.tsx',
  'apps\\web\\app\\settings\\page.tsx',
  'apps\\web\\app\\qa\\page.tsx',
  'apps\\web\\app\\red-team\\page.tsx',
  'apps\\web\\app\\appeals\\page.tsx',
]);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function flattenKeys(value, prefix = '') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [prefix];
  }
  return Object.keys(value).flatMap((key) => flattenKeys(value[key], prefix ? `${prefix}.${key}` : key));
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) return walk(path);
    if (path.endsWith('.test.ts') || path.endsWith('.test.tsx')) return [];
    return path.endsWith('.tsx') || path.endsWith('.ts') ? [path] : [];
  });
}

const zh = readJson(zhPath);
const en = readJson(enPath);
const zhKeys = new Set(flattenKeys(zh));
const enKeys = new Set(flattenKeys(en));
const missingInEn = [...zhKeys].filter((key) => !enKeys.has(key));
const missingInZh = [...enKeys].filter((key) => !zhKeys.has(key));

const hardcodedChinese = [];
const strictHardcodedChinese = [];
for (const file of walk(appDir)) {
  const rel = relative(root, file);
  const source = readFileSync(file, 'utf8');
  const lines = source.split(/\r?\n/u);
  lines.forEach((line, index) => {
    if (/[\u4e00-\u9fff]/u.test(line) && !rel.includes('legacy-localizer')) {
      const item = { file: rel, line: index + 1, text: line.trim().slice(0, 160) };
      hardcodedChinese.push(item);
      if (strictProductFiles.has(rel)) {
        strictHardcodedChinese.push(item);
      }
    }
  });
}

if (missingInEn.length > 0 || missingInZh.length > 0) {
  console.error('i18n key mismatch detected.');
  if (missingInEn.length > 0) {
    console.error('\nMissing in en-US.json:');
    for (const key of missingInEn) console.error(`  - ${key}`);
  }
  if (missingInZh.length > 0) {
    console.error('\nMissing in zh-CN.json:');
    for (const key of missingInZh) console.error(`  - ${key}`);
  }
  process.exit(1);
}

console.log(`i18n keys OK: ${zhKeys.size} keys are aligned between zh-CN and en-US.`);
if (strictHardcodedChinese.length > 0) {
  console.warn(
    `Warning: found ${strictHardcodedChinese.length} hardcoded Chinese lines in strict product pages.`,
  );
  for (const item of strictHardcodedChinese.slice(0, 20)) {
    console.warn(`  ${item.file}:${item.line} ${item.text}`);
  }
}
if (hardcodedChinese.length > 0) {
  console.warn(
    `Warning: found ${hardcodedChinese.length} total hardcoded Chinese lines in TS/TSX. Legacy pages are currently localized by LegacyLocalizer; migrate them to message keys before GA.`,
  );
  for (const item of hardcodedChinese.slice(0, 20)) {
    console.warn(`  ${item.file}:${item.line} ${item.text}`);
  }
  if (hardcodedChinese.length > 20) {
    console.warn(`  ... ${hardcodedChinese.length - 20} more`);
  }
}
