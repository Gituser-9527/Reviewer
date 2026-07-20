/* global URL, console, process, fetch, setTimeout, chrome */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { access, mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import pg from 'pg';
import { chromium } from 'playwright';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('TEST_DATABASE_URL is required for local API PostgreSQL extension E2E');
}

const extensionPath = resolve('apps/extension');
const profile = await mkdtemp(resolve(tmpdir(), 'job-compliance-extension-local-api-'));
const tenantId = `extension-e2e-${randomUUID()}`;
const otherTenantId = `extension-e2e-other-${randomUUID()}`;
const token = `local-extension-e2e-${randomBytes(24).toString('base64url')}`;
const encryptionKey = randomBytes(32).toString('base64');
const fixture = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>脱敏本地岗位 Fixture</title><script type="application/ld+json">{"@context":"https://schema.org","@type":"JobPosting","title":"行政专员","description":"负责行政支持与招聘流程协调。限女性，已婚已育优先。入职需缴纳500元服装费。","hiringOrganization":{"name":"脱敏示例科技有限公司"},"jobLocation":{"address":"北京"},"baseSalary":{"value":"8k-15k"},"employmentType":"FULL_TIME","qualifications":"熟悉行政流程"}</script></head><body><main><h1>行政专员</h1><p id="job-description">负责行政支持与招聘流程协调。限<span>女性</span>，已婚已育优先。入职需缴纳500元服装费。</p><mark id="site-mark">网站自身标记</mark><input id="uneditable-risk-text" value="限女性"></main></body></html>`;

function assertNoForbidden(value, forbidden) {
  if (Array.isArray(value)) {
    value.forEach((entry) => assertNoForbidden(entry, forbidden));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.equal(forbidden.has(key.toLowerCase()), false, `Forbidden field in persisted/request data: ${key}`);
    assertNoForbidden(child, forbidden);
  }
}

function reservePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = net.createServer();
    server.once('error', rejectPort);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        rejectPort(new Error('Could not reserve a local API port.'));
        return;
      }
      server.close((error) => error ? rejectPort(error) : resolvePort(address.port));
    });
  });
}

async function waitForReady(baseUrl, processHandle) {
  const deadline = Date.now() + 20_000;
  let processError;
  processHandle.once('exit', (code, signal) => {
    processError = new Error(`Local API exited before readiness (code=${String(code)}, signal=${String(signal)}).`);
  });
  while (Date.now() < deadline) {
    if (processError) throw processError;
    try {
      const response = await fetch(`${baseUrl}/health/ready`);
      if (response.status === 200) {
        const payload = await response.json();
        assert.equal(payload.status, 'ok');
        assert.equal(payload.checks?.postgres, 'ok');
        return;
      }
    } catch {
      // The server is still starting. The bounded retry below supplies the failure signal.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
  }
  throw new Error('Timed out waiting for the local API readiness endpoint.');
}

async function stopProcess(processHandle) {
  if (!processHandle) return;
  if (processHandle.exitCode !== null || processHandle.killed) return;
  processHandle.kill();
  await Promise.race([
    new Promise((resolveExit) => processHandle.once('exit', resolveExit)),
    new Promise((resolveDelay) => setTimeout(resolveDelay, 8_000)),
  ]);
  if (processHandle.exitCode === null) {
    throw new Error('Local API process did not stop after the E2E run.');
  }
}

async function cleanupTenant(pool, scopedTenantId) {
  await pool.query('DELETE FROM llm_usage_records WHERE tenant_id=$1', [scopedTenantId]);
  await pool.query('DELETE FROM audit_enrichment_records WHERE tenant_id=$1', [scopedTenantId]);
  await pool.query('DELETE FROM async_jobs WHERE tenant_id=$1', [scopedTenantId]);
  await pool.query('DELETE FROM audit_routing_traces WHERE tenant_id=$1', [scopedTenantId]);
  await pool.query('DELETE FROM audit_evidence_links WHERE tenant_id=$1', [scopedTenantId]);
  await pool.query('DELETE FROM audit_findings WHERE tenant_id=$1', [scopedTenantId]);
  await pool.query('DELETE FROM audit_runs WHERE tenant_id=$1', [scopedTenantId]);
  await pool.query('DELETE FROM job_postings WHERE tenant_id=$1', [scopedTenantId]);
  await pool.query('DELETE FROM llm_connections WHERE tenant_id=$1', [scopedTenantId]);
  await pool.query('DELETE FROM audit_routing_policy_versions WHERE tenant_id=$1', [scopedTenantId]);
  await pool.query('DELETE FROM audit_routing_policies WHERE tenant_id=$1', [scopedTenantId]);
}

const fixtureServer = createServer((request, response) => {
  if (request.url === '/fixture') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(fixture);
    return;
  }
  response.writeHead(404).end();
});

await new Promise((resolveServer) => fixtureServer.listen(0, '127.0.0.1', resolveServer));
const fixtureAddress = fixtureServer.address();
if (!fixtureAddress || typeof fixtureAddress === 'string') {
  throw new Error('Fixture server unavailable.');
}
const fixtureUrl = `http://127.0.0.1:${fixtureAddress.port}/fixture`;
const pool = new pg.Pool({ connectionString: databaseUrl });
let context;
let apiProcess;
const apiLogs = [];

