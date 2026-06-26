# UAT Acceptance Report

## 1. 当前版本号

- Version: `0.1.0`
- Report date: 2026-06-26
- Scope: 招聘岗位合规审核 Agent 受控 Beta 前验收

## 2. 已完成模块

- 项目骨架、TypeScript monorepo、API、Web、shared/core/database 包。
- 核心类型、Zod schema、审核结果和 finding/evidence 契约。
- YAML 规则引擎、规则文件、规则命中测试。
- 岗位结构化抽取、Mock LLM 抽取接口。
- Audit orchestrator：预处理、抽取、规则、RAG evidence、风险聚合、Reflection、AuditResult。
- REST API：单条审核、审核查询、人工复核、评估、规则、运行配置、Beta、事故响应等 MVP 接口。
- 前端审核页、人工复核页、规则后台、监控、Beta、应急、帮助中心等 MVP 页面。
- RAG 本地知识库检索层和 evidence 输出。
- Eval、真实数据评估、Red Team、Release Gate。
- 人工复核闭环、申诉、质检、规则改进建议。
- 安全脱敏、隐私检查、审计日志、权限与租户隔离。
- Kill Switch、规则回滚演练、事故记录和复盘。

## 3. 未完成模块

- 真实 LLM Provider 生产接入与供应商侧数据处理协议确认。
- 法规和平台规则知识库的法务最终审批。
- 所有运营模块的 PostgreSQL 持久化 repository 适配。
- 生产级压测、容量规划、SLO 和告警阈值校准。
- 真实身份系统、企业级权限、SSO 和审计导出集成。
- 多地区法规、多平台规则叠加和客户自定义规则优先级治理。

## 4. 已知限制

- 系统是审核辅助工具，不输出绝对法律裁判结论。
- Beta 期间建议只使用 `shadow` 或 `assist` 模式，不建议直接全量自动拦截。
- 当前部分后台能力为 MVP 内存实现，生产前必须接入持久化。
- Eval 和 Red Team 数据集仍需持续扩充真实、脱敏、人工标注样本。
- 法规、政策和平台规则内容必须由合规负责人确认来源、版本和适用范围。

## 5. 测试覆盖情况

- `npm test` 已覆盖核心类型、规则引擎、抽取、编排器、RAG、Reflection、API、人工复核、评估、应急开关和 UAT 路由。
- 最近一次本地验证：`107 passed | 1 skipped`。
- `npm run build` 通过。
- `npm run lint` 通过。

## 6. Eval 结果

- 已提供 `npm run eval`、`npm run eval:real`、`npm run eval:dataset`。
- UAT 默认门禁要求 Eval 可运行，并记录 decisionAccuracy、categoryRecall、evidenceAccuracy、rewriteSafetyRate。
- 进入 Beta 前应固定一版基线评估报告，作为后续规则变更对比基准。

## 7. Red Team 结果

- 已提供 `npm run eval:redteam`。
- Release Gate 默认要求 `redTeamRecall >= 0.85`。
- 红队失败样本应进入规则改进建议或评估集。

## 8. 性能压测结果

- 已提供 p95 latency 指标占位、批量异步审核、限流和成本统计 MVP。
- 当前尚未完成生产级容量压测。
- Beta 限制：仅允许小流量、指定 tenant、受控岗位来源进入试运行。

## 9. 安全检查结果

- 已提供上线安全检查、权限隔离、敏感操作审计、事故响应和 Kill Switch。
- 高风险结论必须可追踪到 `ruleId` 或 `evidenceId`。
- 禁止输出“企业已经违法”等绝对法律结论。

## 10. 隐私检查结果

- `packages/core/src/security/` 提供统一敏感信息检测、脱敏、哈希和审计日志清洗。
- LLM 输入默认脱敏。
- 审计日志默认不得保存身份证号、手机号、银行卡号、邮箱、微信号、详细地址和验证码明文。

## 11. 回滚演练结果

- 已提供规则回滚演练 API：`POST /api/incidents/drills/rule-rollback`。
- 已提供应急开关：`force_manual_review`、`disable_llm`、`disable_auto_reject`。
- 事故处置支持记录 action 和 postmortem。

## 12. 使用人员培训准备情况

- 已提供审核员培训手册、运营 FAQ、常见误判案例、申诉处理说明和问题上报说明。
- 前端帮助中心已包含风险类型说明、反馈类型说明和新手任务清单。
- 支持记录 `reviewer_training_completed`。

## 13. 是否建议进入 Beta

建议进入受控 Beta，但仅限：

- `shadow` 或 `assist` 模式。
- 指定 tenant、指定审核员、指定岗位来源。
- 每日复盘误杀、漏判、RAG 错误引用和人工反馈一致性。
- 保持 Kill Switch 可用，并明确事故升级负责人。

## 14. Beta 边界和限制

- 不直接替代人工最终判断。
- 不作为对企业的法律定性或处罚依据。
- 不自动发布法规知识库或规则版本。
- 不在未审批场景使用真实 LLM 输出作为唯一依据。
- 出现异常指标或隐私风险时立即暂停自动处置。

## 15. Go / No-Go 决策

当前建议：`GO` for controlled Beta。

No-Go 条件：

- 任一 required UAT 检查项为 `fail`。
- 安全或隐私检查为 `blocked`。
- Eval 或 Red Team 无法运行。
- Kill Switch 或回滚演练不可用。
- 使用人员未完成 SOP 和反馈标注培训。
