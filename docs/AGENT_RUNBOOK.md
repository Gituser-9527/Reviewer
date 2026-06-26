# 招聘岗位合规审核 Agent 启动与架构说明

本文档用于说明如何启动当前项目，以及这个 Agent 的产品定位、系统能力、核心架构和运行链路。

## 1. Agent 是什么

招聘岗位合规审核 Agent 是一个用于辅助平台审核企业招聘岗位文案的系统。它会接收岗位标题、公司名称、岗位描述、薪资、地点、用工类型等信息，检查岗位是否存在合规风险，并输出审核结论、风险等级、命中违规点、依据、修改建议、合规改写和审核日志。

当前系统定位是“审核辅助工具”，不是法律裁判系统。输出应使用审慎表达，例如“存在合规风险”“建议人工复核”“建议修改后重新提交”，不得输出“该企业已经违法”等绝对法律结论。

## 2. 当前已具备能力

- 岗位审核 REST API
- Next.js 前端审核页面
- YAML 驱动规则引擎
- 岗位结构化抽取基础模块
- 本地 RAG evidence 检索层
- 审核编排器 audit orchestrator
- ReflectionChecker 质量校验
- PostgreSQL / Drizzle 数据库 schema、migration 和 repository
- 人工复核闭环
- 评估集与自动化评估脚本
- LLM Provider 抽象层，默认不调用真实外部模型
- 安全与隐私脱敏模块
- 规则运营后台 MVP
- 运行时配置、灰度发布、指标监控和回滚 MVP

## 3. 技术栈

- Monorepo：npm workspaces
- Backend：Node.js + TypeScript + Fastify
- Frontend：Next.js + React + TypeScript
- Database：PostgreSQL + Drizzle ORM
- Vector DB：预留 pgvector
- Rule Engine：YAML
- RAG：本地 markdown/json 知识库，后续可接 pgvector
- LLM：Provider 抽象层，默认 Mock
- Test：Vitest
- Quality：ESLint、Prettier

## 4. 目录结构

```text
.
├─ apps/
│  ├─ api/                  # Fastify REST API
│  └─ web/                  # Next.js 前端管理台
├─ packages/
│  ├─ core/                 # 审核编排、规则、RAG、LLM、脱敏等领域能力
│  ├─ database/             # PostgreSQL schema、migration、repository
│  └─ shared/               # 共享类型、DTO、运行时 schema
├─ rules/                   # YAML 合规规则
├─ knowledge/               # 法规、政策、平台规则等本地知识库
├─ evals/                   # 评估集与评估脚本
├─ docs/                    # 产品、架构、部署、验收文档
├─ AGENTS.md                # Agent 工程协作约束
└─ TASKS.md                 # 分阶段任务清单
```

## 5. 本地启动方式

### 5.1 环境要求

- Node.js `>= 20.9`
- npm `>= 10`

当前项目已在 Node.js `24.11.1`、npm `11.6.2` 下验证。

### 5.2 安装依赖

在项目根目录执行：

```bash
npm install
```

### 5.3 可选：配置环境变量

可以从 `.env.example` 复制一份本地配置：

```bash
cp .env.example .env
```

Windows PowerShell 可使用：

```powershell
Copy-Item .env.example .env
```

如不设置 `DATABASE_URL`，API 会使用进程内存存储，适合本地快速体验。

如需启用 PostgreSQL 持久化，设置：

```text
DATABASE_URL=postgres://postgres:postgres@localhost:5432/job_compliance_agent
```

然后执行：

```bash
npm run db:migrate
```

### 5.4 启动 API

打开第一个终端：

```bash
npm run dev:api
```

默认地址：

```text
http://localhost:3001
```

健康检查：

```bash
curl http://localhost:3001/health
```

PowerShell 可使用：

```powershell
Invoke-RestMethod http://localhost:3001/health
```

### 5.5 启动 Web

打开第二个终端：

```bash
npm run dev:web
```

默认地址：

```text
http://localhost:3000
```

Web 会把 `/api/*` 代理到 API 服务，默认代理目标为：

```text
http://localhost:3001
```

## 6. Docker Compose 启动方式

如果希望同时启动 API、Web 和 PostgreSQL，可以在项目根目录执行：

```bash
docker compose up --build
```

启动后访问：

