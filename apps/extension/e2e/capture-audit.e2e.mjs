/* global URL, console */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';

const extensionPath = resolve('apps/extension');
const profile = await mkdtemp(resolve(tmpdir(), 'job-compliance-extension-'));
const requests = [];
const fixture = `<!doctype html><title>脱敏招聘 Fixture</title><script>const ignored='限女性';</script><script type="application/ld+json">{"@context":"https://schema.org","@type":"JobPosting","title":"行政专员","description":"负责行政支持。限女性，已婚已育优先。","hiringOrganization":{"name":"示例科技有限公司"},"jobLocation":{"address":"北京"},"baseSalary":{"value":"8k-15k"},"employmentType":"FULL_TIME","qualifications":"熟悉行政流程"}</script><main><h1>行政专员</h1><p id="job-description">负责行政支持。限<span>女性</span>，已婚已育优先。</p><input value="限女性"><mark id="site-mark">网站自身标记</mark></main>`;
const server = createServer(async (request, response) => {
  if (request.url === '/fixture') { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); response.end(fixture); return; }
  if (request.url === '/api/audit/job' && request.method === 'POST') {
    let body = ''; for await (const chunk of request) body += chunk;
    const parsed = JSON.parse(body); requests.push({ headers: request.headers, body: parsed });
    assert.equal(request.headers.authorization, 'Bearer e2e-placeholder');
    assert.equal(parsed.tenantId, 'e2e-tenant'); assert.equal(parsed.company.name, '修正后的示例公司');
    assert.equal(parsed.job.description.includes('限女性'), true);
    assert.equal(JSON.stringify(parsed).toLowerCase().includes('html'), false);
    assert.equal(JSON.stringify(parsed).toLowerCase().includes('cookie'), false);
    response.writeHead(201, { 'content-type': 'application/json' }); response.end(JSON.stringify({ auditId:'browser-e2e-audit',decision:'MANUAL_REVIEW',riskLevel:'HIGH',summary:'发现风险，建议人工复核。',findings:[{category:'DISCRIMINATION',severity:'HIGH',message:'岗位包含性别限制。',evidence:[{title:'岗位原文',quote:'限女性'}],metadata:{matchedText:['限女性']}}],createdAt:'2026-07-17T00:00:00.000Z' })); return;
  }
  response.writeHead(404); response.end();
});
await new Promise(resolveServer => server.listen(0, '127.0.0.1', resolveServer));
const address = server.address(); if (!address || typeof address === 'string') throw new Error('Fixture server unavailable');
const baseUrl = `http://127.0.0.1:${address.port}`;
let context;
try {
  context = await chromium.launchPersistentContext(profile, { headless: false, args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  assert.ok(extensionId);
  const source = await context.newPage(); await source.goto(`${baseUrl}/fixture`); await source.waitForLoadState('networkidle');
  const popup = await context.newPage(); await popup.goto(`chrome-extension://${extensionId}/popup.html`); await popup.waitForSelector('#extract'); await popup.locator('summary').click();
  await popup.locator('#apiBaseUrl').fill(baseUrl); await popup.locator('#tenantId').fill('e2e-tenant'); await popup.locator('#accessToken').fill('e2e-placeholder');
  await source.bringToFront(); await popup.locator('#extract').click();
  await popup.locator('#preview').waitFor({ state:'visible' });
  assert.equal(await popup.locator('[data-field="title"]').inputValue(), '行政专员');
  await popup.locator('[data-field="companyName"]').fill('修正后的示例公司');
  await popup.locator('#submit').dblclick();
  await popup.locator('#result').waitFor({ state:'visible' });
  assert.match(await popup.locator('#decision').textContent(), /MANUAL_REVIEW/);
  assert.match(await popup.locator('#findings').textContent(), /限女性/);
  assert.equal(requests.length, 1);
  await source.bringToFront(); await popup.locator('#highlight').click();
  await source.locator('[data-job-compliance-highlight="true"]').first().waitFor();
  assert.equal(await source.locator('[data-job-compliance-highlight="true"]').count(), 2);
  assert.equal(await source.locator('#job-description').textContent(), '负责行政支持。限女性，已婚已育优先。');
  assert.equal(await source.locator('input').inputValue(), '限女性');
  assert.equal(await source.locator('#site-mark').textContent(), '网站自身标记');
  await popup.locator('#highlight').click();
  assert.equal(await source.locator('[data-job-compliance-highlight="true"] [data-job-compliance-highlight="true"]').count(), 0);
  await popup.locator('#clearHighlights').click();
  assert.equal(await source.locator('[data-job-compliance-highlight="true"]').count(), 0);
  assert.equal(await source.locator('#job-description').textContent(), '负责行政支持。限女性，已婚已育优先。');
  await popup.close();
  const restored = await context.newPage(); await restored.goto(`chrome-extension://${extensionId}/popup.html`); await restored.locator('#result').waitFor({ state:'visible' });
  assert.match(await restored.locator('#decision').textContent(), /MANUAL_REVIEW/);
  assert.equal(await restored.locator('[data-field="companyName"]').inputValue(), '修正后的示例公司');
  console.log('Browser extension E2E passed with a real Chromium extension context.');
} finally { await context?.close(); await new Promise(resolveServer => server.close(resolveServer)); await rm(profile, { recursive:true, force:true }); }
