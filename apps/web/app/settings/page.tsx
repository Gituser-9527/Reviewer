'use client';

import { useEffect, useState } from 'react';
type Connection = { id: string; displayName: string; provider: string; auditModel: string; status: string; isDefault: boolean; apiKeyMasked?: string; lastVerifiedAt?: string };
export default function SettingsPage() {
  const [tenantId, setTenantId] = useState('tenant_web'); const [items, setItems] = useState<Connection[]>([]); const [error, setError] = useState<string>();
  const load = async () => { const response = await fetch(`/api/settings/llm-connections?tenantId=${encodeURIComponent(tenantId)}`); if (!response.ok) { setError('无法读取模型配置。'); return; } setItems((await response.json() as {items: Connection[]}).items); };
  useEffect(() => { void load(); }, []);
  return <main className="workspace"><section className="audit-form"><p className="section-label">AI Models / 模型配置</p><h1>租户模型连接</h1><p>密钥只在提交时发送，列表仅展示掩码；验证通过后才可设为默认。</p><label><span>租户 ID</span><input value={tenantId} onChange={(event) => setTenantId(event.target.value)} /></label><button className="submit-button" onClick={() => void load()}>刷新状态</button>{error ? <p className="error-message">{error}</p> : null}<div className="finding-list">{items.length === 0 ? <p className="empty-state">尚未配置模型连接。</p> : items.map((item) => <article className="finding-card" key={item.id}><h3>{item.displayName}</h3><p>{item.provider} · {item.auditModel} · {item.apiKeyMasked ?? '密钥已安全保存'}</p><p>状态：{item.status}{item.isDefault ? ' · 默认' : ''}</p></article>)}</div></section><aside className="review-note"><span>Audit Routing / 审核路由</span><p>确定性规则优先；语义模型故障时，核心审核按租户策略降级并保留路由轨迹。</p><a className="text-link" href={`/api/settings/llm-routing?tenantId=${encodeURIComponent(tenantId)}`}>查看当前路由策略</a></aside></main>;
}
