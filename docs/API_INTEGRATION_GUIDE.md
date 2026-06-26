# API Integration Guide

本文档面向招聘平台、ATS、HR 系统接入招聘岗位合规审核 Agent。

## 环境

- 本地：`http://localhost:3001`
- Sandbox：使用请求体 `sandbox: true`，或使用 sandbox API Key。
- OpenAPI：`GET /v1/openapi.json`

## 鉴权

所有 `/v1/*` 接口使用 API Key：

```http
Authorization: Bearer jca_xxxx
```

API Key 只在创建时明文返回，服务端只保存哈希。

## 单条审核

```http
POST /v1/audit/job
Content-Type: application/json
Authorization: Bearer jca_xxxx
```

```json
{
  "externalId": "job_001",
  "company": { "name": "某某科技有限公司" },
  "job": {
    "title": "行政专员",
    "description": "负责办公室行政工作，薪资8k-12k。",
    "location": "北京"
  },
  "options": {
    "jurisdiction": "CN_MAINLAND",
    "enableRag": true
  },
  "sandbox": true
}
```

响应结构稳定，核心字段包括：

- `id`
- `object`
- `status`
- `decision`
- `riskLevel`
- `riskScore`
- `summary`
- `findings`
- `evidence`
- `versions`

## 批量审核

```http
POST /v1/audit/batch
```

支持三种导入方式：

- `jobs`
- `jsonl`
- `csv`

CSV 表头示例：

```csv
externalId,companyName,title,description,location,salary,employmentType
job_001,某某科技有限公司,行政专员,负责办公室行政工作,北京,8k-12k,full_time
```

批量接口返回 `202 Accepted`，通过 `GET /v1/audit/batch/:id` 查询进度。

## Webhook

Webhook 事件：

- `audit.completed`
- `batch.completed`

注册 webhook：

```http
POST /v1/webhooks
Authorization: Bearer jca_xxxx
```

```json
{
  "url": "https://ats.example.com/webhooks/job-compliance",
  "events": ["audit.completed", "batch.completed"],
  "secret": "your_webhook_secret"
}
```

系统会发送以下签名头：

- `x-jca-event`
- `x-jca-timestamp`
- `x-jca-signature`

签名算法：

```text
HMAC_SHA256(secret, timestamp + "." + rawBody)
```

失败最多重试 5 次。`mock://` URL 用于 sandbox 或本地测试，不发起真实 HTTP 请求。

测试 webhook：

```http
POST /v1/webhooks/test
Authorization: Bearer jca_xxxx
```

```json
{
  "url": "mock://ats/webhook",
  "event": "audit.completed",
  "secret": "sandbox_webhook_secret"
}
```

查看投递日志：

```http
GET /v1/webhooks/deliveries
Authorization: Bearer jca_xxxx
```

## 使用量

```http
GET /v1/usage
```

返回 quota、限流和成本统计。

## SDK 示例

TypeScript 示例见：

- `examples/sdk/typescript.ts`

## 错误格式

```json
{
  "requestId": "req_xxx",
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "API key is required.",
    "retryable": false
  }
}
```

常见错误码：

- `UNAUTHENTICATED`
- `TENANT_MISMATCH`
- `VALIDATION_ERROR`
- `RATE_LIMITED`
- `QUOTA_EXCEEDED`
- `AUDIT_RUN_NOT_FOUND`
- `BATCH_NOT_FOUND`

## Sandbox 建议

1. 使用测试租户和 API Key。
2. 请求体设置 `sandbox: true`。
3. Webhook URL 使用 `mock://your-system/event`。
4. 验证签名逻辑后再切换真实 HTTPS URL。
