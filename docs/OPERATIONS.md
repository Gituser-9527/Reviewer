# Operations

## 运行目标

运维目标是让审核系统在 MVP 阶段具备基础可观测性和可恢复性：

- 服务是否存活可检查。
- 依赖是否可用可检查。
- 请求和错误有基础日志。
- 指标端点可被监控系统抓取。
- 敏感信息默认不进入日志。

## 健康检查

### Liveness

```http
GET /health/live
```

用于判断 API 进程是否可响应。正常返回：

```json
{
  "service": "job-compliance-api",
  "status": "ok",
  "timestamp": "2026-06-18T00:00:00.000Z"
}
```

### Readiness

```http
GET /health/ready
```

用于判断服务是否可承接流量。

未配置数据库时，系统使用内存存储，readiness 返回 storage `ok`。

配置 `DATABASE_URL` 后，readiness 会检查 PostgreSQL：

```json
{
  "service": "job-compliance-api",
  "status": "ok",
  "timestamp": "2026-06-18T00:00:00.000Z",
  "checks": {
    "postgres": "ok"
  }
}
```

依赖不可用时返回 HTTP `503`，并将对应检查标记为 `degraded`。

## Metrics

```http
GET /metrics
```

当前输出 Prometheus 兼容文本，占位指标包括：

- `job_compliance_api_requests_total`
- `job_compliance_api_responses_total`
- `job_compliance_api_errors_total`
- `job_compliance_api_uptime_seconds`

后续建议增加：

- 审核请求耗时
- 规则命中率
- RAG 无结果率
- LLM fallback 次数
- 人工复核率
- 高风险结论可追溯率

## Logging

API 使用 Fastify logger。

基础请求日志包含：

- `requestId`
- `method`
- `url`
- `statusCode`
- `durationMs`

错误日志包含：

- `requestId`
- `method`
- `url`
- `statusCode`
- 错误对象

日志不得包含请求体原文、Authorization、API Key、Prompt、模型供应商原始响应或未脱敏个人信息。

## 规则发布运维

规则管理后台使用 draft/published 两阶段发布：

- 后台新增、编辑、启停规则只影响 `rules/drafts/{jurisdiction}/`。
- 审核链路默认读取 `rules/{jurisdiction}/`，因此 draft 不会直接影响线上审核。
- 发布时 API 会先对 draft 目录运行 `npm run eval`。
- `npm run eval` 失败时，发布请求返回 `422 EVAL_FAILED`，published 规则保持不变。
- 发布成功后写入 `rules/versions/{jurisdiction}.json`，记录 `ruleVersion`、发布时间、操作者和规则数。

发布失败排查：

- 检查 eval 输出中的 failedCases。
- 确认 draft 规则的 `ruleVersion` 与发布版本一致。
- 确认新增规则没有破坏冻结评测集中的正常岗位、边界样本或多风险样本。
- 如规则语义确需改变，应先更新评测集和变更说明，再重新发布。

## 隐私处理

所有脱敏、哈希和审计日志清洗必须通过：

- `detectSensitiveInfo(text)`
- `redactSensitiveInfo(text)`
- `hashSensitiveValue(value)`
- `sanitizeAuditLog(payload)`

默认策略：

- 审计日志不保存 `rawText`。
- 如果确需保存 `rawText`，必须显式开启，并至少保存脱敏文本。
- LLM 调用前默认使用脱敏文本。

## 常见故障

### API readiness 返回 503

优先检查：

- `DATABASE_URL` 是否正确。
- PostgreSQL 容器是否 healthy。
- migration 是否执行成功。
- API 容器到 `postgres:5432` 的网络是否可达。

### Web 页面无法调用 API

优先检查：

- Compose 内 `API_BASE_URL` 是否为 `http://api:3001`。
- 本地开发时 API 是否运行在 `http://localhost:3001`。
- 浏览器请求是否命中 Next.js rewrite。

### migration 失败

优先检查：

- 数据库用户是否有建表权限。
- migration SQL 是否已执行过且不具备幂等性。
- `DATABASE_URL` 是否指向预期环境。

## 发布建议

- 每次发布前运行 CI 同等命令。
- 规则、Prompt、知识库或聚合逻辑变更后必须运行 `npm run eval`。
- 涉及数据库结构变更时，先在测试库验证 migration。
- 涉及敏感字段新增时，同步更新 security 模块和测试。
