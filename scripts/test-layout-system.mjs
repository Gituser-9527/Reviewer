/* global console, process */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const styles = readFileSync(join(root, 'apps/web/app/styles.css'), 'utf8');
const overview = readFileSync(join(root, 'apps/web/app/overview/page.tsx'), 'utf8');
const ui = readFileSync(join(root, 'apps/web/app/components/ui.tsx'), 'utf8');

const required = [
  '--layout-compact',
  '--layout-default',
  '--layout-wide',
  '--page-gutter',
  '--control-md',
  '--card-padding',
  '.metric-card',
  '.metadata-list',
  '.workspace-hub',
  'grid-auto-rows: 1fr',
  '@media (max-width: 1180px)',
  '@media (max-width: 767px)',
];

const failures = required.filter((token) => !styles.includes(token)).map((token) => `Missing layout token/rule: ${token}`);
if (!ui.includes('function MetricCard')) failures.push('Missing MetricCard component.');
if (!ui.includes('function MetadataList')) failures.push('Missing MetadataList component.');
if (!overview.includes('<MetadataList')) failures.push('Dashboard runtime metadata was not consolidated.');
if (!overview.includes('<MetricCard')) failures.push('Dashboard does not use MetricCard.');

if (failures.length > 0) {
  console.error('Layout system test failed:');
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}

console.log('Layout system test passed: tokens, responsive grid, MetricCard and runtime metadata are present.');
