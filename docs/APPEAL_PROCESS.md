# 申诉与争议处理流程

本文档定义企业申诉、审核员分歧和高级审核员裁决流程。

## 1. 适用场景

样本进入争议或申诉流程的场景：

- 多名审核员标注不一致
- 企业对拦截或修改要求提出申诉
- Agent 与人工结论冲突且影响高
- evidence 引用被认为不准确
- 规则命中疑似过宽或过窄

## 2. 角色

| 角色 | 职责 |
| ---- | ---- |
| 一线审核员 | 独立标注和提交理由 |
| 高级审核员 | 处理争议样本并给出最终标签 |
| 规则运营 | 根据争议样本创建规则改进建议 |
| 法务/政策人员 | 确认法规、政策或平台规则口径 |

## 3. 争议样本状态

- `open`：待处理
- `resolved`：已裁决

## 4. 裁决流程

1. 系统将不一致样本写入 `disputed_cases`。
2. 高级审核员查看所有 reviewer decisions。
3. 高级审核员检查原文、Agent finding、规则命中和 evidence。
4. 高级审核员提交：
   - `finalDecision`
   - `finalCategories`
   - `finalSeverity`
   - `resolvedBy`
   - `resolutionComment`
5. 系统将争议状态置为 `resolved`。
6. 已裁决样本可进入 eval 或规则改进流程。

## 5. 申诉处理原则

- 申诉处理不应直接覆盖历史审核记录。
- 应追加记录新的裁决、理由和操作者。
- 如申诉成立，应记录为误杀或规则过宽样本。
- 如申诉不成立，应保留原依据和裁决说明。
- Appeal Agent 只能输出复审建议，不能自动推翻原审核结论。
- Appeal Agent 报告必须同时列出支持维持和支持撤销/调整的理由。
- 最终决定必须由人工复审员提交。

## 6. Appeal Agent 流程

1. 企业通过 `POST /api/appeals` 提交申诉，选择申诉原因并补充说明。
2. 系统保存原审核结论、命中规则、finding、evidence 和脱敏申诉文本。
3. 后台审核员可查看 `GET /api/appeals/:id`。
4. 审核员触发 `POST /api/appeals/:id/agent-report`。
5. Appeal Agent 汇总：
   - 原审核结论
   - 命中规则和 evidence
   - 企业申诉理由
   - 补充说明
   - 历史相似申诉样本
6. 审核员通过 `POST /api/appeals/:id/review-result` 提交最终决定：
   - `MAINTAIN`
   - `OVERTURN`
   - `REQUEST_REVISION`
7. 已复审样本可通过 `add-to-eval` 进入评估集，或通过 `create-rule-suggestion` 生成规则改进建议。

## 7. 输出规范

高级审核员裁决仍应使用审慎表达：

- “建议维持拦截”
- “建议改为人工复核”
- “建议调整风险等级”
- “建议进入规则修订”

不得输出绝对法律裁判结论。