- Web 审核台：`http://localhost:3000`
- API：`http://localhost:3001`
- Health：`http://localhost:3001/health`
- Readiness：`http://localhost:3001/health/ready`
- Metrics：`http://localhost:3001/metrics`

Compose 会启动 PostgreSQL，并在 API 启动前执行数据库 migration。

## 7. 常用页面

- 审核页面：`http://localhost:3000/`
- 人工复核台：`http://localhost:3000/reviews`
- 规则管理：`http://localhost:3000/rules`
- 评估台：`http://localhost:3000/evals`
- 监控灰度：`http://localhost:3000/monitoring`

## 8. 常用命令

```bash
npm run build         # 构建 packages、API、Web
npm test              # 运行测试
npm run lint          # 运行 ESLint
npm run eval          # 运行冻结评估集
npm run eval:real     # 运行真实数据评估脚本
npm run eval:dataset  # 指定数据集评估
npm run db:migrate    # 执行数据库 migration
```

## 9. 核心 API 示例

### 9.1 健康检查

```bash
curl http://localhost:3001/health
```

### 9.2 提交岗位审核

```bash
curl -X POST http://localhost:3001/api/audit/job \
  -H "Content-Type: application/json" \
  -d '{
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
  }'
```

预期会返回 `AuditResult`，其中通常包含：

- `decision`
- `riskLevel`
- `summary`
- `findings`
- `evidence`
- `suggestions`
- `context.ruleVersion`
- `context.lawKbVersion`
- `context.modelVersion`

### 9.3 查询审核结果

```bash
curl http://localhost:3001/api/audit/runs/{auditId}
```

按租户查询：

```bash
curl "http://localhost:3001/api/audit/runs?tenantId=tenant_001"
```

### 9.4 查看监控指标

```bash
curl http://localhost:3001/api/metrics/audit
```

### 9.5 创建规则版本灰度计划

```bash
curl -X POST http://localhost:3001/api/rollouts \
  -H "Content-Type: application/json" \
  -d '{
    "target": "ruleVersion",
    "stableVersion": "1.0.0",
    "candidateVersion": "1.0.1",
    "tenantAllowList": ["tenant_001"],
    "rolloutPercent": 0,
    "createdBy": "ops_user"
  }'
```

### 9.6 回滚灰度计划

```bash
curl -X POST http://localhost:3001/api/rollouts/{rolloutId}/rollback
```

## 10. 核心架构

系统采用模块化单体架构。MVP 阶段不拆微服务，但通过 package 和接口保持清晰边界。

```mermaid
flowchart LR
  Web["Next.js Web"]
  API["Fastify REST API"]
  Core["packages/core"]
  Shared["packages/shared"]
  DB["packages/database"]
  Rules["YAML Rules"]
  KB["Local Knowledge Base"]
  PG["PostgreSQL"]
  Eval["Eval Scripts"]

  Web --> API
  API --> Core
  API --> DB
  API --> Shared
  Core --> Rules
  Core --> KB
  DB --> PG
  Eval --> Core
```

### 10.1 后端 API 层

位置：

```text
apps/api/
```

职责：

- HTTP 路由
- 请求体验证
- 错误响应映射
- 调用 core 审核编排器
- 保存 audit run
- 创建人工复核单
- 暴露规则、评估、复核、监控和灰度接口

API 层不直接承担风险判断逻辑。

### 10.2 Web 前端层

位置：

```text
apps/web/
```

主要页面：

- 岗位审核页面
- 人工复核页面
- 规则运营页面
- 评估页面
- 监控灰度页面

前端通过 `/api/*` 调用后端。

### 10.3 Core 领域层

位置：

```text
packages/core/
```

职责：

- 文本标准化
- 岗位结构化抽取
- YAML 规则引擎
- RAG evidence 检索
- 风险聚合
- ReflectionChecker
- LLM Provider 抽象
- 安全与隐私脱敏

领域层不得绑定 HTTP、数据库 ORM 或具体 LLM SDK。

### 10.4 Database 持久化层

位置：

```text
packages/database/
```

职责：

- Drizzle schema
- migration
- repository
- audit run 持久化
- finding/evidence link 持久化
- review/eval/rule/runtime 相关表结构

当前支持 PostgreSQL，预留 pgvector。

### 10.5 Shared 契约层

