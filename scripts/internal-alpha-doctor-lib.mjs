import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';

const minimumNode = [20, 9, 0];

export function parseVersion(value) {
  const match = /^(?:v)?(\d+)\.(\d+)\.(\d+)/u.exec(value ?? '');
  return match ? match.slice(1).map(Number) : undefined;
}

export function atLeast(actual, minimum) {
  if (!actual) return false;
  for (let index = 0; index < minimum.length; index += 1) {
    if (actual[index] > minimum[index]) return true;
    if (actual[index] < minimum[index]) return false;
  }
  return true;
}

export function validHttpUrl(value) {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

export function createDoctor(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const fs = options.fs ?? { exists: existsSync, readFile: (file) => readFileSync(file, 'utf8') };
  const run = options.run ?? ((command, args) => execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim());
  const nodeVersion = options.nodeVersion ?? process.version;
  const rows = [];
  const add = (status, name, detail) => rows.push({ status, name, detail });
  const present = (name) => Boolean(env[name]?.trim());
  const file = (...parts) => join(cwd, ...parts);

  add(atLeast(parseVersion(nodeVersion), minimumNode) ? 'PASS' : 'FAIL', 'Node.js', `detected ${nodeVersion}; requires >=20.9.0`);
  try {
    const npmVersion = options.npmVersion ?? (options.run ? run('npm', ['--version']) : process.platform === 'win32'
      ? execFileSync('cmd.exe', ['/d', '/s', '/c', 'npm --version'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
      : run('npm', ['--version']));
    add(atLeast(parseVersion(npmVersion), [10, 0, 0]) ? 'PASS' : 'FAIL', 'npm', atLeast(parseVersion(npmVersion), [10, 0, 0]) ? `detected ${npmVersion}` : 'requires >=10.0.0');
  } catch {
    add('FAIL', 'npm', 'npm is not available on PATH');
  }

  const packageFile = file('package.json');
  add(fs.exists(packageFile) ? 'PASS' : 'FAIL', 'repository root', fs.exists(packageFile) ? 'package.json found' : 'run this command from the repository root');
  add(fs.exists(file('node_modules')) ? 'PASS' : 'FAIL', 'dependencies', fs.exists(file('node_modules')) ? 'node_modules found' : 'run npm ci');
  add(fs.exists(file('apps', 'extension', 'manifest.json')) ? 'PASS' : 'FAIL', 'extension manifest', fs.exists(file('apps', 'extension', 'manifest.json')) ? 'manifest found' : 'apps/extension/manifest.json is missing');

  if (fs.exists(file('apps', 'extension', 'manifest.json'))) {
    try {
      const manifest = JSON.parse(fs.readFile(file('apps', 'extension', 'manifest.json')));
      add(typeof manifest.version === 'string' && manifest.version.length > 0 ? 'PASS' : 'FAIL', 'manifest version', typeof manifest.version === 'string' ? `version ${manifest.version}` : 'version is missing');
    } catch {
      add('FAIL', 'manifest version', 'manifest JSON cannot be parsed');
    }
  }

  add(fs.exists(file('apps', 'api', 'dist', 'server.js')) ? 'PASS' : 'WARN', 'API build', fs.exists(file('apps', 'api', 'dist', 'server.js')) ? 'dist/server.js found' : 'run npm run build --workspace @job-compliance/api');
  add(fs.exists(file('apps', 'extension', 'dist')) ? 'PASS' : 'WARN', 'extension build', fs.exists(file('apps', 'extension', 'dist')) ? 'dist directory found' : 'run npm run build:extension');

  const apiUrl = env.INTERNAL_ALPHA_API_BASE_URL || env.API_BASE_URL;
  add(!apiUrl ? 'WARN' : validHttpUrl(apiUrl) ? 'PASS' : 'FAIL', 'API address', !apiUrl ? 'not set; configure the Popup API address before a trial' : validHttpUrl(apiUrl) ? 'configured (value withheld)' : 'must be an http(s) URL');
  add(present('DATABASE_URL') ? 'PASS' : env.INTERNAL_ALPHA_USE_SHARED_API === 'true' ? 'WARN' : 'WARN', 'PostgreSQL configuration', present('DATABASE_URL') ? 'DATABASE_URL is present (value withheld)' : env.INTERNAL_ALPHA_USE_SHARED_API === 'true' ? 'shared Alpha API selected; local database is not required' : 'not set; a durable Alpha API needs PostgreSQL');
  add(present('TEST_DATABASE_URL') ? 'PASS' : 'WARN', 'test database configuration', present('TEST_DATABASE_URL') ? 'TEST_DATABASE_URL is present (value withheld)' : 'not set; local PostgreSQL integration tests will not run');

  if (present('DATABASE_URL')) add(present('LLM_SECRET_ENCRYPTION_KEY') ? 'PASS' : 'FAIL', 'LLM settings encryption key', present('LLM_SECRET_ENCRYPTION_KEY') ? 'configured (value withheld)' : 'required by the API when DATABASE_URL is configured');
  const devAuth = present('DEV_EXTENSION_AUTH_ENABLED') || present('DEV_EXTENSION_AUTH_TOKEN') || present('DEV_EXTENSION_TENANT_ID') || present('DEV_EXTENSION_ORIGINS');
  if (devAuth) add(env.DEV_EXTENSION_AUTH_ENABLED === 'true' && present('DEV_EXTENSION_AUTH_TOKEN') && present('DEV_EXTENSION_TENANT_ID') && present('DEV_EXTENSION_ORIGINS') ? 'PASS' : 'FAIL', 'development extension authentication', 'required names are checked; values are withheld');
  else add('WARN', 'development extension authentication', 'not configured in this shell; obtain configuration from the designated maintainer');

  try {
    add('PASS', 'Git commit', `commit ${run('git', ['rev-parse', '--short', 'HEAD'])}`);
    const dirty = run('git', ['status', '--porcelain']);
    add(dirty ? 'WARN' : 'PASS', 'working tree', dirty ? 'working tree has changes' : 'clean');
  } catch {
    add('WARN', 'Git', 'Git metadata is unavailable; version cannot be recorded');
  }
  return rows;
}

export function summarize(rows) {
  const failed = rows.filter((row) => row.status === 'FAIL').length;
  const warned = rows.filter((row) => row.status === 'WARN').length;
  return { failed, warned, exitCode: failed > 0 ? 1 : 0 };
}
