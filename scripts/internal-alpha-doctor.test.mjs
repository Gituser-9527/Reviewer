import assert from 'node:assert/strict';
import test from 'node:test';
import { atLeast, createDoctor, parseVersion, summarize, validHttpUrl } from './internal-alpha-doctor-lib.mjs';

const files = new Set(['package.json', 'node_modules', 'apps/extension/manifest.json', 'apps/api/dist/server.js', 'apps/extension/dist']);
const fs = { exists: (file) => files.has(file.replaceAll('\\', '/')), readFile: () => JSON.stringify({ version: '0.1.0' }) };
const portableFs = { exists: (file) => [...files].some((entry) => file.replaceAll('\\', '/').endsWith(entry)), readFile: () => JSON.stringify({ version: '0.1.0' }) };
const run = (command, args) => command.startsWith('npm') ? '11.6.2' : args.includes('status') ? '' : 'abc1234';
function doctor(overrides = {}) { return createDoctor({ cwd: '', fs, run, nodeVersion: 'v24.11.1', env: {}, ...overrides }); }

test('does not echo sensitive environment values', () => {
  const secret = 'a$pec!al-secret/not-for-output';
  const rows = doctor({ env: { DATABASE_URL: secret, TEST_DATABASE_URL: secret, DEV_EXTENSION_AUTH_ENABLED: 'true', DEV_EXTENSION_AUTH_TOKEN: secret, DEV_EXTENSION_TENANT_ID: 'alpha', DEV_EXTENSION_ORIGINS: 'chrome-extension://example' } });
  assert.equal(JSON.stringify(rows).includes(secret), false);
});

test('does not disclose command errors that contain a secret', () => {
  const secret = 'postgresql://user:password@private.example.test/db';
  const rows = doctor({ run: () => { throw new Error(secret); } });
  assert.equal(JSON.stringify(rows).includes(secret), false);
  assert.ok(rows.some((row) => row.name === 'npm' && row.status === 'FAIL'));
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
  assert.equal(validHttpUrl('https://user:password@example.test'), false);
  const rows = doctor({ env: { API_BASE_URL: 'not a url', DEV_EXTENSION_AUTH_ENABLED: 'true' } });
  assert.ok(rows.some((row) => row.name === 'API address' && row.status === 'FAIL'));
  assert.ok(rows.some((row) => row.name === 'development extension authentication' && row.status === 'FAIL'));
});

test('handles invalid manifests, unavailable Git/npm, and Windows or Linux style paths', () => {
  const invalidManifest = doctor({ fs: { exists: (file) => file.replaceAll('\\', '/').endsWith('manifest.json') || files.has(file.replaceAll('\\', '/')), readFile: () => '{' } });
  assert.ok(invalidManifest.some((row) => row.name === 'manifest version' && row.status === 'FAIL'));
  const unavailable = doctor({ run: () => { throw new Error('unavailable'); } });
  assert.ok(unavailable.some((row) => row.name === 'npm' && row.status === 'FAIL'));
  assert.ok(unavailable.some((row) => row.name === 'Git' && row.status === 'WARN'));
  assert.equal(doctor({ cwd: 'C:\\alpha', fs: portableFs, run, nodeVersion: 'v24.11.1', env: {} }).some((row) => row.status === 'FAIL'), false);
  assert.equal(doctor({ cwd: '/alpha', fs: portableFs, run, nodeVersion: 'v24.11.1', env: {} }).some((row) => row.status === 'FAIL'), false);
});

test('compares Node and npm versions lexicographically against repository engines', () => {
  assert.equal(atLeast([19, 99, 99], [20, 9, 0]), false);
  assert.equal(atLeast([20, 9, 0], [20, 9, 0]), true);
  assert.equal(atLeast([20, 9, 1], [20, 9, 0]), true);
  assert.equal(atLeast([20, 10, 0], [20, 9, 0]), true);
  assert.equal(atLeast([20, 8, 99], [20, 9, 0]), false);
  assert.equal(atLeast([21, 0, 0], [20, 9, 0]), true);
  const outdatedNpm = doctor({ run: (command, args) => command.startsWith('npm') ? '9.99.99' : args.includes('status') ? '' : 'abc1234' });
  assert.ok(outdatedNpm.some((row) => row.name === 'npm' && row.status === 'FAIL'));
  const outdatedNode = doctor({ nodeVersion: 'v19.99.99' });
  assert.ok(outdatedNode.some((row) => row.name === 'Node.js' && row.status === 'FAIL'));
});

test('rejects incomplete, malformed, and prerelease versions without echoing them', () => {
  for (const version of ['', undefined, '20', '20.9', '20.x.0', 'v20.9.0-rc.1', 'not-a-version']) assert.equal(parseVersion(version), undefined);
  const secret = '20.9.0-rc.1-secret-value';
  const rows = doctor({ nodeVersion: secret, npmVersion: 'not-a-version' });
  assert.ok(rows.some((row) => row.name === 'Node.js' && row.status === 'FAIL'));
  assert.ok(rows.some((row) => row.name === 'npm' && row.status === 'FAIL'));
  assert.equal(JSON.stringify(rows).includes(secret), false);
});
