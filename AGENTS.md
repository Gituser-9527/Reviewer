# AGENTS.md

## Project Name

Job Compliance Audit Agent

## Language

- 使用中文解释业务逻辑、产品逻辑、架构决策和实现说明。
- 代码、变量名、函数名、接口名、文件名、数据库字段名使用英文。
- 对外报告应使用审慎表述，避免绝对法律结论。

## Project Mission

构建一个可解释、可审计、可配置、可扩展的招聘岗位合规审核 Agent，用于辅助平台审核企业发布的招聘岗位是否存在合规风险。

系统遵循以下原则：

- 确定性规则优先
- LLM 辅助判断
- RAG 提供证据支撑
- 高风险结论必须可追溯
- 依据不足时人工复核兜底
- 审核助手定位，不替代法律裁判

## Product Goal

本项目用于审核企业发布的招聘岗位是否存在合规风险，包括但不限于：

- 就业歧视
- 性别或婚育限制
- 入职收费、押金、培训贷
- 虚假或夸大招聘
- 个人信息过度收集
- 岗位信息不完整
- 劳动合同相关风险
- 平台招聘规则风险
- 其他招聘合规风险

系统输出的结论应服务于平台审核、风控拦截、人工复核和企业修改建议。

## Current Stage

当前仅完成规划和文档初始化。

除非任务明确进入实现阶段，不要创建：

- 业务代码
- 项目脚手架
- 依赖配置
- 数据库迁移
- 生产级规则文件

在实现前，应优先检查并完善相关设计文档、接口契约、数据模型、规则格式和验收标准。

## Technical Stack

- Backend: Node.js + TypeScript
- API: REST
- Database: PostgreSQL
- Vector DB: pgvector
- Frontend: Next.js + React
- Rule Config: YAML
- LLM Provider: 抽象接口，不得与具体模型或供应商强绑定
- Test: Vitest 或 Jest

## Authority Documents

以下文档是项目权威依据：

- 产品范围与验收：`docs/PRD.md`
- 模块边界与运行流程：`docs/ARCHITECTURE.md`
- HTTP 契约：`docs/API_SPEC.md`
- 数据模型：`docs/DATABASE_SCHEMA.md`
- 规则格式与决策：`docs/RULE_ENGINE.md`
- RAG 演进：`docs/RAG_DESIGN.md`
- 质量门禁：`docs/EVAL_PLAN.md`
- 实施顺序：`TASKS.md`

当文档之间存在冲突时，不要静默选择。

应按以下优先级识别和处理冲突：

1. 安全性
2. 明确产品验收
3. API / 数据契约
4. 实现便利性

必要时，应更新对应文档，或在 `docs/adr/` 中新增 ADR 记录架构决策。

## Architecture Principle

系统采用以下主流程：

```text
Job Input
-> Preprocess
-> Extract Structured Facts
-> Route
-> Rule Engine
-> RAG Evidence Retrieval
-> LLM Checkers
-> Risk Aggregation
-> Reflection
-> Final Report
-> Audit Log
```

### Core Design Principles

- MVP 阶段优先采用模块化单体，保持清晰领域边界。
- TypeScript 必须开启严格模式。
- 边界输入必须进行运行时校验。
- 领域层不得依赖 HTTP、数据库 ORM 或具体 LLM SDK。
- LLM、RAG、时钟、ID 生成器和持久化能力必须通过接口注入。
- 规则 YAML 不允许执行任意代码。
- 硬拦截规则优先于模型判断。
- 模型失败、结果无效或依据不足时，不得默认通过。
- 改写后的招聘文案必须经过二次规则检查。
- 业务历史和审计事件不得原地覆盖。
- 所有租户数据访问必须显式携带租户上下文。
- 所有模块都要保持可替换、可测试、可扩展。

## Agent Responsibilities

本 Agent 应负责：

1. 接收招聘岗位输入。
2. 清洗和标准化岗位文本。
3. 抽取结构化岗位事实。
4. 根据岗位类型、风险特征和信息完整度进行路由。
5. 优先执行确定性规则引擎。
6. 在需要时检索法规、平台规则或历史案例证据。
7. 调用 LLM 进行语义理解、解释、总结和改写。
8. 聚合规则、证据和模型检查结果。
9. 对高风险结论进行反思和一致性检查。
10. 输出最终审核报告。
11. 写入可追溯审计日志。

## LLM Usage Boundary

LLM 只能负责：

- 语义理解
- 隐含风险识别
- 文本解释
- 风险摘要
- 修改建议
- 招聘文案改写
- 对规则命中结果进行自然语言说明

LLM 不得单独决定高风险结论。

以下逻辑不能只写在 Prompt 中，必须优先由规则引擎或确定性逻辑承担：

- 硬拦截规则
- 明确关键词风险
- 收费、押金、培训贷判断
- 年龄、性别、婚育等显性限制判断
- 必填字段完整性判断
- 决策聚合优先级
- 人工复核降级策略
- 敏感信息脱敏策略

