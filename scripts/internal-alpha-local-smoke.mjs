#!/usr/bin/env node
/* global URL, chrome, clearTimeout, console, fetch, setTimeout */
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import pg from 'pg';
import { chromium } from 'playwright';
import {
  assertApprovedManifestPermissions,
  assertNoSensitiveArgs,
  createCleanupStack,
  createExactExtensionOrigin,
  createSessionId,
  isLoopbackHttpUrl,
  manualSmokeSteps,
  redactSensitiveText,
  sanitizeSummary,
} from './internal-alpha-local-smoke-lib.mjs';

const localFixture = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>LOCAL INTERNAL ALPHA SMOKE</title><script id="job-json" type="application/ld+json">{"@context":"https://schema.org","@type":"JobPosting","title":"本地脱敏后端工程师","description":"负责服务端开发与稳定性建设。","hiringOrganization":{"name":"本地脱敏示例公司"},"jobLocation":{"address":"本地测试"},"employmentType":"FULL_TIME"}</script></head><body><main><p><strong>LOCAL INTERNAL ALPHA SMOKE — 仅本地脱敏夹具</strong></p><button id="change-job" type="button" onclick="window.changeLocalSmokeJob()">手动触发岗位身份变化</button><h1>本地脱敏后端工程师</h1><p id="job-description">负责服务端开发与稳定性建设。</p></main><script>window.changeLocalSmokeJob=()=>{const job={"@context":"https://schema.org","@type":"JobPosting",title:"本地脱敏平台工程师",description:"负责平台稳定性建设。",hiringOrganization:{name:"本地脱敏示例公司"},jobLocation:{address:"本地测试"},employmentType:"FULL_TIME"};document.querySelector('#job-json').textContent=JSON.stringify(job);document.querySelector('h1').textContent=job.title;document.querySelector('#job-description').textContent=job.description;history.pushState({},'', '/fixture?changed=1')};</script></body></html>`;

function command(commandName, args, options = {}) {
  assertNoSensitiveArgs([commandName, ...args], options.secrets ?? []);
  const executable = process.platform === 'win32' && commandName === 'npm' ? 'cmd.exe' : commandName;
  const executableArgs = process.platform === 'win32' && commandName === 'npm' ? ['/d', '/s', '/c', 'npm', ...args] : args;
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(executable, executableArgs, { cwd: options.cwd ?? process.cwd(), env: options.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    for (const stream of [child.stdout, child.stderr]) stream?.on('data', (value) => { output += String(value); });
    child.once('error', rejectCommand);
    child.once('exit', (code) => code === 0 ? resolveCommand(redactSensitiveText(output, options.secrets)) : rejectCommand(new Error(`Local prerequisite command failed: ${commandName} ${args.join(' ')}`)));
  });
}

function reserveLoopbackPort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = net.createServer();
    server.once('error', rejectPort);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close();
      if (!address || typeof address === 'string') rejectPort(new Error('Could not reserve a loopback port.'));
      else resolvePort(address.port);
    });
  });
}

async function waitForReady(apiBaseUrl, apiProcess) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (apiProcess.exitCode !== null) throw new Error('Local API exited before readiness.');
    try {
      const response = await fetch(`${apiBaseUrl}/health/ready`);
      if (response.status === 200) return;
    } catch {
      // Bounded local readiness retry only.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
  }
  throw new Error('Timed out waiting for local API readiness.');
}

async function stopOwnedProcess(child) {
  if (!child || child.exitCode !== null || child.killed) return;
  child.kill();
  await Promise.race([
    new Promise((resolveExit) => child.once('exit', resolveExit)),
    new Promise((resolveDelay) => setTimeout(resolveDelay, 8_000)),
  ]);
}

function requireLoopbackDatabase(databaseUrl) {
  if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required; configure only the repository local test database.');
  const parsed = new URL(databaseUrl);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)) throw new Error('Smoke Harness accepts only a loopback TEST_DATABASE_URL.');
}

async function readManifest() {
  const manifest = JSON.parse(await readFile(resolve('apps/extension/manifest.json'), 'utf8'));
  if (!assertApprovedManifestPermissions(manifest.permissions)) throw new Error('Extension manifest permissions do not match the approved baseline.');
  return manifest;
}

async function ensureNoOwnedTestDatabaseAlreadyExists(secrets) {
  const existing = await command('docker', ['compose', '-f', 'docker-compose.test.yml', 'ps', '-q', 'postgres-test'], { secrets });
  if (existing.trim()) throw new Error('A test PostgreSQL container already exists; Smoke Harness will not take ownership of it.');
}

async function waitForOperatorCompletion() {
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  const timeoutMs = 30 * 60 * 1000;
  let timeout;
  let onInterrupt;
  try {
    const completed = prompt.question('After completing the manual checklist, type DONE and press Enter: ');
    const interrupted = new Promise((_, rejectInterrupted) => {
      onInterrupt = () => rejectInterrupted(new Error('Operator interrupted the local Smoke Harness.'));
      process.once('SIGINT', onInterrupt);
    });
    const timedOut = new Promise((_, rejectTimeout) => { timeout = setTimeout(() => rejectTimeout(new Error('Local Smoke Harness timed out before manual completion.')), timeoutMs); });
    const answer = await Promise.race([completed, interrupted, timedOut]);
    if (String(answer).trim().toUpperCase() !== 'DONE') throw new Error('Manual Smoke was not confirmed with DONE.');
  } finally {
    if (timeout) clearTimeout(timeout);
    if (onInterrupt) process.removeListener('SIGINT', onInterrupt);
    prompt.close();
  }
}

async function run() {
  if (process.argv.includes('--self-test')) {
    console.log('PASS Local Smoke Harness self-test: manual-only plan and loopback guards are available.');
    return;
  }

  const databaseUrl = process.env.TEST_DATABASE_URL;
  requireLoopbackDatabase(databaseUrl);
  const sessionId = createSessionId();
  const tenantId = `local-smoke-${sessionId}`;
  const token = `local-smoke-${randomBytes(24).toString('base64url')}`;
  const encryptionKey = randomBytes(32).toString('base64');
  const secrets = [databaseUrl, token, encryptionKey];
  const cleanup = createCleanupStack();
  const startedAt = new Date().toISOString();
  const gates = { prerequisites: 'NOT VERIFIED', database: 'NOT VERIFIED', api: 'NOT VERIFIED', extension: 'NOT VERIFIED', fixture: 'NOT VERIFIED', manual: 'NOT VERIFIED', cleanup: 'NOT VERIFIED' };
  let profile;
  let fixtureServer;
  let apiProcess;
  let context;
  let pool;
  let apiBaseUrl;
  let extensionVersion;
  let manualStepsConfirmed = false;
  let counts = { auditRunCount: 0, findingCount: 0, evidenceCount: 0, tenantMatched: false, pageBindingMatched: false };
  let testDatabaseOwned = false;

  try {
    const manifest = await readManifest();
    extensionVersion = manifest.version;
    await ensureNoOwnedTestDatabaseAlreadyExists(secrets);
    cleanup.add('test database container', async () => {
      if (testDatabaseOwned) await command('npm', ['run', 'test:db:down'], { secrets });
    });
    testDatabaseOwned = true;
    await command('npm', ['run', 'test:db:up'], { secrets });
    await command('npm', ['run', 'test:db:wait'], { secrets });
    await command('npm', ['run', 'test:db:migrate'], { secrets, env: { ...process.env, DATABASE_URL: databaseUrl } });
    await command('npm', ['run', 'build:packages'], { secrets });
    await command('npm', ['run', 'build', '--workspace', '@job-compliance/api'], { secrets });
    await command('npm', ['run', 'build:extension'], { secrets });
    gates.prerequisites = 'PASS';
    gates.database = 'PASS';

    fixtureServer = createServer((request, response) => {
      if (request.url?.startsWith('/fixture')) {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(localFixture);
        return;
      }
      response.writeHead(404).end();
    });
    await new Promise((resolveServer) => fixtureServer.listen(0, '127.0.0.1', resolveServer));
    cleanup.add('local fixture server', () => new Promise((resolveServer) => fixtureServer.close(resolveServer)));
    const fixtureAddress = fixtureServer.address();
    if (!fixtureAddress || typeof fixtureAddress === 'string') throw new Error('Local fixture server is unavailable.');
    const fixtureUrl = `http://127.0.0.1:${fixtureAddress.port}/fixture`;
    if (!isLoopbackHttpUrl(fixtureUrl)) throw new Error('Fixture URL must be loopback-only.');
    gates.fixture = 'PASS';

    profile = await mkdtemp(resolve(tmpdir(), 'job-compliance-local-smoke-'));
    cleanup.add('Playwright profile', () => rm(profile, { recursive: true, force: true }));
    context = await chromium.launchPersistentContext(profile, { headless: false, args: [`--disable-extensions-except=${resolve('apps/extension')}`, `--load-extension=${resolve('apps/extension')}`] });
    cleanup.add('Playwright context', () => context.close());
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const extensionOrigin = createExactExtensionOrigin(new URL(worker.url()).host);
    const apiPort = await reserveLoopbackPort();
    apiBaseUrl = `http://127.0.0.1:${apiPort}`;
    apiProcess = spawn(process.execPath, ['apps/api/dist/server.js'], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(apiPort), DATABASE_URL: databaseUrl, LLM_SECRET_ENCRYPTION_KEY: encryptionKey, LLM_SECRET_ENCRYPTION_KEY_VERSION: 'local-smoke', DEV_EXTENSION_AUTH_ENABLED: 'true', DEV_EXTENSION_AUTH_TOKEN: token, DEV_EXTENSION_TENANT_ID: tenantId, DEV_EXTENSION_ORIGINS: extensionOrigin, LOG_LEVEL: 'error' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    cleanup.add('local API process', () => stopOwnedProcess(apiProcess));
    await waitForReady(apiBaseUrl, apiProcess);
    gates.api = 'PASS';

    const createTenant = await fetch(`${apiBaseUrl}/api/product/tenants`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tenantId, tenantName: 'Local Smoke Tenant', planId: 'free_trial', brandConfig: {} }) });
    if (createTenant.status !== 201) throw new Error('Could not create the local Smoke tenant.');
    pool = new pg.Pool({ connectionString: databaseUrl });
    cleanup.add('database connection pool', () => pool.end());
    await worker.evaluate(async (config) => { await chrome.storage.session.set({ jobComplianceDevConfig: config }); }, { apiBaseUrl, tenantId, accessToken: token });
    gates.extension = 'PASS';

    const page = await context.newPage();
    await page.route('http://**/*', async (route) => {
      if (isLoopbackHttpUrl(route.request().url())) await route.continue();
      else await route.abort('blockedbyclient');
    });
    await page.goto(fixtureUrl);
    console.log('LOCAL INTERNAL ALPHA SMOKE is ready. No extraction, audit submission, highlight, click, or page identity change has been automated.');
    console.log(`Fixture opened on loopback only: ${fixtureUrl}`);
    for (const [index, step] of manualSmokeSteps.entries()) console.log(`${index + 1}. ${step}`);
    await waitForOperatorCompletion();
    manualStepsConfirmed = true;
    const auditRuns = await pool.query('SELECT COUNT(*)::int AS count FROM audit_runs WHERE tenant_id=$1', [tenantId]);
    const findings = await pool.query('SELECT COUNT(*)::int AS count FROM audit_findings WHERE tenant_id=$1', [tenantId]);
    const evidence = await pool.query('SELECT COUNT(*)::int AS count FROM audit_evidence_links WHERE tenant_id=$1', [tenantId]);
    const state = await worker.evaluate(async () => (await chrome.storage.local.get('jobComplianceCaptureState')).jobComplianceCaptureState);
    counts = {
      auditRunCount: auditRuns.rows[0]?.count ?? 0,
      findingCount: findings.rows[0]?.count ?? 0,
      evidenceCount: evidence.rows[0]?.count ?? 0,
      tenantMatched: true,
      pageBindingMatched: Boolean(state?.binding),
    };
    gates.manual = 'NOT VERIFIED';
  } catch (error) {
    console.error(redactSensitiveText(error instanceof Error ? error.message : 'Local Smoke Harness failed.', secrets));
    process.exitCode = 1;
  } finally {
    const cleanupFailures = await cleanup.run();
    gates.cleanup = cleanupFailures.length === 0 ? 'PASS' : 'FAIL';
    const summary = sanitizeSummary({ sessionId, startedAt, endedAt: new Date().toISOString(), commit: process.env.GIT_COMMIT ?? 'local', extensionVersion, gates, manualStepsConfirmed, cleanupSucceeded: cleanupFailures.length === 0, ...counts });
    const summaryPath = resolve('.local', 'internal-alpha-smoke', `${summary.session}.json`);
    await mkdir(dirname(summaryPath), { recursive: true });
    await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 });
    console.log(`Sanitized local session summary: ${summaryPath}`);
    if (cleanupFailures.length) console.error(`Cleanup failed for ${cleanupFailures.map((failure) => failure.name).join(', ')}.`);
  }
}

await run();
