# Product Maturity Assessment

## 当前阶段判断

当前系统处于 **V1.5：工程化 MVP / 试运行前候选阶段**。

判断依据：

- 已经具备可运行的端到端审核链路：岗位输入、标准化、结构化抽取、YAML 规则、RAG evidence、风险聚合、Reflection、AuditResult、REST API、前端页面、人工复核、数据库持久化和评测脚本。
- 已经具备基础工程化能力：monorepo、TypeScript、lint、test、build、eval、CI、Docker Compose、health/readiness、metrics 占位。
- 但尚未达到 V2 生产可用：鉴权/RBAC、租户隔离强约束、完整审计日志、法规依据正式审批、规则回滚、监控告警、生产数据隐私策略、OpenAPI 契约和真实灰度流程仍不足。

阶段定义建议：

| 阶段 | 定义                                                                        | 当前是否达到 |
| ---- | --------------------------------------------------------------------------- | ------------ |
| V0   | 原型或单模块验证，不能完整审核                                              | 已超过       |
| V1   | MVP 可端到端跑通，适合演示和内部评测                                        | 已达到       |
| V1.5 | 工程化 MVP，具备 CI、持久化、评测、人工复核和初步运维，可进入受控试运行准备 | 当前阶段     |
| V2   | 生产可用，具备权限、审计、监控、正式规则治理和回滚                          | 未达到       |
| V3   | 企业级规模化，多租户、灰度、知识治理、可观测性和质量闭环成熟                | 未达到       |

## 已完成能力

### 1. 核心审核流程

状态：**基本完整，达到 MVP 要求**。

已覆盖：

- `JobPostingInput` 输入校验。
- 文本标准化。
- `basicExtractor` 抽取 `JobFacts`。
- YAML 规则引擎执行。
- 本地 RAG evidence 检索。
- `RiskAggregator` 聚合决策。
- `ReflectionChecker` 做一致性检查。
- 输出 `AuditResult`。
- API 与前端均可完成一次岗位审核。

最近验收样例：

```json
{
  "decision": "REJECT",
  "riskLevel": "CRITICAL",
  "findingCount": 5,
  "evidenceCount": 15
}
```

### 2. 规则引擎

状态：**MVP 稳定，但规则治理仍弱**。

已完成：

- 读取 `rules/cn-mainland/*.yml`。
- 支持 `containsAny`、`regex`、`severity`、`action`、`ruleVersion`。
- 当前已有 21 条初始规则。
- 支持 disabled 规则。
- 支持 draft/published 两阶段管理。
- 发布前运行 `npm run eval`。

不足：

- 当前 YAML schema 是轻量实现，不完全等同 `docs/RULE_ENGINE.md` 中长期规则 schema。
- 缺少规则内容哈希、审批记录、diff、灰度和正式回滚。
- 每条规则还没有独立的正例、反例和 evidence 断言夹具。

### 3. RAG Evidence

状态：**可追溯，但准确性仍是本地启发式**。

已完成：

- `EvidenceRetriever` 接口。
- `LocalKnowledgeRetriever` 读取 Markdown/JSON。
- 支持 category 过滤、jurisdiction/platform 过滤和关键词排序。
- evidence 包含 `id`、`title`、`sourceType`、`quote`、`url`、`version`、metadata。
- `Finding.evidenceIds` 与 `AuditResult.evidence` 已接入。

不足：

- 不是向量检索，也不是混合检索。
- 没有依据审批状态、生效期/失效期过滤。
- 没有 citation precision 评测。
- 当前知识库文本需要法务确认，不能视为正式生产依据。

### 4. Reflection

状态：**能发现确定性一致性错误，但不是语义审校器**。

已完成检查：

