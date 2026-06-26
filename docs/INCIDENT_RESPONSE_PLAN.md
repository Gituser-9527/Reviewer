# Incident Response Plan

## 目标

在 Beta 测试中出现误杀、漏判、系统异常、LLM 故障、RAG 错误引用或数据泄露风险时，快速止损、记录、复盘并形成回归样本。

## 分级

- P0：数据泄露、批量错误拦截、系统无法回滚。
- P1：严重误杀/漏判、错误依据影响多个 tenant。
- P2：单点规则偏差、可由人工兜底的系统异常。
- P3：展示、文案、低风险体验问题。

## 处置步骤

1. 记录 `incident_event`。
2. 必要时开启 Kill Switch：`force_manual_review`、`disable_llm` 或 `disable_auto_reject`。
3. 通知 Beta owner、合规负责人和技术负责人。
4. 收集 auditRunId、ruleVersion、lawKbVersion、modelVersion、命中规则和证据。
5. 执行修复、回滚或降级。
6. 生成 `incident_postmortem`。
7. 把失败样本加入 eval/red-team 或规则改进建议。
