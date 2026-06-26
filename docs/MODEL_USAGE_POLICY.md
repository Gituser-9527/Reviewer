# 模型使用政策

## 使用边界

LLM 只能辅助以下任务：

- 岗位结构化抽取
- 风险解释
- 合规改写
- Reflection 辅助检查

LLM 不得单独决定最终审核结论，不得绕过规则引擎，不得编造法规、条款或平台规则。

## 输入保护

所有 LLM 输入默认必须经过：

- `redactSensitiveInfo(text)`
- `sanitizeLLMMessages(messages)`
- 必要时使用 `sanitizeAuditLog(payload)` 清洗调用日志

除非经过明确审批，不得向模型供应商发送完整手机号、身份证号、银行卡号、邮箱、微信号、详细地址或验证码。

## 输出约束

LLM 输出必须满足：

- 通过 zod schema 校验。
- 失败时 fallback 到规则引擎和人工复核。
- 不得输出“该企业已经违法”“构成犯罪”等绝对法律结论。
- 不得把模型生成的法规名称当作权威依据。
- 高风险 finding 必须关联 `ruleId`、`evidenceId` 或人工复核理由。

## 版本记录

每次审核必须记录：

- modelProvider
- modelName
- modelVersion
- promptVersion
- ruleVersion
- lawKbVersion

当前 MVP 在 `AuditResult.context` 中记录 ruleVersion、lawKbVersion、modelVersion；真实 LLM 接入前应扩展完整模型元数据和调用审计。

## 日志策略

- 默认不保存完整 Prompt。
- 默认不保存供应商原始响应。
- 可保存脱敏后的错误码、耗时、fallbackUsed、modelVersion。
- LLM 调用日志保留期限建议为 30 天或关闭。

