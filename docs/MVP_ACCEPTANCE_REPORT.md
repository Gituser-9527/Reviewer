# MVP Acceptance Report

## 验收时间

- 日期：2026-06-18
- 范围：MVP 全项目验收与工程加固
- 结论：核心 MVP 审核链路可运行，`build`、`test`、`lint`、`eval` 均通过；API 与前端代理已完成一次端到端岗位审核验证。

## 当前已完成能力

### 项目骨架

- npm workspaces monorepo。
- `apps/api`：Fastify REST API。
- `apps/web`：Next.js + React 前端。
- `packages/shared`：共享枚举、DTO、运行时 schema。
- `packages/core`：审核领域核心、规则引擎、RAG、LLM 抽象、Reflection、安全脱敏。
- `packages/database`：PostgreSQL schema、migration、repository 与隐私持久化模型。
- `rules/`：中国大陆 MVP YAML 规则。
- `knowledge/`：本地法规/平台规则依据文件。
- `evals/`：冻结评测集与自动评测脚本。

### 核心类型

- 已实现 `JobPostingInput`、`JobFacts`、`AuditResult`、`Finding`、`Evidence`、`AuditDecision`、`RiskCategory`、`Severity`、`RuleDefinition`、`RuleHit`、`AuditContext`、`CheckerResult` 等共享类型。
- 共享类型包含运行时校验 schema 与基础单元测试。

### YAML 规则引擎

- 支持从 `rules/cn-mainland/*.yml` 加载规则。
- 支持 `containsAny`、`regex`、`severity`、`action`、`ruleVersion`。
- 输出 `RuleHit[]`，包含 `ruleId`、`matchedText`、`evidence`、`category`、`severity` 和建议。
- 初始规则覆盖歧视、收费押金、隐私、虚假误导、信息完整性。
- 已实现 draft/published 规则管理后台 MVP，发布前会运行 eval，发布成功记录 `ruleVersion`。

### 岗位结构化抽取

- 已实现 `basicExtractor`，基于规则和简单文本解析抽取 `JobFacts`。
- 已定义 `LLMExtractor` 接口。
- 已实现 `MockLLMExtractor`，测试不调用真实外部模型。

### Audit Orchestrator

- 已实现 `auditJobPosting(input): Promise<AuditResult>`。
- 流程覆盖：输入校验、文本标准化、结构化抽取、规则引擎、RAG evidence、风险聚合、Reflection、最终 `AuditResult`。
- `critical` 命中返回 `REJECT`，`high` 返回 `MANUAL_REVIEW`，`medium` 返回 `ALLOW_WITH_WARNING`，无风险返回 `PASS`。
- 高风险 finding 校验要求具备 `ruleId` 或 `evidenceId`。

### REST API

- `GET /health`
- `GET /health/live`
- `GET /health/ready`
- `GET /metrics`
- `POST /api/audit/job`
- `GET /api/audit/runs/:id`
- `GET /api/audit/runs?tenantId=...`
- `POST /api/reviews`
- `GET /api/reviews`
- `GET /api/reviews/:id`
- `POST /api/reviews/:id/decision`
- `GET /api/rules`
- `POST /api/rules`
- `PUT /api/rules/:id`
- `POST /api/rules/:id/toggle`
- `GET /api/rules/versions`
- `POST /api/rules/publish`

### 前端审核页面

- 首页支持输入岗位标题、公司名称、描述、薪资、地点和用工类型。
- 可调用 `POST /api/audit/job`。
- 展示审核结论、风险等级、风险分数、摘要、findings、命中片段、解释、建议、evidence 和改写结果。
- 已补 runtime API proxy：`apps/web/app/api/[...path]/route.ts`，生产 standalone 启动时可通过运行时 `API_BASE_URL` 转发 API 请求。

### 初版 RAG Evidence Retriever

- 已实现 `EvidenceRetriever` 接口。
- 已实现 `LocalKnowledgeRetriever`，支持读取 `knowledge/` 下 Markdown/JSON。
- 支持按风险类别和关键词检索。
- `AuditResult.evidence` 与 `Finding.evidenceIds` 已接入。
- 已预留 `VectorEvidenceRetriever` 演进空间。

### 工程化与安全

- Dockerfile、docker-compose、GitHub Actions CI 已配置。
- CI 覆盖 install、lint、test、build、eval。
- API 已具备 basic request logging、error logging、health、readiness、metrics 占位。
- 安全模块已实现敏感信息识别、脱敏、哈希和审计日志清洗。
- LLM Provider 默认测试使用 mock，不依赖真实 API Key。

## 当前未完成能力

- 未接真实 LLM Provider；OpenAI-compatible provider 仍作为占位适配层。
- pgvector 向量检索未实现；当前 RAG 为本地关键词/类别检索。
- 鉴权、RBAC、API Key、租户级权限隔离仍未完成。
- 幂等键、限流、并发控制、OpenAPI 文档生成未完成。
- 审计事件表与完整审计日志查询未完成。
- 合规改写仍为保守占位，未实现完整二次规则改写闭环。
- 规则审批、diff、回滚、灰度发布仍为后续工程化能力。
- 法规和平台规则内容仍需法务/合规人员正式确认。

## 当前可运行命令

```bash
npm install
npm run build
npm test
npm run lint
npm run eval
npm run dev:api
npm run dev:web
npm run db:migrate
docker compose up --build
```

说明：

