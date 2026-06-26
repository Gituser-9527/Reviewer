# REST API 规格

## 1. 通用约定

- Base URL：`/api/v1`
- Content-Type：`application/json`
- 时间：ISO 8601 UTC
- ID：UUID
- 枚举值使用大写蛇形命名
- 所有响应返回 `request_id`
- 写请求支持 `Idempotency-Key`；同租户、同键、不同请求体返回冲突
- 鉴权：MVP 可使用 Bearer Token；生产方案待安全评审

## 2. 核心数据类型

### ReviewDecision

`PASS | BLOCK | REVIEW`

### RiskLevel

`NONE | LOW | MEDIUM | HIGH | CRITICAL`

### ReviewStatus

`RECEIVED | PROCESSING | NEEDS_REVIEW | COMPLETED | FAILED`

## 3. 创建审核

`POST /reviews`

### 请求

```json
{
  "external_id": "job-2026-001",
  "jurisdiction": "CN",
  "locale": "zh-CN",
  "platform": "DEFAULT",
  "job": {
    "title": "销售经理",
    "description": "负责客户开发……",
    "responsibilities": ["开发客户"],
    "requirements": ["三年以上相关经验"],
    "location": "上海",
    "employment_type": "FULL_TIME",
    "salary": {
      "text": "15k-25k/月",
      "min": 15000,
      "max": 25000,
      "currency": "CNY",
      "period": "MONTH"
    }
  },
  "options": {
    "generate_rewrite": true,
    "include_trace": false,
    "ruleset_version": null
  }
}
```

约束：

- `title` 与 `description` 必填
- 文本总长度、数组长度和字段大小必须设置上限
- `ruleset_version` 为空时使用该租户和平台当前已发布版本
- `include_trace` 仅对授权角色生效

### 成功响应

同步完成返回 `201 Created`：

```json
{
  "request_id": "req_uuid",
  "review": {
    "id": "review_uuid",
    "status": "NEEDS_REVIEW",
    "machine_decision": "REVIEW",
    "final_decision": "REVIEW",
    "risk_level": "HIGH",
    "risk_score": 82,
    "summary": "命中年龄限制风险，需人工确认是否属于法定特殊岗位。",
    "findings": [
      {
        "id": "finding_uuid",
        "rule_id": "CN-DISCRIMINATION-AGE-001",
        "category": "EMPLOYMENT_DISCRIMINATION",
        "severity": "HIGH",
        "disposition": "REVIEW",
        "message": "岗位要求包含年龄上限。",
        "evidence": [
          {
            "field": "job.description",
            "quote": "年龄不超过 30 岁",
            "start": 24,
            "end": 35
          }
        ],
        "authorities": [
          {
            "type": "LAW",
            "code": "AUTHORITY_ID",
            "title": "依据标题",
            "article": "条款标识",
            "url": null,
            "version": "2026-01"
          }
        ],
        "confidence": 0.96,
        "source": "RULE"
      }
    ],
    "suggestions": [
      {
        "finding_id": "finding_uuid",
        "action": "REMOVE_OR_JUSTIFY",
        "message": "删除与履职无直接关系的年龄限制；如为法定特殊岗位，补充依据并转人工复核。"
      }
    ],
    "compliant_rewrite": {
      "text": "销售经理……",
      "validation_status": "PASSED",
      "remaining_findings": []
    },
    "metadata": {
      "ruleset_id": "ruleset_uuid",
      "ruleset_version": "1.0.0",
      "model_provider": "configured-provider",
      "model": "configured-model",
      "prompt_version": "review-v1",
      "duration_ms": 1240,
      "created_at": "2026-06-11T00:00:00Z"
    }
  }
}
```

异步模式后续可返回 `202 Accepted`，响应包含审核 ID 和查询地址；MVP 不要求开放。

## 4. 查询审核

`GET /reviews/{review_id}`

返回与创建接口相同的 `review` 对象。默认不返回内部提示词、原始模型响应或敏感调试信息。

## 5. 查询审核列表

`GET /reviews?status=&decision=&risk_level=&external_id=&created_from=&created_to=&cursor=&limit=`

- 使用游标分页，`limit` 默认 20、最大 100
- 支持按状态、最终结论、风险等级、外部业务 ID 和时间筛选
- 响应包含 `items` 与 `next_cursor`

## 6. 提交人工复核结论

规划接口为 `POST /reviews/{review_id}/manual-decisions`。MVP 当前实现路径为 `POST /api/reviews/{id}/decision`。

```json
{
  "reviewerId": "mock_reviewer",
  "finalDecision": "REQUEST_REVISION",
  "feedbackType": "RULE_TOO_BROAD",
  "comment": "确认该年龄限制与岗位履职无直接关系。",
  "falsePositive": false,
  "falseNegative": false
}
```

约束：

- 仅复核角色可调用
- `comment` 必填且有长度限制
- 使用乐观锁或 `If-Match` 防止重复覆盖
- 响应返回更新后的当前投影；机器结论保持不变

MVP 复核闭环接口：

- `GET /api/reviews?status=pending|completed|all&tenantId=xxx`
- `GET /api/reviews/{id}`
- `POST /api/reviews/{id}/decision`
- `POST /api/reviews/{id}/add-to-eval`
- `POST /api/reviews/{id}/create-rule-suggestion`
- `GET /api/rule-suggestions?status=open|resolved|all&tenantId=xxx`
- `POST /api/rule-suggestions/{id}/resolve`

反馈类型：

