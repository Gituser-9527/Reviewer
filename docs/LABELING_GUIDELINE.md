# 标注体系说明

本文档定义人工审核员和高级审核员使用的统一标签结构。进入评估集前，人工反馈必须转换为该结构。

## 1. 统一标签结构

每条人工标注至少包含：

- `reviewTicketId`
- `auditRunId`
- `tenantId`
- `reviewerId`
- `finalDecision`
- `categories`
- `severity`
- `feedbackType`
- `comment`
- `confidence`

## 2. finalDecision

| 标签 | 含义 |
| ---- | ---- |
| `APPROVE` | 人工认为可以发布 |
| `REJECT` | 人工认为应拦截 |
| `REQUEST_REVISION` | 人工认为应修改后再提交 |

映射到评估集时：

| 人工标签 | Eval decision |
| -------- | ------------- |
| `APPROVE` | `PASS` |
| `REJECT` | `REJECT` |
| `REQUEST_REVISION` | `MANUAL_REVIEW` 或 `ALLOW_WITH_WARNING`，由高级审核员裁决 |

## 3. categories

固定风险类别：

- `DISCRIMINATION`
- `FEE_DEPOSIT`
- `PRIVACY`
- `FALSE_OR_MISLEADING`
- `INCOMPLETE_INFORMATION`
- `LABOR_CONTRACT_RISK`
- `PLATFORM_POLICY`
- `OTHER`

多类别风险应全部标出。例如“限女性，入职收服装费”应标注：

- `DISCRIMINATION`
- `FEE_DEPOSIT`

## 4. severity

固定风险等级：

- `NONE`
- `LOW`
- `MEDIUM`
- `HIGH`
- `CRITICAL`

风险等级口径详见 `docs/RISK_LEVEL_STANDARD.md`。

## 5. feedbackType

| 标签 | 含义 |
| ---- | ---- |
| `FALSE_POSITIVE` | Agent 误杀，人工认为不应判风险 |
| `FALSE_NEGATIVE` | Agent 漏判，人工发现风险 |
| `WRONG_CATEGORY` | 风险类别错误 |
| `WRONG_SEVERITY` | 风险等级错误 |
| `WRONG_EVIDENCE` | evidence 不相关、引用错误或依据不足 |
| `BAD_REWRITE` | 改写文案仍有风险或不可用 |
| `RULE_TOO_BROAD` | 规则过宽，导致误杀 |
| `RULE_TOO_NARROW` | 规则过窄，导致漏判 |
| `NEEDS_NEW_RULE` | 当前规则体系未覆盖 |
| `VALID_RESULT` | Agent 结果有效 |

## 6. confidence

`confidence` 用 0 到 1 表示审核员对标签的把握程度：

- `0.9 - 1.0`：高度确定
- `0.7 - 0.89`：基本确定
- `0.5 - 0.69`：存在疑问，建议多人复核
- `< 0.5`：不应直接进入评估集

## 7. 一致性判断

同一条样本多人标注时，以下字段共同决定一致性：

- `finalDecision`
- `categories`
- `severity`

任一字段不一致，样本进入争议池。

## 8. 进入 eval 的要求

人工反馈进入 eval 前必须满足：

- 使用统一标签结构
- 无未处理争议，或已由高级审核员裁决
- 文本字段已脱敏
- `expectedDecision`、`expectedCategories`、`expectedSeverity` 明确
- `humanReason` 可解释
