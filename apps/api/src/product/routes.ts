import type { AuditResult } from '@job-compliance/shared';
import type { FastifyInstance } from 'fastify';
import type { AuditJobHandler } from '../audit/routes.js';
import type { AuditRunStore } from '../audit/store.js';
import type { AuthServices } from '../auth/service.js';
import type { BetaTrialService } from '../beta-trial/service.js';
import type { HumanReviewStore } from '../reviews/store.js';
import type { RuntimeServices } from '../runtime/services.js';
import { exportAuditResultCsv, exportAuditResultPdf } from './report-export.js';
import {
  apiKeyParamsSchema,
  createApiKeySchema,
  createTenantSchema,
  createWebhookSchema,
  exportAuditReportQuerySchema,
  tenantParamsSchema,
  updateBrandSchema,
} from './schemas.js';
import type { ProductService } from './service.js';

export interface ProductRoutesDependencies {
  productService: ProductService;
  auditRunStore: AuditRunStore;
  reviewStore?: HumanReviewStore;
  runtimeServices?: RuntimeServices;
  betaTrialService?: BetaTrialService;
  authServices?: AuthServices;
  auditJob?: AuditJobHandler;
}

function notFound(requestId: string, code: string, message: string): Record<string, unknown> {
  return {
    requestId,
    error: { code, message, retryable: false },
  };
}