- 未设置 `DATABASE_URL` 时，API 使用内存存储。
- 设置 `DATABASE_URL` 后，API 使用 PostgreSQL repository。
- Web standalone 启动使用 `npm run start --workspace @job-compliance/web`，内部执行 `.next/standalone/apps/web/server.js`。

## 当前 API 示例

### 提交岗位审核

```http
POST /api/audit/job
Content-Type: application/json
```

```json
{
  "tenantId": "tenant_001",
  "jobPostingId": "job_001",
  "company": {
    "name": "某某科技有限公司"
  },
  "job": {
    "title": "行政专员",
    "description": "限女性，已婚已育优先，入职需缴纳500元服装费",
    "location": "北京",
    "salary": "8k-15k",
    "employmentType": "full_time"
  },
  "options": {
    "jurisdiction": "CN_MAINLAND",
    "enableRewrite": true,
    "enableRag": true
  }
}
```

验收样例结果：

```json
{
  "decision": "REJECT",
  "riskLevel": "CRITICAL",
  "findings": ["DISCRIMINATION", "FEE_DEPOSIT"],
  "evidence": "present",
  "context": {
    "ruleVersion": "1.0.0",
    "lawKbVersion": "local-2026-06-12"
  }
}
```

### 查询审核结果

```http
GET /api/audit/runs/{auditId}?tenantId=tenant_001
```

### 健康检查

```http
GET /health
GET /health/live
GET /health/ready
GET /metrics
```

### 规则管理

```http
GET /api/rules?jurisdiction=CN_MAINLAND&status=draft
POST /api/rules
PUT /api/rules/{ruleId}
POST /api/rules/{ruleId}/toggle
POST /api/rules/publish
```

## 本轮验收结果

### 命令验证

```text
npm install: passed
npm run build: passed
npm test: passed
npm run lint: passed
npm run eval: passed
```

评测结果：

```json
{
  "total": 55,
  "passed": 55,
  "failed": 0,
  "accuracy": 1,
  "categoryRecall": 1,
  "decisionAccuracy": 1,
  "failedCases": []
}
```

测试结果：

```text
Test Files: 14 passed | 1 skipped (15)
Tests: 78 passed | 1 skipped (79)
```

### API 与前端链路验证

本轮启动临时端口：

- API：`http://127.0.0.1:3101`
- Web：`http://127.0.0.1:3100`

验证结果：

```json
{
  "apiHealth": "ok",
  "webHomeStatus": 200,
  "apiDecision": "REJECT",
  "apiRiskLevel": "CRITICAL",
  "apiFindingCount": 5,
  "apiEvidenceCount": 15,
  "proxyDecision": "REJECT",
  "proxyRiskLevel": "CRITICAL",
  "proxyFindingCount": 5,
  "hasAuditId": true,
  "hasContext": true
}
```

结论：

- `POST /api/audit/job` 可返回完整 `AuditResult`。
- Web 首页可访问。
- Web `/api/audit/job` runtime proxy 可转发到 API，前端页面具备完成一次岗位审核的运行条件。

## 当前测试覆盖情况

- 共享类型与 schema 测试。
- YAML 规则引擎测试。
- 基础结构化抽取测试。
- Audit orchestrator 与风险聚合测试。
- ReflectionChecker 测试。
- LocalKnowledgeRetriever 测试。
- LLM provider mock、安全调用和 fallback 测试。
- 安全脱敏模块测试。
- API health、audit route、rule management route 测试。
- 数据库 persistence model 测试。
- 前端 view model 测试。
- 离线 eval 覆盖 55 条岗位样本。

## 本轮修复

- 修复 Web 生产启动方式：`next start` 不适配 `output: standalone`，已改为 standalone server。
- 新增 Web runtime API proxy，避免 Next rewrite 在 standalone 产物中固化构建时 `API_BASE_URL`，导致前端生产环境无法按运行时配置调用 API。
- 移除 `next.config.ts` 中的 build-time rewrite，统一由 runtime proxy 处理 `/api/*`。

## 当前技术债

- `npm install` 后 `npm audit` 报 2 个 moderate vulnerabilities；本轮未执行 `npm audit fix --force`，避免引入破坏性升级。
- API 文档仍保留部分早期 `/api/v1` 与 `/reviews` 目标契约描述，实际 MVP 路径为 `/api/audit/*`、`/api/reviews/*` 和 `/api/rules/*`，后续应统一 OpenAPI。
- 规则 YAML 当前是 MVP 简化格式，与 `docs/RULE_ENGINE.md` 中的长期 schema 仍存在差异。
- 数据库实现覆盖核心审核持久化和人工反馈，但尚未覆盖完整 PRD 中的审计事件、规则集版本表、模型运行表和知识库向量表。
- Docker Compose 未在本机实际验收；当前环境没有 Docker CLI。
- 当前没有真实鉴权与权限系统，管理端点仅作 MVP 预留。

## 下一步优先级建议

1. 统一 API_SPEC 与实际 MVP 路径，生成 OpenAPI 文档。
2. 补齐鉴权、租户隔离、幂等键和管理端点权限。
3. 将规则发布记录从文件补强到数据库，并增加 diff、审批、回滚。
4. 完整实现审计事件追加写与审计日志查询。
5. 对 `npm audit` 的 moderate vulnerabilities 做非破坏性升级评估。
6. 将 Docker Compose 放到具备 Docker CLI 的环境做启动验收。
7. 由法务/合规确认首批规则和 knowledge 文本，冻结正式 MVP 基线。
