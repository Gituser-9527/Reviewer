import { AdapterRegistry } from '../adapters/registry.js';
import { toPageContext } from '../extraction/page-context.js';
import type { ExtensionMessage } from '../messaging/protocol.js';

const status = document.querySelector('#status'); const preview = document.querySelector('#preview'); const button = document.querySelector('#read');
button?.addEventListener('click', async () => {
  if (status) status.textContent = '正在读取当前页面…';
  const response = await chrome.runtime.sendMessage({ type: 'WEB_CAPTURE_READ_CURRENT_PAGE' } satisfies ExtensionMessage) as { type: string; payload?: unknown };
  if (response.type !== 'WEB_CAPTURE_PAGE_SNAPSHOT' || response.payload === undefined) { if (status) status.textContent = '未能读取当前页面。'; return; }
  const capture = await new AdapterRegistry().resolve(toPageContext(response.payload as never)).extract(toPageContext(response.payload as never));
  if (status) status.textContent = '已完成本地预览；尚未上传或调用审核。'; if (preview) preview.textContent = JSON.stringify(capture, null, 2);
});