- high/critical finding 是否有 `ruleId` 或 `evidenceId`。
- `matchedText` 是否出现在原文中。
- finding decision 与 severity 是否匹配。
- final decision/riskLevel 是否与聚合结果一致。
- critical 是否必须 `REJECT`。
- high 是否至少 `MANUAL_REVIEW`。
- evidence category 是否与 finding category 匹配。
- 改写后是否仍包含高风险词。
- 是否出现绝对法律结论。
- 是否泄露内部规则权重。

不足：

- 主要是规则化检查，不能发现复杂语义漏判。
- `correctedResult` 只覆盖部分证据不足场景；主流程目前 `assertValid` 会直接抛错，而不是总能自动降级返回。
- 不具备 LLM 辅助反思，也没有人工标注驱动的 reflection 评测集。

### 5. 评估集

状态：**足够支撑 MVP 回归，不足以支撑生产上线**。

当前情况：

- `evals/datasets/job-posting-cases.jsonl`：55 条样本。
- 覆盖正常岗位、性别限制、婚育限制、收费押金、培训贷、虚假高薪、隐私、信息不完整、多风险混合、边界样本。
- `npm run eval` 结果：

```json
{
  "total": 55,
  "passed": 55,
  "failed": 0,
  "accuracy": 1,
  "categoryRecall": 1,
  "decisionAccuracy": 1
}
```

不足：

- 样本均为合成样本，不代表真实分布。
- 数量偏少，缺少 hard negatives、对抗样本、真实匿名样本和人工双标。
- 没有 precision/recall/F1、混淆矩阵、citation precision、改写安全指标。

### 6. 人工复核闭环

状态：**MVP 闭环可用，运营闭环不足**。

已完成：

- `MANUAL_REVIEW` 可创建复核单。
- 有待复核列表、详情页和人工结论提交。
- 支持 `APPROVE`、`REJECT`、`REQUEST_REVISION`。
- 反馈写入 `human_review_feedback`。

不足：

- 无权限、领取、转派、SLA、复核原因码和并发保护。
- 人工反馈尚未自动进入评测样本候选池。
- 没有人工推翻率、复核积压和处理时长指标。

### 7. 数据库日志与持久化

状态：**核心结果可持久化，完整审计日志不足**。

已完成表：

- `job_postings`
- `audit_runs`
- `audit_findings`
- `audit_evidence_links`
- `compliance_rules`
- `human_review_feedback`

已完成：

- 审核结果、findings、evidence links 可保存。
- `inputHash` 用于追踪和去重。
- `rawTextRedacted` 保存脱敏文本。
- 人工复核反馈可保存。

不足：

- 缺少 `audit_events` 追加式审计事件表。
- 缺少 `model_runs`、规则发布审计、依据快照表。
- 审核日志查询 API 未完成。
- 无乐观锁、幂等键、租户隔离数据库策略和备份恢复验证。

### 8. 隐私脱敏

状态：**核心工具已具备，但 API 返回侧未完全收口**。

已完成：

- `detectSensitiveInfo(text)`
- `redactSensitiveInfo(text)`
- `hashSensitiveValue(value)`
- `sanitizeAuditLog(payload)`
- 手机号、身份证号、邮箱、银行卡号、微信号、基础地址、验证码识别。
- LLM messages 默认脱敏。
- 数据库持久化使用脱敏文本和 input hash。
- API request logging 不记录 body。

高风险不足：

- API 返回的 `AuditResult` 仍可能包含岗位原文命中片段、evidence quote 或 finding metadata 中的敏感文本。
- 详细地址和微信号识别仍是启发式规则。
- 缺少日志脱敏扫描、响应脱敏策略和生产数据保留策略。

### 9. CI/CD

状态：**MVP CI 已具备**。

GitHub Actions 已包含：

