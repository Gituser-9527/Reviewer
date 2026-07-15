/* global console, process */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

const requiredFiles = [
  'apps/web/app/page.tsx',
  'apps/web/app/overview/page.tsx',
  'apps/web/app/reviews/page.tsx',
  'apps/web/app/rules/page.tsx',
  'apps/web/app/evals/page.tsx',
  'apps/web/app/monitoring/page.tsx',
  'apps/web/app/releases/page.tsx',
  'apps/web/app/appeals/page.tsx',
  'apps/web/app/qa/page.tsx',
  'apps/web/app/settings/page.tsx',
  'apps/web/app/components/app-shell.tsx',
  'apps/web/app/components/data-table.tsx',
  'apps/web/app/components/permission-gate.tsx',
  'apps/web/app/components/protected-route.tsx',
  'apps/web/app/components/sensitive-action-dialog.tsx',
  'apps/web/app/landing/page.tsx',
  'apps/web/app/api-docs/page.tsx',
  'apps/web/app/components/public-site-header.tsx',
  'apps/web/messages/zh-CN.json',
  'apps/web/messages/en-US.json',
];

const requiredStyleSnippets = [
  '.audit-source-preview',
  'overflow-wrap: anywhere',
  '.data-table__pagination',
  '.empty-state--modern',
  '.skeleton-panel',
  '.sensitive-dialog',
  '.permission-explainer',
  '.evidence-drawer',
  '.demo-mode-banner',
  '.demo-case-strip',
  '.onboarding-guide',
  '.onboarding-launcher',
  '.public-site',
  '.landing-hero',
  '.api-portal__layout',
  '@media (prefers-color-scheme: dark)',
  '@media (max-width: 860px)',
];

const requiredSourceSnippets = [
  ['apps/web/app/page.tsx', 'ResultSkeleton'],
  ['apps/web/app/page.tsx', 'FeedbackDialog'],
  ['apps/web/app/page.tsx', 'navigator.clipboard.writeText'],
  ['apps/web/app/overview/page.tsx', 'DataTable'],
  ['apps/web/app/components/data-table.tsx', 'setPage'],
  ['apps/web/app/components/app-shell.tsx', 'RoleBasedSidebar'],
  ['apps/web/app/components/app-shell.tsx', 'DemoModeBanner'],
  ['apps/web/app/components/app-shell.tsx', '/api/demo/seed'],
  ['apps/web/app/page.tsx', '/api/demo'],
  ['apps/web/app/page.tsx', 'useDemoCase'],
  ['apps/web/app/components/onboarding-guide.tsx', 'OnboardingGuide'],
  ['apps/web/app/components/onboarding-guide.tsx', "updateStatus('complete')"],
  ['apps/web/app/components/app-shell.tsx', 'OnboardingGuide'],
  ['apps/web/app/components/report-export-actions.tsx', 'ReportExportActions'],
  ['apps/web/app/components/report-export-actions.tsx', 'format='],
  ['apps/web/app/page.tsx', 'ReportExportActions'],
  ['apps/web/app/pilot/page.tsx', '转正式建议'],
  ['apps/web/app/pilot/page.tsx', 'updateOperations'],
  ['apps/web/app/pilot/page.tsx', 'autoRejectRate'],
  ['apps/web/app/components/app-shell.tsx', 'appeals'],
  ['apps/web/app/components/app-shell.tsx', 'qa'],
  ['apps/web/app/components/protected-route.tsx', 'noAccessTitle'],
  ['apps/web/app/components/protected-route.tsx', 'requiredPermissions'],
  ['apps/web/app/rules/page.tsx', 'SensitiveActionDialog'],
  ['apps/web/app/monitoring/page.tsx', 'SensitiveActionDialog'],
  ['apps/web/app/releases/page.tsx', 'SensitiveActionDialog'],
  ['apps/web/app/reviews/page.tsx', 'SensitiveActionDialog'],
  ['apps/web/app/landing/page.tsx', '/api/trial-requests'],
  ['apps/web/app/landing/page.tsx', 'PublicSiteHeader'],
  ['apps/web/app/api-docs/page.tsx', 'PublicSiteHeader'],
];

const failures = [];
for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) failures.push(`Missing required file: ${file}`);
}

const styles = readFileSync(join(root, 'apps/web/app/styles.css'), 'utf8');
for (const snippet of requiredStyleSnippets) {
  if (!styles.includes(snippet)) failures.push(`Missing CSS smoke snippet: ${snippet}`);
}

for (const [file, snippet] of requiredSourceSnippets) {
  const source = readFileSync(join(root, file), 'utf8');
  if (!source.includes(snippet)) failures.push(`Missing source smoke snippet in ${file}: ${snippet}`);
}

if (failures.length > 0) {
  console.error('UI smoke test failed:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('UI smoke test passed: core pages, states, permissions, responsive styles and table controls are present.');
