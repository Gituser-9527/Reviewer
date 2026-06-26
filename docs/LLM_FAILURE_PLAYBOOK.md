# LLM Failure Playbook

## 常见故障

- LLM 超时。
- Provider 返回格式不符合 schema。
- API Key 不可用。
- 输出包含不允许的绝对法律结论。

## 降级策略

1. 开启 `disable_llm`。
2. 系统使用规则引擎和本地证据路径继续审核。
3. 高风险或证据不足样本进入人工复核。
4. 记录 `incident_event`，必要时生成规则或 Prompt 改进任务。

## 恢复条件

- Mock/集成测试通过。
- 输出 schema 校验通过。
- 最近一批样本无 LLM 错误。
- 合规负责人确认可以恢复。
