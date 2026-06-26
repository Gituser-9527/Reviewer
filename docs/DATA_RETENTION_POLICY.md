# 数据保留与删除策略

## 目标

确保招聘岗位合规审核 Agent 只在必要期限内保存审核数据，并提供可审计的数据删除与导出能力。

## 默认保留建议

| 数据 | 建议期限 | 说明 |
| --- | --- | --- |
| audit_runs | 180 天 | 用于审核追踪、申诉和模型/规则评估 |
| audit_operation_logs | 365 天 | 用于敏感操作审计 |
| human_review_feedback | 365 天 | 用于评估集沉淀和规则改进 |
| eval_cases | 长期保留，需脱敏 | 作为冻结评测集，严禁包含明文个人敏感信息 |
| llm_call_logs | 30 天或关闭 | 仅保存脱敏后的摘要、版本和错误码 |

## 配置接口

通过以下接口配置保留策略：

```http
POST /api/security/data-retention/jobs
Content-Type: application/json

{
  "tenantId": "tenant_001",
  "resourceType": "audit_runs",
  "retentionDays": 180,
  "enabled": true
}
```

## 删除请求流程

1. 创建删除请求：`POST /api/security/data-deletion-requests`。
2. 校验租户和权限：仅 `SUPER_ADMIN` 或具备全局管理权限的角色可执行。
3. 执行删除：`POST /api/security/data-deletion-requests/:id/execute`。
4. 写入操作审计日志：记录 actor、tenantId、resourceId、deletedRecords、requestId。
5. 保留删除请求本身作为审计凭证，文本字段必须脱敏。

## 删除范围

MVP 当前支持：

- 按 tenant 删除本地内存审核结果。
- 删除请求记录和执行结果审计。

生产数据库接入前必须补充：

- PostgreSQL 仓储的软删除或硬删除策略。
- 关联表级联范围确认。
- 法规要求必须保留的审计记录例外规则。