function apiDocsHtml(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>Job Compliance Agent API</title>
<style>body{font-family:Inter,Arial,sans-serif;max-width:960px;margin:40px auto;padding:0 20px;line-height:1.6}code,pre{background:#f4f6f8;padding:2px 6px;border-radius:6px}pre{padding:16px;overflow:auto}.pill{display:inline-block;background:#e8f2ff;color:#075985;padding:2px 8px;border-radius:999px}</style></head>
<body>
<h1>Job Compliance Audit Agent API</h1>
<p><span class="pill">MVP SaaS/API</span> 使用 API Key 调用招聘岗位合规审核、批量审核、导出报告和 Webhook。</p>
<h2>认证</h2>
<pre>Authorization: Bearer jca_xxxx_secret
x-api-key: jca_xxxx_secret</pre>
<h2>核心接口</h2>
<ul>
<li>POST /api/product/tenants - 注册租户</li>
<li>POST /api/product/tenants/{tenantId}/api-keys - 创建 API Key</li>
<li>POST /api/audit/job - 单条审核</li>
<li>POST /api/audit/batch - 批量审核</li>
<li>GET /api/audit/runs/{id}/export?format=csv|pdf - 导出报告</li>
<li>POST /api/product/tenants/{tenantId}/webhooks - 配置 Webhook</li>
</ul>
<h2>单条审核示例</h2>
<pre>{
  "tenantId": "tenant_001",
  "jobPostingId": "job_001",
  "company": {"name": "某某科技有限公司"},
  "job": {"title": "行政专员", "description": "限女性，入职需缴纳服装费"},
  "options": {"jurisdiction": "CN_MAINLAND", "enableRag": true}
}</pre>
</body></html>`;
}

export function registerProductRoutes(
  app: FastifyInstance,
  dependencies: ProductRoutesDependencies,
): void {
  app.get('/api/docs', async (_request, reply) => {
    return reply.type('text/html; charset=utf-8').send(apiDocsHtml());
  });

  app.get('/api/product/plans', async (_request, reply) => {
    return reply.send({ items: dependencies.productService.listPlans() });
  });

  app.post('/api/product/tenants', async (request, reply) => {
    const body = createTenantSchema.parse(request.body);
    const tenant = dependencies.productService.createTenant(body);
    return reply.code(201).send(tenant);
  });

  app.get('/api/product/tenants/:tenantId', async (request, reply) => {
    const params = tenantParamsSchema.parse(request.params);
    dependencies.authServices?.authService.requireTenantAccess(request, params.tenantId);
    const tenant = dependencies.productService.getTenant(params.tenantId);
    if (tenant === undefined) {
      return reply
        .code(404)
        .send(notFound(request.id, 'TENANT_NOT_FOUND', 'Tenant was not found.'));
    }
    return reply.send(tenant);
  });

  app.patch('/api/product/tenants/:tenantId/brand', async (request, reply) => {
    const params = tenantParamsSchema.parse(request.params);
    dependencies.authServices?.authService.requireTenantAccess(request, params.tenantId);
    const body = updateBrandSchema.parse(request.body);
    const tenant = dependencies.productService.updateBrand(params.tenantId, body);
    if (tenant === undefined) {
      return reply
        .code(404)
        .send(notFound(request.id, 'TENANT_NOT_FOUND', 'Tenant was not found.'));
    }
    return reply.send(tenant);
  });

  app.post('/api/product/tenants/:tenantId/api-keys', async (request, reply) => {
    const params = tenantParamsSchema.parse(request.params);
    dependencies.authServices?.authService.requireTenantAccess(request, params.tenantId);
    const body = createApiKeySchema.parse(request.body);
    const key = dependencies.productService.createApiKey(params.tenantId, body);
    return reply.code(201).send(key);
  });

  app.get('/api/product/tenants/:tenantId/api-keys', async (request, reply) => {
    const params = tenantParamsSchema.parse(request.params);
    dependencies.authServices?.authService.requireTenantAccess(request, params.tenantId);
    return reply.send({ items: dependencies.productService.listApiKeys(params.tenantId) });
  });

  app.delete('/api/product/api-keys/:id', async (request, reply) => {
    const params = apiKeyParamsSchema.parse(request.params);
    const key = dependencies.productService.revokeApiKey(params.id);
    if (key === undefined) {
      return reply
        .code(404)
        .send(notFound(request.id, 'API_KEY_NOT_FOUND', 'API key was not found.'));
    }
    dependencies.authServices?.authService.requireTenantAccess(request, key.tenantId);
    return reply.send(key);
  });

  app.get('/api/product/tenants/:tenantId/usage', async (request, reply) => {
    const params = tenantParamsSchema.parse(request.params);
    dependencies.authServices?.authService.requireTenantAccess(request, params.tenantId);
    return reply.send(dependencies.productService.getUsage(params.tenantId));
  });

  app.post('/api/product/tenants/:tenantId/webhooks', async (request, reply) => {
    const params = tenantParamsSchema.parse(request.params);
    dependencies.authServices?.authService.requireTenantAccess(request, params.tenantId);
    const body = createWebhookSchema.parse(request.body);
    const webhook = dependencies.productService.createWebhook(params.tenantId, body);
    return reply.code(201).send(webhook);
  });

  app.get('/api/product/tenants/:tenantId/webhooks', async (request, reply) => {
    const params = tenantParamsSchema.parse(request.params);
    dependencies.authServices?.authService.requireTenantAccess(request, params.tenantId);
    return reply.send({ items: dependencies.productService.listWebhooks(params.tenantId) });
  });

  app.get('/api/product/tenants/:tenantId/webhook-deliveries', async (request, reply) => {
    const params = tenantParamsSchema.parse(request.params);
    dependencies.authServices?.authService.requireTenantAccess(request, params.tenantId);
    return reply.send({ items: dependencies.productService.listWebhookDeliveries(params.tenantId) });
  });

  app.get('/api/audit/runs/:id/export', async (request, reply) => {
    const params = apiKeyParamsSchema.parse(request.params);
    const query = exportAuditReportQuerySchema.parse(request.query);
    const result = await dependencies.auditRunStore.findById(params.id, query.tenantId);
    if (result === undefined) {
      return reply
        .code(404)
        .send(notFound(request.id, 'AUDIT_RUN_NOT_FOUND', 'Audit run was not found.'));
    }
    dependencies.authServices?.authService.requireTenantAccess(request, result.context.tenantId);
    if (query.format === 'pdf') {
      const pdf = exportAuditResultPdf(result as AuditResult);
      return reply
        .type('application/pdf')
        .header('content-disposition', `attachment; filename="${result.auditId}.pdf"`)
        .send(pdf);
    }
    const csv = exportAuditResultCsv(result as AuditResult);
    return reply
      .type('text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="${result.auditId}.csv"`)
      .send(csv);
  });
}
