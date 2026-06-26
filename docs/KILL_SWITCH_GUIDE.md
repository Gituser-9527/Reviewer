# Kill Switch Guide

## 开关

### force_manual_review

所有审核结果最终降级为 `MANUAL_REVIEW`，用于误杀、漏判或证据质量不稳定时保守兜底。

### disable_llm

禁用 LLM 辅助路径，审核按规则引擎和本地证据降级输出。当前结果会记录 `modelVersion=llm-disabled-by-emergency-switch`。

### disable_auto_reject

自动拦截暂停。原本 `REJECT` 的结果降级为 `MANUAL_REVIEW`。

## 使用原则

- 开启前必须记录原因。
- 开启后必须记录事故或演练动作。
- 解除前必须确认复盘和回归验证完成。
- 不得用 Kill Switch 掩盖规则质量问题。