## RAG Usage Boundary

RAG 用于提供证据支撑，而不是直接替代规则判断。

RAG 可检索：

- 法律法规
- 政策文件
- 平台招聘规则
- 内部审核规范
- 历史审核案例
- 风险解释模板

RAG 结果必须保留：

- `evidenceId`
- `sourceType`
- `sourceName`
- `sourceVersion`
- `effectiveFrom`
- `effectiveTo`
- `retrievedAt`

不允许把模型生成的法规名称、条款编号或政策内容直接当作权威依据。

没有可靠证据时，应输出 `REVIEW`，而不是直接给出高风险拦截结论。

## Domain Enums

### Decision

系统内部固定使用以下审核决策枚举：

- `PASS`
- `BLOCK`
- `REVIEW`

不要自行增加近义枚举。

如需要兼容旧接口或外部系统，可在 API 适配层进行映射，但领域层不得使用多个近义决策枚举。

建议映射关系：

| External Value       | Internal Decision   |
| -------------------- | ------------------- |
| `PASS`               | `PASS`              |
| `REJECT`             | `BLOCK`             |
| `MANUAL_REVIEW`      | `REVIEW`            |
| `ALLOW_WITH_WARNING` | `PASS` with warning |
| `NEED_MORE_INFO`     | `REVIEW`            |

如需正式新增决策枚举，必须先更新：

- `docs/API_SPEC.md`
- `docs/DATABASE_SCHEMA.md`
- `docs/EVAL_PLAN.md`

### Risk Level

固定风险等级：

- `NONE`
- `LOW`
- `MEDIUM`
- `HIGH`
- `CRITICAL`

### Audit Status

固定审核状态：

- `RECEIVED`
- `PROCESSING`
- `NEEDS_REVIEW`
- `COMPLETED`
- `FAILED`

### Risk Category

固定风险类别：

- `DISCRIMINATION`
- `FEE_DEPOSIT`
- `PRIVACY`
- `FALSE_OR_MISLEADING`
- `INCOMPLETE_INFORMATION`
- `LABOR_CONTRACT_RISK`
- `PLATFORM_POLICY`
- `OTHER`

新增风险类别前，必须同步更新 API、数据库、规则文档和评测集。

## Decision Policy

系统是审核辅助工具，不是法律裁判系统。

允许使用的表达：

- 存在合规风险
- 建议拦截
- 建议人工复核
- 可能违反平台规则
- 建议企业修改后重新提交
- 当前证据不足，建议人工确认

禁止使用的表达：

- 该企业已经违法
- 该企业构成犯罪
- 该岗位必然违法
- 该招聘行为已经构成法律责任

## Traceability Requirements

所有高风险结论必须至少追踪到以下任一依据：

- `ruleId`
- `evidenceId`
- `checkerId`
- `manualReviewReason`

审核结果、数据库记录、接口响应和审计日志必须保留：

- `ruleVersion`
- `lawKbVersion`
- `promptVersion`
- `modelProvider`
- `modelName`
- `modelVersion`
- `auditId`
- `tenantId`
- `createdAt`

没有证据时，不得输出确定性高风险结论，应输出 `REVIEW`。

## Rule Engine Requirements

规则引擎是风险判断的第一优先级。

规则配置使用 YAML，但 YAML 不得包含可执行代码。

每条规则至少应包含：

- `ruleId`
- `ruleVersion`
- `category`
- `riskLevel`
- `decision`
- `conditions`
- `evidenceRequired`
- `message`
- `suggestion`
- `enabled`
- `effectiveFrom`
- `effectiveTo`

每条规则必须具备：

- 正例测试
- 反例测试
- 证据断言测试

规则命中结果必须可解释、可追溯、可审计。

## Risk Aggregation Requirements

风险聚合模块负责合并以下来源：

- 规则引擎结果
- RAG 证据
- LLM Checker 结果
- 信息完整性检查
- 平台策略检查
- 反思检查结果

聚合逻辑必须覆盖：

- 优先级
- 冲突处理
- 异常处理
- 降级策略
- 人工复核条件

推荐优先级：

```text
CRITICAL BLOCK
> HIGH BLOCK
> REVIEW required
> MEDIUM warning
> LOW warning
> PASS
```

当规则结果和 LLM 判断冲突时，默认以规则结果为准。

当证据不足、模型失败或结果格式无效时，默认进入 `REVIEW`。

## Reflection Requirements

Reflection 用于提升最终输出质量，但不得推翻明确的硬规则命中结果。

Reflection 应检查：

- 审核结论是否与规则命中一致
- 高风险结论是否有 `ruleId` 或 `evidenceId`
- 是否存在无证据断言
- 是否出现绝对法律结论
- 是否遗漏明显风险类别
- 文案改写后是否仍包含风险表达
- 输出是否符合 API 契约

## API Requirements

REST API 必须遵循 `docs/API_SPEC.md`。

API 应覆盖：