- `FALSE_POSITIVE`
- `FALSE_NEGATIVE`
- `WRONG_CATEGORY`
- `WRONG_SEVERITY`
- `WRONG_EVIDENCE`
- `BAD_REWRITE`
- `RULE_TOO_BROAD`
- `RULE_TOO_NARROW`
- `NEEDS_NEW_RULE`
- `VALID_RESULT`

`POST /api/reviews/{id}/add-to-eval` 会将复核样本写入 `eval_cases`，默认数据集为 `human_review_feedback`。`POST /api/reviews/{id}/create-rule-suggestion` 会创建 `rule_improvement_suggestions` 记录，供规则管理员后续处理。

## 7. 获取审核日志

`GET /reviews/{review_id}/audit-logs?cursor=&limit=`

仅返回调用方有权查看的事件。事件至少包含：事件类型、时间、操作者类型/ID、前后状态摘要、规则/模型版本和关联 ID。

## 8. 规则管理 API

MVP 当前实现路径为 `/api/rules`，用于管理 YAML 规则的 draft/published 状态。

规则修改只写入 `rules/drafts/{jurisdiction}/`，不会直接影响线上审核使用的 `rules/{jurisdiction}/`。

### 查询规则

`GET /api/rules?jurisdiction=CN_MAINLAND&status=draft|published|all`

响应：

```json
{
  "items": [
    {
      "id": "CN_PRIVACY_PHONE_001",
      "status": "draft",
      "jurisdiction": "CN_MAINLAND",
      "ruleVersion": "1.0.0",
      "fileName": "privacy.yml",
      "category": "PRIVACY",
      "severity": "medium",
      "action": "manual_review",
      "enabled": true,
      "hitCount": 0,
      "explanation": "岗位要求提供过度个人信息。",
      "suggestion": "删除非必要个人信息收集要求。"
    }
  ]
}
```

`hitCount` 当前为占位字段，后续应从审核日志或指标服务聚合。

### 新增规则

`POST /api/rules`

```json
{
  "jurisdiction": "CN_MAINLAND",
  "fileName": "privacy.yml",
  "rule": {
    "id": "CN_PRIVACY_WECHAT_002",
    "category": "PRIVACY",
    "severity": "medium",
    "action": "manual_review",
    "containsAny": {
      "fields": ["rawText", "normalizedText"],
      "values": ["微信号"]
    },
    "explanation": "岗位要求提供微信号，需要确认收集必要性。",
    "suggestion": "删除非必要联系方式要求。",
    "enabled": true
  }
}
```

### 编辑规则

`PUT /api/rules/{ruleId}`

请求体与新增规则相同，但只更新 draft 规则。

### 启用或禁用规则

`POST /api/rules/{ruleId}/toggle`

```json
{
  "jurisdiction": "CN_MAINLAND",
  "enabled": false
}
```

### 查询发布版本

`GET /api/rules/versions?jurisdiction=CN_MAINLAND`

### 发布 draft

`POST /api/rules/publish`

```json
{
  "jurisdiction": "CN_MAINLAND",
  "ruleVersion": "1.0.1",
  "actorId": "mock-rule-admin"
}
```

发布流程：

1. 将 draft 规则更新为目标 `ruleVersion`。
2. 使用 draft 目录运行 `npm run eval`。
3. 评测失败时返回 `422 EVAL_FAILED`，不覆盖 published 规则。
4. 评测通过后复制 draft 到 published 目录。
5. 写入 `rules/versions/{jurisdiction}.json` 版本记录。

后续生产版应补充鉴权、审批、内容哈希、回滚和审计事件。

### 规则运营 API

MVP 当前新增 `/api/rulesets/*`，用于规则集级别的创建、测试、评估、发布和回滚。

- `GET /api/rulesets`
- `POST /api/rulesets`
- `GET /api/rulesets/{id}`
- `POST /api/rulesets/{id}/rules`
- `PATCH /api/rules/{id}`
- `POST /api/rulesets/{id}/test`
- `POST /api/rulesets/{id}/run-eval`
- `POST /api/rulesets/{id}/publish`
- `POST /api/rulesets/{id}/rollback`
- `GET /api/rule-publish-records`

规则状态：

- `draft`
- `testing`
- `published`
- `disabled`
- `archived`

发布约束：

- 线上审核只读取 published 目录，draft 不直接影响审核。
- 发布前运行 eval；未达到阈值时拒绝发布，除非 `forcePublish=true`。
- 每次发布生成新的 `ruleVersion`，审核结果通过 `AuditResult.context.ruleVersion` 记录实际版本。
- 回滚会恢复上一个或指定的 published 快照，并写入发布记录。

规则测试请求：

```json
{
  "text": "招聘文员，入职需缴纳保证金500元。"
}
```

响应包含：

- `hits[].ruleId`
- `hits[].matchedText`
- `hits[].category`
- `hits[].severity`
- `hits[].action`
- `finalDecision`

## 9. 真实数据评估 API

MVP 当前实现路径为 `/api/evals/*`，用于导入脱敏评估样本、运行评估并查看失败样本。

### 创建评估数据集

`POST /api/evals/datasets`

```json
{
  "id": "real_2026_q2",
  "name": "真实岗位脱敏评估集",
  "version": "v1",
  "description": "仅包含已脱敏岗位样本"
}
```

### 导入评估样本

`POST /api/evals/datasets/{id}/cases`

支持直接传入 `cases`，也支持通过 `jsonl` 批量导入。服务端会再次执行脱敏。

