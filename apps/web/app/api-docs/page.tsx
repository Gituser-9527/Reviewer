const endpoints = [
  ['POST', '/api/product/tenants', '注册租户并选择套餐'],
  ['POST', '/api/product/tenants/{tenantId}/api-keys', '生成 API Key'],
  ['POST', '/api/audit/job', '提交单条岗位审核'],
  ['POST', '/api/audit/batch', '批量提交岗位审核'],
  ['GET', '/api/product/tenants/{tenantId}/usage', '查看用量和剩余额度'],
  ['GET', '/api/audit/runs/{auditId}/export?format=csv|pdf', '导出审核报告'],
  ['POST', '/api/product/tenants/{tenantId}/webhooks', '配置审核完成 Webhook'],
];

export default function ApiDocsPage() {
  return (
    <main className="docs-page">
      <section className="docs-hero">
        <p className="eyebrow">SaaS/API MVP</p>
        <h1>招聘岗位合规审核 Agent API</h1>
        <p>
          面向企业和平台方试用的 API 能力，包括 API Key、套餐额度、批量审核、报告导出和
          Webhook 回调。
        </p>
      </section>

      <section className="docs-card">
        <h2>认证方式</h2>
        <pre>{`Authorization: Bearer jca_xxxx_secret\nx-api-key: jca_xxxx_secret`}</pre>
      </section>

      <section className="docs-card">
        <h2>主要接口</h2>
        <div className="endpoint-list">
          {endpoints.map(([method, path, description]) => (
            <article className="endpoint-item" key={`${method}-${path}`}>
              <span>{method}</span>
              <code>{path}</code>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="docs-card">
        <h2>单条审核请求示例</h2>
        <pre>{`{
  "tenantId": "tenant_001",
  "jobPostingId": "job_001",
  "company": { "name": "某某科技有限公司" },
  "job": {
    "title": "行政专员",
    "description": "限女性，入职需缴纳服装费"
  },
  "options": {
    "jurisdiction": "CN_MAINLAND",
    "enableRag": true
  }
}`}</pre>
      </section>
    </main>
  );
}
