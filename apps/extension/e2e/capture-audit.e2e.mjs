/* global URL, console, window, chrome */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';

const extensionPath = resolve('apps/extension');
const profile = await mkdtemp(resolve(tmpdir(), 'job-compliance-extension-'));
const requests = [];
const fixture = `<!doctype html><title>脱敏招聘 Fixture</title><script>const ignored='限女性';const jobs={a:{title:'行政专员',description:'负责行政支持。限女性，已婚已育优先。',company:'示例科技有限公司'},b:{title:'后端工程师',description:'负责服务端开发，不限性别。',company:'示例技术有限公司'}};window.switchJob=(id,method='push')=>{const job=jobs[id];document.querySelector('#job-json').textContent=JSON.stringify({'@context':'https://schema.org','@type':'JobPosting',title:job.title,description:job.description,hiringOrganization:{name:job.company},jobLocation:{address:'北京'},baseSalary:{value:'8k-15k'},employmentType:'FULL_TIME',qualifications:'熟悉流程'});document.querySelector('main').innerHTML='<h1>'+job.title+'</h1><p id="job-description">'+job.description+'</p><p hidden>限女性</p><input value="限女性"><mark id="site-mark">网站自身标记</mark>';history[method+'State']({},'', '/fixture?job='+id)};</script><script id="job-json" type="application/ld+json">{"@context":"https://schema.org","@type":"JobPosting","title":"行政专员","description":"负责行政支持。限女性，已婚已育优先。","hiringOrganization":{"name":"示例科技有限公司"},"jobLocation":{"address":"北京"},"baseSalary":{"value":"8k-15k"},"employmentType":"FULL_TIME","qualifications":"熟悉行政流程"}</script><main><h1>行政专员</h1><p id="job-description">负责行政支持。限<span>女性</span>，已婚已育优先。</p><p hidden>限女性</p><p aria-hidden="true">限女性</p><p style="display:none">限女性</p><input value="限女性"><mark id="site-mark">网站自身标记</mark></main>`;
const server = createServer(async (request, response) => {
  if (request.url === '/fixture') { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); response.end(fixture); return; }
  if (request.url === '/api/audit/job' && request.method === 'POST') {
    let body = ''; for await (const chunk of request) body += chunk;
    const parsed = JSON.parse(body); const firstAudit = requests.length === 0; requests.push({ headers: request.headers, body: parsed });
    assert.equal(request.headers.authorization, 'Bearer e2e-placeholder');
    assert.equal(parsed.tenantId, 'e2e-tenant'); assert.equal(parsed.company.name, firstAudit ? '修正后的示例公司' : '示例技术有限公司');
    assert.equal(parsed.job.description.includes('限女性'), firstAudit);
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
let source;
let popup;
let phase = 'initializing';
const logPhase = (name) => { phase = name; console.log(`[extension-e2e] phase=${name}`); };
async function reportFailure(error) {
  const state = await popup?.evaluate(async () => {
    const saved = (await chrome.storage.local.get('jobComplianceCaptureState')).jobComplianceCaptureState;
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const tab = tabs[0];
    return {
      capture: Boolean(saved?.capture), lifecycle: saved?.lifecycle?.status ?? 'EMPTY',
      pageIdentity: saved?.binding ? 'bound' : 'unknown', generation: Boolean(saved?.binding?.generation),
      tabMatches: typeof tab?.id === 'number' && tab.id === saved?.binding?.tabId,
      activeTabType: tab?.url?.startsWith('chrome-extension:') ? 'extension' : tab?.url?.startsWith('http') ? 'web' : 'unknown',
    };
  }).catch(() => undefined);
  console.error(`[extension-e2e] diagnostics phase=${phase} popupOpen=${!popup?.isClosed()} sourceOpen=${!source?.isClosed()} workerAlive=${Boolean(context?.serviceWorkers().length)} submitDisabled=${await popup?.locator('#submit').isDisabled().catch(() => undefined)} capture=${state?.capture ?? 'unknown'} lifecycle=${state?.lifecycle ?? 'unknown'} pageIdentity=${state?.pageIdentity ?? 'unknown'} generation=${state?.generation ?? 'unknown'} tabMatches=${state?.tabMatches ?? 'unknown'} activeTabType=${state?.activeTabType ?? 'unknown'} error=${error instanceof Error ? error.name : 'UnknownError'}`);
}
try {
  context = await chromium.launchPersistentContext(profile, { headless: false, args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  assert.ok(extensionId);
  logPhase('extension-loaded');
  source = await context.newPage(); await source.goto(`${baseUrl}/fixture`); await source.waitForLoadState('networkidle');
  logPhase('fixture-opened');
  popup = await context.newPage(); await popup.goto(`chrome-extension://${extensionId}/popup.html`); await popup.waitForSelector('#extract'); await popup.locator('summary').click();
  logPhase('popup-opened');
  await popup.locator('#apiBaseUrl').fill(baseUrl); await popup.locator('#tenantId').fill('e2e-tenant'); await popup.locator('#accessToken').fill('e2e-placeholder');
  logPhase('configuration-ready');
  await source.bringToFront(); await popup.locator('#extract').click();
  await popup.locator('#preview').waitFor({ state:'visible' });
  logPhase('job-captured');
  assert.equal(await popup.locator('[data-field="title"]').inputValue(), '行政专员');
  await popup.locator('[data-field="companyName"]').fill('修正后的示例公司');
  await popup.locator('#submit').waitFor({ state: 'visible' });
  assert.equal(await popup.locator('#submit').isDisabled(), false);
  logPhase('submit-enabled');
  await popup.locator('#submit').dblclick();
  logPhase('audit-submitted');
  await popup.locator('#result').waitFor({ state:'visible' });
  assert.match(await popup.locator('#decision').textContent(), /MANUAL_REVIEW/);
  assert.match(await popup.locator('#findings').textContent(), /限女性/);
  assert.equal(requests.length, 1);
  await source.bringToFront(); await popup.locator('#highlight').click();
  await source.locator('[data-job-compliance-highlight="true"]').first().waitFor();
  assert.equal(await source.locator('[data-job-compliance-highlight="true"]').count(), 2);
  assert.equal(await source.locator('[hidden] [data-job-compliance-highlight="true"], [aria-hidden="true"] [data-job-compliance-highlight="true"], [style*="display:none"] [data-job-compliance-highlight="true"]').count(), 0);
  assert.equal(await source.locator('#job-description').textContent(), '负责行政支持。限女性，已婚已育优先。');
  assert.equal(await source.locator('input').inputValue(), '限女性');
  assert.equal(await source.locator('#site-mark').textContent(), '网站自身标记');
  await popup.locator('#highlight').dblclick();
  assert.equal(await source.locator('[data-job-compliance-highlight="true"] [data-job-compliance-highlight="true"]').count(), 0);
  await popup.locator('#clearHighlights').click();
  assert.equal(await source.locator('[data-job-compliance-highlight="true"]').count(), 0);
  assert.equal(await source.locator('#job-description').textContent(), '负责行政支持。限女性，已婚已育优先。');
  await popup.close();
  const restored = await context.newPage(); popup = restored; await restored.goto(`chrome-extension://${extensionId}/popup.html`); await restored.locator('#result').waitFor({ state:'visible' });
  assert.match(await restored.locator('#decision').textContent(), /MANUAL_REVIEW/);
  assert.equal(await restored.locator('[data-field="companyName"]').inputValue(), '修正后的示例公司');
  await source.bringToFront();
  await source.evaluate(() => { globalThis.history.pushState({}, '', '/fixture?job=missing'); globalThis.document.querySelector('#job-json')?.remove(); globalThis.document.querySelector('main')?.replaceChildren(); });
  await restored.locator('#status').filter({ hasText: '旧审核结果已失效' }).waitFor();
  assert.equal(await source.locator('[data-job-compliance-highlight="true"]').count(), 0);
  assert.equal(await restored.locator('#highlight').isDisabled(), true);
  assert.equal(await restored.locator('#submit').isDisabled(), true);
  await restored.locator('#extract').click();
  await restored.locator('#status').filter({ hasText: '未检测到可审核的岗位信息' }).waitFor();
  assert.equal(await restored.locator('#submit').isDisabled(), true);
  assert.equal(await restored.locator('#result').isHidden(), true);
  assert.equal(await restored.locator('#submit').isDisabled(), true);
  await source.evaluate(() => { const script = globalThis.document.createElement('script'); script.id = 'job-json'; script.type = 'application/ld+json'; globalThis.document.head.append(script); window.switchJob('b', 'push'); });
  await restored.locator('#extract').click();
  await restored.locator('#preview').waitFor({ state:'visible' });
  assert.equal(await restored.locator('[data-field="title"]').inputValue(), '后端工程师');
  assert.equal(await restored.locator('#result').isHidden(), true);
  assert.equal(await restored.locator('#submit').isDisabled(), false);
  await restored.locator('#submit').click();
  await restored.locator('#result').waitFor({ state:'visible' });
  await source.evaluate(() => {
    const json = globalThis.document.querySelector('#job-json');
    const title = globalThis.document.querySelector('h1');
    const description = globalThis.document.querySelector('#job-description');
    if (json?.firstChild) json.firstChild.data = JSON.stringify({ '@context':'https://schema.org', '@type':'JobPosting', title:'平台工程师', description:'负责平台稳定性建设。', hiringOrganization:{ name:'示例技术有限公司' } });
    if (title?.firstChild) title.firstChild.data = '平台工程师';
    if (description?.firstChild) description.firstChild.data = '负责平台稳定性建设。';
  });
  await restored.locator('#status').filter({ hasText: '旧审核结果已失效' }).waitFor();
  assert.equal(await restored.locator('#result').isHidden(), true);
  assert.equal(await restored.locator('#highlight').isDisabled(), true);
  assert.equal(await restored.locator('#submit').isDisabled(), true);
  logPhase('passed');
  console.log('Browser extension E2E passed with a real Chromium extension context.');
} catch (error) {
  await reportFailure(error);
  throw error;
} finally { await context?.close(); await new Promise(resolveServer => server.close(resolveServer)); await rm(profile, { recursive:true, force:true }); }