```json
{
  "jsonl": "{\"id\":\"case_001\",\"input\":{\"title\":\"行政专员\",\"description\":\"限女性...\"},\"expected\":{\"decision\":\"REJECT\",\"categories\":[\"DISCRIMINATION\"],\"minRiskLevel\":\"critical\"}}"
}
```

也可通过 `fromReviewTicketId` 将人工复核反馈转换为评估样本。

### 运行评估

`POST /api/evals/run`

```json
{
  "datasetId": "real_2026_q2",
  "ruleVersion": "1.0.1",
  "lawKbVersion": "local-2026-06-12",
  "modelVersion": "mock",
  "enableRealLlm": false
}
```

默认不调用真实 LLM。响应包含：

- `decisionAccuracy`
- `categoryPrecision`
- `categoryRecall`
- `criticalRecall`
- `falsePositiveRate`
- `falseNegativeRate`
- `manualReviewRate`
- `evidenceAccuracy`
- `rewriteSafetyRate`
- `failures`

### 查询评估运行

- `GET /api/evals/datasets`
- `GET /api/evals/datasets/{id}/cases`
- `GET /api/evals/runs`
- `GET /api/evals/runs/{id}`
- `GET /api/evals/runs/{id}/failures`

## 10. 运行时配置、灰度与监控 API

MVP 当前实现路径为 `/api/runtime-configs`、`/api/rollouts`、`/api/metrics/audit` 和
`/api/alerts`。运行时配置用于选择 `ruleVersion`、`lawKbVersion`、`modelVersion`。

### 运行时配置

- `GET /api/runtime-configs`
- `PATCH /api/runtime-configs/{key}`

`key` 允许值：

- `ruleVersion`
- `lawKbVersion`
- `modelVersion`

```json
{
  "stableVersion": "1.0.0",
  "candidateVersion": "1.0.1",
  "updatedBy": "ops_user"
}
```

### 灰度计划

- `GET /api/rollouts`
- `POST /api/rollouts`
- `PATCH /api/rollouts/{id}`
- `POST /api/rollouts/{id}/rollback`

```json
{
  "target": "ruleVersion",
  "stableVersion": "1.0.0",
  "candidateVersion": "1.0.1",
  "tenantAllowList": ["tenant_001"],
  "rolloutPercent": 10,
  "createdBy": "ops_user"
}
```

状态允许值：

- `active`
- `paused`
- `completed`
- `rolled_back`

### 审核指标与告警

- `GET /api/metrics/audit`
- `GET /api/alerts`

指标包含：

- `audit_total`
- `reject_rate`
- `manual_review_rate`
- `critical_finding_rate`
- `rule_hit_by_rule_id`
- `llm_error_rate`
- `rag_no_result_rate`
- `api_error_rate`
- `p95_latency`
- `version_distribution`

## 11. 封闭试运行 Beta Trial API

MVP 当前实现路径为 `/api/beta-trial/*`，用于在真实数据中运行 Agent，但根据租户模式控制是否影响线上业务。

### 租户试运行模式

- `GET /api/beta-trial/tenant-modes`
- `GET /api/beta-trial/tenant-modes/{tenantId}`
- `PATCH /api/beta-trial/tenant-modes/{tenantId}`

```json
{
  "mode": "shadow_mode",
  "enabled": true,
  "updatedBy": "ops_user"
}
```

模式说明：

- `shadow_mode`：Agent 正常审核，但不拦截岗位，只记录 Agent 与人工结果差异。
- `assist_mode`：Agent 为人工审核员提供建议，人工最终决定是否通过。
- `enforce_mode`：Agent 可以自动通过或拦截，仅应对明确配置的 tenant 开启。

### 试运行记录和人工结果

- `GET /api/beta-trial/runs`
- `GET /api/beta-trial/runs/{id}`
- `POST /api/beta-trial/runs/{id}/human-result`

```json
{
  "reviewerId": "human_001",
  "finalDecision": "REJECT",
  "feedbackType": "FALSE_NEGATIVE",
  "comment": "人工认为存在严重风险"
}
```

### 报告

- `GET /api/beta-trial/reports/daily`
- `GET /api/beta-trial/reports/shadow-comparison`

报告指标包括：

- Agent 与人工一致率
- 严重风险召回率
- 误杀率
- 漏判率
- 人工复核节省时间估算
- Top 10 规则误杀
- Top 10 规则漏判
- Top 10 evidence 引用错误

## 12. 审核 SOP 与标注体系 API

MVP 当前实现路径为 `/api/labeling/*`、`/api/reviews/{id}/reviewer-decisions`、
`/api/reviewer-agreement-stats` 和 `/api/disputed-cases/*`。

### 标注说明

- `GET /api/labeling/reference`

返回风险等级解释和反馈类型说明，用于人工审核台展示统一标注口径。

### 多人标注

- `POST /api/reviews/{id}/reviewer-decisions`
- `GET /api/reviews/{id}/reviewer-decisions`

```json
{
  "reviewerId": "reviewer_a",
  "finalDecision": "REQUEST_REVISION",
  "categories": ["DISCRIMINATION"],
  "severity": "HIGH",
  "feedbackType": "VALID_RESULT",
  "comment": "建议删除性别限制后重新提交",
  "confidence": 0.9
}
```

同一条样本支持多名审核员独立标注。系统使用以下字段计算一致性：

- `finalDecision`
- `categories`
- `severity`

任一字段不一致，样本进入争议池。

### 审核员一致率

- `GET /api/reviewer-agreement-stats`

返回每个审核员的：

