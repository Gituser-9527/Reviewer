/* global URL */
import { createHash, randomUUID } from 'node:crypto';

export const approvedManifestPermissions = Object.freeze(['activeTab', 'storage', 'tabs']);

export const manualSmokeSteps = Object.freeze([
  '在 Chromium 工具栏中手动打开扩展 Popup。',
  '手动提取当前脱敏岗位，并查看提取结果。',
  '人工修正至少一个允许修正的字段。',
  '手动点击提交审核，等待结果并查看 Findings 与 Evidence。',
  '手动执行高亮，再手动清除高亮。',
  '在本地夹具中手动触发岗位页面身份变化。',
  '确认旧结果进入 STALE，提交与高亮操作被禁用。',
  '重新加载有效岗位，确认没有自动提取、自动审核或自动高亮。',
  '回到终端，确认本次人工 Smoke 已结束。',
]);

export function isLoopbackHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

export function createExactExtensionOrigin(extensionId) {
  if (!/^[a-p]{32}$/u.test(extensionId)) throw new Error('Extension service worker did not provide a valid dynamic ID.');
  return `chrome-extension://${extensionId}`;
}

export function createSessionId() {
  return randomUUID();
}

export function shortHash(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

export function redactSensitiveText(value, secrets = []) {
  let text = String(value ?? '');
  for (const secret of secrets.filter(Boolean)) text = text.split(secret).join('[redacted]');
  return text
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/giu, '[redacted-database]')
    .replace(/bearer\s+[^\s"']+/giu, 'Bearer [redacted]')
    .replace(/authorization\s*[:=]\s*[^\s,;]+/giu, 'authorization=[redacted]');
}

export function sanitizeSummary(input) {
  const sessionId = String(input.sessionId ?? '');
  const commit = String(input.commit ?? '');
  return {
    session: shortHash(sessionId),
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    mainCommit: commit.slice(0, 12),
    extensionVersion: input.extensionVersion,
    gates: input.gates,
    manualStepsConfirmed: Boolean(input.manualStepsConfirmed),
    auditRunCount: Number(input.auditRunCount ?? 0),
    findingCount: Number(input.findingCount ?? 0),
    evidenceCount: Number(input.evidenceCount ?? 0),
    tenantMatched: Boolean(input.tenantMatched),
    pageBindingMatched: Boolean(input.pageBindingMatched),
    cleanupSucceeded: Boolean(input.cleanupSucceeded),
  };
}

export function createCleanupStack() {
  const tasks = [];
  let completed = false;
  return {
    add(name, task) {
      if (completed) throw new Error('Cleanup has already completed.');
      tasks.push({ name, task });
    },
    async run() {
      if (completed) return [];
      completed = true;
      const failures = [];
      while (tasks.length) {
        const current = tasks.pop();
        try {
          await current.task();
        } catch (error) {
          failures.push({ name: current.name, message: error instanceof Error ? error.message : 'cleanup failed' });
        }
      }
      return failures;
    },
  };
}

export function assertNoSensitiveArgs(args, secrets) {
  const joined = args.join('\u0000');
  for (const secret of secrets.filter(Boolean)) {
    if (joined.includes(secret)) throw new Error('Sensitive value must not be passed through command-line arguments.');
  }
}

export function assertApprovedManifestPermissions(permissions) {
  return Array.isArray(permissions)
    && permissions.length === approvedManifestPermissions.length
    && permissions.every((permission, index) => permission === approvedManifestPermissions[index]);
}
