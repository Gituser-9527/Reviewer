import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import process from 'node:process';
import { createReadinessDoctor, summarize } from './internal-alpha-doctor-lib.mjs';

const requiredFiles = new Set([
  'package.json',
  'apps/extension/manifest.json',
  'docs/internal-alpha/README.md',
  'docs/internal-alpha/ALPHA_READINESS_CHECKLIST.md',
  'docs/internal-alpha/ALPHA_GO_NO_GO_TEMPLATE.md',
  'docs/internal-alpha/ALPHA_READINESS_DOCTOR_DESIGN.md',
]);
const packageJson = JSON.stringify({ scripts: { 'doctor:internal-alpha': 'node scripts/internal-alpha-doctor.mjs', 'doctor:internal-alpha-readiness': 'node scripts/internal-alpha-readiness-doctor.mjs' } });
const manifest = JSON.stringify({ version: '0.1.0', permissions: ['activeTab', 'storage', 'tabs'] });

function createFs(files = requiredFiles, content = {}) {
  return {
    exists: (file) => files.has(file.replaceAll('\\', '/')),
    readFile: (file) => content[file.replaceAll('\\', '/')] ?? (file.replaceAll('\\', '/') === 'package.json' ? packageJson : manifest),
  };
}

function readiness(overrides = {}) {
  return createReadinessDoctor({
    cwd: '',
    fs: createFs(),
    run: (command, args) => command === 'npm' ? '10.9.0' : args.includes('status') ? '' : 'unused',
    nodeVersion: 'v20.9.0',
    ...overrides,
  });
}

test('passes local static readiness checks and exits zero without warnings', () => {
  const rows = readiness();
  assert.equal(rows.every((row) => row.status === 'PASS'), true);
  assert.deepEqual(summarize(rows), { failed: 0, warned: 0, exitCode: 0 });
});

test('fails invalid, prerelease, and outdated runtime versions without echoing their values', () => {
  for (const version of ['v19.99.99', 'v20.9.0-rc.1', 'not-a-version', undefined]) {
    const rows = readiness({ nodeVersion: version });
    assert.equal(rows.find((row) => row.name === 'Runtime Node.js')?.status, 'FAIL');
  }
  const rows = readiness({ npmVersion: '9.99.99' });
  assert.equal(rows.find((row) => row.name === 'Runtime npm')?.status, 'FAIL');
  assert.equal(summarize(rows).exitCode, 1);
});

test('fails missing readiness files and doctor script', () => {
  const files = new Set(requiredFiles);
  files.delete('docs/internal-alpha/ALPHA_READINESS_CHECKLIST.md');
  const rows = readiness({ fs: createFs(files, { 'package.json': JSON.stringify({ scripts: { 'doctor:internal-alpha': 'present' } }) }) });
  assert.equal(rows.find((row) => row.name === 'Repository docs/internal-alpha/ALPHA_READINESS_CHECKLIST.md')?.status, 'FAIL');
  assert.equal(rows.find((row) => row.name === 'Repository package scripts')?.status, 'FAIL');
});

test('fails a manifest permission baseline mismatch without changing the manifest', () => {
  const rows = readiness({ fs: createFs(requiredFiles, { 'apps/extension/manifest.json': JSON.stringify({ version: '0.1.0', permissions: ['activeTab'] }) }) });
  assert.equal(rows.find((row) => row.name === 'Extension manifest permissions')?.status, 'FAIL');
});

test('warns for a dirty worktree while retaining a zero exit code', () => {
  const rows = readiness({ run: (command, args) => command === 'npm' ? '10.9.0' : args.includes('status') ? '?? docs/internal-alpha/example.md' : 'unused' });
  assert.equal(rows.find((row) => row.name === 'Repository working tree')?.status, 'WARN');
  assert.equal(summarize(rows).exitCode, 0);
});

test('does not leak sensitive values from command failures or CLI stdout and stderr', () => {
  const secret = 'database-credential-not-for-output';
  const rows = readiness({ run: () => { throw new Error(secret); } });
  assert.equal(JSON.stringify(rows).includes(secret), false);

  const result = spawnSync(process.execPath, ['scripts/internal-alpha-readiness-doctor.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, DEV_EXTENSION_AUTH_TOKEN: secret, DATABASE_URL: secret, AUTHORIZATION: `Bearer ${secret}` },
  });
  assert.equal(`${result.stdout}${result.stderr}`.includes(secret), false);
});