- `totalLabeled`
- `agreementCount`
- `disagreementCount`
- `agreementRate`

### 争议样本池

- `GET /api/disputed-cases`
- `GET /api/disputed-cases/{id}`
- `POST /api/disputed-cases/{id}/resolve`

```json
{
  "resolvedBy": "senior_reviewer",
  "finalDecision": "REQUEST_REVISION",
  "finalCategories": ["DISCRIMINATION"],
  "finalSeverity": "HIGH",
  "resolutionComment": "以删除性别限制后重提为准"
}
```

存在未解决争议时，`POST /api/reviews/{id}/add-to-eval` 会返回
`LABEL_DISPUTE_UNRESOLVED`，避免不统一标签进入评估集。

## 13. 权限、租户隔离与审计日志 API

MVP 当前使用请求头模拟身份，后续可替换为 JWT、Session 或企业 SSO。

请求头：

- `x-user-id`
- `x-user-role`
- `x-tenant-id`

未传请求头时，本地开发默认视为 `SUPER_ADMIN`。

支持角色：

- `SUPER_ADMIN`
- `TENANT_ADMIN`
- `COMPLIANCE_MANAGER`
- `REVIEWER`
- `RULE_OPERATOR`
- `VIEWER`

关键约束：

- `REVIEWER` 只能处理人工复核。
- `RULE_OPERATOR` 可以编辑 draft 规则，但不能发布。
- `COMPLIANCE_MANAGER` 可以审批规则发布和回滚。
- `TENANT_ADMIN` 只能查看本 tenant 数据。
- `SUPER_ADMIN` 可以管理全局配置。

### 当前用户

- `GET /api/auth/me`

返回当前用户、角色、租户和权限列表。前端据此隐藏无权限按钮。

### 审计日志

- `GET /api/audit-operation-logs`

敏感操作会写入 `audit_operation_logs`，包括：

- 规则发布
- 规则回滚
- 灰度比例调整
- 人工复核结果修改
- runtime config 修改

### 规则发布审批

- `GET /api/rule-publish-approvals`

规则发布和回滚接口要求 `rule:approve_publish` 或 `rule:rollback` 权限，并生成
`rule_publish_approvals` 记录。

## 14. 申诉与复审 Agent

### 创建申诉

- `POST /api/appeals`

请求：

```json
{
  "tenantId": "tenant_001",
  "auditRunId": "audit_001",
  "submitterId": "enterprise_user_001",
  "reasonType": "UPDATED_POSTING",
  "reasonText": "企业认为原审核存在误判",
  "supplementalText": "已修改后的岗位文案"
}
```

`reasonType` 可选：

- `MISTAKE`
- `JOB_SPECIALTY`
- `UPDATED_POSTING`
- `INACCURATE_EVIDENCE`
- `RULE_NOT_APPLICABLE`
- `OTHER`

### 查看申诉

- `GET /api/appeals?tenantId=tenant_001&status=submitted`
- `GET /api/appeals/:id`
- `POST /api/appeals/:id/messages`

补充说明和附件名称保存前必须脱敏。

### 生成 Appeal Agent 复审报告

- `POST /api/appeals/:id/agent-report`

报告必须同时包含：

- `maintainReasons`：支持维持原结论的理由
- `overturnReasons`：支持撤销或调整原结论的理由
- `evidenceSummary`
- `similarCases`
- `recommendation`

Appeal Agent 的 `recommendation` 仅是复审建议，不得自动推翻原审核结论。

### 人工复审

- `POST /api/appeals/:id/review-result`

请求：

```json
{
  "reviewerId": "reviewer_001",
  "finalDecision": "OVERTURN",
  "comment": "企业已提交修改后文案，建议撤销原拦截并重新审核。"
}
```

`finalDecision` 可选：

- `MAINTAIN`
- `OVERTURN`
- `REQUEST_REVISION`

### 反哺评估和规则改进

- `POST /api/appeals/:id/add-to-eval`
- `POST /api/appeals/:id/create-rule-suggestion`
- `GET /api/appeals/rule-suggestions`

申诉成功或要求修改的样本可进入 eval case；申诉暴露的误杀、依据不准确或规则过宽问题可生成规则改进建议。

## 15. SaaS/API 产品化能力

### API 文档页面

- `GET /api/docs`：返回轻量 HTML API 文档。
- Web 前端页面：`/api-docs`。

### 套餐

- `GET /api/product/plans`

默认套餐：

| planId | 名称 | 月额度 |
| --- | --- | --- |
| `free_trial` | Free Trial | 100 |
| `starter` | Starter | 3000 |
| `pro` | Pro | 30000 |
| `enterprise` | Enterprise | 不限量或私有化约定 |

### 租户注册与品牌配置

- `POST /api/product/tenants`
- `GET /api/product/tenants/:tenantId`
- `PATCH /api/product/tenants/:tenantId/brand`

请求：

```json
{
  "tenantId": "tenant_001",
  "tenantName": "某某科技有限公司",
  "planId": "free_trial",
  "brandConfig": {
    "displayName": "某某招聘审核",
    "primaryColor": "#0f766e",
    "supportEmail": "support@example.com"
  }
}
```

### API Key 管理

- `POST /api/product/tenants/:tenantId/api-keys`
- `GET /api/product/tenants/:tenantId/api-keys`
- `DELETE /api/product/api-keys/:id`

API Key 明文仅在创建时返回。服务端只保存 `keyHash` 和 `keyPrefix`。

调用方式：

