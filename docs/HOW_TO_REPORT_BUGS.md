# How To Report Bugs

## Bug 反馈必须包含

- 问题标题。
- 严重度：low / medium / high / critical。
- 相关 auditRunId 或 reviewTicketId。
- 操作步骤。
- 实际结果。
- 期望结果。
- 是否影响真实业务发布。

## 严重度口径

- `critical`：数据泄露、批量错误拦截、无法回滚。
- `high`：严重误杀/漏判、错误依据影响多个租户。
- `medium`：单条样本错误、流程可绕过但有人工兜底。
- `low`：文案、展示或轻微体验问题。

## 隐私要求

提交 bug 时必须脱敏。不要粘贴完整个人敏感信息、API Key、数据库连接串或模型原始响应。
