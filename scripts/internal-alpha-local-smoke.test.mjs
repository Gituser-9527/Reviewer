/* global URL */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  approvedManifestPermissions,
  assertApprovedManifestPermissions,
  assertNoSensitiveArgs,
  createCleanupStack,
  createExactExtensionOrigin,
  isLoopbackHttpUrl,
  redactSensitiveText,
  sanitizeSummary,
} from './internal-alpha-local-smoke-lib.mjs';

test('accepts only loopback HTTP fixture and API URLs', () => {
  assert.equal(isLoopbackHttpUrl('http://127.0.0.1:3100/fixture'), true);
  assert.equal(isLoopbackHttpUrl('http://localhost:3100/fixture'), true);
  assert.equal(isLoopbackHttpUrl('https://example.com/fixture'), false);
  assert.equal(isLoopbackHttpUrl('http://192.168.1.10/fixture'), false);
});

test('uses a dynamic exact extension origin and preserves approved manifest permissions', () => {
  assert.equal(createExactExtensionOrigin('a'.repeat(32)), `chrome-extension://${'a'.repeat(32)}`);
  assert.throws(() => createExactExtensionOrigin('not-an-extension-id'));
  assert.equal(assertApprovedManifestPermissions(approvedManifestPermissions), true);
  assert.equal(assertApprovedManifestPermissions([...approvedManifestPermissions, 'cookies']), false);
});

test('redacts credentials and rejects sensitive child-process arguments', () => {
  const secret = 'very-secret-token';
  const database = 'database-credential-not-for-output';
  const text = redactSensitiveText(`Authorization: Bearer ${secret}; ${database}`, [secret, database]);
  assert.equal(text.includes(secret), false);
  assert.equal(text.includes(database), false);
  assert.throws(() => assertNoSensitiveArgs(['--token', secret], [secret]));
  assert.doesNotThrow(() => assertNoSensitiveArgs(['apps/api/dist/server.js'], [secret]));
});

test('writes a whitelist-only summary without identifiers or credentials', () => {
  const summary = sanitizeSummary({ sessionId: 'local-smoke-private-session', commit: 'a6846be248641990385c295312bfe0b65a7db4e7', startedAt: '2026-07-22T00:00:00.000Z', endedAt: '2026-07-22T00:01:00.000Z', extensionVersion: '0.1.0', gates: { api: 'PASS' }, auditRunCount: 1, findingCount: 2, evidenceCount: 3, tenantMatched: true, pageBindingMatched: true, cleanupSucceeded: true });
  const encoded = JSON.stringify(summary);
  assert.equal(encoded.includes('local-smoke-private-session'), false);
  assert.equal(encoded.includes('a6846be248641990385c295312bfe0b65a7db4e7'), false);
  assert.deepEqual(Object.keys(summary).sort(), ['auditRunCount', 'cleanupSucceeded', 'endedAt', 'evidenceCount', 'extensionVersion', 'findingCount', 'gates', 'mainCommit', 'manualStepsConfirmed', 'pageBindingMatched', 'session', 'startedAt', 'tenantMatched'].sort());
});

test('cleanup runs only registered resources in reverse order and is idempotent', async () => {
  const cleanup = createCleanupStack();
  const seen = [];
  cleanup.add('first', async () => { seen.push('first'); });
  cleanup.add('second', async () => { seen.push('second'); });
  assert.deepEqual(await cleanup.run(), []);
  assert.deepEqual(seen, ['second', 'first']);
  assert.deepEqual(await cleanup.run(), []);
});

test('cleanup reports registered failures without touching unregistered resources', async () => {
  const cleanup = createCleanupStack();
  const seen = [];
  cleanup.add('owned-api', async () => { seen.push('owned-api'); throw new Error('expected'); });
  const failures = await cleanup.run();
  assert.deepEqual(seen, ['owned-api']);
  assert.deepEqual(failures, [{ name: 'owned-api', message: 'expected' }]);
});

test('harness source does not automate Popup interactions or hard-code an extension ID', async () => {
  const source = await readFile(new URL('./internal-alpha-local-smoke.mjs', import.meta.url), 'utf8');
  for (const forbidden of ['.click(', '.dblclick(', 'locator(', 'popup.html', '--token']) assert.equal(source.includes(forbidden), false, `Unexpected automated interaction: ${forbidden}`);
  assert.equal(source.includes('chrome.storage.session.set'), true);
  assert.equal(source.includes('createExactExtensionOrigin(new URL(worker.url()).host)'), true);
  assert.equal(source.includes("process.once('SIGINT'"), true);
  assert.equal(source.includes("page.route('http://**/*'"), true);
  assert.equal(source.includes('testDatabaseOwned'), true);
});

test('manual Smoke fixture contains deterministic, page-locatable rule evidence', async () => {
  const source = await readFile(new URL('./internal-alpha-local-smoke.mjs', import.meta.url), 'utf8');
  assert.equal(source.includes('限女性'), true, 'The local fixture must contain deterministic YAML-rule evidence.');
  assert.equal(source.includes('服装费'), true, 'The local fixture must contain a second deterministic YAML-rule evidence phrase.');
  assert.equal(source.includes('LOCAL INTERNAL ALPHA SMOKE'), true, 'The fixture must remain explicitly local-only.');
});