```http
Authorization: Bearer jca_xxxx_secret
x-api-key: jca_xxxx_secret
```

### 用量与额度

- `GET /api/product/tenants/:tenantId/usage`

使用 API Key 调用 `POST /api/audit/job` 或 `POST /api/audit/batch` 会扣减当前月额度。内部后台无 API Key 调用不计入 SaaS 用量。

### 批量审核

- `POST /api/audit/batch`
- `GET /api/audit/batch/:id`
- `GET /api/audit/batch/:id/items`

请求：

```json
{
  "tenantId": "tenant_001",
  "jobs": [
    {
      "jobPostingId": "job_001",
      "company": { "name": "某某科技有限公司" },
      "job": {
        "title": "行政专员",
        "description": "岗位描述"
      },
      "options": {
        "jurisdiction": "CN_MAINLAND",
        "enableRag": false
      }
    }
  ]
}
```

批量审核当前为异步任务。`POST /api/audit/batch` 返回 `202 Accepted`，响应包含：

- `id`
- `tenantId`
- `status`：`queued`、`processing`、`completed`、`partial_failed` 或 `failed`
- `totalCount`
- `queuedCount`
- `processingCount`
- `completedCount`
- `failedCount`
- `resultIds`
- `errors`

客户端应通过 `GET /api/audit/batch/:id` 轮询进度，通过
`GET /api/audit/batch/:id/items` 查看单条任务状态。

### 成本和限流

- `GET /api/usage/costs?tenantId=tenant_001&date=2026-06-26`
- `GET /api/usage/limits?tenantId=tenant_001`
- `PATCH /api/usage/limits/{tenantId}`

成本统计按 tenant 聚合，当前记录：

- 审核调用量
- LLM tokens 输入/输出
- LLM 成本
- RAG 成本
- 规则执行成本
- 总成本

限流支持：

- tenant 每日审核上限
- tenant 每分钟审核上限
- API Key 每分钟审核上限

```json
{
  "tenantDailyAuditLimit": 10000,
  "tenantPerMinuteLimit": 600,
  "apiKeyPerMinuteLimit": 300
}
```

单条审核有最大执行超时时间。超时后系统会尝试回退到确定性规则审核路径；普通业务异常仍返回错误，不会被静默吞掉。

### 报告导出

- `GET /api/audit/runs/:id/export?tenantId=tenant_001&format=csv`
- `GET /api/audit/runs/:id/export?tenantId=tenant_001&format=pdf`

CSV/PDF 导出内容必须保持审慎表述，不输出绝对法律裁判结论。

### Webhook

- `POST /api/product/tenants/:tenantId/webhooks`
- `GET /api/product/tenants/:tenantId/webhooks`
- `GET /api/product/tenants/:tenantId/webhook-deliveries`

支持事件：

- `audit.completed`
- `batch.completed`

MVP 支持 `mock://` URL 作为测试回调，也支持 HTTP POST 尝试投递。

## 16. 法规与平台规则更新 Agent

### 可信来源

- `POST /api/law-kb/sources`
- `GET /api/law-kb/sources`
- `POST /api/law-kb/sources/:id/check`

可信来源必须记录：

- `sourceUrl` / `baseUrl`
- `sourceType`
- `jurisdiction`
- `scope`

MVP 不自动发布或覆盖知识库文件；外部来源检查返回人工导入提示。

### 文档导入与差异

- `POST /api/law-kb/documents/import`
- `GET /api/law-kb/documents`
- `GET /api/law-kb/documents/:id/diff?version=v2`

导入请求必须包含：

```json
{
  "sourceId": "source_001",
  "title": "就业公平政策摘要",
  "sourceUrl": "https://example.gov.cn/employment/fair",
  "sourceType": "LAW",
  "jurisdiction": "CN_MAINLAND",
  "scope": "job_posting",
  "publishedAt": "2026-06-20T00:00:00.000Z",
  "effectiveFrom": "2026-08-01T00:00:00.000Z",
  "version": "v2",
  "categories": ["DISCRIMINATION"],
  "keywords": ["性别限制"],
  "content": "法规或平台规则正文"
}
```

差异报告输出：

- `addedClauses`
- `modifiedClauses`
- `deprecatedClauses`
- `unchangedCount`

### 更新建议与影响分析

- `POST /api/law-kb/suggestions`
- `GET /api/law-kb/suggestions?status=pending`
- `GET /api/law-kb/suggestions/:id`
- `GET /api/law-kb/impact-reports/:id`

`law_kb_update_suggestion` 必须保持 `pending`，不得自动发布。

### 人工确认与版本生成

- `POST /api/law-kb/suggestions/:id/approve`
- `GET /api/law-kb/versions`

批准后：

1. suggestion 状态变为 `approved`。
2. 生成新的 `lawKbVersion`。
3. 自动运行 eval。
4. 将 runtime config 的 `lawKbVersion.candidateVersion` 指向新版本。

### 灰度与回滚

- `POST /api/law-kb/versions/:version/rollout`
- `POST /api/rollouts/:id/rollback`

法规知识库版本通过现有 rollout 机制灰度发布和回滚，Agent 不得绕过人工确认直接发布。

## 17. 上线前安全与合规检查

### 生成上线检查报告

- `GET /api/security/launch-check/report`

权限：`global:manage`

返回：

```json
{
  "id": "security_check_xxx",
  "status": "ready",
  "summary": "上线前安全与合规门禁均已通过。",
  "checks": [
    {
      "id": "llm_input_redaction",
      "title": "LLM 输入默认脱敏",
      "status": "pass",
      "detail": "LLM 样例输入结果：候选人手机号138****5678..."
    }
  ],
  "createdAt": "2026-06-23T00:00:00.000Z"
}
```

