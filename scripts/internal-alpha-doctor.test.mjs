import assert from 'node:assert/strict';
import test from 'node:test';
import { createDoctor, summarize, validHttpUrl } from './internal-alpha-doctor-lib.mjs';

const files = new Set(['package.json', 'node_modules', 'apps/extension/manifest.json', 'apps/api/dist/server.js', 'apps/extension/dist']);
const fs = { exists: (file) => files.has(file.replaceAll('\\', '/')), readFile: () => JSON.stringify({ version: '0.1.0' }) };
const run = (command, args) => command.startsWith('npm') ? '11.6.2' : args.includes('status') ? '' : 'abc1234';
function doctor(overrides = {}) { return createDoctor({ cwd: '', fs, run, nodeVersion: 'v24.11.1', env: {}, ...overrides }); }

test('does not echo sensitive environment values', () => {
  const secret = 'not-for-output';
  const rows = doctor({ env: { DATABASE_URL: secret, TEST_DATABASE_URL: secret, DEV_EXTENSION_AUTH_ENABLED: 'true', DEV_EXTENSION_AUTH_TOKEN: secret, DEV_EXTENSION_TENANT_ID: 'alpha', DEV_EXTENSION_ORIGINS: 'chrome-extension://example' } });
  assert.equal(JSON.stringify(rows).includes(secret), false);
});

test('reports missing required files as failures', () => {
  const rows = doctor({ fs: { exists: () => false, readFile: () => '' } });
  assert.ok(rows.some((row) => row.name === 'repository root' && row.status === 'FAIL'));
  assert.equal(summarize(rows).exitCode, 1);
});

test('uses warnings for optional local configuration and dirty worktrees', () => {
  const rows = doctor({ run: (command, args) => command.startsWith('npm') ? '11.6.2' : args.includes('status') ? ' M docs/example.md' : 'abc1234' });
  assert.ok(rows.some((row) => row.name === 'PostgreSQL configuration' && row.status === 'WARN'));
  assert.ok(rows.some((row) => row.name === 'working tree' && row.status === 'WARN'));
  assert.equal(summarize(rows).exitCode, 0);
});

test('validates API URL and configuration completeness without values', () => {
  assert.equal(validHttpUrl('https://alpha.example.test'), true);
  assert.equal(validHttpUrl('not a url'), false);
  const rows = doctor({ env: { API_BASE_URL: 'not a url', DEV_EXTENSION_AUTH_ENABLED: 'true' } });
  assert.ok(rows.some((row) => row.name === 'API address' && row.status === 'FAIL'));
  assert.ok(rows.some((row) => row.name === 'development extension authentication' && row.status === 'FAIL'));
});
