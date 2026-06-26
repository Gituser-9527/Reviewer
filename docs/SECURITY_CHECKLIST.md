# 上线前安全检查清单

本文档用于招聘岗位合规审核 Agent 进入封闭试运行或生产前的安全自检。结论应使用审慎表述，系统定位为审核辅助工具，不替代法律裁判。

## 必检项

| 检查项 | 标准 | 当前实现 |
| --- | --- | --- |
| 敏感信息明文保存 | 审核日志、操作日志、导出文件不得包含手机号、身份证号、银行卡号、邮箱等完整原文 | 通过 `packages/core/src/security/` 脱敏，API 新增上线检查报告 |
| LLM 输入脱敏 | 默认不得把完整个人敏感信息发送给模型供应商 | `sanitizeLLMMessages` 默认脱敏，上线报告包含样例校验 |
| 权限隔离 | 敏感 API 必须校验角色权限和 tenant 范围 | 通过 RBAC header mock 和 `AuthService` 执行 |
| 租户隔离 | 非 SUPER_ADMIN 不得访问其他 tenant 数据 | 审核、复核、评估、导出等接口均显式传入 tenantId |
| 高风险可追溯 | high/critical finding 必须包含 `ruleId` 或 `evidenceId` | ReflectionChecker 和上线检查报告覆盖 |
| 版本追踪 | 审核结果必须记录 ruleVersion、lawKbVersion、modelVersion | `AuditResult.context` 和 `audit_runs` 保存 |
| 审计日志 | 敏感操作必须记录 actor、operation、resource、requestId | `audit_operation_logs` 与 API 操作日志服务覆盖 |
| 数据保留 | 必须配置保留期限，并能查看当前策略 | `data_retention_jobs` 和 `/api/security/data-retention/jobs` |
| 数据删除 | 必须支持可审计删除请求 | `data_deletion_requests` 和执行接口 |
| 审计导出 | 必须支持导出脱敏审计记录 | `privacy_export_requests` |

## 上线门禁接口

- `GET /api/security/launch-check/report`：生成上线前安全与合规检查报告。
- `GET /api/security/check-results`：查看历史检查结果。
- `POST /api/security/data-retention/jobs`：配置数据保留期限。
- `POST /api/security/data-deletion-requests`：创建数据删除请求。
- `POST /api/security/data-deletion-requests/:id/execute`：执行删除请求。
- `POST /api/security/privacy-export-requests`：创建脱敏审计导出请求。

## 阻断条件

出现以下任一情况，不建议进入真实生产流量：

- LLM 输入样例仍包含完整手机号、身份证号、邮箱等敏感信息。
- 高风险审核结论缺少 `ruleId`、`evidenceId` 或人工复核理由。
- 规则发布、灰度比例调整、数据删除、人工复核修改未写入审计日志。
- 未配置租户隔离或角色权限。
- 无法说明拦截原因、证据来源和版本。

