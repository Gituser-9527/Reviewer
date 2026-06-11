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

`POST /reviews/{review_id}/manual-decisions`

```json
{
  "decision": "BLOCK",
  "risk_level": "HIGH",
  "reason_code": "CONFIRMED_DISCRIMINATION",
  "comment": "确认该年龄限制与岗位履职无直接关系。",
  "finding_ids": ["finding_uuid"]
}
```

约束：

- 仅复核角色可调用
- `comment` 必填且有长度限制
- 使用乐观锁或 `If-Match` 防止重复覆盖
- 响应返回更新后的当前投影；机器结论保持不变

## 7. 获取审核日志

`GET /reviews/{review_id}/audit-logs?cursor=&limit=`

仅返回调用方有权查看的事件。事件至少包含：事件类型、时间、操作者类型/ID、前后状态摘要、规则/模型版本和关联 ID。

## 8. 规则集管理 API

管理 API 仅定义目标契约，MVP 可先通过受控 CLI/发布流程实现：

- `GET /rulesets`：列出规则集与状态
- `GET /rulesets/{id}`：查看元数据和校验结果
- `POST /rulesets/validate`：校验 YAML，不发布
- `POST /rulesets/{id}/publish`：发布指定版本
- `POST /rulesets/{id}/rollback`：切回已发布版本

规则发布必须记录内容哈希、审批人、变更说明和校验报告。

## 9. 健康检查

- `GET /health/live`：进程存活
- `GET /health/ready`：数据库、规则集和必要依赖可用

LLM 不可用是否影响 readiness 由部署策略决定，但审核接口必须按降级规则处理。

## 10. 错误格式

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

## 11. 兼容性与版本控制

- `/v1` 内只增加可选字段，不删除或改变既有字段语义
- 数据库枚举扩展不等于 API 客户端自动兼容；SDK 应保留 unknown 分支
- 规则版本与 API 版本独立
- 响应中的依据文本是审核时快照，不应通过后续更新静默改变