try {
  const requiredExtensionFiles = ['manifest.json', 'popup.html', 'dist/popup.js', 'dist/background.js', 'dist/content.js'];
  for (const path of requiredExtensionFiles) {
    const exists = await access(resolve(extensionPath, path)).then(() => true).catch(() => false);
    assert.equal(exists, true, `Missing built extension file: ${path}`);
  }

  context = await chromium.launchPersistentContext(profile, {
    headless: false,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  assert.match(extensionId, /^[a-p]{32}$/u);
  const extensionOrigin = `chrome-extension://${extensionId}`;

  const apiPort = await reservePort();
  const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
  apiProcess = spawn(process.execPath, ['apps/api/dist/server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: String(apiPort),
      DATABASE_URL: databaseUrl,
      LLM_SECRET_ENCRYPTION_KEY: encryptionKey,
      LLM_SECRET_ENCRYPTION_KEY_VERSION: 'extension-e2e',
      DEV_EXTENSION_AUTH_ENABLED: 'true',
      DEV_EXTENSION_AUTH_TOKEN: token,
      DEV_EXTENSION_TENANT_ID: tenantId,
      DEV_EXTENSION_ORIGINS: extensionOrigin,
      LOG_LEVEL: 'error',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (const stream of [apiProcess.stdout, apiProcess.stderr]) {
    stream?.on('data', (buffer) => {
      apiLogs.push(String(buffer).replaceAll(token, '[redacted-token]').replaceAll(databaseUrl, '[redacted-database]'));
    });
  }
  await waitForReady(apiBaseUrl, apiProcess);

  const createdTenant = await fetch(`${apiBaseUrl}/api/product/tenants`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenantId, tenantName: 'Extension PostgreSQL E2E Tenant', planId: 'free_trial', brandConfig: {} }),
  });
  assert.equal(createdTenant.status, 201);
  assert.equal((await createdTenant.json()).tenantId, tenantId);

  const browserRequests = [];
  context.on('request', (request) => {
    if (request.url().startsWith(`${apiBaseUrl}/api/audit/`)) {
      browserRequests.push({ method: request.method(), url: request.url(), headers: request.headers(), body: request.postData() });
    }
  });

  const source = await context.newPage();
  await source.goto(fixtureUrl);
  await source.waitForLoadState('networkidle');
  const popup = await context.newPage();
  await popup.goto(`${extensionOrigin}/popup.html`);
  await popup.waitForSelector('#extract');
  await popup.locator('summary').click();
  await popup.locator('#apiBaseUrl').fill(apiBaseUrl);
  await popup.locator('#tenantId').fill(tenantId);
  await popup.locator('#accessToken').fill(token);

  await source.bringToFront();
  await popup.locator('#extract').click();
  await popup.locator('#preview').waitFor({ state: 'visible' });
  assert.equal(await popup.locator('[data-field="title"]').inputValue(), '行政专员');
  assert.equal(await popup.locator('[data-field="companyName"]').inputValue(), '脱敏示例科技有限公司');
  assert.equal(await popup.locator('[data-field="description"]').inputValue().then((value) => value.includes('服装费')), true);
  await popup.locator('[data-field="companyName"]').fill('人工修正后的脱敏示例公司');

  const postResponsePromise = popup.waitForResponse((response) => response.url() === `${apiBaseUrl}/api/audit/job` && response.request().method() === 'POST');
  await popup.locator('#submit').click();
  const postResponse = await postResponsePromise;
  assert.equal(postResponse.status(), 201);
  const postHeaders = await postResponse.allHeaders();
  assert.equal(postHeaders['access-control-allow-origin'], extensionOrigin);
  assert.equal(postHeaders['access-control-allow-credentials'], undefined);
  assert.notEqual(postHeaders['access-control-allow-origin'], '*');
  await popup.locator('#result').waitFor({ state: 'visible' });
  const decisionText = await popup.locator('#decision').textContent();
  assert.match(decisionText ?? '', /REJECT\s*·\s*CRITICAL/u);
  assert.ok((await popup.locator('#summary').textContent())?.trim());
  assert.match(await popup.locator('#findings').textContent(), /服装费|限女性/u);
  const auditIdText = await popup.locator('#auditId').textContent();
  const auditId = auditIdText?.match(/AuditRun:\s*([^·\s]+)/u)?.[1];
  assert.ok(auditId);

  const postRequest = browserRequests.find((request) => request.method === 'POST' && request.url === `${apiBaseUrl}/api/audit/job`);
  assert.ok(postRequest);
  const postBody = JSON.parse(postRequest.body ?? '{}');
  assert.equal(postBody.tenantId, tenantId);
  assert.equal(postBody.company.name, '人工修正后的脱敏示例公司');
  assert.equal(postBody.options.enableRewrite, false);
  assert.equal(postBody.options.enableRag, false);
  assertNoForbidden(postBody, new Set(['html', 'rawhtml', 'fullhtml', 'cookie', 'cookies', 'authorizationheader', 'apikey', 'secret', 'pagescripts', 'localstorage', 'sessionstorage', 'accesstoken']));

  const getResult = await popup.evaluate(async ({ apiBaseUrl: baseUrl, runId, expectedTenant }) => {
    const config = (await chrome.storage.session.get('jobComplianceDevConfig')).jobComplianceDevConfig;
    const response = await fetch(`${baseUrl}/api/audit/runs/${runId}?tenantId=${expectedTenant}`, {
      headers: { authorization: `Bearer ${config.accessToken}`, 'x-tenant-id': expectedTenant },
    });
    return { status: response.status, payload: await response.json() };
  }, { apiBaseUrl, runId: auditId, expectedTenant: tenantId });
  assert.equal(getResult.status, 200);
  assert.equal(getResult.payload.auditId, auditId);
  assert.equal(getResult.payload.context.tenantId, tenantId);
  assert.equal(getResult.payload.decision, 'REJECT');
  assert.equal(getResult.payload.riskLevel, 'CRITICAL');
  const deniedReadStatus = await popup.evaluate(async ({ apiBaseUrl: baseUrl, runId, wrongTenantId }) => {
    const config = (await chrome.storage.session.get('jobComplianceDevConfig')).jobComplianceDevConfig;
    const response = await fetch(`${baseUrl}/api/audit/runs/${runId}?tenantId=${wrongTenantId}`, {
      headers: { authorization: `Bearer ${config.accessToken}`, 'x-tenant-id': wrongTenantId },
    });
    return response.status;
  }, { apiBaseUrl, runId: auditId, wrongTenantId: otherTenantId });
  assert.equal(deniedReadStatus, 403);

  const storedAudit = await pool.query('SELECT decision, risk_level, result_payload, rule_version FROM audit_runs WHERE tenant_id=$1 AND id=$2', [tenantId, auditId]);
  assert.equal(storedAudit.rowCount, 1);
  assert.equal(storedAudit.rows[0].decision, getResult.payload.decision);
  assert.equal(storedAudit.rows[0].risk_level, getResult.payload.riskLevel);
  assert.ok(storedAudit.rows[0].rule_version);
  const storedFindings = await pool.query('SELECT finding_id, category, severity, payload FROM audit_findings WHERE tenant_id=$1 AND audit_run_id=$2 ORDER BY finding_id', [tenantId, auditId]);
  assert.ok(storedFindings.rowCount && storedFindings.rowCount > 0);
  assert.equal(storedFindings.rowCount, getResult.payload.findings.length);
  assert.equal(JSON.stringify(storedFindings.rows).includes('服装费') || JSON.stringify(storedFindings.rows).includes('限女性'), true);
  assertNoForbidden(storedAudit.rows[0].result_payload, new Set(['apikey', 'secret', 'authorization', 'prompt', 'jobpayload', 'databaseurl']));

  const storage = await popup.evaluate(async () => ({ local: await chrome.storage.local.get(null), session: await chrome.storage.session.get(null) }));
  assertNoForbidden(storage.local, new Set(['accesstoken', 'authorization', 'cookie', 'apikey', 'secret', 'rawhtml', 'html']));
  assert.equal(storage.local.jobComplianceCaptureState.capture.userCorrected, true);
  assert.equal(storage.local.jobComplianceCaptureState.result.auditId, auditId);
  assert.equal(storage.session.jobComplianceDevConfig.accessToken, token);
  assertNoForbidden(storage.local.jobComplianceCaptureState.capture, new Set(['accesstoken', 'authorization', 'cookie', 'apikey', 'secret', 'rawhtml', 'html']));

  const actualEvidence = storage.local.jobComplianceCaptureState.result.findings.flatMap((finding) => [
    ...(finding.metadata?.matchedText ?? []),
    ...finding.evidence.flatMap((evidence) => evidence.quote ? [evidence.quote] : []),
  ]).filter((value, index, values) => typeof value === 'string' && value.length >= 3 && values.indexOf(value) === index);
  assert.ok(actualEvidence.some((value) => value.includes('限女性') || value.includes('服装费')), 'The persisted real API result must include highlightable YAML-rule evidence.');

  const originalJobText = await source.locator('#job-description').textContent();
  await source.bringToFront();
  await popup.locator('#highlight').click();
  await source.locator('[data-job-compliance-highlight="true"]').first().waitFor();
  const highlightedText = await source.locator('[data-job-compliance-highlight="true"]').allTextContents();
  assert.ok(highlightedText.length > 0);
  assert.equal(highlightedText.every((text) => actualEvidence.some((evidence) => evidence.includes(text))), true, 'Every highlighted DOM fragment must come from persisted real API evidence.');
  const firstHighlightCount = await source.locator('[data-job-compliance-highlight="true"]').count();
  assert.match(await popup.locator('#status').textContent(), new RegExp(`已高亮\\s+\\d+\\s+项；\\s*\\d+\\s+项未定位。`, 'u'));

  await source.bringToFront();
  await popup.locator('#highlight').click();
  assert.equal(await source.locator('[data-job-compliance-highlight="true"]').count(), firstHighlightCount);
  assert.equal(await source.locator('[data-job-compliance-highlight="true"] [data-job-compliance-highlight="true"]').count(), 0);

  const auditCountBeforeClear = await pool.query('SELECT COUNT(*)::int AS count FROM audit_runs WHERE tenant_id=$1', [tenantId]);
  await source.bringToFront();
  await popup.locator('#clearHighlights').click();
  await source.locator('[data-job-compliance-highlight="true"]').waitFor({ state: 'detached' });
  assert.equal(await source.locator('#job-description').textContent(), originalJobText);
  assert.equal(await source.locator('#site-mark').textContent(), '网站自身标记');
  assert.equal(await source.locator('#site-mark').count(), 1);
  const auditCountAfterClear = await pool.query('SELECT COUNT(*)::int AS count FROM audit_runs WHERE tenant_id=$1', [tenantId]);
  assert.equal(auditCountAfterClear.rows[0].count, auditCountBeforeClear.rows[0].count);
  assert.match(await popup.locator('#status').textContent(), /已清除\s+\d+\s+处页面高亮。/u);

  await popup.close();
  const restored = await context.newPage();
  await restored.goto(`${extensionOrigin}/popup.html`);
  await restored.locator('#result').waitFor({ state: 'visible' });
  assert.match(await restored.locator('#auditId').textContent(), new RegExp(auditId));
  assert.equal(await restored.locator('[data-field="companyName"]').inputValue(), '人工修正后的脱敏示例公司');
  assert.match(await restored.locator('#findings').textContent(), /服装费|限女性/u);

  const countBeforeDenied = await pool.query('SELECT COUNT(*)::int AS count FROM audit_runs WHERE tenant_id IN ($1,$2)', [tenantId, otherTenantId]);
  await restored.locator('summary').click();
  await restored.locator('#tenantId').fill(otherTenantId);
  const deniedResponsePromise = restored.waitForResponse((response) => response.url() === `${apiBaseUrl}/api/audit/job` && response.request().method() === 'POST');
  await restored.locator('#submit').click();
  const deniedResponse = await deniedResponsePromise;
  assert.equal(deniedResponse.status(), 403);
  assert.equal((await deniedResponse.allHeaders())['access-control-allow-origin'], extensionOrigin);
  await restored.locator('#status').waitFor({ hasText: '提交失败' });
  const countAfterDenied = await pool.query('SELECT COUNT(*)::int AS count FROM audit_runs WHERE tenant_id IN ($1,$2)', [tenantId, otherTenantId]);
  assert.equal(countAfterDenied.rows[0].count, countBeforeDenied.rows[0].count);
  const deniedRequest = browserRequests.filter((request) => request.method === 'POST' && request.url === `${apiBaseUrl}/api/audit/job`).at(-1);
  assert.ok(deniedRequest);
  assert.equal(JSON.parse(deniedRequest.body ?? '{}').tenantId, otherTenantId);
  await restored.close();

  console.log('Local API PostgreSQL browser extension E2E passed with real Chromium, API, CORS, auth, and PostgreSQL.');
} catch (error) {
  const sanitizedLogs = apiLogs.join('').replaceAll(token, '[redacted-token]').replaceAll(databaseUrl, '[redacted-database]');
  if (sanitizedLogs.trim()) console.error(`Local API diagnostic output: ${sanitizedLogs.slice(-4_000)}`);
  throw error;
} finally {
  await context?.close();
  await stopProcess(apiProcess).catch(() => undefined);
  await cleanupTenant(pool, tenantId).catch(() => undefined);
  await cleanupTenant(pool, otherTenantId).catch(() => undefined);
  await pool.end();
  await new Promise((resolveServer) => fixtureServer.close(resolveServer));
  await rm(profile, { recursive: true, force: true });
}