- 提交岗位审核
- 查询审核结果
- 查询审核详情
- 获取规则命中信息
- 获取证据引用
- 获取改写建议
- 人工复核状态流转

API 测试必须覆盖：

- 参数校验
- 鉴权
- 租户隔离
- 幂等
- 并发
- 异常返回
- 敏感信息脱敏

## Database Requirements

数据库使用 PostgreSQL。

向量能力使用 pgvector。

数据库设计必须保留：

- 审核任务
- 岗位原始输入
- 结构化事实
- 规则命中结果
- RAG 证据引用
- LLM Checker 结果
- 聚合后的审核结论
- 审计事件
- 版本信息
- 租户上下文

业务历史和审计事件不得原地覆盖。

涉及审核结论、规则版本、证据版本、模型版本的记录必须可追溯。

## Security and Compliance

禁止在以下位置保存真实密钥或未脱敏个人信息：

- 代码
- 规则文件
- 测试夹具
- 日志
- 示例数据
- 文档示例

不得在日志中明文保存：

- 身份证号
- 手机号
- 银行卡号
- Authorization
- API Key
- 数据库连接串
- 原始模型供应商响应中的敏感内容

对外错误信息不得暴露：

- Prompt
- 内部规则实现细节
- 模型供应商原始响应
- 数据库结构细节
- 内部服务拓扑

法律与平台规则内容必须保留：

- 来源
- 版本
- 生效期
- 审批记录

## Testing Requirements

所有核心业务逻辑必须有单元测试。

测试要求包括：

- 每条规则至少有正例、反例和证据断言
- 决策聚合覆盖优先级、冲突、异常和降级
- API 覆盖校验、鉴权、租户隔离、幂等和并发
- LLM 测试使用可控 fake provider
- RAG 测试使用可控 fake retriever
- 真实 LLM Provider 仅用于单独的集成环境或评测环境
- 修复误报或漏报时必须增加回归样本
- 发布规则、模型或 Prompt 版本前必须运行冻结评测集

## Evaluation and Monitoring

系统需要支持评测和监控。

至少应关注：

- 误报率
- 漏报率
- 人工复核率
- 规则命中率
- 模型失败率
- RAG 无结果率
- 高风险结论可追溯率
- 平均审核耗时
- Token 消耗
- 不同风险类别的分布

冻结评测集应覆盖：

- 就业歧视
- 收费押金
- 培训贷
- 隐私过度收集
- 虚假招聘
- 信息不完整
- 平台规则风险
- 正常低风险岗位
- 边界模糊岗位
- 对抗性输入

## Change Management

任何功能变更应同时检查：

- 是否改变审核结论
- 是否改变风险等级
- 是否改变人工复核条件
- 是否影响 API 向后兼容
- 是否需要数据库迁移
- 是否需要历史数据处理
- 是否改变规则 schema
- 是否改变已发布规则语义
- 是否改变模型版本
- 是否改变 Prompt 版本
- 是否改变评测基线
- 是否新增敏感数据采集
- 是否新增日志字段
- 是否新增外部数据传输

架构级决定必须写入 `docs/adr/`。

ADR 使用递增编号，并注明：

- 状态
- 背景
- 决定
- 后果

## Implementation Workflow for Coding Agent

Agent 在执行任务时必须遵守以下流程：

1. 先阅读相关文档和现有代码，再做改动。
2. 明确当前任务是否属于规划、文档、实现、测试或修复。
3. 保持任务范围小，不顺手重构无关模块。
4. 实现前确认验收标准。
5. 发现规格缺口时，优先更新文档或创建 ADR。
6. 不把关键业务行为隐藏在代码中。
7. 实现后运行最小充分测试。
8. 汇报已改文件、验证结果、剩余风险和需要人工确认的法规事项。

## Scope Control

如果用户只要求更新文档，不要创建业务代码。

如果用户只要求规划，不要初始化项目依赖。

如果用户只要求实现某个模块，不要顺手改动无关模块。

如果发现当前任务需要前置决策，应先提出决策点，或者创建 ADR 草案。

## Reporting Format

任务完成后，Agent 应汇报：

- 已完成内容
- 修改的文件
- 运行的测试
- 测试结果
- 未完成事项
- 剩余风险
- 需要人工确认的法规或平台规则事项

## Non-Negotiable Rules

以下规则不可违反：

1. 风险判断逻辑不能只写在 Prompt 中。
2. 高风险结论必须能追踪到 `ruleId` 或 `evidenceId`。
3. 不允许编造法规条款。
4. 没有证据时输出 `REVIEW`，不得直接判定高风险违法。
5. 所有审核结果必须保留 `ruleVersion` 和 `lawKbVersion`。
6. 不得在日志中保存敏感信息明文。
7. 领域层不得绑定具体 LLM Provider。
8. 租户数据访问必须显式携带 `tenantId`。
9. 改写文案必须经过二次审核。
10. 系统不得输出绝对法律裁判结论。