- `npm ci`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run eval`

不足：

- 没有安全扫描、依赖漏洞门禁、Docker build 验证。
- 没有数据库 migration 验证。
- 没有部署流水线、环境审批和回滚。

### 10. 规则版本管理与回滚

状态：**有版本发布，无正式回滚**。

已完成：

- draft/published 状态。
- 发布前 eval。
- 发布后记录 `ruleVersion`、发布时间、actorId、ruleCount。

不足：

- 没有 rollback API。
- 没有版本 diff。
- 没有审批状态。
- 没有内容哈希。
- 没有将发布记录写入数据库。

### 11. 监控指标

状态：**仅占位，不足以生产运维**。

已完成：

- `/metrics` Prometheus 文本占位。
- 计数：requests、responses、errors、uptime。
- health/readiness。

不足：

- 没有审核耗时分位数。
- 没有规则命中率、RAG 无结果率、人工复核率。
- 没有 LLM fallback、token、成本指标。
- 没有告警、仪表盘、traceId、OpenTelemetry。

### 12. 小范围真实岗位试运行

结论：**不建议直接进入会影响发布决策的真实岗位试运行；可以准备“影子模式/只读建议模式”的受控试运行。**

允许的试运行形态：

- 仅内部运营/法务可见。
- 不自动拦截、下架或处罚企业。
- 不把结果直接展示给企业客户作为最终结论。
- 使用去标识化或最小化真实岗位数据。
- 所有高风险输出由人工复核确认。

不建议的试运行形态：

- 直接接入线上发布链路并自动拦截。
- 直接对企业展示“违法”或确定性法律判断。
- 在未完成权限和审计前开放规则管理后台。

## 未完成能力

- 正式鉴权、RBAC、API Key 和租户隔离。
- OpenAPI 契约与实际 API 路径统一。
- 完整审计事件追加写与查询。
- 法规/平台依据正式审批和版本治理。
- 规则 rollback、diff、审批、灰度。
- pgvector 或混合检索 RAG。
- 真实 LLM 接入后的安全降级和成本监控。
- 改写后二次审核的完整闭环。
- 生产级监控、告警、日志脱敏扫描。
- 真实样本评测、人工双标和法务验收。

## 高风险缺口

1. **缺少鉴权和权限控制**
   - API 和规则管理后台没有生产级权限。
   - 风险：未授权用户可查看审核结果、提交复核、修改规则。

2. **API 返回侧敏感信息未统一脱敏**
   - finding matched text、evidence quote、metadata 可能包含原文敏感信息。
   - 风险：真实岗位中若包含手机号、身份证号、地址等，可能通过响应泄露。

3. **法规与平台依据未正式确认**
   - 当前 knowledge 是手动维护文本，但未形成审批、生效期和正式来源治理。
   - 风险：引用依据不适合直接用于生产合规结论。

4. **没有完整审计事件**
   - 缺少 `audit_events` 和规则发布/人工复核的完整追加日志。
   - 风险：生产事故或争议时无法完整还原决策链。

5. **规则管理无回滚和审批**
   - 发布后可记录版本，但不能一键回滚，缺少双人审批和 diff。
   - 风险：错误规则可能进入线上并影响大量审核。

6. **评测集不足以证明生产安全**
   - 55 条合成样本只能证明回归可跑，不能证明真实分布表现。
   - 风险：真实岗位表达导致漏判/误杀。

## 中风险缺口

1. **RAG 检索准确性不足**
   - 当前只做类别过滤和关键词排序，没有 citation precision 评测。

2. **Reflection 不是语义级防线**
   - 能发现格式和一致性错误，但无法发现复杂漏判。

3. **数据库模型不完整**
   - 缺少 `model_runs`、knowledge snapshot、idempotency、audit event。

4. **监控指标不足**
   - 没有结论分布、风险类别、规则命中、复核率、延迟分位数。

5. **人工复核运营能力弱**
   - 无领取、转派、SLA、复核原因码、推翻分析。

6. **合规改写能力仍弱**
   - 当前不具备高质量改写生成和改写后二次审核的完整产品闭环。

7. **Docker Compose 未在当前机器验证**
   - 文档和配置存在，但本地环境此前没有 Docker CLI。

## 低风险缺口

1. **规则 schema 与长期文档不完全一致**
   - 需要统一 MVP YAML 格式与长期 schema。

2. **命中次数仍为占位**
   - 规则后台 `hitCount` 固定为 0，后续需从日志/指标聚合。

3. **文档仍有早期 API 路径残留**
   - `docs/API_SPEC.md` 中仍保留部分 `/reviews` 和 `/api/v1` 目标契约描述。

4. **依赖漏洞需评估**
   - 最近验收中 `npm install` 报 2 个 moderate vulnerabilities，未做破坏性修复。

5. **缺少性能压测**
   - 尚未验证 P95、并发、长文本输入和规则规模增长后的性能。

## 是否建议试运行

### 结论

**不建议进入生产决策链路试运行。**

**建议进入“内部影子模式试运行准备阶段”。**

### 可接受试运行条件

- 输入数据先去标识化或最小化。
- 结果只给内部审核/法务团队看。
- 不自动影响岗位发布状态。
- 所有 `REJECT`/`MANUAL_REVIEW` 结论由人工确认。
- 禁止对外输出绝对法律结论。
- 试运行样本必须进入评测与人工反馈闭环。

## 试运行前必须完成事项

1. **接入最小鉴权**
   - 至少 API Key 或内部 SSO。
   - 规则管理、人工复核、审核查询必须区分权限。

2. **统一 API 响应脱敏**
   - 对 `AuditResult` 中的 evidence quote、matchedText、metadata 做响应级脱敏。
   - 增加响应脱敏回归测试。

3. **完成审计事件表和写入**
   - 审核提交、规则发布、人工复核、错误降级都应写 `audit_events`。

4. **冻结试运行规则和依据**
   - 由法务/合规确认规则、knowledge 文本、适用范围和禁止表达。

5. **补充真实匿名样本评测**
   - 至少覆盖 300-500 条去标识化岗位样本。
   - 增加 hard negatives、边界表达、对抗样本。

6. **规则发布加回滚**
   - 支持按版本回滚。
   - 发布记录包含内容哈希、评测摘要、操作者。

7. **增加基本运营指标**
   - 结论分布、风险类别分布、规则命中率、人工复核率、错误率、P95 延迟。

8. **明确试运行 SOP**
   - 人工确认流程、误报漏报登记、升级路径、数据保留期。

## 下一阶段路线图

### 阶段 A：V1.5 加固到可影子试运行

目标：内部真实样本影子试运行，不影响线上发布。

- API Key/内部鉴权。
- 响应脱敏。
- 审计事件追加写。
- 规则 rollback。
- 法务确认首批规则和知识库。
- 评测集扩展到 300+。
- 增加结论分布和规则命中 metrics。

### 阶段 B：V2 生产可用

目标：受控接入线上审核流程，可作为人工审核辅助系统。

- RBAC 与租户隔离。
- 完整 OpenAPI。
- 数据库幂等、乐观锁、审计查询。
- 规则审批、diff、灰度、回滚。
- RAG 依据审批、生效期和引用快照。
- 监控告警和仪表盘。
- 人工复核 SLA、领取、转派、推翻分析。
- 真实样本评测与法务验收报告。

### 阶段 C：V3 成熟平台

目标：多租户、多规则集、多地区、可规模化运营。

- pgvector + 关键词混合检索。
- 多模型路由与成本质量监控。
- 规则/知识自动变更检测，但保持人工审批。
- 批量审核、Webhook、异步任务队列。
- 客户自定义规则的受控优先级。
- 漂移监控、红队测试、偏差评估。
- 完整数据治理：删除、归档、法律保留、备份恢复。

## 总结

当前系统已经具备 **工程化 MVP 的骨架和核心能力**，可以支撑内部演示、离线评测和受控影子试运行准备。它还不是生产可用系统，最关键的差距不是“能不能审核”，而是 **权限、审计、依据治理、响应脱敏、规则回滚和真实样本验证**。

因此成熟度判断为：**V1.5，但未达到 V2**。