### 数据保留策略

- `GET /api/security/data-retention/jobs`
- `POST /api/security/data-retention/jobs`

请求：

```json
{
  "tenantId": "tenant_001",
  "resourceType": "audit_runs",
  "retentionDays": 180,
  "enabled": true
}
```

### 数据删除请求

- `GET /api/security/data-deletion-requests`
- `POST /api/security/data-deletion-requests`
- `POST /api/security/data-deletion-requests/:id/execute`

请求：

```json
{
  "tenantId": "tenant_001",
  "targetType": "tenant",
  "reason": "用户要求删除历史审核数据"
}
```

所有原因文本保存前必须脱敏，执行删除必须写入 `audit_operation_logs`。

### 隐私导出请求

- `GET /api/security/privacy-export-requests`
- `POST /api/security/privacy-export-requests`

请求：

```json
{
  "tenantId": "tenant_001"
}
```

返回内容仅包含脱敏后的审计记录，不返回完整手机号、身份证号、银行卡号、邮箱等敏感信息。

## 18. 健康检查

## 18. 审核质检 Agent API

MVP 当前实现路径为 `/api/qa/*`，用于定期抽样检查 Agent 审核结果、人工复核结果、改写文案和证据引用质量。质检 Agent 只输出质量问题和改进建议，不直接修改原审核结论。

### 创建质检任务

- `POST /api/qa/inspection-jobs`

```json
{
  "tenantId": "tenant_001",
  "strategy": "high_risk_first",
  "sampleSize": 20,
  "ruleVersion": "1.0.0",
  "reviewerId": "reviewer_001",
  "includeRewrites": true,
  "includeEvidence": true
}
```

`strategy` 可选：

- `random`：按样本稳定随机抽样。
- `high_risk_first`：优先抽取高风险和严重风险样本。

返回质检任务摘要：

- `sampleCount`
- `issueCount`
- `summary`
- `status`

### 查询质检任务

- `GET /api/qa/inspection-jobs?tenantId=tenant_001`
- `GET /api/qa/inspection-jobs/{id}`

详情返回：

- `samples`：本次抽样对象，来源包括 `audit_run`、`human_review_feedback`、`rewritten_posting` 和 `evidence_link`。
- `results`：每个样本的检查项、分数和通过状态。

### 查询和关闭质量问题

- `GET /api/qa/issues?tenantId=tenant_001&status=open|resolved|all`
- `POST /api/qa/issues/{id}/resolve`

```json
{
  "resolvedBy": "qa_manager_001",
  "resolutionComment": "已加入回归评估集，并创建规则改进建议。",
  "addToEval": true,
  "createRuleSuggestion": true,
  "datasetId": "qa_failed_samples"
}
```

质量问题类型包括：

- `WRONG_DECISION`
- `WRONG_CATEGORY`
- `WRONG_SEVERITY`
- `BAD_MATCHED_TEXT`
- `IRRELEVANT_EVIDENCE`
- `UNSAFE_REWRITE`
- `SOP_INCONSISTENT_REVIEW`
- `APPEAL_HANDLING_RISK`

关闭问题时可选择将失败样本写入 `eval_cases`，也可基于关联复核单创建 `rule_improvement_suggestions`，用于后续规则运营。

## 19. 客户试点与 ROI 看板 API

MVP 当前实现路径为 `/api/pilots/*`，用于按 tenant 创建客户试点项目，聚合试点期间的审核效率、准确性和客户反馈，并导出 ROI 报告。

### 创建和查询试点项目

- `POST /api/pilots/projects`
- `GET /api/pilots/projects?tenantId=tenant_001`
- `GET /api/pilots/projects/{id}`

```json
{
  "tenantId": "tenant_001",
  "name": "A 客户招聘合规试点",
  "startDate": "2026-06-26",
  "endDate": "2026-07-26",
  "modes": ["shadow_mode", "assist_mode", "enforce_mode"],
  "avgReviewTimeBefore": 8,
  "avgReviewTimeAfter": 2,
  "hourlyLaborCost": 120,
  "description": "用于评估审核 Agent 的业务价值"
}
```

### 试点看板

- `GET /api/pilots/projects/{id}/dashboard`

返回：

- `project`
- `dailyMetrics`
- `report`
- `feedback`

指标包含：

- `totalJobsAudited`
- `autoPassRate`
- `autoRejectRate`
- `manualReviewRate`
- `avgReviewTimeBefore`
- `avgReviewTimeAfter`
- `timeSavedHours`
- `estimatedLaborCostSaved`
- `falsePositiveRate`
- `falseNegativeRate`
- `appealRate`
- `customerSatisfaction`
- `topRiskCategories`
- `topRuleHits`

### ROI 报告与导出

- `POST /api/pilots/projects/{id}/roi-report`
- `GET /api/pilots/projects/{id}/roi-report/export?format=markdown|pdf`

报告必须包含风险和限制说明，例如：

- ROI 为试点估算值，依赖人工反馈完整度和样本代表性。
- `shadow_mode` 不直接影响线上业务，其节省时间为模拟测算。
- 误杀率、漏判率需要持续用人工复核和申诉结果校准。
- 报告不构成法律意见，只用于评估审核辅助系统的业务价值。

PDF 导出当前为 MVP 占位文本报告，生产版应接入正式 PDF 渲染服务并做版式验收。