位置：

```text
packages/shared/
```

职责：

- 共享 TypeScript 类型
- 共享 DTO
- 运行时 schema
- 审核结果、finding、evidence、review 等稳定契约

## 11. 审核主流程

```text
Job Input
-> Preprocess / Normalize
-> Extract JobFacts
-> Rule Engine
-> RAG Evidence Retrieval
-> Risk Aggregation
-> Reflection Check
-> AuditResult
-> Persistence / Review / Metrics
```

### 11.1 输入

输入来自 API：

- `tenantId`
- `jobPostingId`
- `company.name`
- `job.title`
- `job.description`
- `job.location`
- `job.salary`
- `job.employmentType`
- `options.jurisdiction`
- `options.enableRewrite`
- `options.enableRag`

### 11.2 规则引擎

规则位于：

```text
rules/cn-mainland/
```

规则支持：

- containsAny
- regex
- severity
- action
- ruleVersion
- matchedText
- ruleId

硬规则优先于 LLM。

### 11.3 RAG evidence

知识库位于：

```text
knowledge/
```

当前使用本地 markdown/json 文件检索，不编造法规。每条 evidence 需要保留：

- `id`
- `title`
- `sourceType`
- `quote`
- `url`
- `version`

### 11.4 风险聚合

聚合策略：

```text
CRITICAL -> REJECT
HIGH -> MANUAL_REVIEW
MEDIUM -> ALLOW_WITH_WARNING
无风险 -> PASS
```

高风险 finding 必须包含 `ruleId` 或 `evidenceId`。

### 11.5 Reflection

ReflectionChecker 会检查：

- high/critical finding 是否有 ruleId 或 evidenceId
- matchedText 是否出现在原文
- decision 是否与 severity 匹配
- evidence 是否与 category 匹配
- 改写文案是否仍包含高风险词
- 是否出现绝对法律结论
- 是否泄露内部规则权重

## 12. 灰度发布、监控和回滚

当前已支持运行时选择：

- `ruleVersion`
- `lawKbVersion`
- `modelVersion`

灰度策略支持：

- `tenantAllowList`
- `rolloutPercent`
- `stableVersion`
- `candidateVersion`
- `active / paused / completed / rolled_back`

审核时会根据 `tenantId` 选择版本，并在 `AuditResult.context` 中记录：

- `ruleVersion`
- `lawKbVersion`
- `modelVersion`

监控指标包括：

- `audit_total`
- `reject_rate`
- `manual_review_rate`
- `critical_finding_rate`
- `rule_hit_by_rule_id`
- `llm_error_rate`
- `rag_no_result_rate`
- `api_error_rate`
- `p95_latency`

## 13. 数据库说明

核心表包括：

- `job_postings`
- `audit_runs`
- `audit_findings`
- `audit_evidence_links`
- `compliance_rules`
- `review_tickets`
- `human_review_feedback`
- `eval_datasets`
- `eval_cases`
- `eval_runs`
- `eval_failures`
- `rule_sets`
- `rule_publish_records`
- `runtime_configs`
- `rollout_plans`
- `audit_metrics_daily`
- `alert_events`

隐私要求：

- 不明文保存手机号、身份证号、银行卡号、邮箱、微信号等敏感信息
- 审计日志默认保存脱敏文本
- LLM 调用前默认使用脱敏文本

## 14. 当前边界

- 默认不调用真实 LLM
- RAG 当前是本地知识库检索，尚未接 pgvector
- 鉴权和复杂权限系统仍是预留能力
- RuntimeConfig、Rollout、Metrics、Alert 当前是 MVP 进程内服务，数据库表已预留，后续可接持久化 repository
- 当前合规依据为人工维护文本，不应视为完整法律意见

## 15. 推荐验证流程

首次启动或改动后建议执行：

```bash
npm run build
npm test
npm run lint
npm run eval
```

如果使用 Docker：

```bash
docker compose up --build
```

然后访问：

```text
http://localhost:3000
```

提交一条样例岗位：

```text
招聘行政专员，限女性，已婚已育优先。入职需缴纳500元服装费。
```

预期结果：

- `decision` 为 `REJECT`
- `riskLevel` 为 `CRITICAL`
- findings 至少包含 `DISCRIMINATION` 和 `FEE_DEPOSIT`
