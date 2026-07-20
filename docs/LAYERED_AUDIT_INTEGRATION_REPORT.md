# 分层审核集成报告

`LayeredAuditEngine` 是 `auditJobPosting` 的包装阶段，不建立平行审核流程。

流程：输入质量 → 既有规则/RAG → 规则短路或 Fast LLM → 聚合/反思 → 异步增强标记。确定性 `REJECT`/`MANUAL_REVIEW` 不等待模型；模型不可用且规则无命中时按策略转人工复核。`routingTrace` 记录阶段状态、原因、模型和降级原因。

当前默认环境没有租户 verified provider，因此不会产生外部模型调用或费用。