### 客户反馈

- `POST /api/pilots/projects/{id}/feedback`
- `GET /api/pilots/feedback?tenantId=tenant_001&pilotProjectId=pilot_xxx`

```json
{
  "feedbackType": "satisfaction",
  "rating": 4,
  "contactName": "客户经理",
  "comment": "试点看板能说明节省时间，但还需要更多样本。"
}
```

`feedbackType` 可选：

- `satisfaction`
- `risk`
- `feature_request`
- `bug`
- `other`

## 20. Beta 试运行交付包 API

MVP 当前实现路径为 `/api/beta-programs/*` 和 `/api/beta-feedback`，用于管理内部受控试运行交付动作。

### 创建和查询 Beta 项目

- `POST /api/beta-programs`
- `GET /api/beta-programs?tenantId=tenant_001`
- `GET /api/beta-programs/{id}`

```json
{
  "tenantId": "tenant_001",
  "name": "招聘合规审核 Agent Beta",
  "mode": "shadow",
  "startDate": "2026-06-26",
  "endDate": "2026-07-10",
  "scope": "内部审核员、运营、合规人员受控试用",
  "goals": ["验证准确性", "收集流程反馈"],
  "ownerId": "beta_owner_001"
}
```

模式：

- `shadow`
- `assist`
- `limited_enforce`

### 使用人员和模式配置

- `POST /api/beta-programs/{id}/participants`
- `PATCH /api/beta-programs/{id}/mode`

参与角色：

- `reviewer`
- `operator`
- `compliance`
- `observer`

### 问题反馈

- `POST /api/beta-programs/{id}/feedback`
- `GET /api/beta-feedback?tenantId=tenant_001&programId=beta_program_xxx&status=open`

反馈类型：

- `bug`
- `false_positive`
- `false_negative`
- `bad_evidence`
- `bad_rewrite`
- `ux_issue`
- `process_gap`
- `other`

### 每日 Beta 报告

- `POST /api/beta-programs/{id}/daily-reports`
- `GET /api/beta-programs/{id}/daily-reports`

日报记录活跃人员、审核量、人工复核量、反馈数量、阻塞项、摘要和下一步行动。

### Go / No-Go 检查

- `GET /api/beta-programs/{id}/go-no-go`
- `PATCH /api/beta-programs/{id}/go-no-go/{checkId}`

检查状态：

- `pending`
- `pass`
- `fail`
- `waived`

必选检查项存在 `pending` 或 `fail` 时，不建议扩大试运行或进入有限自动执行。

## 21. 使用人员培训与帮助中心 API

MVP 当前实现路径为 `/api/help-center` 和 `/api/training/*`，用于向审核员、运营人员展示培训内容，并记录首次阅读确认。

### 帮助中心内容

- `GET /api/help-center`

返回：

- `documents`：培训文档入口
- `riskLevels`：风险等级说明
- `feedbackTypes`：反馈类型说明
- `videoPlaceholders`：操作视频占位链接
- `onboardingChecklist`：新手任务清单
- `commonMisjudgmentCases`：常见误判案例

### 培训状态

- `GET /api/training/status?reviewerId=xxx&tenantId=tenant_001`

返回：

```json
{
  "reviewerId": "reviewer_001",
  "tenantId": "tenant_001",
  "completed": false
}
```

### 完成培训确认

- `POST /api/training/complete`

```json
{
  "reviewerId": "reviewer_001",
  "tenantId": "tenant_001",
  "documentVersion": "training-v1"
}
```

完成后记录 `reviewer_training_completed`。人工复核页应在首次使用时提示完成培训确认，并在反馈提交区域展示反馈类型定义。

## 22. 事故演练与应急预案 API

MVP 当前实现路径为 `/api/emergency/*` 和 `/api/incidents/*`，用于 Beta 测试期间的 Kill Switch、事故记录、复盘和规则回滚演练。

### Kill Switch

- `GET /api/emergency/switches`
- `PATCH /api/emergency/switches/{key}`
- `POST /api/emergency/switches/{key}/trigger`

`key` 可选：

- `force_manual_review`：所有审核结果降级为人工复核。
- `disable_llm`：禁用 LLM 辅助路径，按规则引擎降级输出。
- `disable_auto_reject`：自动拦截暂停，`REJECT` 降级为 `MANUAL_REVIEW`。

```json
{
  "enabled": true,
  "reason": "LLM timeout drill",
  "updatedBy": "incident_commander"
}
```

### 事故记录和动作

- `POST /api/incidents`
- `GET /api/incidents?tenantId=tenant_001&status=open`
- `GET /api/incidents/{id}`
- `POST /api/incidents/{id}/actions`

事故类型包括：

- `false_positive_spike`
- `false_negative`
- `system_error`
- `llm_failure`
- `rag_bad_citation`
- `data_leak`
- `rule_regression`
- `other`

### 事故复盘

- `POST /api/incidents/{id}/postmortem`

复盘必须包含：

- root cause
- impact
- timeline
- corrective actions
- prevention actions

### 规则回滚演练

- `POST /api/incidents/drills/rule-rollback`

该接口创建演练事故、记录回滚动作并生成复盘报告。MVP 不直接修改线上规则文件；真实回滚仍应走规则发布/回滚审批流程。

## 23. UAT 验收报告 API

MVP 当前实现路径为 `/api/uat/*`，用于在真实使用人员接入前生成最终验收报告，并控制是否允许开启 Beta Program。

### 生成和查询 UAT 报告

