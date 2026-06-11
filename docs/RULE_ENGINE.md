# YAML 规则引擎设计

## 1. 目标

规则引擎用于承载明确、稳定、可解释的审核政策，并保证相同输入和规则版本得到确定性结果。LLM 可以补充语义命中，但不得覆盖硬拦截规则。

## 2. 规则生命周期

```text
DRAFT -> VALIDATED -> APPROVED -> PUBLISHED -> RETIRED
                                  -> ROLLED_BACK
```

- 编辑、审批和发布角色应分离
- 发布前必须通过 schema、静态检查、单元样例和回归评测
- 已发布版本不可修改；变更产生新版本
- 回滚是切换当前版本，不删除历史版本

## 3. 目录建议

```text
rules/
  schema/
    rule-set.schema.json
  CN/
    default/
      1.0.0.yaml
    platform-example/
      1.0.0.yaml
  fixtures/
```

此目录仅为后续实现建议，本阶段不创建规则代码或示例规则文件。

## 4. 规则集结构

```yaml
schema_version: '1'
ruleset:
  id: 'cn-default'
  version: '1.0.0'
  jurisdiction: 'CN'
  platform: 'DEFAULT'
  locale: 'zh-CN'
  effective_from: '2026-07-01'
  description: '中国大陆通用招聘岗位审核规则'
rules:
  - id: 'CN-DISCRIMINATION-AGE-001'
    name: '不当年龄限制'
    category: 'EMPLOYMENT_DISCRIMINATION'
    severity: 'HIGH'
    disposition: 'REVIEW'
    priority: 800
    enabled: true
    match:
      type: 'regex'
      fields: ['title', 'description', 'requirements']
      patterns:
        - "年龄.{0,4}(不超过|以下|以内)\\s*\\d{2}"
      normalize: true
    exceptions:
      - type: 'requires_context'
        key: 'legally_restricted_role'
    message: '岗位包含年龄限制，需要确认其必要性和合法依据。'
    suggestion:
      action: 'REMOVE_OR_JUSTIFY'
      template: '删除与履职无直接关系的年龄限制。'
    authorities:
      - code: 'AUTHORITY_ID'
        article: 'ARTICLE_ID'
    tests:
      positive:
        - '年龄不超过30岁'
      negative:
        - '具备跨年龄团队协作经验'
```

示例仅展示格式，不代表已由法务确认的有效规则或法律依据。

## 5. 字段定义

### 必填字段

- `id`：稳定且全局可追踪；含地区、类别和序号
- `name`、`category`、`severity`、`disposition`
- `priority`：0-1000，越高越先处理
- `match`：匹配器定义
- `message`：面向审核员的解释
- `authorities`：至少一个依据；纯平台格式规则可引用平台规则

### 可选字段

- `exceptions`：例外条件，仅能缩小适用范围
- `suggestion`：修正动作和模板
- `effective_from/to`：有效期
- `tags`、`owner`、`change_ticket`
- `tests`：随规则维护的正反例

## 6. 支持的匹配器

MVP 建议支持：

| 类型              | 用途           | 说明                               |
| ----------------- | -------------- | ---------------------------------- |
| `keyword`         | 精确词和同义词 | 支持词边界与大小写配置             |
| `regex`           | 明确文本模式   | 限制表达式复杂度，防止 ReDoS       |
| `field`           | 结构化字段比较 | 数值、枚举、存在性、区间           |
| `all`/`any`/`not` | 组合条件       | 使用结构化 AST，不执行任意代码     |
| `semantic`        | 请求 LLM 分类  | 仅声明任务，不在规则引擎内调用 SDK |

后续可增加词典、实体识别和 RAG 依据校验。禁止在 YAML 中嵌入 JavaScript、模板执行器或数据库查询。

## 7. 标准化与证据

- 保留原文和标准化文本映射，证据最终必须定位回原文字段与偏移
- 标准化包括 Unicode、全半角、空白和常见标点，不默认改写语义
- 每个命中至少返回一个 evidence：`field`、`quote`、`start`、`end`
- 正则或关键词命中不得只返回整段文本

## 8. 决策聚合

### 优先级

1. `CRITICAL + BLOCK` 硬规则
2. 其他硬规则的 `BLOCK`
3. 强制 `REVIEW` 规则
4. LLM/RAG 语义发现
5. 低风险提示

### 建议计分

规则命中可映射基础分：`LOW=20`、`MEDIUM=45`、`HIGH=75`、`CRITICAL=100`。多个命中采用“最高分 + 同类/跨类增量”并封顶 100，具体公式必须配置化并有测试。

结论示例：

- 任一硬拦截命中：`BLOCK`
- 无硬拦截且风险分达到复核阈值：`REVIEW`
- 规则与 LLM 冲突、LLM 失败或关键上下文缺失：`REVIEW`
- 仅低风险建议且无不确定项：`PASS`

阈值只是补充，不能把明确禁止项平均掉。

## 9. 去重与冲突

- 相同规则、相同证据范围合并
- 同类规则重叠时保留更具体或优先级更高的规则，并记录被抑制规则供调试
- `PASS` 类信号不能抵消 `BLOCK`
- 例外条件无法被确定性验证时，不自动豁免，转 `REVIEW`
- 平台规则可以比通用规则更严格，不得放宽法律底线

## 10. 语义规则契约

`semantic` 规则向 LLM 层提交：任务 ID、待判断文本、标签定义、允许的结果、证据要求和最小置信度。LLM 返回必须包含标签、证据、解释和置信度，并通过 schema 校验。

模型生成的新“法规依据”不能直接作为正式依据；只能引用规则库或 RAG 中已审核的 authority ID。

## 11. 改写安全

- 改写只能删除、弱化或澄清风险表达，不得编造薪酬、福利、资质和企业承诺
- 对关键信息不明确的命中，改写使用占位提示或返回 `null`
- 改写后重新执行全部适用确定性规则
- 若仍有 `BLOCK`/`REVIEW` 命中，标记 `validation_status=FAILED`，不得宣称已合规

## 12. 校验与测试

发布门禁：

- YAML 可解析且符合 JSON Schema
- 规则 ID、版本、authority 引用有效
- 正则复杂度和长度检查
- 所有规则至少一个正例和一个反例
- 无不可达条件、重复 ID、循环组合或非法优先级
- 全量黄金集回归无未批准的关键指标下降
- 内容哈希与审批记录完整

## 13. 可观测性

按规则记录执行次数、命中率、耗时、被抑制次数、人工推翻率和版本变化。对命中率突增、从不命中和高推翻率规则设置告警。