- `GET /api/uat/reports`
- `POST /api/uat/reports`
- `GET /api/uat/reports/{id}`

请求示例：

```json
{
  "generatedBy": "uat_operator",
  "currentVersion": "0.1.0",
  "checks": [
    {
      "key": "security",
      "status": "pass",
      "detail": "安全检查通过。"
    }
  ],
  "metrics": {
    "evalAccuracy": 1,
    "decisionAccuracy": 1,
    "categoryRecall": 1,
    "redTeamRecall": 0.95,
    "p95LatencyMs": 120
  }
}
```

报告必须包含：

- 当前版本号
- 已完成模块
- 未完成模块
- 已知限制
- 测试覆盖情况
- Eval 结果
- Red Team 结果
- 性能压测结果
- 安全检查结果
- 隐私检查结果
- 回滚演练结果
- 使用人员培训准备情况
- 是否建议进入 Beta
- Beta 边界和限制
- Go / No-Go 决策

`required=true` 且 `status=fail` 的检查项会进入 `blockers`，报告决策为 `NO_GO`。

### 批准进入 Beta

- `POST /api/uat/reports/{id}/approve-beta`

请求示例：

```json
{
  "tenantId": "tenant_beta",
  "name": "UAT 通过后的 Beta",
  "mode": "shadow",
  "startDate": "2026-06-26",
  "endDate": "2026-07-10",
  "ownerId": "compliance_manager_001"
}
```

约束：

- 有阻塞项时返回 `409 UAT_BLOCKED`，不得开启 Beta。
- 通过后创建 Beta Program，默认推荐 `shadow` 或 `assist` 模式。
- 批准动作必须写入敏感操作审计日志。

## 24. 健康检查

- `GET /health/live`：进程存活
- `GET /health/ready`：数据库、规则集和必要依赖可用

LLM 不可用是否影响 readiness 由部署策略决定，但审核接口必须按降级规则处理。

## 25. 发布质量门禁 API

MVP 当前实现路径为 `/api/releases/*`，用于在规则版本、知识库版本、模型配置和
Prompt 模板发布前执行自动质量检查。

### 创建发布候选

- `GET /api/releases/candidates`
- `POST /api/releases/candidates`

```json
{
  "name": "Rules 2.0.0",
  "target": "ruleVersion",
  "ruleVersion": "2.0.0",
  "evalDatasetId": "release_validation",
  "qualityMetrics": {
    "criticalRecall": 0.96,
    "falseNegativeRate": 0.01,
    "falsePositiveRate": 0.05,
    "evidenceAccuracy": 0.92,
    "rewriteSafetyRate": 0.96,
    "redTeamRecall": 0.86,
    "predictedRejectRateChange": 0.03
  }
}
```

`target` 可选：

- `ruleVersion`
- `lawKbVersion`
- `modelVersion`
- `promptVersion`

### 运行门禁和查询结果

- `POST /api/releases/candidates/{id}/run-gates`
- `GET /api/releases/candidates/{id}/gate-results`

门禁项包括：

- build 是否通过
- unit test 是否通过
- eval 是否通过
- red team eval 是否可运行且召回达标
- `criticalRecall >= 0.95`
- `falseNegativeRate <= 0.02`
- `falsePositiveRate` 低于阈值
- `evidenceAccuracy >= 0.9`
- `rewriteSafetyRate >= 0.95`
- `redTeamRecall >= 0.85`
- `reject_rate` 预测变化是否异常
- 是否存在人工审批记录

缺失关键指标时按失败处理，不允许静默放行。

### 审批与发布

- `POST /api/releases/candidates/{id}/approve`
- `POST /api/releases/candidates/{id}/publish`

普通发布要求：

1. 存在人工审批记录。
2. 最新门禁结果通过。
3. 发布对象绑定对应的 `ruleVersion` / `lawKbVersion` / `modelVersion` /
   `promptVersion`。

`forcePublish=true` 仅允许 `COMPLIANCE_MANAGER` 或 `SUPER_ADMIN` 使用，且必须写入
`audit_operation_logs`。发布 `ruleVersion`、`lawKbVersion` 或 `modelVersion` 会创建
0% 灰度计划，进入现有 rollout 机制。

## 26. 错误格式

```json
{
  "request_id": "req_uuid",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "field": "job.title",
        "reason": "REQUIRED"
      }
    ],
    "retryable": false
  }
}
```

建议错误码：

| HTTP | code                   | 场景                   |
| ---- | ---------------------- | ---------------------- |
| 400  | `VALIDATION_ERROR`     | 请求格式或字段错误     |
| 401  | `UNAUTHENTICATED`      | 未认证                 |
| 403  | `FORBIDDEN`            | 无权限                 |
| 404  | `REVIEW_NOT_FOUND`     | 资源不存在或租户不可见 |
| 409  | `IDEMPOTENCY_CONFLICT` | 幂等键请求体不一致     |
| 409  | `VERSION_CONFLICT`     | 人工复核并发冲突       |
| 422  | `RULESET_UNAVAILABLE`  | 无适用已发布规则集     |
| 429  | `RATE_LIMITED`         | 超出限额               |
| 503  | `SERVICE_UNAVAILABLE`  | 无法形成安全结果       |

## 27. 兼容性与版本控制

- `/v1` 内只增加可选字段，不删除或改变既有字段语义
- 数据库枚举扩展不等于 API 客户端自动兼容；SDK 应保留 unknown 分支
- 规则版本与 API 版本独立
- 响应中的依据文本是审核时快照，不应通过后续更新静默改变
